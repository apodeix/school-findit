import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";

export async function ensureUserProfile(db: Firestore, user: User) {
  const userReference = doc(db, "users", user.uid);
  const current = await getDoc(userReference);
  if (current.exists()) return;

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
  } catch {
    await setDoc(userReference, { ...profile, role: "student" });
  }
}
