import { parseAiJsonObject } from "./parseAiJson";
import type { FoundMistake, MemoryUpdate, MistakeTarget, TopicFact } from "./learnerMemoryTypes";

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

export interface ReportMemoryInput {
  tracked: { id: string; pattern: string; rule: string }[];
  /** null for interviews and when the topic read failed. */
  facts: TopicFact[] | null;
}

/** Report-prompt section asking for mistake checks, trackedIds and (conversations) the updated topic facts. "" when there is nothing to ask. */
export function reportMemorySection(input: ReportMemoryInput, kind: "conversation" | "interview"): string {
  const parts: string[] = [];
  if (input.tracked.length > 0) {
    const lines = input.tracked.map((t) => `- id "${t.id}": ${t.pattern} — ${t.rule}`).join("\n");
    parts.push(`Mistakes this learner is already tracked for:
${lines}

Add a top-level key "mistakeChecks": [{"id": "<tracked id>", "result": "correct" | "wrong"}]. Include a tracked mistake ONLY if the learner had a real chance to use that form in this session ("correct" if they used it right, "wrong" if they got it wrong); omit it when there was no occasion. When a "recurringMistakes" item is the same mistake as a tracked one, give it "trackedId": "<tracked id>"; otherwise omit "trackedId".`);
  }
  if (kind === "conversation" && input.facts !== null) {
    const prev =
      input.facts.length > 0
        ? input.facts.map((f) => (f.asked.length > 0 ? `- ${f.fact} (asked: ${f.asked.join(", ")})` : `- ${f.fact}`)).join("\n")
        : "(none yet)";
    parts.push(`Facts already known about the learner on this topic:
${prev}

Add a top-level key "topicFacts": [{"fact": "...", "asked": ["..."]}] — the FULL updated list for this topic: the previous facts merged with what the learner revealed in this session, each rewritten short, in English, at most 12. "asked" lists the angles the AI has already covered for that fact (short English words). The transcription-error caveat above applies to facts too: do not record a fact built on a misheard word.`);
  }
  return parts.join("\n\n");
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Parses a "recurringMistakes" array; keeps `trackedId` when `keepId` accepts it. Malformed items are dropped. */
export function parseFoundMistakes(value: unknown, keepId: (id: string) => boolean = () => true): FoundMistake[] {
  if (!Array.isArray(value)) return [];
  const out: FoundMistake[] = [];
  for (const item of value) {
    const o = obj(item);
    const pattern = str(o.pattern);
    if (!pattern) continue;
    const example = (Array.isArray(o.examples) ? o.examples : [])
      .map((e) => ({ said: str(obj(e).said), better: str(obj(e).better) }))
      .find((e) => e.said && e.better);
    if (!example) continue;
    const found: FoundMistake = { pattern, rule: str(o.rule), example };
    const id = str(o.trackedId);
    if (id && keepId(id)) found.trackedId = id;
    out.push(found);
  }
  return out.slice(0, 3);
}

/** Parses the memory-related keys of a report response. Never throws; anything unusable means "no change". */
export function parseMemoryUpdate(raw: string, trackedIds: string[], kind: "conversation" | "interview"): MemoryUpdate {
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = parseAiJsonObject(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { checks: [], found: [], topicFacts: null };
    json = parsed as Record<string, unknown>;
  } catch {
    return { checks: [], found: [], topicFacts: null };
  }
  const known = new Set(trackedIds);
  const checks: MemoryUpdate["checks"] = [];
  const checked = new Set<string>();
  for (const item of Array.isArray(json.mistakeChecks) ? json.mistakeChecks : []) {
    const o = obj(item);
    const id = str(o.id);
    if (known.has(id) && !checked.has(id) && (o.result === "correct" || o.result === "wrong")) {
      checked.add(id);
      checks.push({ id, result: o.result });
    }
  }
  const found = parseFoundMistakes(json.recurringMistakes, (id) => known.has(id));
  let topicFacts: MemoryUpdate["topicFacts"] = null;
  if (kind === "conversation" && Array.isArray(json.topicFacts)) {
    topicFacts = [];
    for (const item of json.topicFacts) {
      const o = obj(item);
      const fact = str(o.fact);
      if (!fact) continue;
      const asked = (Array.isArray(o.asked) ? o.asked : []).map(str).filter((a) => a.length > 0);
      topicFacts.push({ fact, asked });
    }
  }
  return { checks, found, topicFacts };
}
