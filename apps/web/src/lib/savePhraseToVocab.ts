import { getVocabRecordByHeadword, saveVocabRecord, type VocabRecord } from "./vocabRecords";
import { capitalizeHeadword } from "./vocabDisplay";
import type { ConversationLevel, ConversationPhrase } from "./conversationTypes";

export function phraseHeadword(text: string): string {
  return capitalizeHeadword(text.trim());
}

export async function isPhraseSaved(uid: string, text: string): Promise<boolean> {
  return (await getVocabRecordByHeadword(uid, phraseHeadword(text), "english")) !== null;
}

/** Saves an English phrase to the vocab bank; does nothing if the headword is already there. */
export async function savePhraseToVocab(
  uid: string,
  phrase: ConversationPhrase,
  opts: { level: ConversationLevel; note: string }
): Promise<void> {
  const headword = phraseHeadword(phrase.text);
  if (await getVocabRecordByHeadword(uid, headword, "english")) return;
  const now = new Date().toISOString();
  await saveVocabRecord(uid, {
    headword,
    inputType: "phrase",
    ipa: "",
    meaning: phrase.meaning,
    examples: phrase.example ? [phrase.example] : [],
    personalNotes: opts.note,
    topicIds: [],
    targetLanguage: "english",
    cefrLevel: opts.level.toLowerCase() as VocabRecord["cefrLevel"],
    activeContext: "general",
    createdAt: now,
    updatedAt: now,
    nextReviewAt: null,
    sm2Repetitions: 0,
    sm2EaseFactor: 2.5,
    sm2Interval: 1,
    definition: "",
    synonyms: [],
  });
}
