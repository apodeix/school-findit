// Explicit opt-in integration check; only synthetic qa-* records are created/removed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { dispatch } from "../api/app.ts";
import { today, type Role } from "../lib/domain.ts";
import { getRewardSummary, type RewardTransaction } from "../lib/rewards.ts";
if (!process.argv.includes("--live-school-findit"))
  throw new Error(
    "Use --live-school-findit only for an authorized isolated production-data test.",
  );
const settings = JSON.parse(
  await readFile(
    join(homedir(), ".config/configstore/firebase-tools.json"),
    "utf8",
  ),
);
initializeApp({ projectId: "school-findit" });
const db = getFirestore(),
  prefix = `qa-${randomUUID()}`;
const requireAdmin = createRequire(
  createRequire(import.meta.url).resolve("firebase-admin"),
);
const { GoogleAuth, OAuth2Client } = requireAdmin("google-auth-library");
const client = new OAuth2Client();
client.setCredentials({
  access_token: settings.tokens.access_token,
  expiry_date: Date.now() + 1800000,
});
db.settings({
  auth: new GoogleAuth({ authClient: client, projectId: "school-findit" }),
  preferRest: true,
});
const actor = (suffix: string, role: Role) => ({
  uid: `${prefix}-${suffix}`,
  role,
  email: `${suffix}@example.invalid`,
});
const owner = actor("owner", "student"),
  helper = actor("helper", "student"),
  teacher = actor("teacher", "teacher"),
  admin = actor("admin", "final_admin"),
  other = actor("other", "student");
const actors = [owner, helper, teacher, admin, other],
  itemIds = [`${prefix}-lost`, `${prefix}-found`, `${prefix}-direct`, `${prefix}-teacher-lost`],
  clueIds = [`${prefix}-clue1`, `${prefix}-clue2`, `${prefix}-teacher-clue`];
const value = (kind: "lost" | "found") => ({
  kind,
  title: `${prefix} 시험 물건`,
  location: `${prefix} 시험 장소`,
  dateText: today(),
  description: "자동 검증용 가상 자료입니다.",
  category: "기타",
  color: prefix.slice(0, 20),
  imageDataUrl: "",
});
const clueValue = {
  place: "가상 도서관",
  seenDate: today(),
  seenTime: "점심시간",
  detail: "시험용 단서입니다.",
};
let checks = 0;
function ok(condition: unknown) {
  assert.ok(condition);
  checks++;
}
async function deny(p: Promise<unknown>) {
  await assert.rejects(p);
  checks++;
}
try {
  for (const a of actors)
    await db
      .doc(`users/${a.uid}`)
      .create({ email: a.email, role: a.role, active: true });
  await dispatch(owner, "item.create", {
    id: itemIds[0],
    value: value("lost"),
  });
  await dispatch(owner, "item.create", {
    id: itemIds[1],
    value: value("found"),
  });
  await deny(
    dispatch(helper, "item.handoff", {
      id: itemIds[1],
      storageLocation: "가상 교무실",
    }),
  );
  const before = (await dispatch(helper, "snapshot", {})) as {
    items: { id: string; authorId?: string }[];
  };
  ok(!before.items.some((i) => i.id === itemIds[1]));
  ok(before.items.find((i) => i.id === itemIds[0])?.authorId === undefined);
  await deny(
    dispatch(helper, "clue.create", {
      id: clueIds[0],
      itemId: itemIds[0],
      value: { ...clueValue, detail: " \n " },
    }),
  );
  ok(!(await db.doc(`clues/${clueIds[0]}`).get()).exists);
  for (const id of clueIds.slice(0, 2))
    await dispatch(helper, "clue.create", {
      id,
      itemId: itemIds[0],
      value: clueValue,
    });
  await dispatch(helper, "clue.edit", {
    id: clueIds[0],
    value: { ...clueValue, detail: "수정된 시험 단서" },
  });
  await deny(
    dispatch(other, "clue.edit", { id: clueIds[0], value: clueValue }),
  );
  await deny(dispatch(helper, "clue.helpful", { id: clueIds[0] }));
  const helpful = await Promise.allSettled(
    clueIds.slice(0, 2).map((id) => dispatch(owner, "clue.helpful", { id })),
  );
  ok(helpful.filter((r) => r.status === "fulfilled").length === 1);
  const h = await db
    .collection("reward_transactions")
    .where("relatedItemId", "==", itemIds[0])
    .get();
  ok(h.size === 1 && h.docs[0].data().points === 1);
  const handoff = await Promise.allSettled(
    [1, 2].map(() =>
      dispatch(teacher, "item.handoff", {
        id: itemIds[1],
        storageLocation: "가상 교무실",
      }),
    ),
  );
  ok(handoff.filter((r) => r.status === "fulfilled").length === 1);
  const r = await db
    .collection("reward_transactions")
    .where("relatedItemId", "==", itemIds[1])
    .get();
  ok(r.size === 1 && r.docs[0].data().points === 3);
  await dispatch(teacher, "item.create", {
    id: itemIds[2],
    value: { ...value("found"), storageLocation: "가상 보관함" },
  });
  ok(
    (await db.doc(`items/${itemIds[2]}`).get()).data()?.status ===
      "looking_for_owner",
  );
  const notices = await db
    .collection("notifications")
    .where("userId", "==", owner.uid)
    .get();
  ok(notices.docs.some((d) => d.data().title.includes("새 단서")));
  ok(notices.docs.some((d) => d.data().title.includes("비슷한")));
  ok(notices.docs.some((d) => d.data().title.includes("+3점")));
  await dispatch(teacher, "item.storage", {
    id: itemIds[1],
    storageLocation: "가상 보관함 2",
  });
  await deny(
    dispatch(owner, "item.status", { id: itemIds[1], status: "returned" }),
  );
  await dispatch(teacher, "item.status", {
    id: itemIds[1],
    status: "returned",
  });
  await dispatch(owner, "item.status", { id: itemIds[0], status: "found" });
  await dispatch(owner, "item.status", { id: itemIds[0], status: "closed" });
  await deny(
    dispatch(helper, "clue.create", {
      id: `${prefix}-closedclue`,
      itemId: itemIds[0],
      value: clueValue,
    }),
  );
  await dispatch(helper, "report.create", {
    id: itemIds[0],
    targetType: "items",
    reason: "검증용 신고",
  });
  await dispatch(teacher, "item.hide", {
    id: itemIds[0],
    hidden: true,
    reason: "검증용 숨김",
  });
  const hidden = (await dispatch(other, "snapshot", {})) as {
    items: { id: string }[];
    clues: { id: string }[];
  };
  ok(
    !hidden.items.some((i) => i.id === itemIds[0]) &&
      !hidden.clues.some((c) => clueIds.includes(c.id)),
  );
  await deny(
    dispatch(teacher, "item.hide", {
      id: itemIds[0],
      hidden: false,
      reason: "교사는 해제 불가",
    }),
  );
  await dispatch(admin, "item.hide", {
    id: itemIds[0],
    hidden: false,
    reason: "검증 해제",
  });
  await deny(
    dispatch(other, "reward.cancel", { id: r.docs[0].id, reason: "권한 없음" }),
  );
  await dispatch(teacher, "reward.cancel", {
    id: r.docs[0].id,
    reason: "검증 지급 취소",
  });
  await dispatch(teacher, "reward.cancel", {
    id: r.docs[0].id,
    reason: "중복 취소 검증",
  });
  const own = (await dispatch(owner, "snapshot", {})) as unknown as {
    rewards: RewardTransaction[];
  };
  ok(getRewardSummary(own.rewards, owner.uid).totalPoints === 0);
  await dispatch(owner, "notification.read", { id: notices.docs[0].id });
  await dispatch(admin, "notification.cancel", { id: notices.docs[0].id });
  const cancelled = (
    await db.doc(`notifications/${notices.docs[0].id}`).get()
  ).data();
  ok(
    cancelled?.status === "cancelled" &&
      cancelled?.cancelledBy === admin.uid &&
      cancelled?.read === false,
  );
  await deny(
    dispatch(helper, "role.change", { id: helper.uid, role: "final_admin" }),
  );
  // Teachers keep every ordinary lost-item capability, not just staff duties.
  await dispatch(teacher, "item.create", { id: itemIds[3], value: value("lost") });
  const teacherView = await dispatch(teacher, "snapshot", {}) as { items: { id: string; isMine: boolean; status: string }[] };
  ok(teacherView.items.some(i => i.id === itemIds[3] && i.isMine && i.status === "seeking"));
  await dispatch(helper, "clue.create", { id: clueIds[2], itemId: itemIds[3], value: clueValue });
  await dispatch(teacher, "clue.helpful", { id: clueIds[2] });
  await dispatch(teacher, "item.edit", { id: itemIds[3], value: { ...value("lost"), title: "가상 교사 분실물 수정" } });
  await dispatch(teacher, "item.status", { id: itemIds[3], status: "found" });
  await dispatch(teacher, "item.status", { id: itemIds[3], status: "closed" });
  ok((await db.doc(`items/${itemIds[3]}`).get()).data()?.status === "closed");
  const teacherNotices = await db.collection("notifications").where("userId", "==", teacher.uid).get();
  ok(teacherNotices.docs.some(d => d.data().title.includes("새 단서")));
  await dispatch(admin, "role.change", { id: teacher.uid, role: "student" });
  await deny(
    dispatch(teacher, "item.hide", {
      id: itemIds[0],
      hidden: true,
      reason: "회수된 권한",
    }),
  );
  await dispatch(owner, "item.delete", { id: itemIds[0] });
  await deny(
    dispatch(owner, "item.edit", { id: itemIds[0], value: value("lost") }),
  );
  ok((await db.doc(`items/${itemIds[0]}`).get()).data()?.deleted === true);
  console.log(
    `PASS: ${checks} live backend assertions (isolated synthetic records).`,
  );
} finally {
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  const collect = async (collection: string, field: string, ids: string[]) => {
    for (const id of ids)
      for (const doc of (
        await db.collection(collection).where(field, "==", id).get()
      ).docs)
        refs.set(doc.ref.path, doc.ref);
  };
  // Queries are constrained to the random run's actor/item identifiers, never a collection-wide delete.
  await collect(
    "audit_logs",
    "actorId",
    actors.map((a) => a.uid),
  );
  await collect(
    "notifications",
    "userId",
    actors.map((a) => a.uid),
  );
  await collect("reward_transactions", "relatedItemId", itemIds);
  await collect(
    "reports",
    "reporterId",
    actors.map((a) => a.uid),
  );
  for (const a of actors)
    for (const collection of [
      "users",
      "teacher_verifications",
      "verification_attempts",
    ])
      refs.set(`${collection}/${a.uid}`, db.doc(`${collection}/${a.uid}`));
  for (const id of itemIds)
    for (const collection of ["items", "notification_jobs"])
      refs.set(`${collection}/${id}`, db.doc(`${collection}/${id}`));
  for (const id of [...clueIds, `${prefix}-closedclue`])
    refs.set(`clues/${id}`, db.doc(`clues/${id}`));
  const batch = db.batch();
  for (const ref of refs.values()) batch.delete(ref);
  await batch.commit();
  console.log(
    `Cleaned ${refs.size} test-owned records. No user records were removed.`,
  );
}
