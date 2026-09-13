import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const schoolEmailDomain =
  process.env.NEXT_PUBLIC_SCHOOL_EMAIL_DOMAIN?.trim().toLowerCase() ?? "";

export const isFirebaseConfigured =
  Object.values(firebaseConfig).every((value) => Boolean(value?.trim()));

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

let services: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase 프로젝트 또는 학교 이메일 도메인 설정이 없습니다.");
  }

  if (services) return services;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  services = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
  return services;
}

export function isAllowedSchoolEmail(email: string | null): boolean {
  if (!email) return false;
  // 학교 도메인을 확정하기 전에는 Firestore의 비공개 허용 계정 규칙이
  // 실제 데이터 접근을 통제한다.
  if (!schoolEmailDomain) return true;
  const [, domain, ...rest] = email.toLowerCase().split("@");
  return rest.length === 0 && domain === schoolEmailDomain;
}
