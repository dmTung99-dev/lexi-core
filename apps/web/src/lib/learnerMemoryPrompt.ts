import type { MistakeTarget, TopicFact } from "./learnerMemoryTypes";

/** Prompt section: what the AI already knows about the learner on this topic. "" when there is nothing. */
export function topicMemorySection(facts: TopicFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) =>
    f.asked.length > 0 ? `- ${f.fact} (angles already asked: ${f.asked.join(", ")})` : `- ${f.fact}`
  );
  return `What you already know about this learner from earlier chats on this topic:
${lines.join("\n")}

How to use it (quietly, in the background):
- Do not ask again about angles already covered. When the learner returns to a known subject, ask about something not yet covered or how they feel about it now. Deepen lightly, like a friend; never press for small details or private matters.
- If the learner's answers get short, or a subject has been covered well, move to a different angle or a neighbouring subject.
- Do not open by saying you remember anything; mention a past detail only if it fits naturally in the flow.`;
}

function targetLines(targets: MistakeTarget[]): string {
  return targets
    .map((t) => `- ${t.pattern}: ${t.rule} (learner said "${t.example.said}", better: "${t.example.better}")`)
    .join("\n");
}

/** Prompt section: recurring mistakes the learner should get a natural chance to practise. "" when none. */
export function practiceTargetsSection(targets: MistakeTarget[], kind: "conversation" | "interview"): string {
  if (targets.length === 0) return "";
  if (kind === "interview") {
    return `Practice targets — forms this candidate often gets wrong:
${targetLines(targets)}

Shape up to 2 questions so that answering them naturally needs these forms (e.g. "Tell me about a time…" for the past tense). They must stay realistic interviewer questions; do not mention the targets or that anything is being practised.`;
  }
  return `Practice targets — forms this learner often gets wrong:
${targetLines(targets)}

Create natural chances for the learner to use these forms (e.g. ask about a past event for a past-tense target), at most 2–3 in the whole chat. Weave them into ordinary questions; never correct the learner and never mention the targets.`;
}
