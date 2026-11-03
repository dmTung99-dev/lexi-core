import type { PrepPattern } from "./conversationPrepTypes";

export interface Span {
  start: number;
  end: number;
}

export interface Highlight extends Span {
  patternIndex: number;
}

// Blanks and slot markers inside a pattern frame: "___", "…", "...",
// "+ V" / "+ V-ing" / "+ N", "sb"/"sth", and optional "(that)" parts.
const PLACEHOLDER = /_{2,}|…|\.{3}|\+\s*(?:V(?:-ing|-ed)?|N|noun|verb|adj)\b|\b(?:sb|sth|somebody|something)\b|\([^)]*\)/gi;
const EDGE_PUNCT = /^[\s.,!?;:]+|[\s.,!?;:]+$/g;

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");
}

export function findPatternSpan(line: string, pattern: string): Span | null {
  const chunks = pattern
    .split(PLACEHOLDER)
    .map((c) => c.replace(EDGE_PUNCT, ""))
    .filter((c) => c.length >= 3);
  if (chunks.length === 0) return null;
  const core = chunks.reduce((a, b) => (b.length > a.length ? b : a));
  const source = core.split(/\s+/).map(escapeWord).join("\\s+");
  const match = new RegExp(source, "i").exec(line);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

export function lineHighlights(line: string, patterns: Pick<PrepPattern, "pattern">[]): Highlight[] {
  const found = patterns
    .map((p, patternIndex) => {
      const span = findPatternSpan(line, p.pattern);
      return span ? { ...span, patternIndex } : null;
    })
    .filter((h): h is Highlight => h !== null)
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Highlight[] = [];
  for (const h of found) {
    const last = out[out.length - 1];
    if (!last || h.start >= last.end) out.push(h);
  }
  return out;
}
