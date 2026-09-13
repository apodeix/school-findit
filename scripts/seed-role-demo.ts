import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { DEMO_ROOT } from "../lib/server/demo-scope.ts";
if (!process.argv.includes("--copy-current")) throw new Error("Explicit --copy-current required.");
const cached = JSON.parse(await readFile(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
const requireAdmin = createRequire(createRequire(import.meta.url).resolve("firebase-admin"));
const { GoogleAuth, OAuth2Client } = requireAdmin("google-auth-library");
const client = new OAuth2Client();
client.setCredentials({ access_token: cached.tokens.access_token, expiry_date: Date.now() + 1800000 });
initializeApp({ projectId: "school-findit" });
const db = getFirestore();
db.settings({ auth: new GoogleAuth({ authClient: client, projectId: "school-findit" }), preferRest: true });
const root = db.doc(DEMO_ROOT);
if ((await root.get()).exists) throw new Error("Demo space already exists; refusing to overwrite it.");
const [items, clues] = await Promise.all([db.collection("items").get(), db.collection("clues").get()]);
const writes: { path: string; value: FirebaseFirestore.DocumentData }[] = [];
for (const role of ["student", "teacher", "final_admin"])
  writes.push({ path: `users/demo-${role}`, value: { role, email: `${role}@example.invalid`, active: true } });
writes.push({ path: "users/demo-helper", value: { role: "student", email: "helper@example.invalid", active: true } });
writes.push({ path: "app_settings/security", value: { demoOnly: true } });
const itemFields = ["kind", "title", "location", "dateText", "description", "category", "color", "storageLocation", "imageDataUrl", "hasImage", "status", "isPublished", "hidden", "createdAt", "updatedAt", "clueCount"];
const copied = new Set<string>();
for (const doc of items.docs) {
  const data = doc.data();
  if (data.deleted) continue;
  const role = ["teacher", "final_admin"].includes(data.authorRole) ? data.authorRole : "student";
  const value = Object.fromEntries(itemFields.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  Object.assign(value, { authorId: `demo-${role}`, authorRole: role, receivedById: data.receivedById ? "demo-teacher" : "", deleted: false });
  writes.push({ path: `items/${doc.id}`, value });
  copied.add(doc.id);
}
let clueCount = 0;
for (const doc of clues.docs) {
  const data = doc.data();
  if (data.deleted || !copied.has(data.itemId)) continue;
  const fields = ["itemId", "place", "seenDate", "seenTime", "detail", "hidden", "createdAt", "updatedAt"];
  const value = Object.fromEntries(fields.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  Object.assign(value, { authorId: "demo-helper", deleted: false });
  writes.push({ path: `clues/${doc.id}`, value });
  clueCount++;
}
await root.create({ state: "preparing", createdAt: FieldValue.serverTimestamp() });
for (let offset = 0; offset < writes.length; offset += 400) {
  const batch = db.batch();
  for (const write of writes.slice(offset, offset + 400)) batch.create(db.doc(`${DEMO_ROOT}/${write.path}`), write.value);
  await batch.commit();
}
await root.update({ state: "ready", copiedItems: copied.size, copiedClues: clueCount });
console.log(`Copied ${copied.size} items and ${clueCount} clues into isolated demo space. No source records, real profiles or security settings were changed/copied.`);
