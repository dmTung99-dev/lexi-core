export type LevelMode = "max" | "all";

/** "Tối đa X" weight: 1-based position from the bottom of the scale; 0 above X; 1 when unknown. */
export function levelWeight<T>(scale: readonly T[], level: T, max: T): number {
  const index = scale.indexOf(level);
  if (index < 0) return 1;
  const maxIndex = scale.indexOf(max);
  if (maxIndex >= 0 && index > maxIndex) return 0;
  return index + 1;
}

/** Random order without replacement; each pick is proportional to weight among the remaining items. */
export function weightedOrder<T>(items: T[], weightOf: (item: T) => number, random: () => number = Math.random): T[] {
  const pool = items.map((item) => ({ item, weight: weightOf(item) })).filter((e) => e.weight > 0);
  const out: T[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    let r = random() * total;
    let index = 0;
    while (index < pool.length - 1 && r >= pool[index].weight) {
      r -= pool[index].weight;
      index++;
    }
    out.push(pool[index].item);
    pool.splice(index, 1);
  }
  return out;
}

export function pickRandomLevel<T>(scale: readonly T[], random: () => number = Math.random): T {
  return scale[Math.min(scale.length - 1, Math.floor(random() * scale.length))];
}

/** The instruction every "Tối đa X" / "Tất cả" AI prompt adds. */
export function levelMixSentence(level: string): string {
  const x = level.toUpperCase();
  return `Write mainly at CEFR ${x}. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR ${x}.`;
}
