import type { ConversationSetup } from "./conversationTypes";

/** Whisper only attends to roughly the last 224 tokens of initial_prompt. */
export const STT_PROMPT_MAX_CHARS = 400;

/** Keeps the last `maxPoints` code points (never splitting a surrogate pair);
 *  if `maxUnits` is given, drops further leading code points until the result
 *  also fits within that many UTF-16 units (what server-side `.length` counts). */
export function tailByCodePoints(text: string, maxPoints: number, maxUnits?: number): string {
  const points = Array.from(text).slice(-maxPoints);
  let out = points.join("");
  if (maxUnits !== undefined) {
    let start = 0;
    while (out.length > maxUnits && start < points.length) {
      start++;
      out = points.slice(start).join("");
    }
  }
  return out;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Joins the non-empty parts and keeps the TAIL when over the cap, so the
 *  most recent question survives and the oldest context is dropped first. */
function build(parts: string[]): string {
  const joined = parts.map(clean).filter(Boolean).join(" ");
  return tailByCodePoints(joined, STT_PROMPT_MAX_CHARS).trimStart();
}

/** Context hint for Whisper's initial_prompt: topic, optional persona, and
 *  what the AI just said (the learner is answering it). */
export function conversationSttPrompt(setup: ConversationSetup, lastAiText: string): string {
  const topic = clean(setup.topic);
  const persona = setup.persona ? clean(setup.persona) : "";
  return build([
    topic ? `Topic: ${topic}.` : "",
    setup.mode === "roleplay" && persona ? `Role-play: ${persona}.` : "",
    lastAiText,
  ]);
}

export function interviewSttPrompt(role: string, question: string): string {
  const r = clean(role);
  return build([r ? `Job interview for ${r}.` : "", question]);
}
