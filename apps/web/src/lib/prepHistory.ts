import type { ConversationPrep } from "./conversationPrepTypes";

/** Longest story summary kept on a kit, and the longest summary line fed back into a new kit's prompt. */
export const PREP_SUMMARY_MAX = 400;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** The kit's stored story summary, or (old kits) a deterministic one built from its other fields. */
export function kitSummary(prep: Pick<ConversationPrep, "title" | "situation" | "persona" | "goals" | "summary">): string {
  const stored = collapse(prep.summary ?? "");
  if (stored) return stored.slice(0, PREP_SUMMARY_MAX);
  const goals = prep.goals.map(collapse).filter(Boolean);
  const pieces = [
    collapse(prep.title),
    collapse(prep.situation) ? `Situation: ${collapse(prep.situation)}` : "",
    collapse(prep.persona),
    goals.length > 0 ? `Goals: ${goals.join("; ")}` : "",
  ].map((p) => p.replace(/[.\s]+$/, "")).filter(Boolean);
  return collapse(pieces.join(". ")).slice(0, PREP_SUMMARY_MAX);
}
