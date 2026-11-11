# LexiCore — Chuẩn bị tình huống: continuity across kits + full, searchable history (web)

**Date:** 2026-11-11
**Status:** Approved (2026-11-11).
**Covers:** (1) A new Chuẩn bị kit knows what happened in the learner's earlier kits (via short summaries) and continues a related story, using only what is relevant to the new situation. (2) The "Gần đây" history shows every kit (not just the latest 10) and gets a search box.
**Out of scope:** Hội thoại and Phỏng vấn (owner: "chưa cần cho hội thoại"). A page to read the summaries (owner: not needed — the history already exists). Filters other than text search (level, date).

---

## 1. Why

The owner builds chains of related kits, e.g.:

- A — interview to join a game-development course
- B — lesson 1
- C — lesson 2
- D — lesson 3 …

Today a new kit only knows the *patterns and words* earlier kits taught (to avoid re-teaching them) plus up to 2 due mistakes. It knows nothing of what *happened* in A, B, C — so D cannot say "last week we covered the game loop", keep the same teacher, or build on lesson 1. The only workaround is typing the whole backstory into the situation box, which grows with every kit.

Separately, the history list only loads the 10 newest kits, so older links in a chain (A) disappear from view (they are not deleted — the page just doesn't load them).

**Success:** the owner types "buổi học 3 của khoá làm game" and the kit continues the course — same people, picks up from what lessons 1–2 covered, does not repeat them — without the owner retyping anything. A travel kit in the history is ignored for this.

## 2. Goals / non-goals / anti-goals

**Goals**
- Every kit has a short story summary.
- When generating a new kit (with "Dùng trí nhớ" on), the AI sees the summaries of all earlier kits and is told to use only the ones relevant to the new situation.
- Kits made before this feature count too (A, B, C already exist).
- History shows all kits, paged, with a text search.

**Non-goals**
- Showing summaries in the UI.
- Continuity for Hội thoại / Phỏng vấn / kit role-play sessions.
- Explicit "series" / "continue from kit X" pickers — the owner prefers the AI decide relevance from the description.

**Anti-goals (would be a failure even if it technically works)**
- Unrelated kits leaking in: a game-course kit mentioning the Tokyo trip.
- Mentioning "your earlier kit" / "last time you prepared…" meta-talk inside the dialogue. Continuity must read as part of the story (characters referring to the previous lesson is fine; the AI talking about the app is not).
- The prompt growing without bound as kits pile up.
- Re-teaching earlier patterns/words (existing coverage rule must keep working).

## 3. Design

### 3.1 Summary on each kit

- New optional field on the kit document: `summary: string` (English, 1–3 sentences, ≤ 400 chars). Missing on old kits.
- Written by the AI **in the same generation call** that writes the kit — add `"summary"` to the JSON the kit prompt already returns. No extra AI call.
  - Prompt instruction: what happens in this situation, who is involved (names/roles as used in the dialogue), and the main thing the learner practises/learns — as story facts a later kit could continue from. No Vietnamese, no meta-talk.
- `parsePrep` accepts a missing/empty summary (kit still saves, just without one) and trims it to 400 chars.

### 3.2 Fallback summary for kits without one (old kits)

Built deterministically (no AI, no migration write) when a kit's `summary` is missing:
`"<title>. Situation: <situation>. <persona>. Goals: <goal1>; <goal2>; …"` — each piece cleaned of extra whitespace, whole thing capped at 400 chars. This is enough for A/B/C to be recognisable as the game course and for D to continue it.

### 3.3 Giving the summaries to the AI

- Only when "Dùng trí nhớ" is on (same switch as today's kit memory; off = no summaries, no coverage, no targets — unchanged behaviour).
- `loadKitMemory` additionally returns `history: { title, createdAt, summary }[]` — the **50 most recent** earlier kits, newest first (cap = builder's call, see §5; keeps the prompt bounded at roughly ≤ 25 KB of text).
- New prompt section in `kitMemorySection` (before coverage/targets), roughly:

  > Earlier situations this learner prepared (newest first, with dates). Some may belong to the same ongoing story as the new situation (e.g. the same course, job, trip or people); most will not.
  > – [2026-11-02] Game course interview: …
  > – …
  > If — and only if — the new situation clearly continues or refers to one of these, keep its people, names and facts consistent and build on what already happened (do not repeat it). Ignore every unrelated one completely; never mention them. Never say the learner prepared anything before.

- A failed read still means "generate without memory" (existing behaviour of `loadKitMemory`).
- Stored `usedMemory` keeps its meaning.

### 3.4 History list: all kits + search

- The create page loads **all** of the user's kits once (one Firestore query ordered by `createdAt desc`, no limit) and keeps them in state. The same list feeds §3.3 indirectly only through `loadKitMemory` (which does its own read; no shared cache required).
- `RecentPreps` renders the first 20; a **"Xem thêm"** button shows 20 more each tap.
- A search input above the list ("Tìm bộ tài liệu…"): case- and diacritic-insensitive substring match against title, situation and summary (fallback summary for old kits is *not* needed for search — title + situation cover them). While a query is non-empty, paging resets and all matches show; empty query restores the paged list. "Không tìm thấy bộ tài liệu nào." when nothing matches.
- Delete stays exactly as it is (only on the owner's tap + confirm). It removes the kit from the in-memory list too.
- The section title stays "Gần đây"? → renamed **"Lịch sử"** since it now holds everything.
- The default level picked from "the latest kit" keeps working (first item of the full list).

## 4. Constraints

- Web only (`apps/web`), Firebase client SDK; no new collection, no Cloud Function, no rules change (kits already live under `users/{uid}/conversation_preps`).
- All new `font-size`s follow the `--type-scale` rule; text inputs stay 16px on phones; touch targets ≥ 44px.
- BYOK AI call unchanged; the extra prompt text is the only cost.
- Tests alongside each change (prompt section, parse, fallback summary, search/paging, memory loader).

## 5. Calls made by me (owner to check)

- **Summary language: English**, so it slots into the English prompt cleanly. Search still works because title + situation (which the owner writes in Vietnamese) are searched too.
- **Cap of 50 summaries** in the prompt rather than literally all — protects speed/cost once the history is long. Older kits stay in the history and searchable.
- **Old kits get a built-from-fields fallback summary**, not an AI-written backfill — free and instant; good enough for continuity.
- **Respects the "Dùng trí nhớ" switch** (off = no summaries), consistent with the rest of kit memory.
- **Load all kits on the create page** instead of server-side paging — simplest, and fine for a personal app with hundreds of kits; revisit if it ever feels slow.
- History section renamed "Gần đây" → "Lịch sử".

## 6. Left to the builder

- Exact prompt wording (within §3.3's rules) and where the summary sits in the kit JSON schema.
- Diacritic-folding helper (reuse an existing one if the codebase has it).
- Search input styling (reuse existing input/chip styles from Bloom).
