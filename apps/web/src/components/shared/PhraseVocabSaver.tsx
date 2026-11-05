"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { enrichPhrases, type PhraseSource } from "@/lib/phraseEnrich";
import { buildVocabRecordDraft } from "@/lib/vocabDraft";
import { getVocabRecordByHeadword, saveVocabRecord, type VocabRecord, type VocabRecordUpdate } from "@/lib/vocabRecords";
import { getTopics, type Topic } from "@/lib/topics";
import { savePhraseToVocab } from "@/lib/savePhraseToVocab";
import { capitalizeHeadword } from "@/lib/vocabDisplay";
import type { ConversationLevel } from "@/lib/conversationTypes";
import type { UserSettings } from "@/lib/settings";
import type { WordPhraseResult } from "@/lib/lookup";
import { EditVocabModal } from "@/components/vocab-bank/EditVocabModal";

/** "Lưu tất cả" shows once at least this many phrases are still unsaved. */
export const SAVE_ALL_MIN = 3;

export interface PhraseSaverOptions {
  uid: string | null;
  settings: UserSettings | null;
  /** Fallback level for a basic save when the lookup fails. */
  level: ConversationLevel;
  /** Stored as the record's personal note, e.g. "Từ luyện Hội thoại tiếng Anh". */
  note: string;
  activeContext?: VocabRecord["activeContext"];
}

export interface PhraseSaver {
  saved: Set<string>;
  markSaved(texts: string[]): void;
  busy: boolean;
  message: string | null;
  error: string | null;
  /** The phrase whose lookup failed, offered for a basic (unenriched) save. */
  fallback: PhraseSource | null;
  saveOne(item: PhraseSource): Promise<void>;
  saveAll(items: PhraseSource[]): Promise<void>;
  saveBasic(item: PhraseSource): Promise<void>;
  modal: ReactNode;
}

const LOOKUP_FAILED = "Không tra được thông tin từ — thử lại, hoặc lưu bản cơ bản.";

function headwordOf(item: PhraseSource): string {
  return capitalizeHeadword(item.text.trim());
}

/** Saves session phrases (Hội thoại, Chuẩn bị tình huống, Phỏng vấn) as full
 * vocab records: an AI lookup fills IPA, definition, synonyms, topic and CEFR
 * level like Tra từ does; one phrase opens the edit modal first, "Lưu tất cả"
 * saves straight away. */
export function usePhraseVocabSaver(opts: PhraseSaverOptions): PhraseSaver {
  const { uid, settings, level, note, activeContext = "general" } = opts;
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<PhraseSource | null>(null);
  const [editing, setEditing] = useState<{ item: PhraseSource; draft: VocabRecord } | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const topicsRef = useRef<Topic[] | null>(null);
  const busyRef = useRef(false);

  const markSaved = useCallback((texts: string[]) => {
    if (texts.length > 0) setSaved((prev) => new Set([...prev, ...texts]));
  }, []);

  async function loadTopics(): Promise<Topic[]> {
    if (topicsRef.current) return topicsRef.current;
    const t = uid ? await getTopics(uid).catch(() => []) : [];
    topicsRef.current = t;
    setTopics(t);
    return t;
  }

  function toDraft(result: WordPhraseResult, t: Topic[]): VocabRecord {
    return { ...buildVocabRecordDraft(result, t, "english"), personalNotes: note, activeContext };
  }

  async function run(task: () => Promise<void>) {
    if (busyRef.current || !uid || !settings) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setFallback(null);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const saveOne = (item: PhraseSource) =>
    run(async () => {
      try {
        if (await getVocabRecordByHeadword(uid!, headwordOf(item), "english")) {
          markSaved([item.text]);
          return;
        }
      } catch {
        setError("Không lưu được từ — thử lại.");
        return;
      }
      let result: WordPhraseResult;
      try {
        [result] = await enrichPhrases(settings!, [item]);
      } catch {
        setError(LOOKUP_FAILED);
        setFallback(item);
        return;
      }
      setEditing({ item, draft: toDraft(result, await loadTopics()) });
    });

  const saveAll = (items: PhraseSource[]) =>
    run(async () => {
      const todo = items.filter((it) => !saved.has(it.text));
      if (todo.length === 0) return;
      let results: WordPhraseResult[];
      try {
        results = await enrichPhrases(settings!, todo);
      } catch {
        setError("Không tra được thông tin các từ — thử lại.");
        return;
      }
      const t = await loadTopics();
      let created = 0;
      let existing = 0;
      try {
        for (let i = 0; i < todo.length; i++) {
          const draft = toDraft(results[i], t);
          if (await getVocabRecordByHeadword(uid!, draft.headword, "english")) {
            existing++;
          } else {
            const { id: _omit, ...record } = draft;
            await saveVocabRecord(uid!, record);
            created++;
          }
          markSaved([todo[i].text]);
        }
      } catch {
        setError("Lưu bị gián đoạn — bấm lại để lưu nốt.");
      }
      setMessage(`Đã lưu ${created}/${todo.length} từ${existing > 0 ? ` (${existing} từ đã có sẵn)` : ""}.`);
    });

  const saveBasic = (item: PhraseSource) =>
    run(async () => {
      try {
        await savePhraseToVocab(uid!, item, { level, note });
        markSaved([item.text]);
      } catch {
        setError("Không lưu được từ — thử lại.");
        setFallback(item);
      }
    });

  async function confirmEdit(updates: VocabRecordUpdate) {
    if (!editing || !uid) return;
    const { id: _omit, ...record } = { ...editing.draft, ...updates };
    // Re-check: another tab may have saved it while the modal was open.
    if (!(await getVocabRecordByHeadword(uid, record.headword, "english"))) await saveVocabRecord(uid, record);
    markSaved([editing.item.text]);
    setEditing(null);
  }

  const modal = editing ? (
    <EditVocabModal record={editing.draft} topics={topics} mode="create" onClose={() => setEditing(null)} onSave={confirmEdit} />
  ) : null;

  return { saved, markSaved, busy, message, error, fallback, saveOne, saveAll, saveBasic, modal };
}

/** Status line + "Lưu tất cả" + the basic-save fallback, shared by the three
 * phrase lists. Renders nothing when there is nothing to show. */
export function PhraseSaveBar({ saver, items }: { saver: PhraseSaver; items: PhraseSource[] }) {
  const unsaved = items.filter((it) => !saver.saved.has(it.text)).length;
  const showAll = unsaved >= SAVE_ALL_MIN;
  if (!showAll && !saver.busy && !saver.message && !saver.error) return null;
  return (
    <div className="phrase-save-bar">
      {showAll && (
        <button type="button" className="btn-secondary" disabled={saver.busy} onClick={() => void saver.saveAll(items)}>
          {`Lưu tất cả (${unsaved})`}
        </button>
      )}
      {saver.busy && <span className="iv-muted" role="status">Đang tra từ…</span>}
      {saver.message && <span className="iv-muted" role="status">{saver.message}</span>}
      {saver.error && <p className="iv-error" role="alert">{saver.error}</p>}
      {saver.fallback && (
        <button type="button" className="btn-secondary" disabled={saver.busy} onClick={() => void saver.saveBasic(saver.fallback!)}>
          Lưu bản cơ bản
        </button>
      )}
    </div>
  );
}
