import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

const MIN_CODE_LENGTH = 8;
const MAX_CODE_LENGTH = 32;

function normalizeCode(code: string) {
  return code.trim();
}

function validateCode(code: string) {
  if (code.length < MIN_CODE_LENGTH || code.length > MAX_CODE_LENGTH) {
    throw new Error("인증코드는 8~32자로 입력해 주세요.");
  }
}

async function hashCode(code: string) {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyTeacherCode(db: Firestore, userId: string, code: string) {
  const normalized = normalizeCode(code);
  validateCode(normalized);
  const codeHash = await hashCode(normalized);
  await setDoc(doc(db, "teacher_verifications", userId), {
    userId,
    codeHash,
    active: true,
    verifiedAt: serverTimestamp(),
  });
}

export async function changeTeacherCode(db: Firestore, adminId: string, code: string) {
  const normalized = normalizeCode(code);
  validateCode(normalized);
  const teacherCodeHash = await hashCode(normalized);
  await updateDoc(doc(db, "app_settings", "security"), {
    teacherCodeHash,
    teacherCodeUpdatedAt: serverTimestamp(),
    teacherCodeUpdatedBy: adminId,
  });
}
