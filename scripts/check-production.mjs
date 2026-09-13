import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const origin = "https://school-findit.vercel.app";
const page = await fetch(origin, { cache: "no-store" });
const html = await page.text();
console.log("Production page:", page.status);
const unauth = await fetch(`${origin}/api/app`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "snapshot" }) });
console.log("Unauthenticated API (expected 401):", unauth.status);
const paths = [...html.matchAll(/(?:src|href)="([^" ]+\.js)"/g)].map(m => m[1]);
let source = "";
for (const path of [...new Set(paths)].slice(0, 15)) {
  const url = new URL(path, origin); if (url.origin !== origin) continue;
  const js = await (await fetch(url)).text(); source += js;
  for (const match of js.matchAll(/["']([^"']*(?:findit|lost-found)[^"']*\.js)["']/g)) {
    const chunk = new URL(match[1], url); if (chunk.origin === origin) source += await (await fetch(chunk)).text();
  }
}
console.log("Shipped clue form:", source.includes("단서 내용 (필수)") || source.includes("단서 내용"));
console.log("Old fake clue success present:", source.includes("찾기 단서를 남겼습니다."));
if (process.argv.includes("--authenticated")) {
  const cached = JSON.parse(await readFile(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  const env = await readFile(".env.local", "utf8");
  const key = env.match(/^NEXT_PUBLIC_FIREBASE_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
  if (!key) throw new Error("Missing Firebase web app configuration.");
  const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestUri: origin, postBody: new URLSearchParams({ providerId: "google.com", access_token: cached.tokens.access_token }).toString(), returnSecureToken: true, returnIdpCredential: false }) });
  const auth = await authResponse.json();
  if (!authResponse.ok || !auth.idToken) { console.log("Google app sign-in check:", authResponse.status, auth.error?.message || "not completed"); }
  else {
    const response = await fetch(`${origin}/api/app`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ action: "snapshot" }) });
    let snapshot; try { snapshot = await response.json(); } catch { snapshot = {}; }
    console.log("Authenticated API:", response.status, "role:", snapshot.role || "unavailable");
    console.log("Signed-in data contains demo IDs:", Array.isArray(snapshot.items) ? snapshot.items.some(i => String(i.id).startsWith("demo-")) : "unavailable");
    if (!response.ok) console.log("User-facing error:", snapshot.error || "server error");
  }
}
