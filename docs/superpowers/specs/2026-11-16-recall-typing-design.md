# LexiCore — Ôn tập: "Gõ từ" recall mode (web)

**Date:** 2026-11-16
**Status:** Implemented (2026-11-16). UI mockup: https://claude.ai/artifact/GugcoAjCHd6sWoryfc4bSA
**Covers:** A third Ôn tập mode next to Flashcard and Trộn AI: the learner sees the Vietnamese meaning and the definition, and must type the full English word/phrase from memory, helped by a letter-pattern hint that scales with the word's CEFR level, a limited "Gợi ý" button, and a skip.
**Platform:** web only (`apps/web`). Flutter later, separately.

---

## 1. Why

- The owner has not used Ôn tập's two modes for a long time. Flashcard is self-graded (easy to "recognise" without really remembering); Trộn AI is mostly recognition too.
- The existing typing practice trains typing speed and spelling, not recall.
- What's missing: **active recall** — produce the English word yourself from its meaning, typed in full, so it sticks.

**Success:** a mode the owner actually reaches for: short sessions, honest scoring (hints count as "not remembered yet"), fast rhythm (Enter to check, Enter to move on), and a summary at the end.

## 2. Goals / non-goals / anti-goals

**Goals**
- Prompt = meaning (Vietnamese) + definition; answer = the full headword typed.
- Length/letter pattern always visible; letters pre-revealed by CEFR level.
- "Gợi ý" reveals more letters a few times; then "Bỏ qua" is allowed.
- Auto-advance after a short green/red flash; end-of-session summary.
- Results feed SM-2 like the other modes.

**Non-goals**
- Flutter app (later).
- Retyping after a wrong answer, partial credit, fuzzy matching.
- Sentences (only words and phrases).
- AI calls — this mode is fully offline from saved data.

**Anti-goals**
- Leaking the answer through the prompt (definition or example containing the headword).
- Counting a hinted answer as "remembered".
- A slow rhythm (extra clicks to continue).

## 3. Design

### 3.1 Setup
- Third chip **"Gõ từ"** in the "Kiểu bài" group (after Flashcard, Trộn AI). Same topic / level / word-count filters and the same "N từ khớp bộ lọc hiện tại." preview.
- Word pool: `selectSessionWords` as today, **excluding `inputType === "sentence"`** for this mode (the preview count reflects the exclusion). Dashboard "Ôn N từ ngay" (`?action=start`) is unchanged (keeps its current mode).

### 3.2 Card
- Shows: Vietnamese **meaning** (as Flashcard shows it), the **definition** (if any), and the record's level badge.
- **Masking:** any occurrence of the headword (case-insensitive, whole word/phrase; also simple inflections `-s/-es/-ed/-ing` of a single-word headword) in the definition **and the meaning** is replaced by `___`. Examples are not shown.
- **Pattern line** above the input, monospace, one slot per character: hidden letters `_`, revealed letters shown, separators shown as-is. Separators = space, `-`, `'`, `.`, `/` — always visible, never need guessing. Rendered as one underlined box per letter (spaces as a gap), per the owner's design canvas; the input has **no placeholder** (revised 2026-11-17 — it duplicated the slot line).
- **Live fill (owner-approved):** as the learner types, the typed characters fill the pattern's letter slots in order, crossword-style (separators in the input align with separator slots; typed text is laid over the slots character by character). A slot shows the typed character when there is one, else its revealed letter, else `_` — except that a revealed slot whose typed character differs (case-insensitive) shows the revealed letter (accent colour, source `conflict`), so a hint always stays visible. **No per-letter right/wrong colouring while typing** — judging happens only on Enter. Characters typed beyond the pattern's length show in the danger colour after the last slot.
- **Input:** single-line text, autofocus, 16px on phones, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck=false`. Labelled "Gõ từ tiếng Anh rồi bấm Enter". Enter submits; empty input does nothing. **Tab** = the hint button (§3.4); Shift+Tab still moves focus; a held (repeating) Tab or Enter is ignored; Tab never moves focus out of the input, also mid-IME composition.
- **Header:** level chip + "từ" / "cụm từ" (headword contains whitespace).
- **Buttons:** "Gợi ý (n)" (n = presses left) and "Bỏ qua" (enabled only after the hints are used up), with a note next to them ("Bỏ qua mở sau khi dùng hết 3 lần gợi ý", then "Hết gợi ý chữ — nghe lại bao nhiêu lần cũng được"). On desktop the buttons show small `Tab` / `Enter` key labels (hidden on phones, aria-hidden).
- **Pronunciation (owner-approved, replaces a 🔊 button):** no speaker button on the card. When the card appears, the headword's pronunciation audio is fetched and preloaded (same cached Storage audio as the 🔊 buttons elsewhere). When the answer is revealed — correct, wrong or skipped — it **plays once automatically**. If the audio is not ready yet it plays as soon as it is, but only while that card is still showing; a failure is silent. Advancing to the next word does not cut audio that is already playing.

### 3.3 Pre-revealed letters by level
Fraction of letters (not separators) shown at the start, deterministic per headword (same word → same pattern every session, so the pattern itself becomes a memory cue):

| Level | Revealed |
|---|---|
| A1, A2 | 0 (pattern only) |
| B1 | 15% |
| B2 | 25% |
| C1 | 35% |
| C2 | 40% |

Count = `round(fraction × letters)`, at least 1 for B1+ when the word has ≥ 4 letters, and always leave **at least half** of the letters hidden. Positions: spread across the phrase (prefer the first letter of each word part, then evenly spaced), picked with a seeded random from the headword so they're stable.

### 3.4 Gợi ý and Bỏ qua
- Up to **3** presses. Each reveals `max(1, ceil(25% of eligible letters))` more, never the last hidden letter (at least one letter always stays hidden until the answer is revealed).
- **Eligible letters (owner-approved):** hidden letters whose slot the learner has **not already typed correctly** (empty or wrong at that position). A hint never spends itself on a letter already typed right. If no letter is eligible, the press reveals nothing and does not use up a hint (the button is disabled in that state).
- **Last hint — listen (owner-approved):** once the letter hints are used up **or** no letter is eligible any more, the "Gợi ý" button becomes **"Nghe phát âm"**, which plays the preloaded pronunciation and can be pressed any number of times (each press restarts it). Pressing it marks the word hinted (it normally already is). If the audio is unavailable the button is disabled.
- "Bỏ qua" enables at the same moment the listen hint becomes available (owner: "nhắc 2-3 lần mà không được thì có thể bỏ qua").
- Any hint press marks the word **hinted** for scoring (§3.6). Pre-revealed letters do not.

### 3.5 Checking and rhythm
- Compare after: trim, collapse inner whitespace, case-insensitive, Unicode NFC, and treat curly/straight apostrophes and different dashes as equal. Otherwise exact.
- **Correct:** input turns green with "✓ Chính xác" inside it; the headword (green, with IPA) replaces the slot line.
- **Wrong:** input turns red, the typed text is struck through, "✗ Chưa đúng" inside it; an "Đáp án" panel with the headword (and IPA) replaces the slot line. No retry.
- **Skipped:** same display as wrong, input badge "Đã bỏ qua".
- **No auto-advance (owner, revised 2026-11-17; was 1.2 s / 2 s timers):** after the result shows, a **second Enter** (or the "Tiếp tục" button) moves to the next word; Tab replays the pronunciation. The input is read-only after grading; further Enters/clicks report the outcome only once.

### 3.6 Scoring and SM-2
- Outcome per word: `clean` (correct, no hint), `hinted` (correct after ≥ 1 hint), `wrong`, `skipped`.
- SM-2 quality: `clean` → 5; everything else → 1 (owner: hinted words come back soon, like wrong ones). Written in the existing batch at session end; daily activity recorded as today.

### 3.7 Summary
- Header (revised 2026-11-17, per the design canvas): green percentage circle (`clean / total`) beside the title "Kết quả ôn tập" and the line "Tự nhớ được X / N từ · Y từ nhờ gợi ý · Z từ sai hoặc bỏ qua".
- The three groups are **side-by-side columns** (one column each on phones): **"Tự nhớ được"** (green, "Giãn lịch ôn như bình thường"), **"Đúng nhờ gợi ý"** (accent, "Sẽ quay lại ôn sớm"), **"Sai / bỏ qua"** (danger, "Sẽ quay lại ôn sớm"); each with its count; empty groups hidden. Each row: headword over meaning, 🔊 on the right.
- Actions left-aligned: "Về Ôn tập" and "Ôn tập lại ngay (Gõ từ)", which restarts in the same mode, unlike today's reset to Flashcard for the other modes.
- Setup: when "Gõ từ" is selected, a note explains the mode ("Xem nghĩa và định nghĩa, gõ lại đầy đủ từ tiếng Anh. Chỉ ôn từ và cụm từ (bỏ qua mục dạng câu).").

## 4. Constraints
- Web only; no new collection, no AI, no backend change.
- Bloom styles; every `font-size` uses `--type-scale`; phone input 16px; touch targets ≥ 44px; green/red use existing success/error tokens.
- Tests for: pattern/reveal logic, masking, answer comparison, card flow (Enter/Tab keyboard flow), mode wiring and summary groups.

## 5. Calls made by me (owner approved "bạn tự quyết")
- Mode name "Gõ từ"; reveal percentages in §3.3; 3 hints at ~25% of hidden letters each; skip after hints run out.
- Pattern deterministic per word.
- Separators always shown; case-insensitive; apostrophe/dash variants equal.
- Definition shown with the headword masked; examples not shown; sentences excluded.
- ~~Timings 1.2 s (correct) and 2 s (wrong/skipped).~~ Replaced 2026-11-17 by the owner: Enter to check, Enter (or Tiếp tục) to move on; Tab = hint / listen / replay.
- (Owner) No 🔊 on the card; pronunciation preloaded on show and auto-played once on reveal. The summary keeps its 🔊 buttons.
- "Ôn tập lại ngay" keeps "Gõ từ".

## 6. Left to the builder
- Component/file split (expected: a pure `lib/recallHint.ts` for pattern/reveal/compare/mask + a `RecallTypingCard` component).
- How the outcome is carried alongside the existing `{ vocabRecordId, quality }` result.
- Exact styling of the pattern line and flash states.
