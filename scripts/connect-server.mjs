// One-time provisioning. Never logs or writes a private key to disk.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const project = "school-findit";
const settings = JSON.parse(
  await readFile(
    join(homedir(), ".config/configstore/firebase-tools.json"),
    "utf8",
  ),
);
const token = settings.tokens?.access_token;
if (!token)
  throw new Error("Run firebase projects:list first to refresh your login.");
async function request(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  if (!response.ok)
    throw new Error(
      `Cloud API ${response.status}: ${json.error?.status || "request failed"}`,
    );
  return json;
}
const serviceEmail = `school-findit-runtime@${project}.iam.gserviceaccount.com`;
const name = `projects/${project}/serviceAccounts/${serviceEmail}`;
if (!process.argv.includes("--provision")) {
  const accounts = await request(
    `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,
  );
  console.log(
    JSON.stringify({
      project,
      runtimeAccountExists:
        accounts.accounts?.some((a) => a.email === serviceEmail) || false,
    }),
  );
  process.exit(0);
}
const linked = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (linked.projectName !== project)
  throw new Error("The Vercel checkout must be linked to school-findit.");
const accounts = await request(
  `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,
);
if (!accounts.accounts?.some((a) => a.email === serviceEmail))
  await request(
    `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,
    "POST",
    {
      accountId: "school-findit-runtime",
      serviceAccount: { displayName: "School Findit Vercel runtime" },
    },
  );
const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
const policy = await request(`${policyUrl}:getIamPolicy`, "POST", {
  options: { requestedPolicyVersion: 3 },
});
for (const role of ["roles/datastore.user", "roles/firebaseauth.viewer"]) {
  let binding = policy.bindings.find((b) => b.role === role && !b.condition);
  if (!binding) {
    binding = { role, members: [] };
    policy.bindings.push(binding);
  }
  if (!binding.members.includes(`serviceAccount:${serviceEmail}`))
    binding.members.push(`serviceAccount:${serviceEmail}`);
}
await request(`${policyUrl}:setIamPolicy`, "POST", { policy });
const key = await request(
  `https://iam.googleapis.com/v1/${name}/keys`,
  "POST",
  {
    privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
    keyAlgorithm: "KEY_ALG_RSA_2048",
  },
);
const secret = Buffer.from(key.privateKeyData, "base64").toString("utf8");
const value = JSON.stringify(JSON.parse(secret));
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "cmd.exe" : "corepack",
      process.platform === "win32"
        ? [
            "/d",
            "/s",
            "/c",
            "corepack pnpm dlx vercel env add FIREBASE_SERVICE_ACCOUNT production --sensitive --yes",
          ]
        : [
            "pnpm",
            "dlx",
            "vercel",
            "env",
            "add",
            "FIREBASE_SERVICE_ACCOUNT",
            "production",
            "--sensitive",
            "--yes",
          ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    // Do not relay output: some CLI versions echo input when running interactively.
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Vercel env add exited ${code}`)),
    );
    child.stdin.end(value);
  });
  console.log(
    "Runtime credential stored as a sensitive Vercel Production variable; no private key written to disk.",
  );
} catch (error) {
  const response = await fetch(`https://iam.googleapis.com/v1/${key.name}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.error(
    `Provisioning failed. New key revocation: ${response.ok ? "complete" : "manual review required"}.`,
  );
  throw error;
}
