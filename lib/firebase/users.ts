import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";

export async function ensureStudentProfile(db: Firestore, user: User) {
  const userReference = doc(db, "users", user.uid);
  const current = await getDoc(userReference);
  if (current.exists()) return;

  await setDoc(userReference, {
    email: user.email,
    role: "student",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
