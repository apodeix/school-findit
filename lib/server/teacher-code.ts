import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const newTeacherCode = z.string().trim().min(12, "새 인증코드는 12~32자로 설정해 주세요.").max(32)
  .regex(/^[A-Za-z0-9!@#$%^&*+_=?-]+$/, "영문·숫자·기호로 설정해 주세요.")
  .refine(value => [/[a-zA-Z]/, /[0-9]/, /[!@#$%^&*+_=?-]/].filter(pattern => pattern.test(value)).length >= 2, "영문·숫자·기호 중 두 종류 이상을 조합해 주세요.")
  .refine(value => !/(.)\1{5}|123456|abcdef|qwerty|password|schoolfindit/i.test(value), "반복 문자나 쉽게 추측할 수 있는 코드는 피해주세요.");
export function hashTeacherCode(code: string) {
  const salt = randomBytes(16).toString("hex");
  return { teacherCodeSalt: salt, teacherCodeHash: scryptSync(code, salt, 32).toString("hex"), teacherCodeAlgorithm: "scrypt" };
}
export function matchesTeacherCode(code: string, settings: Record<string, unknown>) {
  const expected = String(settings.teacherCodeHash || "");
  const actual = settings.teacherCodeAlgorithm === "scrypt" ? scryptSync(code, String(settings.teacherCodeSalt), 32).toString("hex") : createHash("sha256").update(code).digest("hex");
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
