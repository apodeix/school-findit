import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  itemId?: string;
  userId: string;
  read: boolean;
  status: "active" | "cancelled";
};

function toNotification(snapshot: QueryDocumentSnapshot<DocumentData>): AppNotification {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    title: String(data.title ?? "새 알림"),
    message: String(data.message ?? ""),
    itemId: typeof data.itemId === "string" ? data.itemId : undefined,
    userId: String(data.userId ?? ""),
    read: data.read === true,
    status: data.status === "cancelled" ? "cancelled" : "active",
  };
}

export function subscribeToAllNotifications(
  db: Firestore,
  onNotifications: (notifications: AppNotification[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "notifications")),
    snapshot => onNotifications(snapshot.docs.map(toNotification).reverse()),
    onError,
  );
}

export function subscribeToNotifications(
  db: Firestore,
  userId: string,
  onNotifications: (notifications: AppNotification[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
  );
  return onSnapshot(
    notificationsQuery,
    snapshot => onNotifications(snapshot.docs.map(toNotification).reverse()),
    onError,
  );
}

export async function markNotificationRead(db: Firestore, notificationId: string) {
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelNotification(db: Firestore, notificationId: string, adminId: string) {
  await updateDoc(doc(db, "notifications", notificationId), {
    status: "cancelled",
    cancelledBy: adminId,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
