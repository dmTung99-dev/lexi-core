import type { VocabRecord } from "./vocabRecords";

export type RecallOutcome = "clean" | "hinted" | "wrong" | "skipped";

export const RECALL_HINTS = 3;
export const RECALL_CORRECT_MS = 1200;
export const RECALL_WRONG_MS = 2000;

const SEPARATORS = new Set([" ", "-", "'", "’", ".", "/"]);

const FRACTION: Record<VocabRecord["cefrLevel"], number> = {
  a1: 0,
  a2: 0,
  b1: 0.15,
  b2: 0.25,
  c1: 0.35,
  c2: 0.4,
};

export function isSeparator(ch: string): boolean {
  return SEPARATORS.has(ch);
}

function collapse(headword: string): string {
  return headword.replace(/\s+/g, " ").trim();
}

export function letterIndexes(headword: string): number[] {
  const h = collapse(headword);
  const out: number[] = [];
  for (let i = 0; i < h.length; i++) if (!isSeparator(h[i])) out.push(i);
  return out;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic reveal priority: first letter of each word part, then the rest shuffled. */
function revealOrder(headword: string): number[] {
  const h = collapse(headword);
  const letters = letterIndexes(h);
  const firsts: number[] = [];
  const rest: number[] = [];
  for (const i of letters) {
    if (i === 0 || isSeparator(h[i - 1])) firsts.push(i);
    else rest.push(i);
  }
  const rand = mulberry32(hashString(normalizeAnswer(h)));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...firsts, ...rest];
}

export function initialReveal(headword: string, cefr: VocabRecord["cefrLevel"]): Set<number> {
  const letters = letterIndexes(headword).length;
  const fraction = FRACTION[cefr] ?? 0;
  if (fraction === 0 || letters === 0) return new Set();
  let n = Math.round(fraction * letters);
  if (letters >= 4) n = Math.max(n, 1);
  n = Math.min(n, Math.floor(letters / 2));
  return new Set(revealOrder(headword).slice(0, n));
}

function collapseTyped(typed: string): string {
  return typed.replace(/\s+/g, " ").replace(/^ /, "");
}

function eligibleIndexes(headword: string, revealed: Set<number>, typed: string): number[] {
  const h = collapse(headword);
  const t = collapseTyped(typed);
  return revealOrder(h).filter((i) => {
    if (revealed.has(i)) return false;
    const c = t[i];
    return !(c !== undefined && c.toLowerCase() === h[i].toLowerCase());
  });
}

function hiddenCount(headword: string, revealed: Set<number>): number {
  return letterIndexes(headword).filter((i) => !revealed.has(i)).length;
}

function hintCount(headword: string, revealed: Set<number>, typed: string): number {
  const eligible = eligibleIndexes(headword, revealed, typed).length;
  if (eligible === 0) return 0;
  const want = Math.max(1, Math.ceil(0.25 * eligible));
  return Math.min(want, hiddenCount(headword, revealed) - 1, eligible);
}

export function hintAvailable(headword: string, revealed: Set<number>, typed: string): boolean {
  return hintCount(headword, revealed, typed) > 0;
}

export function hintReveal(headword: string, revealed: Set<number>, typed: string): Set<number> {
  const n = hintCount(headword, revealed, typed);
  if (n <= 0) return revealed;
  const next = new Set(revealed);
  for (const i of eligibleIndexes(headword, revealed, typed).slice(0, n)) next.add(i);
  return next;
}

export interface RecallSlot {
  kind: "sep" | "letter";
  ch: string;
  source: "typed" | "revealed" | "empty";
}

export function fillSlots(
  headword: string,
  revealed: Set<number>,
  typed: string,
): { slots: RecallSlot[]; overflow: string } {
  const h = collapse(headword);
  const t = collapseTyped(typed);
  const slots: RecallSlot[] = [];
  for (let i = 0; i < h.length; i++) {
    if (isSeparator(h[i])) {
      slots.push({ kind: "sep", ch: h[i], source: "revealed" });
    } else if (i < t.length) {
      slots.push({ kind: "letter", ch: t[i], source: "typed" });
    } else if (revealed.has(i)) {
      slots.push({ kind: "letter", ch: h[i], source: "revealed" });
    } else {
      slots.push({ kind: "letter", ch: "", source: "empty" });
    }
  }
  return { slots, overflow: t.slice(h.length) };
}

export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFC")
    .replace(/’/g, "'")
    .replace(/[–—]/g, "-");
}

export function answersMatch(input: string, headword: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(headword);
}

export function maskHeadword(text: string, headword: string): string {
  const h = collapse(headword);
  if (!h) return text;
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const single = !h.includes(" ");
  const suffix = single ? "(?:es|ed|ing|s|d)?" : "";
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${suffix}(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(re, "___");
}
