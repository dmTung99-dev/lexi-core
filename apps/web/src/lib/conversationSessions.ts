import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { ConversationReport, ConversationSession, ConversationSetup } from "./conversationTypes";

export type ConversationProgress = Partial<
  Pick<ConversationSession, "messages" | "goalsDone" | "summary" | "summarizedCount">
>;

function sessionsCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "conversation_sessions");
}

function sessionRef(uid: string, id: string) {
  return doc(getFirebaseDb(), "users", uid, "conversation_sessions", id);
}

export async function createConversationSession(uid: string, setup: ConversationSetup): Promise<string> {
  const ref = doc(sessionsCol(uid));
  const session: ConversationSession = {
    id: ref.id,
    createdAt: new Date().toISOString(),
    status: "in_progress",
    setup,
    summary: "",
    summarizedCount: 0,
    messages: [],
    goalsDone: [],
    report: null,
    reportError: false,
  };
  await setDoc(ref, session);
  return ref.id;
}

export async function getConversationSession(uid: string, id: string): Promise<ConversationSession | null> {
  const snap = await getDoc(sessionRef(uid, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as ConversationSession), id: snap.id };
}

// Called after every message with the full arrays — a closed tab still leaves
// every completed message gradable.
export async function saveConversationProgress(uid: string, id: string, patch: ConversationProgress): Promise<void> {
  await updateDoc(sessionRef(uid, id), patch);
}

export async function completeConversationSession(
  uid: string,
  id: string,
  report: ConversationReport | null
): Promise<void> {
  await updateDoc(sessionRef(uid, id), { status: "completed", report, reportError: report === null });
}

export async function deleteConversationSession(uid: string, id: string): Promise<void> {
  await deleteDoc(sessionRef(uid, id));
}

// Over-fetch then filter client-side: a single-field orderBy needs no
// composite index, and abandoned in_progress sessions are rare.
export async function listRecentConversationSessions(uid: string, max = 5): Promise<ConversationSession[]> {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("createdAt", "desc"), limit(20)));
  return snap.docs
    .map((d) => ({ ...(d.data() as ConversationSession), id: d.id }))
    .filter((s) => s.status === "completed")
    .slice(0, max);
}
