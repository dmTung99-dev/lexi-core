// Piper (services/tts-stt) rejects text over 500 chars per call. Split an AI
// utterance into chunks of whole sentences, each ≤ maxLen; a single sentence
// longer than maxLen is split on word boundaries.
export function splitSentences(text: string, maxLen = 500): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences = trimmed.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [trimmed];

  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      pieces.push(sentence);
      continue;
    }
    let current = "";
    for (const word of sentence.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxLen && current) {
        pieces.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const next = current ? `${current} ${piece}` : piece;
    if (next.length > maxLen && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
