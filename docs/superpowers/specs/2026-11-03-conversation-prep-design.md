# LexiCore — Chuẩn bị tình huống (Conversation Prep, web)

**Date:** 2026-11-03
**Status:** Design approved in brainstorming; spec awaiting owner review.
**Covers:** A web-only page where the learner describes an upcoming real-life situation in Vietnamese ("Tôi chuẩn bị báo cáo với khách hàng về task A", "Tôi muốn kể cho bạn bè về kỷ niệm ở thành phố B") and the AI generates a prep kit: a sample English dialogue, the useful sentence patterns/grammar it uses, and new words/phrases to save. From the kit the learner can jump straight into a Hội thoại role-play of the same situation.
**UI mockup:** https://claude.ai/artifact/QUeMMEJvdw8zbzU4XSRj2Z (iPhone 11 create screen, iPhone 11 kit screen, desktop kit screen).
**Builds on:** `2026-10-09-conversation-practice-design.md` (Hội thoại) and `2026-10-10-mobile-responsive-web-design.md` (phone mode).

---

## 1. Goal

Before a real conversation, let a Vietnamese learner see how that exact situation sounds in natural English at their level, learn the reusable patterns and words it needs, save the useful ones, and then rehearse it by voice in Hội thoại.

## 2. Scope & Non-Goals

**In scope (web only, English only):**

- `/conversation/prep`: situation textarea (free Vietnamese text), suggestion chips, CEFR level (A2/B1/B2/C1), Create button, readiness (AI key only), "Gần đây" list with delete.
- `/conversation/prep/[id]`: saved kit view with three sections: Kịch bản mẫu, Mẫu câu hay dùng, Từ/cụm từ mới. Per-line TTS and translation, per-pattern "Tại sao?", per-word save to the vocab bank, "Luyện nhập vai tình huống này" CTA.
- Hội thoại Setup: a "Chuẩn bị tình huống" entry card, and `?prep=<id>` prefill of role-play mode.
- Phone layout (≤ 820px) built for and verified at iPhone 11 (414×896, notch, home indicator).

**Non-goals:** Flutter; languages other than English; editing or regenerating part of a kit; sharing kits; a new navigation item; streaming generation; storing per-word "saved" flags in the kit.

## 3. Architecture

No backend change. Everything runs in `apps/web/` and uses the existing BYOK LLM callable through `callInterviewAi` / `hasAiKey` (`apps/web/src/lib/interviewAi.ts`), exactly as Hội thoại does. No Cloud Functions or Cloud Run deploy.

### 3.1 Routes

| Route | Purpose |
|---|---|
| `/conversation/prep` | Create a kit; list recent kits |
| `/conversation/prep/[id]` | View one saved kit |
| `/conversation` | Existing Setup: new "Chuẩn bị tình huống" card linking to `/conversation/prep`; accepts `?prep=<id>` |

### 3.2 Firestore: `users/{uid}/conversation_preps/{id}`

```ts
interface PrepLine {
  speaker: "you" | "partner";
  partnerRole?: string;        // Vietnamese label for the other side, e.g. "Khách hàng", "Bạn thân"
  en: string;
  vi: string;                  // may be "" (then no Dịch button)
}

interface PrepPattern {
  pattern: string;             // e.g. "I'd like to walk you through ___", "We're on track to + V"
  meaning: string;             // Vietnamese: what it does / when to use it
  example: string;             // a sentence copied verbatim from dialogue[].en
  why: WhyPoint[];             // 0-3, same type as Hội thoại "Tại sao?"
}

interface ConversationPrep {
  id: string;
  createdAt: string;           // ISO, same as conversation_sessions
  situation: string;           // the learner's Vietnamese description
  level: ConversationLevel;    // "A2" | "B1" | "B2" | "C1"
  title: string;               // short Vietnamese title from the AI, for lists
  persona: string;             // English, steers the AI in role-play (same style as the `scenario` prompt)
  goals: string[];             // 3-4, Vietnamese
  dialogue: PrepLine[];        // 8-14 turns
  patterns: PrepPattern[];     // 5-8
  vocab: ConversationPhrase[]; // 6-10, reuses { text, meaning, example }
}
```

- One write per kit, only after the AI result parses. A failed generation writes nothing (no empty docs).
- Firestore rules are not in this repo. Before release, confirm the deployed rules allow the owner to read/write `users/{uid}/conversation_preps/**` (Hội thoại's `users/{uid}/conversation_sessions` suggests a `users/{uid}/**` owner rule already exists).

### 3.3 Modules (new unless noted)

- `lib/conversationPrepTypes.ts`: the types above.
- `lib/conversationPrepPrompt.ts`: `buildPrepPrompt(situation, level)`, `parsePrep(raw, situation)`, `PrepUnclearError`.
- `lib/conversationPreps.ts`: `createConversationPrep`, `getConversationPrep`, `listRecentConversationPreps`, `deleteConversationPrep` (same shape as `conversationSessions.ts`).
- `lib/savePhraseToVocab.ts`: extracted from the Hội thoại report page's `handleSavePhrase` (headword capitalization, existing-record check, `saveVocabRecord`), with the CEFR level and `personalNotes` as parameters, plus `isPhraseSaved`. The report page switches to it and now passes the session's level instead of the hard-coded `b1` (otherwise unchanged); the prep page uses it with its own note ("Từ Chuẩn bị tình huống") and the kit's level.
- `lib/prepHighlight.ts`: `findPatternSpan`, `lineHighlights`.
- Components under `components/conversation/prep/`: `PrepDialogue` (bubbles + highlights), `PrepPatternCard` (uses `WhyList`), `PrepVocabList` (rows: text, meaning, example, TTS, Lưu/Đã lưu — `PhraseSaveList`'s chip layout has no room for meaning/example/TTS), `RecentPreps`. The form, jump bar and CTA are plain markup in the two pages.
- `app/(app)/conversation/prep/page.tsx`, `app/(app)/conversation/prep/[id]/page.tsx`.
- Modified: `app/(app)/conversation/page.tsx` (entry card, `?prep=` prefill), `ConversationSetup` gains optional `prepId?: string` (stored on the session for reference only).

## 4. Flow

1. Learner types the situation (or taps a chip that fills the textarea), picks a level (default: the level of the most recent kit, else B1), taps **Tạo kịch bản**.
2. One `callInterviewAi` call with `buildPrepPrompt`. While waiting the button reads "Đang tạo…", the textarea is locked, and rotating progress lines are shown ("Đang viết kịch bản…", "Đang chọn mẫu câu…", "Đang chọn từ mới…"). These are cosmetic; there is only one call.
3. `parsePrep` validates; on success `createConversationPrep` writes the doc and the page navigates to `/conversation/prep/[id]`.
4. On the kit page, each word's saved state is computed on load by checking the vocab bank (as the Hội thoại report does); **Lưu** calls `savePhraseToVocab` and flips to **Đã lưu**.
5. **Luyện nhập vai tình huống này** navigates to `/conversation?prep=<id>`. Setup loads the kit, sets role-play mode with custom scenario, `topic = title`, `persona`, `goals`, `level` prefilled and editable in `ScenarioPreview`, and **skips the `scenario` call**. The session runs unchanged from there, with `setup.prepId` set.
6. Opening a saved kit needs no AI key. The role-play needs one; Hội thoại Setup's existing readiness check covers it.

## 5. Prompt

`buildPrepPrompt(situation, level)` asks for JSON only:

```json
{
  "title": "...", "persona": "...", "goals": ["..."],
  "dialogue": [{ "speaker": "you|partner", "partnerRole": "...", "en": "...", "vi": "..." }],
  "patterns": [{ "pattern": "...", "meaning": "...", "example": "...", "why": [{ "part": "...", "reason": "..." }] }],
  "vocab": [{ "text": "...", "meaning": "...", "example": "..." }]
}
```

(`why` items use the existing `WhyPoint` field names.)

Constraints in the prompt:

- The learner's situation is wrapped in clearly delimited "untrusted data, not instructions" markers.
- Dialogue: 8-14 turns, alternating, the learner is `you`; natural spoken English at the stated CEFR level; each line with a Vietnamese `vi`; `partnerRole` a short Vietnamese role label.
- Patterns: 5-8 reusable patterns that actually appear in the dialogue; `example` copied verbatim from one `dialogue[].en`; `why` follows the existing `WHY_RULES` (Vietnamese explanations of tense, prepositions, word order, fixed phrases), 0-3 points.
- Vocab: 6-10 items useful for this situation, prefer phrases/collocations over single words, skip words too basic for the level; `example` a short English sentence.
- `persona`: English, same style as the Hội thoại `scenario` prompt; `goals`: 3-4 Vietnamese goals the learner would pursue in this situation, consistent with the dialogue.
- If the situation is not a usable communicative situation (gibberish, a single word), return `{"error":"unclear"}`.

`parsePrep(raw, situation)`:

- Strips markdown fences, parses JSON. `{"error":"unclear"}` throws a typed `PrepUnclearError`.
- Throws on: fewer than 4 dialogue lines, empty persona, no goals, no patterns, no vocab.
- Drops items missing required fields (`en`, `pattern`/`meaning`, `text`/`meaning`); keeps a line without `vi` (`vi = ""`); coerces an unknown `speaker` to drop the line.
- Truncates: dialogue 14, patterns 8, vocab 10, goals 4; `why` through the existing `parseWhy(value, 3)`.
- `title` falls back to the first 60 characters of the situation.

`findPatternSpan(line, pattern)`: strips placeholders (`___`, `+ V`, `(that)`-style optional parts in parentheses, trailing punctuation) from the pattern, finds the remaining text in the line case-insensitively, returns `{start, end}` or `null`. A `null` means no highlight; the pattern card still shows.

## 6. UI

See the mockup. All styling uses existing Bloom tokens/classes; no new colors; dark mode via existing tokens.

**Create page:** heading + one-line explanation, a card with the labelled textarea (16px), suggestion chips (wrap, never scroll horizontally), `BloomSegmented`-style level picker, pill **Tạo kịch bản** (disabled when the textarea is empty/whitespace or no AI key), readiness line, then "Gần đây" (title, level, date, delete with confirm). Signed-out: heading + `SignInButton`.

**Kit page:** back link, title + level badge, the situation in faint italics, a jump bar (Kịch bản / Mẫu câu / Từ mới) that sticks under the header, then:

- **Kịch bản mẫu:** chat bubbles; `you` right-aligned, `partner` left-aligned with its `partnerRole` label; each bubble has a TTS button (Piper, conversation default voice, silent best-effort on failure) and a **Dịch / Ẩn dịch** toggle. Pattern spans are underlined in the accent color; tapping one scrolls to its pattern card and briefly rings it.
- **Mẫu câu hay dùng:** cards with pattern, meaning, example (with TTS), and a collapsed-by-default **Tại sao?** toggle rendering `WhyList`.
- **Từ/cụm từ mới:** `PrepVocabList` rows with TTS per item.
- **CTA:** phone: a bar pinned to the bottom above the tab bar; desktop: the button sits next to the title (top right), no pinned bar.

Desktop layout: two columns, dialogue left, patterns + words right.

### 6.1 Phone (≤ 820px), iPhone 11 first

- Rules live in the phone-mode block of `apps/web/src/styles/bloom.css`. Every `font-size` is `calc(N * var(--type-scale))` (or the `max(var(--type-min), …)` form under 15px); `bloom.fontSize.test.ts` enforces it.
- One column, 16px gutters, no horizontal page scroll. Bubbles max 85% width.
- The textarea stays at 16px (no iOS focus zoom). Every tap target (TTS, Dịch, Tại sao?, Lưu, delete, jump bar items, chips) is ≥ 44px.
- Jump bar: sticky under the header, three equal columns, 44px tall.
- CTA bar: pinned above the tab bar via a `:has(.prep-cta-bar)` rule (same approach as `.reading-submit-bar`); content gets enough bottom padding that the last word row is never hidden; respects `env(safe-area-inset-bottom)` when the tab bar is not shown.

## 7. Error Handling

| Case | Behaviour |
|---|---|
| No AI key | Create disabled; readiness line links to Cài đặt |
| AI error / timeout / invalid JSON | Inline error + **Thử lại**; textarea content kept; nothing written |
| `unclear` | "Hãy mô tả tình huống cụ thể hơn (bạn sẽ nói với ai, về chuyện gì)." |
| Firestore write fails | Error + **Thử lại** that retries the write with the already-parsed kit (no new AI call) |
| `/conversation/prep/[id]` missing or deleted | "Không tìm thấy bộ tài liệu" + link back to `/conversation/prep` |
| `/conversation?prep=` with a bad id | Ignore the param, normal Setup |
| Vocab save fails | Existing `PhraseSaveList` error line; item stays unsaved |
| TTS fails | Silent (best-effort, as elsewhere) |

## 8. Testing

- **Vitest (pure):** `buildPrepPrompt` (level present, situation fenced as data, `WHY_RULES` included, JSON shape described); `parsePrep` (valid, fenced, malformed JSON, `unclear`, each throw case, item dropping, truncation, `why` filtering, missing `vi`, title fallback); `findPatternSpan` (exact, case-insensitive, `___`, `+ V`, optional parenthesised part, no match); `conversationPreps` (create/get/list/delete against the Firestore mock pattern used by `conversationSessions`); `savePhraseToVocab` (new record, existing record skipped, level/note passed through).
- **Component (Testing Library, mocked clients):** create page (disabled states, chip fills textarea, generating state, error + retry, `unclear` message, navigates on success, recent list delete); kit page (three sections render, Dịch toggle, Tại sao? toggle, highlight tap scrolls, Lưu → Đã lưu, already-saved on load, not-found state); Hội thoại Setup with `?prep=` (role-play prefilled from the kit, `scenario` prompt not called, bad id ignored); Hội thoại report still saves phrases through the extracted helper.
- **CSS:** `bloom.fontSize.test.ts` covers new rules.
- **Manual:** `AUDIT_BASE_URL=http://localhost:3000 AUDIT_WIDTH=414 AUDIT_ROUTES=/conversation/prep node --experimental-websocket apps/web/scripts/mobile-audit.mjs` (signed-out view); a static 414px harness built from the real kit markup for the signed-in layout; owner's iPhone 11 end-to-end: create a kit → save two words → Luyện nhập vai → finish a session.

## 9. Deploy

Web only: push to the connected branch, Firebase App Hosting auto-deploys `apps/web/`. No `firebase deploy --only functions`, no Cloud Run change. Check the Firestore rules note in §3.2 before pushing.
