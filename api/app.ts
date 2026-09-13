import { createHash } from "node:crypto";
import { WORKSHOP_GUEST_ACCESS } from "../lib/workshop.js";
import { demoScope, scopedDatabase } from "../lib/server/demo-scope.js";
import { hashTeacherCode, matchesTeacherCode, newTeacherCode } from "../lib/server/teacher-code.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import {
  canSeeClue,
  canSeeItem,
  canTransition,
  clueInput,
  isTeacher,
  itemInput,
  reasonInput,
  roles,
  similarItems,
  statusLabels,
  type Role,
} from "../lib/domain.js";
import {
  REWARD_POINTS,
  handoffRewardKey,
  helpfulClueRewardKey,
} from "../lib/rewards.js";

export const config = { maxDuration: 60 };
class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function requireThat(
  value: unknown,
  message = "이 작업을 처리할 권한이 없습니다.",
  status = 403,
): asserts value {
  if (!value) throw new AppError(message, status);
}
function database() {
  if (!getApps().length) {
    requireThat(
      process.env.FIREBASE_SERVICE_ACCOUNT,
      "서버 연결을 준비 중입니다. 관리자에게 문의해 주세요.",
      503,
    );
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "school-findit",
    });
  }
  return scopedDatabase(getFirestore());
}
const idInput = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const iso = (v: unknown): string =>
  typeof v === "string"
    ? v
    : v &&
        typeof v === "object" &&
        "toDate" in v &&
        typeof v.toDate === "function"
      ? v.toDate().toISOString()
      : "";
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const now = () => FieldValue.serverTimestamp();
function roleOf(v: unknown): Role {
  return roles.includes(v as Role) ? (v as Role) : "student";
}
type Actor = { uid: string; role: Role; email: string };
function notify(
  tx: Transaction,
  actor: Actor,
  userId: string,
  title: string,
  message: string,
  itemId = "",
  key?: string,
) {
  if (!userId) return;
  const collection = database().collection("notifications");
  tx.set(key ? collection.doc(key) : collection.doc(), {
    userId,
    title,
    message,
    itemId,
    read: false,
    status: "active",
    createdBy: actor.uid,
    createdAt: now(),
    updatedAt: now(),
  });
}
function audit(
  tx: Transaction,
  actor: Actor,
  action: string,
  targetId: string,
  reason = "",
) {
  tx.set(database().collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorRole: actor.role,
    action,
    targetId,
    reason,
    createdAt: now(),
  });
  tx.set(database().doc("app_settings/revision"), { updatedAt: now() });
}
async function authenticate(token: string): Promise<Actor> {
  const db = database();
  let claims;
  try {
    claims = await getAuth().verifyIdToken(token, true);
  } catch {
    throw new AppError("로그인이 만료됐습니다. 다시 로그인해 주세요.", 401);
  }
  const anonymous = claims.firebase.sign_in_provider === "anonymous";
  requireThat(
    (WORKSHOP_GUEST_ACCESS && anonymous) || (
    claims.email_verified &&
      claims.email &&
      claims.firebase.sign_in_provider === "google.com"),
    "확인된 Google 계정으로 로그인해 주세요.",
    403,
  );
  const email = claims.email?.toLowerCase() || "";
  return db.runTransaction(async (tx) => {
    const settings =
      (await tx.get(db.doc("app_settings/security"))).data() || {};
    const pattern =
      typeof settings.allowedEmailPattern === "string"
        ? settings.allowedEmailPattern
        : "(?!)";
    let matches = false;
    try {
      matches = new RegExp(`^(?:${pattern})$`, "i").test(email);
    } catch {
      /* deny invalid policy */
    }
    requireThat(
      (WORKSHOP_GUEST_ACCESS && anonymous) || matches ||
        (settings.allowGmailTesting !== false && email.endsWith("@gmail.com")),
      "허용된 학교 Google 계정으로 로그인해 주세요.",
      403,
    );
    const userRef = db.doc(`users/${claims.uid}`);
    const user = await tx.get(userRef);
    requireThat(
      !user.exists || user.data()?.active !== false,
      "사용이 중지된 계정입니다.",
      403,
    );
    let role = roleOf(user.data()?.role);
    if (anonymous) {
      if (!user.exists) tx.create(userRef, { email: "", role: "student", anonymous: true, active: true, createdAt: now() });
      return { uid: claims.uid, email: "", role: "student", anonymous: true };
    }
    if (!user.exists) {
      role =
        String(settings.initialAdminEmail || "").toLowerCase() === email
          ? "final_admin"
          : "student";
      tx.create(userRef, { email, role, active: true, createdAt: now() });
    } else if (role === "student" && !user.data()?.teacherRevokedAt) {
      // One-time migration of previously verified teachers. Revoked accounts never migrate again.
      const legacy = await tx.get(
        db.doc(`teacher_verifications/${claims.uid}`),
      );
      if (legacy.data()?.active === true) {
        role = "teacher";
        tx.update(userRef, { role, migratedAt: now() });
      }
    }
    return { uid: claims.uid, email, role };
  });
}
async function freshActor(tx: Transaction, actor: Actor) {
  const data = (await tx.get(database().doc(`users/${actor.uid}`))).data();
  requireThat(data && data.active !== false, "계정을 다시 확인해 주세요.");
  return { ...actor, role: data.anonymous === true ? "student" as const : roleOf(data.role) };
}
const itemFields = [
  "kind",
  "title",
  "location",
  "dateText",
  "description",
  "category",
  "color",
  "status",
  "storageLocation",
  "authorId",
  "hidden",
  "deleted",
  "isPublished",
  "hasImage",
  "createdAt",
  "updatedAt",
  "clueCount",
  "receivedById",
];
async function snapshot(actor: Actor) {
  const db = database();
  const [itemDocs, clueDocs, notices, rewards] = await Promise.all([
    db
      .collection("items")
      .select(...itemFields)
      .get(),
    db.collection("clues").get(),
    db.collection("notifications").where("userId", "==", actor.uid).get(),
    db.collection("reward_transactions").where("userId", "==", actor.uid).get(),
  ]);
  const itemMap = new Map(itemDocs.docs.map((d) => [d.id, d.data()]));
  const clues = clueDocs.docs
    .filter((d) => {
      const item = itemMap.get(d.data().itemId);
      return item && canSeeClue(d.data(), item, actor.uid, actor.role);
    })
    .map((d) => {
      const c = d.data();
      return {
        id: d.id,
        itemId: c.itemId,
        place: c.place,
        seenDate: c.seenDate,
        seenTime: c.seenTime,
        detail:
          c.hidden && !isTeacher(actor.role)
            ? "숨김 처리된 단서입니다."
            : c.detail,
        isMine: c.authorId === actor.uid,
        hidden: c.hidden === true,
        helpful: Boolean(c.helpfulRewardId),
        createdAt: iso(c.createdAt),
      };
    });
  const items = itemDocs.docs
    .filter((d) => canSeeItem(d.data(), actor.uid, actor.role))
    .map((d) => {
      const i = d.data();
      return {
        id: d.id,
        kind: i.kind,
        title: i.title,
        location: i.location,
        dateText: i.dateText,
        description:
          i.hidden && !isTeacher(actor.role)
            ? "교사가 임시 숨김 처리한 글입니다."
            : i.description || "",
        category: i.category || "기타",
        color: i.color || "",
        status: i.status,
        storageLocation: i.storageLocation || "",
        isMine: i.authorId === actor.uid,
        hidden: i.hidden === true,
        hasImage: i.hasImage !== false,
        createdAt: iso(i.createdAt),
        updatedAt: iso(i.updatedAt),
        clueCount: clues.filter((c) => c.itemId === d.id && !c.hidden).length,
      };
    });
  return {
    role: actor.role,
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    clues: clues.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    notifications: notices.docs
      .map((d) => {
        const n = d.data();
        return {
          id: d.id,
          title: n.title,
          message:
            n.status === "cancelled"
              ? "관리자가 잘못 전달된 안내를 취소했습니다."
              : n.message,
          itemId: n.itemId,
          read: n.read,
          status: n.status || "active",
          createdAt: iso(n.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    rewards: rewards.docs.map((d) => ({
      ...d.data(),
      id: d.id,
      grantedAt: iso(d.data().grantedAt),
      cancelledAt: iso(d.data().cancelledAt),
    })),
  };
}
async function similarityNotifications(foundId: string, actor: Actor) {
  const db = database();
  const lostDocs = await db
    .collection("items")
    .where("kind", "==", "lost")
    .where("status", "==", "seeking")
    .select(...itemFields)
    .get();
  for (const lost of lostDocs.docs) {
    await db.runTransaction(async (tx) => {
      const [f, l, n] = await Promise.all([
        tx.get(db.doc(`items/${foundId}`)),
        tx.get(lost.ref),
        tx.get(
          db.doc(`notifications/${digest(`similar:${foundId}:${lost.id}`)}`),
        ),
      ]);
      const found = f.data(),
        current = l.data();
      if (
        !found ||
        !current ||
        !found.isPublished ||
        found.deleted ||
        found.hidden ||
        n.exists ||
        !similarItems(current, found)
      )
        return;
      notify(
        tx,
        { ...actor, uid: found.receivedById || found.authorId },
        current.authorId,
        "비슷한 습득물이 공개됐어요",
        `‘${found.title}’의 사진과 보관 장소를 확인해 보세요. 일치 여부는 직접 확인해 주세요.`,
        foundId,
        n.id,
      );
      tx.set(db.doc("app_settings/revision"), { updatedAt: now() });
    });
  }
}
export async function dispatch(
  actor: Actor,
  action: string,
  input: Record<string, unknown>,
) {
  const db = database();
  if (action === "snapshot") {
    // Retry one durable similarity job after a transient network failure.
    const jobs = await db
      .collection("notification_jobs")
      .where("pending", "==", true)
      .limit(1)
      .get();
    for (const job of jobs.docs) {
      try {
        await similarityNotifications(job.id, actor);
        await job.ref.update({ pending: false });
      } catch {
        console.error("similarity_job_pending");
      }
    }
    return snapshot(actor);
  }
  if (action === "image") {
    const doc = await db.doc(`items/${idInput.parse(input.id)}`).get();
    requireThat(
      doc.exists &&
        canSeeItem(doc.data()!, actor.uid, actor.role) &&
        (!doc.data()?.hidden || isTeacher(actor.role)),
      "사진을 볼 수 없습니다.",
      404,
    );
    return { imageDataUrl: doc.data()?.imageDataUrl || "" };
  }
  if (action === "management") {
    requireThat(isTeacher(actor.role));
    const [rewards, reports, users, notices, logs] = await Promise.all([
      actor.role === "final_admin"
        ? db.collection("reward_transactions").get()
        : db
            .collection("reward_transactions")
            .where("responsibleTeacherId", "==", actor.uid)
            .get(),
      db.collection("reports").get(),
      actor.role === "final_admin" ? db.collection("users").get() : null,
      actor.role === "final_admin"
        ? db.collection("notifications").get()
        : null,
      actor.role === "final_admin"
        ? db
            .collection("audit_logs")
            .orderBy("createdAt", "desc")
            .limit(100)
            .get()
        : null,
    ]);
    return {
      rewards: rewards.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        grantedAt: iso(d.data().grantedAt),
        cancelledAt: iso(d.data().cancelledAt),
      })),
      reports: reports.docs.map((d) => ({
        id: d.id,
        targetId: d.data().targetId,
        targetType: d.data().targetType,
        itemId: d.data().itemId,
        reason: d.data().reason,
        status: d.data().status,
      })),
      users:
        users?.docs.map((d) => ({
          id: d.id,
          email: d.data().email,
          role: roleOf(d.data().role),
        })) || [],
      notifications:
        notices?.docs.map((d) => ({
          id: d.id,
          title: d.data().title,
          message:
            d.data().status === "cancelled" ? "취소된 안내" : d.data().message,
          status: d.data().status,
          read: d.data().read,
          itemId: d.data().itemId,
          createdAt: iso(d.data().createdAt),
        })) || [],
      logs:
        logs?.docs.map((d) => ({
          id: d.id,
          action: d.data().action,
          targetId: d.data().targetId,
          actorId: d.data().actorId,
          reason: d.data().reason,
          createdAt: iso(d.data().createdAt),
        })) || [],
    };
  }
  if (action === "teacher.verify" || action === "teacher.code") {
    requireThat(Boolean(actor.email), "교사 인증은 Google 계정으로 로그인한 뒤 이용해 주세요.");
    const code = z
      .string()
      .trim()
      .min(8, "인증코드는 8~32자로 입력해 주세요.")
      .max(32)
      .parse(input.code);
    const result = await db.runTransaction(async (tx) => {
      actor = await freshActor(tx, actor);
      const ref = db.doc("app_settings/security"),
        settings = (await tx.get(ref)).data() || {};
      if (action === "teacher.code") {
        requireThat(actor.role === "final_admin");
        newTeacherCode.parse(code);
        requireThat(!matchesTeacherCode(code, settings), "이전과 다른 인증코드를 설정해 주세요.", 400);
        tx.update(ref, {
          ...hashTeacherCode(code),
          teacherCodeUpdatedBy: actor.uid,
          teacherCodeUpdatedAt: now(),
        });
        audit(tx, actor, action, "security");
        return { message: "교사 인증코드를 변경했습니다." };
      }
      requireThat(actor.role === "student", "이미 교사로 인증된 계정입니다.");
      requireThat(settings.teacherCodeAlgorithm === "scrypt", "인증 보안이 강화되었습니다. 최종 관리자가 새 교사 인증코드를 설정한 뒤 다시 시도해 주세요.", 409);
      const profile = (await tx.get(db.doc(`users/${actor.uid}`))).data();
      requireThat(
        !profile?.revokedCodeHash ||
          profile.revokedCodeHash !== settings.teacherCodeHash,
        "교사 권한이 회수된 계정입니다. 관리자에게 새 인증코드를 문의해 주세요.",
      );
      const attemptsRef = db.doc(`verification_attempts/${actor.uid}`),
        attempts = (await tx.get(attemptsRef)).data();
      const inWindow =
        Date.now() - Number(attempts?.windowStart || 0) < 15 * 60 * 1000;
      requireThat(
        !inWindow || Number(attempts?.count) < 5,
        "인증을 여러 번 시도했습니다. 15분 후 다시 시도해 주세요.",
        429,
      );
      const valid = matchesTeacherCode(code, settings);
      tx.set(attemptsRef, {
        windowStart: inWindow ? attempts?.windowStart : Date.now(),
        count: inWindow ? Number(attempts?.count || 0) + 1 : 1,
      });
      if (!valid)
        return {
          error: "인증코드가 올바르지 않거나 아직 설정되지 않았습니다.",
        };
      tx.update(db.doc(`users/${actor.uid}`), {
        role: "teacher",
        teacherVerifiedAt: now(),
        teacherRevokedAt: FieldValue.delete(),
        revokedCodeHash: FieldValue.delete(),
      });
      tx.delete(attemptsRef);
      audit(tx, actor, action, actor.uid);
      return { message: "교사 인증이 완료됐습니다." };
    });
    if ("error" in result) throw new AppError(result.error!);
    return result;
  }
  let publishedId = "";
  const result = await db.runTransaction(async (tx) => {
    actor = await freshActor(tx, actor);
    if (action === "item.create") {
      const value = itemInput.parse(input.value),
        ref = db.doc(`items/${idInput.parse(input.id)}`);
      const existing = await tx.get(ref);
      if (existing.exists) {
        requireThat(existing.data()?.authorId === actor.uid);
        return { message: "이미 등록된 물건입니다." };
      }
      const direct = value.kind === "found" && isTeacher(actor.role);
      requireThat(
        !direct || value.storageLocation.length > 0,
        "보관 장소를 입력해 주세요.",
        400,
      );
      tx.create(ref, {
        ...value,
        authorId: actor.uid,
        authorRole: actor.role,
        status:
          value.kind === "lost"
            ? "seeking"
            : direct
              ? "looking_for_owner"
              : "pending_handoff",
        isPublished: value.kind === "lost" || direct,
        hidden: false,
        deleted: false,
        hasImage: Boolean(value.imageDataUrl),
        receivedById: direct ? actor.uid : "",
        createdAt: now(),
        updatedAt: now(),
        clueCount: 0,
      });
      audit(tx, actor, action, ref.id);
      if (direct) {
        publishedId = ref.id;
        tx.set(db.doc(`notification_jobs/${ref.id}`), { pending: true });
      }
      return {
        message:
          value.kind === "found" && !direct
            ? "전달 대기로 등록했습니다. 물건을 선생님께 전달해 주세요."
            : "물건을 등록했습니다.",
      };
    }
    if (action.startsWith("item.")) {
      const ref = db.doc(`items/${idInput.parse(input.id)}`),
        doc = await tx.get(ref),
        item = doc.data();
      requireThat(
        item && !item.deleted && canSeeItem(item, actor.uid, actor.role),
        "물건을 찾을 수 없습니다.",
        404,
      );
      if (action === "item.edit") {
        requireThat(
          actor.role === "final_admin" ||
            (item.authorId === actor.uid &&
              ["seeking", "pending_handoff"].includes(item.status) &&
              !item.hidden),
        );
        const value = itemInput.parse(input.value);
        requireThat(
          value.kind === item.kind,
          "글 종류는 변경할 수 없습니다.",
          400,
        );
        tx.update(ref, {
          title: value.title,
          location: value.location,
          dateText: value.dateText,
          description: value.description,
          category: value.category,
          color: value.color,
          imageDataUrl: value.imageDataUrl,
          hasImage: Boolean(value.imageDataUrl),
          updatedAt: now(),
        });
      } else if (action === "item.delete") {
        requireThat(
          item.authorId === actor.uid || actor.role === "final_admin",
        );
        tx.update(ref, {
          deleted: true,
          isPublished: false,
          deletedBy: actor.uid,
          deletedAt: now(),
          updatedAt: now(),
        });
      } else if (action === "item.hide") {
        requireThat(isTeacher(actor.role));
        const reason = reasonInput.parse(input.reason);
        const hidden = z.boolean().parse(input.hidden);
        requireThat(
          hidden || actor.role === "final_admin",
          "숨김 해제는 최종 관리자만 가능합니다.",
        );
        tx.update(ref, { hidden, moderatedBy: actor.uid, updatedAt: now() });
        notify(
          tx,
          actor,
          item.authorId,
          hidden ? "내 글이 임시 숨김 처리됐어요" : "내 글의 숨김이 해제됐어요",
          reason,
          ref.id,
        );
      } else if (action === "item.handoff") {
        requireThat(
          isTeacher(actor.role) &&
            item.kind === "found" &&
            item.status === "pending_handoff" &&
            !item.hidden,
          "이미 인수했거나 인수할 수 없는 물건입니다.",
          409,
        );
        const storage = z
          .string()
          .trim()
          .min(1, "보관 장소를 입력해 주세요.")
          .max(120)
          .parse(input.storageLocation);
        const key = handoffRewardKey(ref.id),
          rewardRef = db.doc(`reward_transactions/${digest(key)}`),
          existing = await tx.get(rewardRef);
        const author = (await tx.get(db.doc(`users/${item.authorId}`))).data();
        const awardStudent = (item.authorRole || author?.role) === "student";
        requireThat(
          item.authorId !== actor.uid || !awardStudent,
          "본인이 등록한 물건의 인수 포인트를 직접 지급할 수 없습니다.",
        );
        requireThat(!existing.exists, "이미 포인트를 지급한 활동입니다.", 409);
        tx.update(ref, {
          status: "teacher_received",
          isPublished: true,
          storageLocation: storage,
          receivedById: actor.uid,
          receivedAt: now(),
          updatedAt: now(),
        });
        if (awardStudent)
          tx.create(rewardRef, {
            userId: item.authorId,
            points: REWARD_POINTS.foundItemHandoff,
            reason: "found_item_handoff",
            relatedItemId: ref.id,
            uniqueKey: key,
            status: "active",
            grantedAt: now(),
            grantedBy: actor.uid,
            responsibleTeacherId: actor.uid,
          });
        notify(
          tx,
          actor,
          item.authorId,
          awardStudent
            ? "습득물 인수 확인 · 도움 포인트 +3점"
            : "습득물 인수 확인",
          `물건을 전달해 줘서 고마워요. 보관 장소: ${storage}`,
          ref.id,
        );
        tx.set(db.doc(`notification_jobs/${ref.id}`), { pending: true });
        publishedId = ref.id;
      } else if (action === "item.status") {
        const target = z.string().parse(input.status);
        requireThat(
          canTransition(item, target, actor.uid, actor.role),
          "변경할 수 없는 상태입니다.",
          409,
        );
        tx.update(ref, {
          status: target,
          updatedAt: now(),
          statusChangedBy: actor.uid,
        });
        notify(
          tx,
          actor,
          item.authorId,
          "게시물 상태가 변경됐어요",
          `${item.title}: ${statusLabels[target as keyof typeof statusLabels]}`,
          ref.id,
        );
      } else if (action === "item.storage") {
        requireThat(
          isTeacher(actor.role) &&
            item.kind === "found" &&
            ["teacher_received", "looking_for_owner"].includes(item.status) &&
            !item.hidden,
        );
        const storage = z
          .string()
          .trim()
          .min(1, "보관 장소를 입력해 주세요.")
          .max(120)
          .parse(input.storageLocation);
        tx.update(ref, { storageLocation: storage, updatedAt: now() });
        notify(
          tx,
          actor,
          item.authorId,
          "보관 장소가 변경됐어요",
          `새 보관 장소: ${storage}`,
          ref.id,
        );
      } else throw new AppError("알 수 없는 작업입니다.");
      audit(
        tx,
        actor,
        action,
        ref.id,
        typeof input.reason === "string" ? input.reason.trim() : "",
      );
      return {
        message:
          action === "item.handoff"
            ? "인수를 확인했습니다. 학생 등록 물건에는 도움 포인트 3점이 지급됩니다."
            : "변경 내용을 저장했습니다.",
      };
    }
    if (action.startsWith("clue.")) {
      const ref = db.doc(`clues/${idInput.parse(input.id)}`),
        doc = await tx.get(ref),
        clue = doc.data();
      const itemRef = db.doc(
          `items/${idInput.parse(action === "clue.create" ? input.itemId : clue?.itemId)}`,
        ),
        item = (await tx.get(itemRef)).data();
      requireThat(
        item && !item.deleted && canSeeItem(item, actor.uid, actor.role),
        "관련 물건을 찾을 수 없습니다.",
        404,
      );
      if (action === "clue.create") {
        if (doc.exists) {
          requireThat(clue?.authorId === actor.uid);
          return { message: "이미 등록된 단서입니다." };
        }
        requireThat(
          item.kind === "lost" && item.status === "seeking" && !item.hidden,
          "찾는 중인 분실 신고에만 단서를 작성할 수 있습니다.",
          409,
        );
        const value = clueInput.parse(input.value);
        tx.create(ref, {
          ...value,
          itemId: itemRef.id,
          authorId: actor.uid,
          hidden: false,
          deleted: false,
          createdAt: now(),
          updatedAt: now(),
        });
        if (item.authorId !== actor.uid)
          notify(
            tx,
            actor,
            item.authorId,
            "내 분실 신고에 새 단서가 있어요",
            `${item.title}: ${value.place}에서 목격됐어요.`,
            itemRef.id,
          );
      } else {
        requireThat(
          clue && canSeeClue(clue, item, actor.uid, actor.role),
          "단서를 찾을 수 없습니다.",
          404,
        );
        if (action === "clue.edit") {
          requireThat(
            clue.authorId === actor.uid &&
              item.status === "seeking" &&
              !item.hidden &&
              !clue.hidden,
          );
          tx.update(ref, { ...clueInput.parse(input.value), updatedAt: now() });
        } else if (action === "clue.delete") {
          requireThat(
            clue.authorId === actor.uid || actor.role === "final_admin",
          );
          tx.update(ref, {
            deleted: true,
            deletedBy: actor.uid,
            deletedAt: now(),
            updatedAt: now(),
          });
        } else if (action === "clue.hide") {
          requireThat(isTeacher(actor.role));
          const hidden = z.boolean().parse(input.hidden);
          requireThat(hidden || actor.role === "final_admin");
          const reason = reasonInput.parse(input.reason);
          tx.update(ref, { hidden, moderatedBy: actor.uid, updatedAt: now() });
          notify(
            tx,
            actor,
            clue.authorId,
            hidden
              ? "내 단서가 임시 숨김 처리됐어요"
              : "내 단서의 숨김이 해제됐어요",
            reason,
            itemRef.id,
          );
        } else if (action === "clue.helpful") {
          requireThat(
            item.authorId === actor.uid &&
              clue.authorId !== actor.uid &&
              !clue.hidden &&
              !item.hidden,
            "신고 작성자만 다른 사람의 단서에 도움 표시를 할 수 있습니다.",
          );
          const key = helpfulClueRewardKey(itemRef.id, clue.authorId),
            rewardRef = db.doc(`reward_transactions/${digest(key)}`),
            existing = await tx.get(rewardRef);
          requireThat(
            !existing.exists,
            "이 작성자는 이 신고에서 이미 포인트를 받았습니다. 같은 활동은 다시 지급하지 않습니다.",
            409,
          );
          tx.create(rewardRef, {
            userId: clue.authorId,
            points: REWARD_POINTS.helpfulClue,
            reason: "helpful_clue",
            relatedItemId: itemRef.id,
            relatedClueId: ref.id,
            uniqueKey: key,
            status: "active",
            grantedAt: now(),
            grantedBy: actor.uid,
            responsibleTeacherId: isTeacher(actor.role) ? actor.uid : "",
          });
          tx.update(ref, { helpfulRewardId: rewardRef.id });
          notify(
            tx,
            actor,
            clue.authorId,
            "도움이 된 단서 · 도움 포인트 +1점",
            `‘${item.title}’ 찾기에 도움이 되었어요. 고마워요!`,
            itemRef.id,
          );
        } else throw new AppError("알 수 없는 작업입니다.");
      }
      audit(
        tx,
        actor,
        action,
        ref.id,
        typeof input.reason === "string" ? input.reason.trim() : "",
      );
      return {
        message:
          action === "clue.helpful"
            ? "단서 작성자에게 1점을 지급했습니다."
            : "단서 변경 내용을 저장했습니다.",
      };
    }
    if (action === "report.create") {
      const targetType = z.enum(["items", "clues"]).parse(input.targetType),
        targetId = idInput.parse(input.id),
        reason = reasonInput.parse(input.reason);
      const target = (await tx.get(db.doc(`${targetType}/${targetId}`))).data();
      requireThat(
        target && !target.deleted,
        "신고할 내용을 찾을 수 없습니다.",
        404,
      );
      const item =
        targetType === "items"
          ? target
          : (await tx.get(db.doc(`items/${target.itemId}`))).data();
      requireThat(
        item &&
          (targetType === "items"
            ? canSeeItem(item, actor.uid, actor.role)
            : canSeeClue(target, item, actor.uid, actor.role)),
      );
      const ref = db.doc(
          `reports/${digest(`${targetType}:${targetId}:${actor.uid}`)}`,
        ),
        existing = await tx.get(ref);
      requireThat(
        !existing.exists,
        "이미 신고했습니다. 교사가 확인 중입니다.",
        409,
      );
      tx.create(ref, {
        targetType,
        targetId,
        itemId: targetType === "items" ? targetId : target.itemId,
        reporterId: actor.uid,
        reason,
        status: "open",
        createdAt: now(),
      });
      audit(tx, actor, action, targetId);
      return { message: "신고를 접수했습니다. 교사가 확인합니다." };
    }
    if (action === "report.resolve") {
      requireThat(isTeacher(actor.role));
      const ref = db.doc(`reports/${idInput.parse(input.id)}`);
      requireThat((await tx.get(ref)).exists, "신고를 찾을 수 없습니다.", 404);
      const reason = reasonInput.parse(input.reason);
      tx.update(ref, {
        status: "resolved",
        resolution: reason,
        resolvedBy: actor.uid,
        resolvedAt: now(),
      });
      audit(tx, actor, action, ref.id, reason);
      return { message: "신고를 처리했습니다." };
    }
    if (action === "reward.cancel") {
      const ref = db.doc(`reward_transactions/${idInput.parse(input.id)}`),
        reward = (await tx.get(ref)).data();
      requireThat(
        reward &&
          (actor.role === "final_admin" ||
            (isTeacher(actor.role) &&
              reward.responsibleTeacherId === actor.uid)),
      );
      if (reward.status === "cancelled")
        return { message: "이미 취소된 지급입니다." };
      const reason = reasonInput.parse(input.reason);
      tx.update(ref, {
        status: "cancelled",
        cancelledBy: actor.uid,
        cancelledAt: now(),
        cancellationReason: reason,
      });
      notify(
        tx,
        actor,
        reward.userId,
        `도움 포인트 ${reward.points}점 지급이 취소됐어요`,
        reason,
        reward.relatedItemId,
      );
      audit(tx, actor, action, ref.id, reason);
      return { message: "지급을 취소하고 사유를 알렸습니다." };
    }
    if (action === "notification.read" || action === "notification.cancel") {
      const ref = db.doc(`notifications/${idInput.parse(input.id)}`),
        notice = (await tx.get(ref)).data();
      requireThat(notice, "알림을 찾을 수 없습니다.", 404);
      if (action === "notification.read") {
        requireThat(notice.userId === actor.uid);
        tx.update(ref, { read: true, updatedAt: now() });
      } else {
        requireThat(actor.role === "final_admin");
        tx.update(ref, {
          status: "cancelled",
          read: false,
          cancelledBy: actor.uid,
          cancelledAt: now(),
          updatedAt: now(),
        });
        audit(tx, actor, action, ref.id);
      }
      tx.set(db.doc("app_settings/revision"), { updatedAt: now() });
      return { message: "알림을 처리했습니다." };
    }
    if (action === "role.change") {
      requireThat(actor.role === "final_admin");
      const uid = idInput.parse(input.id),
        role = z.enum(roles).parse(input.role);
      requireThat(
        uid !== actor.uid,
        "본인의 관리자 권한은 변경할 수 없습니다.",
        400,
      );
      const ref = db.doc(`users/${uid}`),
        target = (await tx.get(ref)).data();
      requireThat(target, "계정을 찾을 수 없습니다.", 404);
      requireThat(
        target.role !== "final_admin",
        "최종 관리자 권한 회수는 이 화면에서 지원하지 않습니다.",
        400,
      );
      requireThat(
        role === "student" ||
          (role === "final_admin" && target.role === "teacher"),
        "교사 권한은 인증코드로 부여합니다.",
        400,
      );
      const settings = (await tx.get(db.doc("app_settings/security"))).data();
      tx.update(ref, {
        role,
        teacherRevokedAt: now(),
        revokedCodeHash: settings?.teacherCodeHash || "",
        updatedAt: now(),
      });
      tx.set(
        db.doc(`teacher_verifications/${uid}`),
        { active: false },
        { merge: true },
      );
      notify(
        tx,
        actor,
        uid,
        "계정 권한이 변경됐어요",
        role === "student"
          ? "교사 권한이 회수됐습니다. 담당 관리자에게 문의해 주세요."
          : "최종 관리자로 지정됐습니다.",
      );
      audit(tx, actor, action, uid, role);
      return { message: "계정 권한을 변경했습니다." };
    }
    throw new AppError("알 수 없는 작업입니다.");
  });
  if (publishedId) {
    try {
      await similarityNotifications(publishedId, actor);
      await db
        .doc(`notification_jobs/${publishedId}`)
        .update({ pending: false });
    } catch {
      console.error("similarity_job_pending");
    }
  }
  return result;
}
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "POST 요청만 가능합니다." }));
    return;
  }
  try {
    const auth = req.headers.authorization;
    requireThat(
      auth && auth.startsWith("Bearer "),
      "먼저 Google 계정으로 로그인해 주세요.",
      401,
    );
    let body = req.body;
    if (!body) {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        requireThat(
          Buffer.byteLength(raw) <= 600000,
          "요청 크기가 너무 큽니다.",
          413,
        );
      }
      body = JSON.parse(raw);
    }
    if (typeof body === "string") body = JSON.parse(body);
    requireThat(
      Buffer.byteLength(JSON.stringify(body)) <= 600000,
      "요청 크기가 너무 큽니다.",
      413,
    );
    const input = z.record(z.unknown()).parse(body),
      action = z.string().max(60).parse(input.action);
    const demoRole = req.headers["x-findit-demo-role"];
    if (demoRole !== undefined) {
      requireThat(WORKSHOP_GUEST_ACCESS, "연수용 역할 시연이 종료되었습니다.");
      const role = z.enum(roles).parse(demoRole);
      database();
      // Real identity is verified, but its real profile/role is never modified.
      await getAuth().verifyIdToken(auth.slice(7), true);
      const result = await demoScope.run(true, async () => {
        const actor = { uid: `demo-${role}`, role, email: `${role}@example.invalid` };
        requireThat((await database().doc(`users/${actor.uid}`).get()).exists, "시연 공간 준비 중입니다.", 503);
        const result = await dispatch(actor, action, input);
        return action === "snapshot" ? { ...result, actorId: actor.uid, demo: true } : result;
      });
      res.statusCode = 200;
      res.end(JSON.stringify(result));
      return;
    }
    const actor = await authenticate(auth.slice(7));
    res.statusCode = 200;
    res.end(JSON.stringify(await dispatch(actor, action, input)));
  } catch (error) {
    res.statusCode =
      error instanceof AppError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 500;
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof z.ZodError
          ? error.issues[0]?.message
          : "저장하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.";
    if (res.statusCode === 500)
      console.error(
        "app_request_failed",
        error instanceof Error ? error.name : "UnknownError",
      );
    res.end(JSON.stringify({ error: message }));
  }
}
