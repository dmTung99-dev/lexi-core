import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { InterviewPlanItem, InterviewReport, InterviewSession, InterviewSetup, InterviewTurn } from "./interviewTypes";

// Sessions created before translations were bundled into the plan have
// `plan: string[]` (English only) on Firestore. Normalize those to
// `{en, vi: ""}` on read so old in-progress sessions keep working — the
// empty `vi` makes the UI fall back to an on-demand translate call for
// exactly those legacy questions, new ones always come pre-translated.
function normalizePlan(raw: unknown): InterviewPlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (typeof item === "string" ? { en: item, vi: "" } : (item as InterviewPlanItem)));
}

function sessionsCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "interview_sessions");
}

function sessionRef(uid: string, id: string) {
  return doc(getFirebaseDb(), "users", uid, "interview_sessions", id);
}

export async function createInterviewSession(uid: string, setup: InterviewSetup): Promise<string> {
  const ref = doc(sessionsCol(uid));
  const session: InterviewSession = {
    id: ref.id,
    createdAt: new Date().toISOString(),
    status: "in_progress",
    setup,
    plan: [],
    turns: [],
    report: null,
    reportError: false,
  };
  await setDoc(ref, session);
  return ref.id;
}

export async function getInterviewSession(uid: string, id: string): Promise<InterviewSession | null> {
  const snap = await getDoc(sessionRef(uid, id));
  if (!snap.exists()) return null;
  const data = snap.data() as InterviewSession;
  return { ...data, plan: normalizePlan(data.plan), id: snap.id };
}

export async function saveInterviewPlan(uid: string, id: string, plan: InterviewPlanItem[]): Promise<void> {
  await updateDoc(sessionRef(uid, id), { plan });
}

// Called after every turn with the full array — a closed tab still leaves
// every completed turn gradable.
export async function saveInterviewTurns(uid: string, id: string, turns: InterviewTurn[]): Promise<void> {
  await updateDoc(sessionRef(uid, id), { turns });
}

export async function completeInterviewSession(
  uid: string,
  id: string,
  report: InterviewReport | null
): Promise<void> {
  await updateDoc(sessionRef(uid, id), { status: "completed", report, reportError: report === null });
}

export async function deleteInterviewSession(uid: string, id: string): Promise<void> {
  await deleteDoc(sessionRef(uid, id));
}

// Over-fetch then filter client-side: a single-field orderBy needs no
// composite index, and abandoned in_progress sessions are rare.
export async function listRecentInterviewSessions(uid: string, max = 5): Promise<InterviewSession[]> {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("createdAt", "desc"), limit(20)));
  return snap.docs
    .map((d) => ({ ...(d.data() as InterviewSession), id: d.id }))
    .filter((s) => s.status === "completed")
    .slice(0, max);
}
