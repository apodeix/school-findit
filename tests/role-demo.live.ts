import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { initializeApp as initializeClient } from "firebase/app";
import { getAuth, signInAnonymously, deleteUser } from "firebase/auth";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DEMO_ROOT } from "../lib/server/demo-scope.ts";
import { today } from "../lib/domain.ts";
import type { Snapshot } from "../lib/api-client.ts";
if (!process.argv.includes("--check-isolated-demo")) throw new Error("Explicit opt-in required.");
const cached = JSON.parse(await readFile(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
const env = await readFile(".env.local", "utf8");
const apiKey = env.match(/^NEXT_PUBLIC_FIREBASE_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
const requireAdmin = createRequire(createRequire(import.meta.url).resolve("firebase-admin"));
const { GoogleAuth, OAuth2Client } = requireAdmin("google-auth-library");
const client = new OAuth2Client();
client.setCredentials({ access_token: cached.tokens.access_token, expiry_date: Date.now() + 1800000 });
initializeApp({ projectId: "school-findit" });
const db = getFirestore();
db.settings({ auth: new GoogleAuth({ authClient: client, projectId: "school-findit" }), preferRest: true });
const auth = getAuth(initializeClient({ apiKey, projectId: "school-findit" }));
const { user } = await signInAnonymously(auth);
const id = `qa-demo-${randomUUID()}`;
const securityBefore = (await db.doc("app_settings/security").get()).updateTime?.toMillis();
const call = async (role: string | null, action: string, input = {}) => {
  const res = await fetch("https://school-findit.vercel.app/api/app", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`, ...(role ? { "X-Findit-Demo-Role": role } : {}) }, body: JSON.stringify({ action, ...input }) });
  return { status: res.status, data: await res.json() as Snapshot };
};
try {
  for (const role of ["student", "teacher", "final_admin"]) {
    const r = await call(role, "snapshot");
    assert.equal(r.status, 200); assert.equal(r.data.role, role); assert.equal(r.data.demo, true);
  }
  assert.equal((await call("student", "management")).status, 403);
  const create = await call("student", "item.create", { id, value: { kind: "found", title: id, location: id, dateText: today(), description: "격리 검증용 가상 자료", category: "기타", color: "", imageDataUrl: "" } });
  assert.equal(create.status, 200);
  assert.equal((await db.doc(`items/${id}`).get()).exists, false);
  assert.equal((await db.doc(`${DEMO_ROOT}/items/${id}`).get()).data()?.status, "pending_handoff");
  assert.equal((await call("teacher", "item.handoff", { id, storageLocation: "가상 교무실" })).status, 200);
  const student = await call("student", "snapshot");
  const reward = student.data.rewards.find((r: { relatedItemId: string }) => r.relatedItemId === id);
  assert.equal(reward?.points, 3);
  assert.equal((await call("final_admin", "reward.cancel", { id: reward.id, reason: "격리 검증 취소" })).status, 200);
  assert.equal((await call("final_admin", "item.delete", { id })).status, 200);
  const live = await call(null, "snapshot");
  assert.equal(live.data.role, "student"); assert.equal(live.data.demo, undefined);
  assert.equal((await call(null, "management")).status, 403);
  assert.equal((await db.doc(`items/${id}`).get()).exists, false);
  assert.equal((await db.doc("app_settings/security").get()).updateTime?.toMillis(), securityBefore);
  console.log("PASS: all three demo roles, student denial, handoff +3, admin cancellation/deletion, unchanged real role/security and no real item writes.");
} finally {
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const path of [`${DEMO_ROOT}/items/${id}`, `${DEMO_ROOT}/notification_jobs/${id}`, `users/${user.uid}`]) refs.set(path, db.doc(path));
  const collect = async (collection: string, field: string, value: string) => {
    const result = await db.collection(`${DEMO_ROOT}/${collection}`).where(field, "==", value).get();
    for (const doc of result.docs) refs.set(doc.ref.path, doc.ref);
    return result.docs;
  };
  const rewards = await collect("reward_transactions", "relatedItemId", id);
  await collect("notifications", "itemId", id);
  await collect("audit_logs", "targetId", id);
  for (const reward of rewards) await collect("audit_logs", "targetId", reward.id);
  const batch = db.batch(); for (const ref of refs.values()) batch.delete(ref); await batch.commit();
  await deleteUser(user);
  console.log("Cleaned only this run's synthetic records and temporary Auth account. Copied demo records retained.");
}
