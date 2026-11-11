import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { ConversationPrep, NewConversationPrep } from "./conversationPrepTypes";

function prepsCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "conversation_preps");
}

function prepRef(uid: string, id: string) {
  return doc(getFirebaseDb(), "users", uid, "conversation_preps", id);
}

// Written once, only after the AI result parsed — a failed generation leaves no doc.
export async function createConversationPrep(uid: string, prep: NewConversationPrep): Promise<string> {
  const ref = doc(prepsCol(uid));
  const full: ConversationPrep = { ...prep, id: ref.id, createdAt: new Date().toISOString() };
  await setDoc(ref, full);
  return ref.id;
}

export async function getConversationPrep(uid: string, id: string): Promise<ConversationPrep | null> {
  const snap = await getDoc(prepRef(uid, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as ConversationPrep), id: snap.id };
}

/** Newest first. With no `max` every kit is returned. */
export async function listRecentConversationPreps(uid: string, max?: number): Promise<ConversationPrep[]> {
  const newestFirst = orderBy("createdAt", "desc");
  const snap = await getDocs(max === undefined ? query(prepsCol(uid), newestFirst) : query(prepsCol(uid), newestFirst, limit(max)));
  return snap.docs.map((d) => ({ ...(d.data() as ConversationPrep), id: d.id }));
}

export async function deleteConversationPrep(uid: string, id: string): Promise<void> {
  await deleteDoc(prepRef(uid, id));
}
