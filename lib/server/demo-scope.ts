import { AsyncLocalStorage } from "node:async_hooks";
import type { Firestore } from "firebase-admin/firestore";

// A request cannot choose a collection path. The sandbox root is server-owned.
export const DEMO_ROOT = "workshop_spaces/role-demo-v1";
export const demoScope = new AsyncLocalStorage<boolean>();
export function scopedDatabase(db: Firestore) {
  const root = demoScope.getStore() ? `${DEMO_ROOT}/` : "";
  return {
    collection: (path: string) => db.collection(`${root}${path}`),
    doc: (path: string) => db.doc(`${root}${path}`),
    runTransaction: db.runTransaction.bind(db),
  };
}
