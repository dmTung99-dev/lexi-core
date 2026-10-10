# LexiCore — Mobile-responsive web app (iPhone 11)

**Date:** 2026-10-10
**Status:** Draft, pending spec review
**Covers:** Making the React web app (`apps/web/`) comfortable to use on a phone (primary target: iPhone 11, Safari, 414×896 CSS px, portrait), with all existing features available, a phone-specific navigation, and a phone-specific type scale. Desktop appearance does not change.
**Platform:** Web only (`apps/web/`). Flutter app untouched. No backend, Firestore, or dependency changes.
**Depends on:** `apps/web/src/styles/bloom.css` (single global stylesheet), `AppShell` / `Sidebar` (`apps/web/src/components/shell/`), the `fontSize` user setting (small / normal / large).

---

## 1. Goal

A learner opens the site on an iPhone 11 and can use every area (Tổng quan, Tra từ, Từ vựng, Ôn tập, Đọc, Quét từ, Kiến thức, Nghe, Phỏng vấn, Hội thoại, Cài đặt) with no horizontal page scroll, thumb-reachable navigation, readable text, no unwanted iOS auto-zoom, and nothing hidden under the notch or home indicator.

Success criteria:
- At 414 px width no page scrolls horizontally (`documentElement.scrollWidth <= innerWidth`) for any area's reachable states.
- Navigation between all 11 areas is possible with the thumb, in at most two taps from any screen (tab, or "Thêm" then item).
- Tapping any input does not trigger Safari's focus zoom.
- Every interactive control is at least 44×44 CSS px.
- Desktop (> 820 px) renders exactly as today.

## 2. Findings in the current code

- `.sidebar` is a fixed 264 px column inside `.app-frame { display:flex }`; on a 414 px screen the content area is about 150 px.
- `.main` has `padding: 32px 38px`; `.app-frame::before` is a 320 px decoration.
- Only six `@media` blocks exist (one dark-mode, others at 860/980 px for a few pages).
- 171 `font-size` declarations in `bloom.css` (mostly px, some rem), none inline in components. Body-level sizes are desktop-scale (16.5–19 px).
- The user font-size setting is implemented as `zoom` on `.app-frame` (`.fs-small` 0.9, `.fs-large` 1.15).
- No explicit viewport export; no `viewport-fit=cover` (no safe-area handling). The manifest is `display: standalone`, so the site can be added to the Home Screen, where the notch and home indicator matter.
- Fixed-width pieces to relax: widths of 220/240/320/580 px, side columns of 320 px (`.iv-setup-side`, `.iv-session-side`), 4-/3-/2-column grids (some already collapse at 980 px), a 7-column calendar grid.
- `.iv-dock { position: sticky; bottom: 0 }` on Interview/Conversation session pages.

## 3. Scope & Non-Goals

**In scope:**
- Phone navigation (bottom tab bar + "Thêm" sheet), shared navigation data.
- Viewport / safe-area / dynamic-viewport-height handling.
- Phone type scale via a CSS variable, iOS focus-zoom guard, interplay with the font-size setting.
- Generic phone layout rules plus per-area fixes for all 11 areas.
- Tests for new components and for the font-size convention.

**Non-goals (deferred):**
- iOS Home Screen icons / splash screens, offline mode, gestures (swipe), iPad-specific layout.
- Any desktop visual change.
- Replacing emoji nav icons with an icon set.
- Landscape-phone-specific layout (landscape iPhone 11 is 896 px and keeps the desktop layout).

## 4. Design

### 4.1 Mode switch

"Phone mode" is `@media (max-width: 820px)`. It is **CSS-only**: both `Sidebar` and the new `MobileTabBar` are always rendered; CSS hides the one that does not apply, so there is no hydration flash and no JS device detection.

### 4.2 Navigation

- New `apps/web/src/components/shell/navItems.ts`: the single source for navigation data (groups, hrefs, labels), consumed by `Sidebar` (behavior unchanged) and by `MobileTabBar`. Existing Sidebar tests keep passing.
- New `apps/web/src/components/shell/MobileTabBar.tsx`:
  - Five items in a `<nav aria-label="Điều hướng chính">`: Tổng quan (`/dashboard`), Tra từ (`/lookup`), Từ vựng (`/vocab-bank`), Ôn tập (`/practice`), **Thêm**.
  - Each item at least 44 px tall, emoji icon (same emoji as the sidebar) above a small label. The active tab uses the accent color; matching rule = `pathname === href || pathname.startsWith(href + "/")` (same as Sidebar).
  - **Thêm** is a button (`aria-haspopup="dialog"`, `aria-expanded`) that opens a bottom sheet listing the remaining seven areas (Đọc, Quét từ, Kiến thức, Nghe, Phỏng vấn, Hội thoại, Cài đặt). The sheet is `role="dialog"` with an accessible label, closes on backdrop tap, Escape, selecting an item, or route change, and returns focus to the "Thêm" button. "Thêm" renders as active when the current route belongs to one of those seven areas.
  - Fixed to the bottom: height 56 px plus `env(safe-area-inset-bottom)`.
- **Hidden on session routes:** the tab bar and its sheet are not rendered on `/interview/<id>` and `/conversation/<id>` (the live session pages, matched by `^/(interview|conversation)/[^/]+$`; their `/report` pages and setup pages keep the bar). Those pages already have a sticky bottom dock and need the space; they keep their existing "Kết thúc …" buttons as the exit.
- `AppShell` renders `<Sidebar />`, `<MobileTabBar />` and `<main>`; hiding on session routes is decided inside `MobileTabBar` via `usePathname()`.

### 4.3 Viewport, safe areas, layout base

- `apps/web/src/app/layout.tsx` exports `viewport` (`width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`, `themeColor` matching the manifest). Add `appleWebApp` capable metadata so the Home Screen launch behaves as standalone.
- In phone mode: `.app-frame` uses `min-height: 100dvh` (fallback `100vh`); `.app-frame::before` is hidden; `.main` padding becomes `16px` with bottom padding = tab-bar height + `env(safe-area-inset-bottom)` (+ extra clearance) and top padding includes `env(safe-area-inset-top)`; the sticky `.iv-dock` adds `env(safe-area-inset-bottom)`.
- Add `-webkit-text-size-adjust: 100%` to prevent iOS landscape text inflation.

### 4.4 Typography

- **Mechanism:** a one-off script rewrites every `font-size: N<unit>` in `bloom.css` to `font-size: calc(N<unit> * var(--type-scale))`. Declarations are converted in place (px and rem). `:root { --type-scale: 1 }` so **desktop output is numerically identical**.
- **Phone mode:** `--type-scale` = device scale `0.9` × user scale (`fs-small` 0.9, normal 1, `fs-large` 1.15). On phones the `zoom` rule for `.fs-small` / `.fs-large` is disabled (zoom would push inputs below 16 px) and only the variable changes, so spacing is unaffected. On desktop `zoom` stays as is.
- Examples at normal user scale: body 17.5 → ~15.8 px, screen title 25 → ~22.5 px, group label 14.5 → ~13 px. The tab-bar label is set explicitly (11–12 px). A floor of 12 px applies to anything the scale would shrink below that: the script emits `max(12px, calc(N * var(--type-scale)))` for every declaration whose original size is under 13.5 px (rem values converted at 16 px), and the plain `calc(...)` form for the rest. The convention test accepts both forms.
- **iOS focus-zoom guard:** in phone mode `input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select { font-size: 16px !important }` (the only `!important`, with a comment explaining why).
- **Convention test:** a Vitest test reads `bloom.css` and fails if any `font-size` declaration is not of the form `calc(... * var(--type-scale))` (allow-list for the tab-bar rule, the guard rule, and `:root`/`body` base if needed), so future CSS follows the convention.

### 4.5 Phone layout rules (generic, in one `@media (max-width: 820px)` block at the end of `bloom.css`)

- Two-column layouts stack: `.iv-setup-layout`, `.iv-session-body`, `.reading-result-row`, `.knowledge-detail-columns` and similar; side columns (`.iv-setup-side`, `.iv-session-side`, role-play goal panel) become full-width blocks below the main column.
- Fixed widths become `width: 100%; max-width: 100%` (the 220/240/320/580 px cases found).
- Grids: 4-column → 2 (`.iv-type-grid`, `.iv-voice-grid`); 3-column → 1 (`.iv-improve-grid`); 2-column → 1 where content is text-heavy; the dashboard's 7-column calendar stays 7 columns with smaller cells; `auto-fill` grids use a smaller `minmax` so two cards fit when sensible.
- Wide content (tables, long unbroken strings, code-like text) scrolls horizontally **inside its own container** (`overflow-x: auto`); long words wrap (`overflow-wrap: anywhere`) in chat bubbles, headwords, and cards.
- Modals become bottom sheets: full width, `max-height: 90dvh`, scrollable body.
- Touch targets: buttons, chips, switches, list rows, icon buttons get `min-height: 44px` and adequate spacing.
- Session docks: `position: sticky; bottom: 0` with safe-area padding; textareas in docks cap at about 40 % of the viewport height so they do not swallow the screen when the keyboard is open.

### 4.6 Per-area pass

After the generic rules, each area gets an audit for anything the rules did not cover (custom sliders, tables, fixed columns, hover-only affordances). Order: shell → Tổng quan, Tra từ, Từ vựng, Ôn tập → Hội thoại, Phỏng vấn → Đọc, Nghe, Quét từ, Kiến thức → Cài đặt. Fixes stay inside the phone `@media` block or the area's own phone rules so desktop is untouched.

## 5. Verification

- **Automated (Vitest):** `MobileTabBar` (items and hrefs from `navItems`, active state for nested routes, "Thêm" active for its seven areas, sheet open/close via button / backdrop / Escape / selection, focus return, hidden on `/interview/<id>` and `/conversation/<id>` but visible on `/interview`, `/conversation`, and their `/report` pages); `navItems` shared by `Sidebar` (existing Sidebar tests unchanged); font-size convention test (§4.4).
- **Headless Chrome (local, manual run documented in the plan):** Chrome is installed on the development machine. Against a local build, render the shell, tab bar and "Thêm" sheet and the signed-out states of each route at 414×896, save screenshots, and assert no horizontal overflow. Signed-in states cannot be reached by a headless browser (Google sign-in), so they are verified by CSS review against §4.5 and by feedback below.
- **On the real iPhone:** after deploying, the owner checks the areas on the iPhone 11 and sends screenshots of anything wrong; fixes iterate from those. This is the only verification of signed-in layouts and of Safari-specific behavior (focus zoom, safe areas, dynamic viewport).

## 6. Risks & Notes

- The `font-size` rewrite touches ~171 declarations in one pass; the convention test and an unchanged desktop computed size (scale 1) are the guard. Spot-check a handful of rules before/after.
- `100dvh` and `env(safe-area-inset-*)` are widely supported on current iOS; the fallbacks (`100vh`, no inset) degrade gracefully.
- Hiding the tab bar on live session pages means navigating away requires the page's own exit button or the browser back gesture; this is intentional.
- Emoji icons render per-OS; acceptable and consistent with the sidebar.

## 7. Deploy

Web only. Push → Firebase App Hosting auto-deploys. No Cloud Run or Functions change.
