import { callInterviewAi } from "./interviewAi";
import { InterviewAiError, parseJson, str, strList } from "./interviewPrompts";
import { preselectTopicIds } from "./vocabDraft";
import type { WordPhraseResult } from "./lookup";
import type { Topic } from "./topics";
import type { UserSettings } from "./settings";
import { LANGUAGE_LABELS, type TargetLanguage } from "./languages";
import type { VocabRecord } from "./vocabRecords";

/** A phrase picked by Hội thoại / Chuẩn bị tình huống / Phỏng vấn, with the
 * short meaning and example sentence the session already gave it. */
export interface PhraseSource {
  text: string;
  meaning: string;
  example: string;
}

const CEFR_LEVELS = new Set(["a1", "a2", "b1", "b2", "c1", "c2"]);

// Same fields and topic list as lookup.ts's buildWordPhrasePrompt, so a phrase
// saved from a session ends up as complete as one saved from Tra từ — but for
// a whole list in one call, with the session's meaning/example as context.
export function buildPhraseEnrichPrompt(items: PhraseSource[], targetLanguage: TargetLanguage = "english"): string {
  const languageLabel = LANGUAGE_LABELS[targetLanguage];
  const list = items
    .map((it, i) => {
      const ctx = [it.meaning.trim() && `meaning here: ${it.meaning.trim()}`, it.example.trim() && `used in: "${it.example.trim()}"`]
        .filter(Boolean)
        .join("; ");
      return `${i + 1}. "${it.text.trim()}"${ctx ? ` (${ctx})` : ""}`;
    })
    .join("\n");
  return (
    `You are a language learning assistant helping a Vietnamese speaker learn ${languageLabel}. ` +
    `Write a dictionary entry for each of these ${languageLabel} words/phrases, in the sense they have in the given context:\n${list}\n\n` +
    `Respond with JSON only (no markdown, no code fences): {"entries":[{"headword":"the word or phrase exactly as given",` +
    `"ipa":"IPA transcription","meaning":"Vietnamese definition","definition":"English definition",` +
    `"synonyms":["2-4 English synonyms for this sense, or empty array if none fit"],` +
    `"examples":["example 1 in ${languageLabel}","example 2"],` +
    `"suggestedTopics":["exactly one topic chosen from: Daily Life, Travel, Food & Drink, Business, Technology, Health, ` +
    `Education, Entertainment, Nature, Emotion, Academic, Idioms, Phrasal Verbs, Slang, Social/Casual, Sports, ` +
    `Art & Culture, Science, Law & Politics, Other"],` +
    `"cefrLevel":"a1, a2, b1, b2, c1, or c2"}]} ` +
    `Give exactly one entry per item, in the same order. Keep each headword exactly as given — do not shorten it or change it to a base form. ` +
    `Every "meaning" field must use only Vietnamese script — never Chinese, Japanese, or other non-Vietnamese characters.`
  );
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function objectAt(list: unknown, i: number): Record<string, unknown> {
  const v = Array.isArray(list) ? list[i] : undefined;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** One result per item, matched by position. The headword stays the item's own
 * text and its session example stays first, so the saved record keeps the
 * context it was learned in. */
export function parseEnrichedPhrases(raw: string, items: PhraseSource[]): WordPhraseResult[] {
  const json = parseJson(raw);
  if (!Array.isArray(json.entries) || json.entries.length === 0) {
    throw new InterviewAiError("AI không tra được các cụm từ.");
  }
  return items.map((it, i) => {
    const e = objectAt(json.entries, i);
    const text = it.text.trim();
    const cefr = str(e.cefrLevel).toLowerCase();
    const topics = Array.isArray(e.suggestedTopics) ? strList(e.suggestedTopics) : str(e.suggestedTopics) ? [str(e.suggestedTopics)] : [];
    return {
      kind: "wordPhrase",
      headword: text,
      inputType: /\s/.test(text) ? "phrase" : "word",
      ipa: str(e.ipa),
      meaning: str(e.meaning) || it.meaning.trim(),
      definition: str(e.definition),
      synonyms: strList(e.synonyms),
      examples: dedupe([it.example, ...strList(e.examples)]),
      suggestedTopics: topics,
      cefrLevel: CEFR_LEVELS.has(cefr) ? (cefr as WordPhraseResult["cefrLevel"]) : null,
    };
  });
}

export async function enrichPhrases(
  settings: UserSettings,
  items: PhraseSource[],
  targetLanguage: TargetLanguage = "english"
): Promise<WordPhraseResult[]> {
  return parseEnrichedPhrases(await callInterviewAi(settings, buildPhraseEnrichPrompt(items, targetLanguage)), items);
}

/** "Hiệu chỉnh": the dictionary fields come from the fresh lookup; the review
 * schedule, dates, notes and the learner's own topic choice are kept. */
export function refineVocabRecord(record: VocabRecord, result: WordPhraseResult, topics: Topic[]): VocabRecord {
  return {
    ...record,
    ipa: result.ipa || record.ipa,
    meaning: result.meaning || record.meaning,
    definition: result.definition || record.definition,
    synonyms: result.synonyms.length > 0 ? result.synonyms : record.synonyms,
    examples: dedupe([...record.examples, ...result.examples]),
    cefrLevel: result.cefrLevel ?? record.cefrLevel,
    topicIds: record.topicIds.length > 0 ? record.topicIds : preselectTopicIds(result.suggestedTopics, topics),
  };
}
