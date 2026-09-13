import test from "node:test";
import assert from "node:assert/strict";
import { hashTeacherCode, matchesTeacherCode, newTeacherCode } from "../lib/server/teacher-code.ts";
test("새 교사 코드는 짧거나 단순한 조합을 거부한다", () => {
  for (const code of ["12345678", "123456789012", "aaaaaaaaaaaa", "password12345", "schoolfindit1"]) assert.equal(newTeacherCode.safeParse(code).success, false);
  assert.equal(newTeacherCode.safeParse("Example-7z!K2v9").success, true);
});
test("같은 코드도 서로 다른 salt/hash로 저장되며 원문은 저장하지 않는다", () => {
  const code = "Example-7z!K2v9", a = hashTeacherCode(code), b = hashTeacherCode(code);
  assert.notEqual(a.teacherCodeHash, b.teacherCodeHash);
  assert.notEqual(a.teacherCodeSalt, b.teacherCodeSalt);
  assert.equal(matchesTeacherCode(code, a), true);
  assert.equal(matchesTeacherCode("Wrong-4u!Y3k6", a), false);
  assert.equal(JSON.stringify(a).includes(code), false);
});
