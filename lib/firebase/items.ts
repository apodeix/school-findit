import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

const statusLabels: Record<string, string> = {
  seeking: "찾는 중",
  found: "찾았어요",
  closed: "종료",
  pending_handoff: "전달 대기",
  teacher_received: "교사 인수",
  looking_for_owner: "주인 찾는 중",
  returned: "반환 완료",
};

export type ItemKind = "lost" | "found";

export type StoredItem = {
  id: string;
  kind: ItemKind;
  title: string;
  category: string;
  location: string;
  date: string;
  status: string;
  color: string;
  tone: string;
  clueCount: number;
  description: string;
};

type CreateItemInput = {
  kind: ItemKind;
  title: string;
  location: string;
  description: string;
  authorId: string;
};

function toStoredItem(snapshot: QueryDocumentSnapshot<DocumentData>): StoredItem {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    kind: data.kind === "found" ? "found" : "lost",
    title: String(data.title ?? "이름 없는 물건"),
    category: String(data.category ?? "기타"),
    location: String(data.location ?? "장소 확인 중"),
    date: String(data.dateText ?? "날짜 확인 중"),
    status: statusLabels[String(data.status)] ?? "확인 중",
    color: String(data.color ?? ""),
    tone: data.kind === "found" ? "blue" : "violet",
    clueCount: Number(data.clueCount ?? 0),
    description: String(data.description ?? "상세 설명이 없습니다."),
  };
}

export function subscribeToPublishedItems(
  db: Firestore,
  onItems: (items: StoredItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const itemsQuery = query(
    collection(db, "items"),
    where("isPublished", "==", true),
  );

  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map(toStoredItem)
        .sort((a, b) => b.id.localeCompare(a.id));
      onItems(items);
    },
    onError,
  );
}

export async function createItem(db: Firestore, input: CreateItemInput) {
  const isLost = input.kind === "lost";
  return addDoc(collection(db, "items"), {
    kind: input.kind,
    title: input.title.trim(),
    category: "기타",
    color: "",
    location: input.location.trim(),
    dateText: "오늘",
    description: input.description.trim(),
    authorId: input.authorId,
    status: isLost ? "seeking" : "pending_handoff",
    isPublished: isLost,
    clueCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
