# LexiCore — Cumulative, weighted level picker + dropdown overflow fix (web)

**Date:** 2026-11-09
**Status:** Implemented (2026-11-09).
**Covers:** Every web screen with a CEFR level picker gets the same meaning: "Tất cả" (all levels, evenly) or "Tối đa X" (X and every level below it, with levels closer to X appearing more often). Also fixes the shared dropdown popover overflowing the right edge.
**Branch:** `feat/level-picker`, cut from `feat/memory-split` (both touch the Chuẩn bị and Hội thoại setup pages).

---

## 1. Why

- The owner wants practice to lean toward harder material without losing easier material, and an explicit "everything" option.
- Today the screens disagree: Ôn tập and Luyện đọc offer "Mọi trình độ" / "Tối đa X" but pick words uniformly; Hội thoại and Chuẩn bị tình huống allow exactly one level; Nghe's "Tất cả" silently generates at B1.
- The shared `SimpleDropdown` popover is anchored to the trigger's left edge with a fixed 320px width, so a trigger near the right edge pushes the popover outside `.main` and the page scrolls sideways (owner screenshot on the Nghe hub).

## 2. Rule shared by every screen

- **"Tất cả"** — every level of the screen's scale, evenly.
- **"Tối đa X"** — X and all lower levels; never above X; the closer a level is to X, the more often it appears.
  - Weight of a level = its 1-based position counted up from the lowest level of the scale to X. Example with the A1–C2 scale and "Tối đa B2": A1:A2:B1:B2 = 1:2:3:4 (B2 = 40%, A1 = 10%). With the A2–C1 scale and "Tối đa B2": A2:B1:B2 = 1:2:3.

Phỏng vấn's level (intern/junior/mid/senior) is not CEFR and is out of scope.

## 3. Type 1 — picking the learner's own words (Ôn tập, Đọc song ngữ)

- `selectSessionWords` (`lib/practiceSession.ts`) keeps its rules: filter by topic and `maxCefr`, prefer due words, fall back to all matching words, truncate to `count`.
- The order of the pool changes:
  - `maxCefr === null` ("Tất cả"): uniform shuffle, as today.
  - `maxCefr = X`: weighted random order without replacement (each pick chooses among the remaining words with probability proportional to the word's level weight from §2, A1–C2 scale). Words with a level outside the scale count as weight 1.
- The function takes an optional `random: () => number` (default `Math.random`) so tests are deterministic.
- UI: Ôn tập and Luyện đọc rename "Mọi trình độ" to "Tất cả". "Tối đa X" labels stay.

## 4. Type 2 — difficulty of AI-written content (Hội thoại, Chuẩn bị tình huống, Nghe hiểu, Đọc song ngữ passage)

### 4.1 Picker
- Hội thoại setup and Chuẩn bị create form: chips "Tất cả", "Tối đa A2", "Tối đa B1", "Tối đa B2", "Tối đa C1" (scale A2–C1).
- Nghe hub: dropdown "Tất cả" + "Tối đa A1 … Tối đa C2" (scale A1–C2).
- Luyện đọc hub: already "Tất cả" (renamed, §3) + "Tối đa X"; the same `maxCefr` drives the bilingual passage prompt.

### 4.2 "Tất cả" = a random concrete level per generation
An AI prompt and every saved record need one concrete level, so for Type 2 "Tất cả" means: each time content is generated, pick one level uniformly at random from the screen's scale, generate in "Tối đa" style at that level, and store it like any other level. Across sessions the levels mix evenly. The UI shows the picked level where the level is already displayed (e.g. session header / kit badge "B1"); the setup screen shows "Tất cả" until Start / Tạo.

- Hội thoại: picked at Start; stored as `setup.level` with `setup.levelMode = "all"`.
- Chuẩn bị: picked at Tạo; stored as `level` with `levelMode = "all"`. The save-retry path reuses the already generated kit and its picked level.
- Nghe hiểu: when the URL has no `level`, generation picks a random A1–C2 level instead of the hard-coded B1; the generated passage and a saved exercise carry that concrete level. Saved-exercise lookup with no level filter is unchanged (any level).
- Đọc song ngữ: no change for "Tất cả" (its prompt already omits the level clause when `maxCefr` is null).

### 4.3 Prompt wording (one shared helper)
- Exact (legacy, `levelMode` missing): today's text for that screen, unchanged.
- `"max"` and `"all"` (with its picked level X): "Write mainly at CEFR X. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR X." — combined with the screen's existing level description (`LEVEL_GUIDE` for Hội thoại/Chuẩn bị, `CEFR_LABELS` for Nghe).
- Đọc song ngữ (`maxCefr = X`): "Keep the difficulty at or below CEFR level X" becomes the same "mainly at X … never above X" sentence.

### 4.4 Data
- `ConversationSetup.levelMode?: "max" | "all"` and `NewConversationPrep.levelMode?: "max" | "all"`; `level` keeps its type and always holds a concrete level. Missing `levelMode` = exact (old sessions, old kits, resumed "Đang dở" sessions keep their prompts).
- Firestore never receives `undefined`: new sessions and kits always write `levelMode`.
- Nghe and Đọc keep their URL params and saved-exercise shapes; only prompt text and Nghe's no-level default change.
- Chuẩn bị's default level for the next kit (latest kit's level) also restores the latest kit's mode ("Tất cả" if it was `"all"`).
- Learner memory and every other consumer of `setup.level` keep working: `level` is still a concrete `ConversationLevel`.

## 5. Dropdown overflow fix (`components/shared/SimpleDropdown.tsx`)

- On open, measure the trigger wrapper and the nearest scroll container (`.main`, falling back to the viewport). If `triggerLeft + popoverWidth` would pass the container's right edge, render the popover with an `align-end` modifier (`right: 0; left: auto`).
- Remove the empty bottom gap in the level/option popover: `.vb-topic-popover-opts` keeps `margin-bottom: 12px` only when an apply button follows (the topic filter), not in `SimpleDropdown`.
- Applies to every `SimpleDropdown` user (Ôn tập, Luyện đọc, Nghe, Kiến thức, Cài đặt).
- Phone rules unchanged (`width: min(320px, 100vw - 32px)`).

## 6. Error handling

Nothing new can fail: weighting and random picks are pure; invalid or unknown levels count as weight 1 / fall back to today's behaviour; old data without `levelMode` uses today's prompts.

## 7. Testing

- **Unit:** weighted order never includes levels above X, puts higher-weight levels first more often (seeded `random`, deterministic expectations), "Tất cả" stays uniform, due-first and `count` truncation unchanged; level-instruction helper for exact / max / all; random level pick stays inside the scale (seeded); conversation, prep, listening and reading prompts with each mode, and unchanged text for missing `levelMode` / null `maxCefr`.
- **Pages:** new picker labels ("Tất cả", "Tối đa …") on Hội thoại, Chuẩn bị, Nghe, Ôn tập, Luyện đọc; Hội thoại Start and Chuẩn bị Tạo store `levelMode` and a concrete `level`; Nghe with no level no longer generates at B1 (random level per generation); Chuẩn bị restores the latest kit's mode.
- **SimpleDropdown:** opens with `align-end` when the measured space on the right is too small, without it otherwise (mock `getBoundingClientRect`, `clientWidth` and `clientLeft`).
- **Manual:** the Nghe hub screenshot case at desktop width shows no horizontal scroll; a "Tối đa B2" Ôn tập session visibly favours B2/B1 words.

## 8. Non-goals

Flutter app; Phỏng vấn level; changing the CEFR scales of any screen; per-session weight customisation; mixing several difficulty levels inside one AI-generated piece beyond the "about a quarter easier" instruction.

## 9. Deviations

- Nghe hiểu 'Tất cả' initially picked its random level once per page load; fixed in the final-review wave: the level is picked per generation (including "Bài khác"), and saved exercises store the generated passage's own level.
- A kit's role-play prefill always uses levelMode 'max' at the kit's level.
