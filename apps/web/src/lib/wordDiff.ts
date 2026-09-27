export interface DiffSegment {
  kind: "equal" | "removed" | "added";
  text: string;
}

// Word-level LCS diff between the user's transcript and the AI's minimally
// corrected version. Tokens are whitespace-separated words with punctuation
// attached. Within a changed region, removed words come before added words;
// adjacent tokens of the same kind are merged into one segment.
export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = before.trim() ? before.trim().split(/\s+/) : [];
  const b = after.trim() ? after.trim().split(/\s+/) : [];
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: { kind: DiffSegment["kind"]; word: string }[] = [];
  let i = 0;
  let j = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    removed.forEach((w) => tokens.push({ kind: "removed", word: w }));
    added.forEach((w) => tokens.push({ kind: "added", word: w }));
    removed = [];
    added = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      tokens.push({ kind: "equal", word: a[i] });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      added.push(b[j]);
      j++;
    } else {
      removed.push(a[i]);
      i++;
    }
  }
  flush();

  const segments: DiffSegment[] = [];
  for (const t of tokens) {
    const last = segments[segments.length - 1];
    if (last && last.kind === t.kind) {
      last.text += ` ${t.word}`;
    } else {
      segments.push({ kind: t.kind, text: t.word });
    }
  }
  return segments;
}
