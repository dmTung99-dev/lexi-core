import type { ConversationSetup } from "./conversationTypes";

/** Whisper only attends to roughly the last 224 tokens of initial_prompt. */
export const STT_PROMPT_MAX_CHARS = 400;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Joins the non-empty parts and keeps the TAIL when over the cap, so the
 *  most recent question survives and the oldest context is dropped first. */
function build(parts: string[]): string {
  const joined = parts.map(clean).filter(Boolean).join(" ");
  return joined.length > STT_PROMPT_MAX_CHARS
    ? joined.slice(-STT_PROMPT_MAX_CHARS).trimStart()
    : joined;
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
