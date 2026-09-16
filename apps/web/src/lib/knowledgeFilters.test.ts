import { describe, expect, it } from "vitest";
import {
  applyKnowledgeFilter,
  knowledgeGroupCounts,
  knowledgeAllTags,
  visibleKnowledgeTags,
  type KnowledgeFilter,
} from "./knowledgeFilters";
import type { KnowledgeNote } from "./knowledgeNotes";

const n = (over: Partial<KnowledgeNote>): KnowledgeNote => ({
  id: "x", title: "", summary: "", explanation: "", patterns: [], examples: [], pitfalls: [],
  groupId: "en_other", tags: [], cefrLevel: null, targetLanguage: "english", source: "manual",
  sourcePrompt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});
const empty = (o: Partial<KnowledgeFilter> = {}): KnowledgeFilter =>
  ({ query: "", groupIds: new Set(), levels: new Set(), tags: new Set(), ...o });

const notes = [
  n({ id: "a", title: "Câu điều kiện loại 2", groupId: "en_conditionals", cefrLevel: "b1", tags: ["toeic"] }),
  n({ id: "b", title: "Thì hiện tại đơn", groupId: "en_tenses", cefrLevel: "a1" }),
  n({ id: "c", explanation: "nói về **điều kiện**", groupId: "en_conditionals", cefrLevel: "b2" }),
];

describe("applyKnowledgeFilter", () => {
  it("folded query across fields", () => {
    expect(applyKnowledgeFilter(notes, empty({ query: "dieu kien" })).map((x) => x.id).sort()).toEqual(["a", "c"]);
  });
  it("group + level AND across, OR within", () => {
    expect(applyKnowledgeFilter(notes, empty({ groupIds: new Set(["en_conditionals"]), levels: new Set(["b1"]) }))
      .map((x) => x.id)).toEqual(["a"]);
  });
  it("tag filter", () => {
    expect(applyKnowledgeFilter(notes, empty({ tags: new Set(["toeic"]) })).map((x) => x.id)).toEqual(["a"]);
  });
});
describe("counts + tags", () => {
  it("group counts and sorted unique tags", () => {
    expect(knowledgeGroupCounts(notes).en_conditionals).toBe(2);
    expect(knowledgeAllTags(notes)).toEqual(["toeic"]);
  });
});

describe("visibleKnowledgeTags", () => {
  const tags = ["a", "b", "c", "d", "e"];

  it("returns every tag with no overflow when under the cap", () => {
    expect(visibleKnowledgeTags(tags, new Set(), 8)).toEqual({ visible: tags, hiddenCount: 0 });
  });

  it("caps at max and reports how many are hidden", () => {
    expect(visibleKnowledgeTags(tags, new Set(), 3)).toEqual({
      visible: ["a", "b", "c"],
      hiddenCount: 2,
    });
  });

  it("prioritizes selected tags so an active filter is never hidden", () => {
    // "e" is selected but would otherwise fall outside a cap of 3 by plain order.
    expect(visibleKnowledgeTags(tags, new Set(["e"]), 3)).toEqual({
      visible: ["e", "a", "b"],
      hiddenCount: 2,
    });
  });

  it("keeps all selected tags visible even if they exceed the cap alone", () => {
    expect(visibleKnowledgeTags(tags, new Set(["b", "d", "e"]), 2)).toEqual({
      visible: ["b", "d", "e"],
      hiddenCount: 2,
    });
  });
});
