// No tokens are logged or saved. Explicitly scoped to this workshop project.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, deleteUser } from "firebase/auth";
const origin = "https://school-findit.vercel.app";
const cached = JSON.parse(await readFile(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
const headers = { Authorization: `Bearer ${cached.tokens.access_token}`, "Content-Type": "application/json" };
if (process.argv.includes("--enable") || process.argv.includes("--disable")) {
  const enabled = process.argv.includes("--enable");
  const response = await fetch("https://identitytoolkit.googleapis.com/admin/v2/projects/school-findit/config?updateMask=signIn.anonymous.enabled", {
    method: "PATCH", headers, body: JSON.stringify({ signIn: { anonymous: { enabled } } }),
  });
  if (!response.ok) throw new Error(`Anonymous provider configuration failed (${response.status}).`);
  console.log("Firebase anonymous access enabled:", (await response.json()).signIn?.anonymous?.enabled === true);
} else if (process.argv.includes("--check")) {
  const env = await readFile(".env.local", "utf8");
  const key = env.match(/^NEXT_PUBLIC_FIREBASE_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
  if (!key) throw new Error("Missing web configuration.");
  const auth = getAuth(initializeApp({ apiKey: key, projectId: "school-findit" }));
  const { user } = await signInAnonymously(auth);
  const itemIds = [`qa-${randomUUID()}`, `qa-${randomUUID()}`];
  try {
    const token = await user.getIdToken();
    const call = async (action, input = {}) => {
      const res = await fetch(`${origin}/api/app`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...input }) });
      return { status: res.status, data: await res.json() };
    };
    const snapshot = await call("snapshot");
    if (snapshot.status !== 200 || snapshot.data.role !== "student") throw new Error(`Student access failed (${snapshot.status}).`);
    if (snapshot.data.items.some(i => String(i.id).startsWith("demo-"))) throw new Error("Unexpected demo records.");
    console.log("PASS: real anonymous Firebase token → production student snapshot, no demo records.");
    for (const action of ["management", "teacher.verify", "teacher.code"]) {
      const result = await call(action, { code: "invalid-test-only" });
      if (result.status !== 403) throw new Error(`Guest isolation failed for ${action} (${result.status}).`);
      console.log(`PASS: anonymous ${action} denied (403).`);
    }
    for (const [index, kind] of ["lost", "found"].entries()) {
      const result = await call("item.create", { id: itemIds[index], value: { kind, title: "연수 자동접속 검증용 가상 물건", location: "가상 시험 장소", dateText: new Date().toISOString().slice(0, 10), description: "검사 후 삭제할 가상 자료", category: "기타", color: "", imageDataUrl: "" } });
      if (result.status !== 200) throw new Error(`Anonymous ${kind} registration failed (${result.status}).`);
    }
    const saved = await call("snapshot");
    if (!saved.data.items.some(i => i.id === itemIds[0] && i.isMine && i.status === "seeking") || !saved.data.items.some(i => i.id === itemIds[1] && i.isMine && i.status === "pending_handoff")) throw new Error("Saved student records not found.");
    console.log("PASS: anonymous lost/found registration persisted and queried with correct ownership/status.");
  } finally {
    const base = "https://firestore.googleapis.com/v1/projects/school-findit/databases/(default)/documents";
    const targets = [`${base}/users/${user.uid}`, ...itemIds.map(id => `${base}/items/${id}`)];
    const audits = await fetch(`${base}:runQuery`, { method: "POST", headers, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "audit_logs" }], where: { fieldFilter: { field: { fieldPath: "actorId" }, op: "EQUAL", value: { stringValue: user.uid } } } } }) });
    if (!audits.ok) throw new Error(`Test audit cleanup query failed (${audits.status}).`);
    for (const row of await audits.json()) if (row.document?.name && row.document.fields?.actorId?.stringValue === user.uid) targets.push(`https://firestore.googleapis.com/v1/${row.document.name}`);
    for (const url of targets) {
      const cleanup = await fetch(url, { method: "DELETE", headers });
      if (!cleanup.ok) throw new Error(`Test record cleanup failed (${cleanup.status}).`);
    }
    await deleteUser(user);
    console.log("Removed only this test's two items, audit records, anonymous profile and Auth account.");
  }
} else throw new Error("Use --enable, --disable or --check explicitly.");
