import { normalizeForSearch } from "./normalizeSearch";
import type { CefrLevel, KnowledgeNote } from "./knowledgeNotes";

export interface KnowledgeFilter {
  query: string;
  groupIds: Set<string>;
  levels: Set<CefrLevel>;
  tags: Set<string>;
}

export function applyKnowledgeFilter(notes: KnowledgeNote[], filter: KnowledgeFilter): KnowledgeNote[] {
  const q = normalizeForSearch(filter.query);
  return notes.filter((n) => {
    if (filter.groupIds.size > 0 && !filter.groupIds.has(n.groupId)) return false;
    if (filter.levels.size > 0 && (n.cefrLevel === null || !filter.levels.has(n.cefrLevel))) return false;
    if (filter.tags.size > 0 && !n.tags.some((t) => filter.tags.has(t))) return false;
    if (q) {
      const hay = normalizeForSearch(
        [n.title, n.summary, n.explanation, n.patterns.join(" "), n.pitfalls.join(" "), n.tags.join(" ")].join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function knowledgeGroupCounts(notes: KnowledgeNote[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notes) counts[n.groupId] = (counts[n.groupId] ?? 0) + 1;
  return counts;
}

export function knowledgeAllTags(notes: KnowledgeNote[]): string[] {
  return [...new Set(notes.flatMap((n) => n.tags))].sort();
}

export interface VisibleKnowledgeTags {
  visible: string[];
  hiddenCount: number;
}

/// Caps the home screen's tag filter bar at `max` chips so it can't grow
/// unbounded as more notes/tags accumulate (unlike a single note's own tags,
/// this list is the union across every note). Already-selected tags are
/// always kept visible — including past the cap — so an active filter is
/// never silently hidden by the cap; the rest of `max` is filled with
/// unselected tags in their original (sorted) order.
export function visibleKnowledgeTags(
  allTags: string[],
  selectedTags: Set<string>,
  max: number,
): VisibleKnowledgeTags {
  if (allTags.length <= max) return { visible: allTags, hiddenCount: 0 };

  const selected = allTags.filter((t) => selectedTags.has(t));
  const remainingSlots = Math.max(0, max - selected.length);
  const unselected = allTags.filter((t) => !selectedTags.has(t)).slice(0, remainingSlots);
  const visible = [...selected, ...unselected];
  return { visible, hiddenCount: allTags.length - visible.length };
}
