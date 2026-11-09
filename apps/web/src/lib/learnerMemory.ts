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

const PREP_PREFIX = "prep_";

/** Kit role-play memory (group key prep_<prepId>) lives in its own Chuẩn bị store. */
export function isPrepGroupKey(key: string): boolean {
  return key.startsWith(PREP_PREFIX);
}

function sceneRef(uid: string, key: string) {
  return doc(getFirebaseDb(), "users", uid, "prep_scene_memory", key.slice(PREP_PREFIX.length));
}

function scenesCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "prep_scene_memory");
}

function toTopic(data: TopicMemory): TopicMemory {
  return { ...data, facts: data.facts ?? [] };
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
  if (isPrepGroupKey(key)) {
    const scene = await getDoc(sceneRef(uid, key));
    if (scene.exists()) return toTopic(scene.data() as TopicMemory);
    // Written before the memory split: still readable until the next save moves it.
  }
  const snap = await getDoc(topicRef(uid, key));
  if (!snap.exists()) return null;
  return toTopic(snap.data() as TopicMemory);
}

export async function saveTopicMemory(uid: string, memory: TopicMemory): Promise<void> {
  if (isPrepGroupKey(memory.key)) {
    await setDoc(sceneRef(uid, memory.key), memory);
    try {
      await deleteDoc(topicRef(uid, memory.key));
    } catch {
      // The legacy copy is only a leftover; failing to remove it never fails the save.
    }
    return;
  }
  await setDoc(topicRef(uid, memory.key), memory);
}

/** Hội thoại topic groups only; kit scene memory is listed by listPrepSceneMemories. */
export async function listTopicMemories(uid: string): Promise<TopicMemory[]> {
  const snap = await getDocs(query(topicsCol(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => toTopic(d.data() as TopicMemory)).filter((m) => !isPrepGroupKey(m.key));
}

/** Kit role-play memory: the new store plus legacy conversation_memory/prep_* docs not yet moved. */
export async function listPrepSceneMemories(uid: string): Promise<TopicMemory[]> {
  const [scenes, legacy] = await Promise.all([
    getDocs(query(scenesCol(uid), orderBy("updatedAt", "desc"))),
    getDocs(query(topicsCol(uid), orderBy("updatedAt", "desc"))),
  ]);
  const fresh = scenes.docs.map((d) => toTopic(d.data() as TopicMemory));
  const freshKeys = new Set(fresh.map((m) => m.key));
  const old = legacy.docs
    .map((d) => toTopic(d.data() as TopicMemory))
    .filter((m) => isPrepGroupKey(m.key) && !freshKeys.has(m.key));
  return [...fresh, ...old].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    await deleteTopicMemory(uid, key);
    return;
  }
  await saveTopicMemory(uid, { ...memory, facts, updatedAt: new Date().toISOString() });
}

export async function deleteTopicMemory(uid: string, key: string): Promise<void> {
  if (isPrepGroupKey(key)) {
    await Promise.all([deleteDoc(sceneRef(uid, key)), deleteDoc(topicRef(uid, key))]);
    return;
  }
  await deleteDoc(topicRef(uid, key));
}
