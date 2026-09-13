import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { demoScope, scopedDatabase, DEMO_ROOT } from "../lib/server/demo-scope.ts";
test("시연과 운영 요청은 병렬 실행 중에도 다른 저장 경로를 사용한다", async () => {
  const fake = { doc: (path: string) => path, collection: (path: string) => path, runTransaction: () => {} } as unknown as Firestore;
  await Promise.all([
    demoScope.run(true, async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      for (const name of ["items", "clues", "users", "app_settings", "reward_transactions", "audit_logs", "notifications"]) {
        assert.equal(scopedDatabase(fake).doc(`${name}/test`), `${DEMO_ROOT}/${name}/test`);
        assert.equal(scopedDatabase(fake).collection(name), `${DEMO_ROOT}/${name}`);
      }
    }),
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(scopedDatabase(fake).doc("app_settings/security"), "app_settings/security");
      assert.equal(scopedDatabase(fake).collection("users"), "users");
    })(),
  ]);
  assert.equal(scopedDatabase(fake).doc("items/test"), "items/test");
});
