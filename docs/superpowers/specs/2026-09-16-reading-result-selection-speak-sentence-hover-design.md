# LexiCore — Reading Result: Select-to-Speak + Sentence Hover Sync (web)

**Date:** 2026-09-16
**Status:** Approved
**Covers:** Two small enhancements to the "Đọc & gõ" (bilingual reading/typing) result screen's passage review block on web (`apps/web/src/components/reading/PassageReview.tsx`, rendered from `apps/web/src/app/(app)/reading/bilingual/page.tsx`): (1) selecting arbitrary text in the English passage shows a floating button that speaks the selection aloud, uncached; (2) hovering a sentence in either the English passage or the Vietnamese translation highlights the paired sentence in the other block.
**Depends on:** `2026-08-18-react-web-plan3-phase-c-reading-typing-design.md` (introduced `PassageReview`/`BilingualSentence` and the "Đọc & gõ" result screen this spec extends).
**Platform:** Web only. The Flutter "Đọc & gõ" result screen (`lib/features/reading/presentation/screens/reading_result_screen.dart`) does not currently render a passage+translation review block at all (only a used-vocab list + suggestions), so there is no equivalent surface to extend there yet — out of scope for this spec.

---

## 1. Goal

The result screen's passage review already shows the full English passage (with known-vocab highlights) and its Vietnamese translation underneath. Two gaps observed in use:

1. There's no way to hear an arbitrary word or phrase from the passage — only whole saved vocab words (via the "Từ vựng dùng trong bài" list's cached `PronunciationButton`) can be pronounced. A learner re-reading the passage wants to hear *any* word or short phrase on demand.
2. With two separate blocks of prose (English passage, Vietnamese translation), it's not obvious which Vietnamese sentence corresponds to which English one without re-reading both carefully.

## 2. Scope & Non-Goals

**In scope:**
- English passage text only (not the Vietnamese translation, not the vocab list — see §4 for why).
- The `PassageReview` component and its immediate data (`BilingualSentence[]`).
- Web only.

**Non-goals:**
- **Flutter parity.** Deliberately deferred — building it there means first building the passage+translation review block itself (doesn't exist today), a separate, larger piece of work.
- **Caching the ad-hoc selection audio.** Explicitly the opposite of the existing word/sentence pronunciation cache (`getPronunciation` → Firebase Storage, shared across users) — arbitrary substrings of arbitrary passages are not a bounded, reusable cache key space the way dictionary headwords/example sentences are. Every play is a fresh, uncached `synthesizeSpeech` call, exactly like Nghe chép/Nghe hiểu already do for their freshly-generated sentences.
- **Reading the Vietnamese translation aloud.** The learner is a Vietnamese speaker studying English — hearing Vietnamese TTS serves no purpose here (explicitly decided against during design).
- **Touch/tap fallback for sentence hover.** No `:hover` on touch devices — the feature simply doesn't activate there. Nothing breaks; it's a pure enhancement layered on top of the existing static rendering.
- **A reusable/shared component for other passage screens** (Nghe hiểu, Nghe chép transcripts). This spec scopes both features to `PassageReview` only. The implementation should stay easy to lift out later (see §4), but nothing is built generically upfront (YAGNI).
- **Voice selection** for the ad-hoc speak button — uses `synthesizeSpeech`'s default voice, no picker.

## 3. Design

### 3.1 Select-to-speak (English passage only)

**Capturing the selection:** listen for `mouseup`/`selectionchange` scoped to the passage `<p>` (`.reading-review-passage`). On a non-empty `window.getSelection()` whose anchor/focus both fall within that element, read `selection.toString()` as the text to speak and `selection.getRangeAt(0).getBoundingClientRect()` to position a floating button just above/beside the selection (matches the familiar "selection popover" pattern — e.g. native OS/browser "Copy" bubbles).

**The button:**
- Renders only while a non-empty selection exists inside the passage; disappears on selection clear (click elsewhere, `selectionchange` to empty, or scroll — recompute position on scroll to avoid a stale floating button).
- Icon states mirror `PronunciationButton`'s existing convention exactly: 🔊 idle → "…" while in flight → ⚠️ on error (auto-resets to 🔊 on the next selection change, same as that component's `useEffect` reset-on-identity-change pattern).
- On click: `synthesizeSpeech({ text: selectedText, language: "en" })` → `toAudioDataUrl(audioBase64)` → `new Audio(url).play()`. No `voice` passed (default). Best-effort: a failure shows ⚠️ on the button; no toast/alert (matches `PronunciationButton`'s existing silent-failure convention — this repo's established pattern for TTS errors, see CLAUDE.md's "Deploy gotchas").
- Selecting new text while a previous request is in flight or errored simply resets the button to a fresh idle state at the new position — no cancellation logic needed (the old `Audio` element, if still playing, keeps playing to completion; a second selection+play call is a separate independent `Audio` instance, exactly like clicking `PronunciationButton` on two different words in quick succession already behaves today).

**New code:** a small hook, `useTextSelectionSpeak(containerRef)`, returning `{ selectedText, anchorRect } | null`, plus a `SelectionSpeakButton` presentational component consuming it — both new, colocated with `PassageReview.tsx` (e.g. `apps/web/src/components/reading/`). Not a generic cross-screen utility yet (see §2 non-goals) — but factored as an isolated hook + button specifically so lifting it to a shared location later (if Nghe hiểu/Nghe chép want the same feature) is a file-move, not a rewrite.

**Latency expectation (informed estimate, not benchmarked):** Piper on Cloud Run typically synthesizes faster than real-time for short text — a single word (~0.5s of audio) likely completes in roughly 200–500ms of server processing, a short phrase/sentence (~2–3s of audio) roughly 500ms–1.2s, plus network round-trip (the Cloud Function and Cloud Run service are both `asia-southeast1`, so round-trip from Vietnam is small). The dominant risk is **Cloud Run cold start** (the TTS/STT service scales to zero per CLAUDE.md's deploy notes) — a request after idle time can add several seconds on top of the above. The "…" loading state on the button is the only mitigation planned; no pre-warming or skeleton beyond that.

### 3.2 Sentence hover sync (English ↔ Vietnamese)

`PassageReview` already has 1:1 indexed data (`sentences: BilingualSentence[]`, one `.target`/`.vietnamese` pair per index) and already renders the English side as one `<span>` per sentence. Change:

- Wrap each Vietnamese sentence in its own `<span key={index}>` inside the translation `<p>` (currently one flat string join — becomes per-sentence spans, joined by the same `" "` separator between them, so the rendered text is visually unchanged when nothing is hovered).
- Add one piece of state to `PassageReview`: `hoveredIndex: number | null`.
- Both the English sentence `<span>` and the Vietnamese sentence `<span>` at a given index get `onMouseEnter={() => setHoveredIndex(i)}` / `onMouseLeave={() => setHoveredIndex(null)}`.
- Whichever side the index came from, **both** spans at that index render with a `reading-sentence-hover` class when `hoveredIndex === i` — hovering either side highlights both (bidirectional, single shared state, no "which side triggered it" branching needed).
- New CSS class `.reading-sentence-hover` in `bloom.css`, alongside the existing `.reading-vocab-highlight`/`.reading-review-translation` rules — a background tint distinct from the vocab-word highlight color (`.reading-vocab-highlight` is already visually "used" for known-vocab marks; sentence hover needs its own, lower-emphasis treatment, e.g. a subtle `background-color` with no font-weight change, so a hovered sentence that also contains a vocab-highlighted word doesn't visually conflict).

Interaction with §3.1: `mouseenter`/`mouseleave` (sentence hover) and text selection (`mouseup`/`selectionchange`) are independent browser mechanisms and don't interfere — a user can hover-highlight a sentence and also select text within it; the floating speak button and the sentence-hover tint simply both apply at once.

## 4. Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Which endpoint for ad-hoc speech | `synthesizeSpeech` (uncached) | Matches the existing cached-vs-uncached split already established in this codebase (dictionary/vocab words cached; freshly-generated/arbitrary text uncached) — arbitrary passage substrings have no bounded, reusable cache key |
| Trigger UX | Floating button on selection, not auto-play on mouseup | Avoids firing TTS calls while the user is just adjusting/re-making a selection, and doesn't interfere with normal copy-text selection behavior |
| Scope: English only, not Vietnamese | English passage only | User is a Vietnamese speaker studying English — no value in hearing Vietnamese TTS; also halves the surface area to build/test |
| Scope: web only | No Flutter work in this spec | Flutter's result screen has no passage/translation block to extend yet — building one is a separate, larger effort |
| Sentence hover direction | Bidirectional via one shared `hoveredIndex` | Simplest possible state shape; matches the already-1:1 indexed data with zero extra bookkeeping |
| Touch devices | No fallback, feature silently doesn't activate | Pure enhancement over existing static rendering — nothing regresses on touch, not worth added complexity for a `:hover`-native feature |

## 5. Deferred / Open Follow-ups

- If Nghe hiểu/Nghe chép transcripts later want the same select-to-speak affordance, lift `useTextSelectionSpeak` + `SelectionSpeakButton` out of `apps/web/src/components/reading/` into a shared location (`apps/web/src/components/shared/`) — deliberately not done upfront (§2).
- Flutter parity (a passage+translation review block on `ReadingResultScreen`, plus both features) is explicitly out of scope here and would need its own spec if/when prioritized.
- No telemetry/logging of actual `synthesizeSpeech` latency is planned — §3.1's timing figures are estimates from reading the Piper/Cloud Run code, not measurements. If cold-start latency turns out to be a real problem in practice, revisit with real numbers.
