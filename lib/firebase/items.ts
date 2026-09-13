import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
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
  imageUrl?: string;
  authorId?: string;
  isPublished?: boolean;
};

type CreateItemInput = {
  kind: ItemKind;
  title: string;
  location: string;
  description: string;
  authorId: string;
  imageDataUrl?: string;
  dateText: string;
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
    imageUrl: typeof data.imageDataUrl === "string"
      ? data.imageDataUrl
      : typeof data.imageUrl === "string"
        ? data.imageUrl
        : undefined,
    authorId: String(data.authorId ?? ""),
    isPublished: data.isPublished === true,
  };
}

export function subscribeToPublishedItems(
  db: Firestore,
  canReviewPending: boolean,
  userId: string,
  onItems: (items: StoredItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const publish = (groups: StoredItem[][]) => {
    const merged = new Map<string, StoredItem>();
    groups.flat().forEach(item => merged.set(item.id, item));
    onItems([...merged.values()].sort((a, b) => b.id.localeCompare(a.id)));
  };

  if (canReviewPending) {
    return onSnapshot(
      query(collection(db, "items")),
      snapshot => publish([snapshot.docs.map(toStoredItem)]),
      onError,
    );
  }

  let publishedItems: StoredItem[] = [];
  let ownItems: StoredItem[] = [];
  const unsubscribePublished = onSnapshot(
    query(collection(db, "items"), where("isPublished", "==", true)),
    snapshot => {
      publishedItems = snapshot.docs.map(toStoredItem);
      publish([publishedItems, ownItems]);
    },
    onError,
  );
  const unsubscribeOwn = onSnapshot(
    query(collection(db, "items"), where("authorId", "==", userId)),
    snapshot => {
      ownItems = snapshot.docs.map(toStoredItem);
      publish([publishedItems, ownItems]);
    },
    onError,
  );
  return () => {
    unsubscribePublished();
    unsubscribeOwn();
  };
}

export async function confirmItemHandoff(
  db: Firestore,
  itemId: string,
  teacherId: string,
  recipientId: string,
  storageLocation: string,
) {
  const batch = writeBatch(db);
  batch.update(doc(db, "items", itemId), {
    status: "teacher_received",
    isPublished: true,
    storageLocation: storageLocation.trim(),
    receivedById: teacherId,
    receivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const notificationRef = doc(collection(db, "notifications"));
  batch.set(notificationRef, {
    userId: recipientId,
    type: "found_item_received",
    title: "등록한 습득물을 선생님이 인수했어요",
    message: `보관 장소: ${storageLocation.trim()}`,
    itemId,
    read: false,
    status: "active",
    createdBy: teacherId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function createItem(
  db: Firestore,
  input: CreateItemInput,
) {
  const isLost = input.kind === "lost";
  const itemRef = doc(collection(db, "items"));
  await setDoc(itemRef, {
    kind: input.kind,
    title: input.title.trim(),
    category: "기타",
    color: "",
    location: input.location.trim(),
    dateText: input.dateText,
    description: input.description.trim(),
    authorId: input.authorId,
    status: isLost ? "seeking" : "pending_handoff",
    isPublished: isLost,
    clueCount: 0,
    imageDataUrl: input.imageDataUrl ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return itemRef;
}
