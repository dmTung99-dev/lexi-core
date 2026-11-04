import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { MistakeMemory, TopicMemory, TrackedMistake } from "./learnerMemoryTypes";

function mistakesRef(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "learner_memory", "mistakes");
}

function topicRef(uid: string, key: string) {
  return doc(getFirebaseDb(), "users", uid, "conversation_memory", key);
}

function topicsCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "conversation_memory");
}

export async function getMistakeMemory(uid: string): Promise<MistakeMemory> {
  const snap = await getDoc(mistakesRef(uid));
  if (!snap.exists()) return { items: [], updatedAt: "" };
  const data = snap.data() as Partial<MistakeMemory>;
  return { items: data.items ?? [], updatedAt: data.updatedAt ?? "" };
}

export async function saveMistakeMemory(uid: string, items: TrackedMistake[]): Promise<void> {
  await setDoc(mistakesRef(uid), { items, updatedAt: new Date().toISOString() });
}

export async function getTopicMemory(uid: string, key: string): Promise<TopicMemory | null> {
  const snap = await getDoc(topicRef(uid, key));
  if (!snap.exists()) return null;
  return snap.data() as TopicMemory;
}

export async function saveTopicMemory(uid: string, memory: TopicMemory): Promise<void> {
  await setDoc(topicRef(uid, memory.key), memory);
}

export async function listTopicMemories(uid: string): Promise<TopicMemory[]> {
  const snap = await getDocs(query(topicsCol(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => d.data() as TopicMemory);
}

export async function deleteTrackedMistake(uid: string, id: string): Promise<void> {
  const { items } = await getMistakeMemory(uid);
  await saveMistakeMemory(uid, items.filter((m) => m.id !== id));
}

export async function deleteTopicFact(uid: string, key: string, factId: string): Promise<void> {
  const memory = await getTopicMemory(uid, key);
  if (!memory) return;
  const facts = memory.facts.filter((f) => f.id !== factId);
  if (facts.length === 0) {
    await deleteDoc(topicRef(uid, key));
    return;
  }
  await saveTopicMemory(uid, { ...memory, facts, updatedAt: new Date().toISOString() });
}

export async function deleteTopicMemory(uid: string, key: string): Promise<void> {
  await deleteDoc(topicRef(uid, key));
}
