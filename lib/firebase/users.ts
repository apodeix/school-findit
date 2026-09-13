import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";

export type UserRole = "student" | "teacher" | "final_admin";

function readRole(value: unknown): UserRole {
  return value === "teacher" || value === "final_admin" ? value : "student";
}

export async function ensureUserProfile(db: Firestore, user: User): Promise<UserRole> {
  const userReference = doc(db, "users", user.uid);
  const current = await getDoc(userReference);
  if (current.exists()) {
    const storedRole = readRole(current.data().role);
    if (storedRole !== "student") return storedRole;
    const verification = await getDoc(doc(db, "teacher_verifications", user.uid));
    return verification.exists() && verification.data().active === true ? "teacher" : "student";
  }

  const profile = {
    email: user.email,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 최초 관리자 계정인지는 서버 보안 규칙이 판정한다. 일반 사용자가
  // final_admin을 요청해도 규칙에서 거부되며 학생 프로필로 다시 시도한다.
  try {
    await setDoc(userReference, { ...profile, role: "final_admin" });
    return "final_admin";
  } catch {
    await setDoc(userReference, { ...profile, role: "student" });
    return "student";
  }
}
