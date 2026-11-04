import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { SessionMemorySnapshot } from "./learnerMemoryTypes";
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

export async function createConversationSession(uid: string, setup: ConversationSetup,
  memory?: SessionMemorySnapshot
): Promise<string> {
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
    ...(memory ? { memory } : {}),
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

/** In-progress sessions older than this are left out of the "Đang dở" list. */
export const UNFINISHED_MAX_AGE_DAYS = 14;

// Over-fetch then filter client-side: a single-field orderBy needs no
// composite index.
async function listLatest(uid: string): Promise<ConversationSession[]> {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("createdAt", "desc"), limit(20)));
  return snap.docs.map((d) => ({ ...(d.data() as ConversationSession), id: d.id }));
}

export async function listRecentConversationSessions(uid: string, max = 5): Promise<ConversationSession[]> {
  return (await listLatest(uid)).filter((s) => s.status === "completed").slice(0, max);
}

/** Sessions left mid-way (closed tab, "Lưu & thoát"), newest first. */
export async function listUnfinishedConversationSessions(uid: string, max = 3, now = Date.now()): Promise<ConversationSession[]> {
  const cutoff = now - UNFINISHED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return (await listLatest(uid))
    .filter((s) => s.status === "in_progress" && Date.parse(s.createdAt) >= cutoff)
    .slice(0, max);
}

export async function markConversationMemoryApplied(uid: string, id: string): Promise<void> {
  await updateDoc(sessionRef(uid, id), { memoryApplied: true });
}
