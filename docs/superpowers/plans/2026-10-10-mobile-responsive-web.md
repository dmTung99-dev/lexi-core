# Mobile-responsive Web App (iPhone 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the React web app (`apps/web/`) comfortable on a phone (iPhone 11, Safari, 414×896 portrait): bottom tab navigation, safe-area handling, a phone type scale, and phone layout rules for all 11 areas, without changing the desktop appearance.

**Architecture:** One global stylesheet (`bloom.css`) gets a CSS-only "phone mode" (`@media (max-width: 820px)`). A new `MobileTabBar` component is always rendered next to the existing `Sidebar`; CSS shows one or the other. All `font-size` declarations are rewritten once to `calc(N * var(--type-scale))` so a single variable controls the phone type scale and the user's font-size setting. Navigation data is shared in one module.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest + Testing Library (jsdom), plain CSS. Dev tooling only: a Node script driving headless Chrome through the DevTools protocol (no new npm dependencies).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-10-mobile-responsive-web-design.md`.
- Web only, under `apps/web/` (plus docs). No Flutter, `functions/`, `services/`, Firestore, or **dependency** changes (no new entries in any `package.json`).
- Phone mode is exactly `@media (max-width: 820px)`. Desktop (> 820 px) must render **exactly** as today: new rules are either inside the phone media query or numerically neutral at `--type-scale: 1`.
- CSS-only switching between `Sidebar` and `MobileTabBar` (both rendered; no JS device detection).
- Phone type scale: device scale `0.9`; user font-size setting `fs-small` 0.9 / normal 1 / `fs-large` 1.15 multiplies the same variable on phones (the desktop `zoom` stays for desktop only). Nothing renders below 12 px on phones. Text inputs/textarea/select are exactly 16 px on phones (iOS focus-zoom guard, the only permitted `!important` for font-size).
- Every interactive control on phones is at least 44×44 CSS px.
- Tab bar: items Tổng quan (`/dashboard`), Tra từ (`/lookup`), Từ vựng (`/vocab-bank`), Ôn tập (`/practice`), Thêm (sheet with the other seven areas). Hidden on live session routes `^/(interview|conversation)/[^/]+$` only.
- UI copy is Vietnamese. Existing `Sidebar` behavior and its tests must keep passing unchanged (labels like "🏠 Tổng quan" remain the visible text).
- Next.js here is v16 with breaking changes: follow existing code patterns (`"use client"`, `usePathname` from `next/navigation`) rather than memory of older versions.
- Commands run from `apps/web/`: tests `npx vitest run <path>`, types `npm run typecheck`, full suite `npm test`.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage explicit paths only (never `git add -A`; `apps/web/next-env.d.ts` is routinely modified by `next dev`/`build` and must NOT be committed).

## File Structure

- `apps/web/src/components/shell/navItems.ts` (new) — shared navigation data + pure helpers.
- `apps/web/src/components/shell/navItems.test.ts` (new).
- `apps/web/src/components/shell/Sidebar.tsx` (modify) — consume `navItems`.
- `apps/web/src/components/shell/MobileTabBar.tsx` (new) + `MobileTabBar.test.tsx` (new).
- `apps/web/src/components/shell/AppShell.tsx` (modify) — render `MobileTabBar`.
- `apps/web/src/app/layout.tsx` (modify) — `viewport` export + `appleWebApp` metadata; `layout.test.tsx` extended.
- `apps/web/src/styles/bloom.css` (modify) — shell/tab-bar CSS, type-scale variables, converted `font-size`s, phone layer at the end.
- `apps/web/src/styles/bloom.fontSize.test.ts` (new) — convention test.
- `apps/web/scripts/mobile-audit.mjs` (new) — headless-Chrome audit tool (dev only).

---

### Task 1: Shared navigation data

**Files:**
- Create: `apps/web/src/components/shell/navItems.ts`
- Create: `apps/web/src/components/shell/navItems.test.ts`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`

**Interfaces:**
- Produces (exact):
  - `interface NavItem { href: string; icon: string; label: string; shortLabel?: string }`
  - `interface NavGroup { label: string | null; items: NavItem[] }`
  - `const NAV_GROUPS: NavGroup[]`
  - `const TAB_ITEMS: NavItem[]` (4 items, in tab order)
  - `const MORE_ITEMS: NavItem[]` (the other 7, in sidebar order)
  - `isActivePath(pathname: string, href: string): boolean`
  - `isMoreActive(pathname: string): boolean`
  - `hidesTabBar(pathname: string): boolean`

- [ ] **Step 0: Create the working branch**

Run (repo root `D:/Flutter/lexi-core`): `git checkout -b feat/mobile-responsive` (the controller normally does this before dispatch; if the branch already exists and is checked out, continue).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/shell/navItems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MORE_ITEMS, NAV_GROUPS, TAB_ITEMS, hidesTabBar, isActivePath, isMoreActive } from "./navItems";

describe("navItems", () => {
  it("keeps all 11 areas in the original sidebar order", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual([
      "/dashboard", "/lookup", "/vocab-bank", "/practice",
      "/reading", "/word-radar", "/knowledge", "/listening",
      "/interview", "/conversation", "/settings",
    ]);
  });

  it("has four tab items followed by seven 'more' items covering every area exactly once", () => {
    expect(TAB_ITEMS.map((i) => i.href)).toEqual(["/dashboard", "/lookup", "/vocab-bank", "/practice"]);
    expect(MORE_ITEMS.map((i) => i.href)).toEqual([
      "/reading", "/word-radar", "/knowledge", "/listening", "/interview", "/conversation", "/settings",
    ]);
    expect(TAB_ITEMS.length + MORE_ITEMS.length).toBe(11);
  });

  it("gives the long vocab-bank label a short tab label", () => {
    expect(TAB_ITEMS.find((i) => i.href === "/vocab-bank")?.shortLabel).toBe("Từ vựng");
  });

  it("matches a route and its nested routes, not look-alike prefixes", () => {
    expect(isActivePath("/interview", "/interview")).toBe(true);
    expect(isActivePath("/interview/abc/report", "/interview")).toBe(true);
    expect(isActivePath("/interviewing", "/interview")).toBe(false);
  });

  it("marks 'Thêm' active only for routes in the seven other areas", () => {
    expect(isMoreActive("/settings")).toBe(true);
    expect(isMoreActive("/reading/part5")).toBe(true);
    expect(isMoreActive("/lookup")).toBe(false);
    expect(isMoreActive("/dashboard")).toBe(false);
  });

  it("hides the tab bar only on live interview/conversation session pages", () => {
    expect(hidesTabBar("/interview/abc123")).toBe(true);
    expect(hidesTabBar("/conversation/abc123")).toBe(true);
    expect(hidesTabBar("/interview")).toBe(false);
    expect(hidesTabBar("/conversation")).toBe(false);
    expect(hidesTabBar("/interview/abc123/report")).toBe(false);
    expect(hidesTabBar("/conversation/abc123/report")).toBe(false);
    expect(hidesTabBar("/vocab-bank")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shell/navItems.test.ts`
Expected: FAIL (cannot resolve `./navItems`).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/shell/navItems.ts`:

```ts
export interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** Shorter label for the phone tab bar, when `label` is too long. */
  shortLabel?: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", icon: "🏠", label: "Tổng quan" },
      { href: "/lookup", icon: "🔍", label: "Tra từ" },
      { href: "/vocab-bank", icon: "📚", label: "Ngân hàng từ vựng", shortLabel: "Từ vựng" },
      { href: "/practice", icon: "🎯", label: "Ôn tập" },
    ],
  },
  { label: "Đọc", items: [{ href: "/reading", icon: "📖", label: "Đọc — tổng quan" }] },
  { label: "Quét từ", items: [{ href: "/word-radar", icon: "🛰️", label: "Quét từ vựng" }] },
  { label: "Kiến thức", items: [{ href: "/knowledge", icon: "📖", label: "Kiến thức" }] },
  { label: "Nghe", items: [{ href: "/listening", icon: "🎧", label: "Nghe — tổng quan" }] },
  { label: "Phỏng vấn", items: [{ href: "/interview", icon: "🎤", label: "Phỏng vấn tiếng Anh" }] },
  { label: "Hội thoại", items: [{ href: "/conversation", icon: "💬", label: "Hội thoại tiếng Anh" }] },
  { label: "Khác", items: [{ href: "/settings", icon: "⚙️", label: "Cài đặt" }] },
];

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const TAB_HREFS = ["/dashboard", "/lookup", "/vocab-bank", "/practice"];

export const TAB_ITEMS: NavItem[] = TAB_HREFS.map((href) => ALL_ITEMS.find((i) => i.href === href) as NavItem);
export const MORE_ITEMS: NavItem[] = ALL_ITEMS.filter((i) => !TAB_HREFS.includes(i.href));

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string): boolean {
  return MORE_ITEMS.some((i) => isActivePath(pathname, i.href));
}

/** Live session pages have their own sticky bottom dock, so they hide the phone tab bar. */
export function hidesTabBar(pathname: string): boolean {
  return /^\/(interview|conversation)\/[^/]+$/.test(pathname);
}
```

Replace the contents of `apps/web/src/components/shell/Sidebar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, isActivePath } from "./navItems";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="leaf" />
        LexiCore
      </div>
      <nav className="sidenav">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {group.label && <div className="grp-label">{group.label}</div>}
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={isActivePath(pathname, item.href) ? "active" : undefined}>
                {`${item.icon} ${item.label}`}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/shell` — Expected: PASS (navItems + the unchanged Sidebar and AppShell tests).
Run: `npm run typecheck` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/navItems.ts apps/web/src/components/shell/navItems.test.ts apps/web/src/components/shell/Sidebar.tsx
git commit -m "refactor(web): share navigation data between sidebar and the upcoming tab bar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Phone tab bar, "Thêm" sheet, shell wiring

**Files:**
- Create: `apps/web/src/components/shell/MobileTabBar.tsx`
- Create: `apps/web/src/components/shell/MobileTabBar.test.tsx`
- Modify: `apps/web/src/components/shell/AppShell.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append at the very end)

**Interfaces:**
- Consumes: `TAB_ITEMS`, `MORE_ITEMS`, `hidesTabBar`, `isActivePath`, `isMoreActive` from `./navItems`.
- Produces: `MobileTabBar()` (no props); CSS classes `.mtab`, `.mtab-item`, `.mtab-more`, `.mtab-icon`, `.mtab-label`, `.mtab-backdrop`, `.mtab-sheet`; CSS variable `--tabbar-h` (56px, phone mode).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/shell/MobileTabBar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileTabBar } from "./MobileTabBar";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

function at(pathname: string) {
  vi.mocked(usePathname).mockReturnValue(pathname);
}

beforeEach(() => at("/dashboard"));

describe("MobileTabBar", () => {
  it("renders the four tabs with their hrefs plus a Thêm button", () => {
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: "Tổng quan" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Tra từ" })).toHaveAttribute("href", "/lookup");
    expect(screen.getByRole("link", { name: "Từ vựng" })).toHaveAttribute("href", "/vocab-bank");
    expect(screen.getByRole("link", { name: "Ôn tập" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("button", { name: /Thêm/ })).toBeInTheDocument();
  });

  it("marks the current tab active, including nested routes", () => {
    at("/vocab-bank/whatever");
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: "Từ vựng" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Tra từ" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: /Thêm/ })).not.toHaveClass("active");
  });

  it("marks Thêm active when the route belongs to one of its seven areas", () => {
    at("/settings");
    render(<MobileTabBar />);
    expect(screen.getByRole("button", { name: /Thêm/ })).toHaveClass("active");
  });

  it("opens a dialog sheet listing the seven other areas", () => {
    render(<MobileTabBar />);
    const more = screen.getByRole("button", { name: /Thêm/ });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Các khu vực khác" });
    expect(dialog.querySelectorAll("a")).toHaveLength(7);
    expect(screen.getByRole("link", { name: /Hội thoại tiếng Anh/ })).toHaveAttribute("href", "/conversation");
    expect(screen.getByRole("link", { name: /Cài đặt/ })).toHaveAttribute("href", "/settings");
  });

  it("closes the sheet on backdrop tap and returns focus to Thêm", () => {
    render(<MobileTabBar />);
    const more = screen.getByRole("button", { name: /Thêm/ });
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId("mtab-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(more);
  });

  it("closes the sheet on Escape", () => {
    render(<MobileTabBar />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet when an item is chosen", () => {
    render(<MobileTabBar />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    fireEvent.click(screen.getByRole("link", { name: /Đọc — tổng quan/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet when the route changes", () => {
    const { rerender } = render(<MobileTabBar />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    at("/reading");
    rerender(<MobileTabBar />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders nothing on live interview and conversation session pages", () => {
    for (const p of ["/interview/abc123", "/conversation/abc123"]) {
      at(p);
      const { container, unmount } = render(<MobileTabBar />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("still renders on the setup and report pages of those areas", () => {
    for (const p of ["/interview", "/conversation", "/interview/abc123/report", "/conversation/abc123/report"]) {
      at(p);
      const { unmount } = render(<MobileTabBar />);
      expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shell/MobileTabBar.test.tsx`
Expected: FAIL (cannot resolve `./MobileTabBar`).

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/shell/MobileTabBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MORE_ITEMS, TAB_ITEMS, hidesTabBar, isActivePath, isMoreActive } from "./navItems";

/**
 * Phone navigation (visible only in phone mode via CSS; always rendered).
 * Four tabs plus "Thêm", which opens a bottom sheet with the remaining areas.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // A route change always closes the sheet (without stealing focus).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        moreRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidesTabBar(pathname)) return null;

  const closeToMore = () => {
    setOpen(false);
    moreRef.current?.focus();
  };
  const moreActive = open || isMoreActive(pathname);

  return (
    <>
      {open && <div className="mtab-backdrop" data-testid="mtab-backdrop" onClick={closeToMore} />}
      {open && (
        <div ref={sheetRef} className="mtab-sheet" role="dialog" aria-modal="true" aria-label="Các khu vực khác">
          <ul>
            {MORE_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={isActivePath(pathname, item.href) ? "active" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {`${item.icon} ${item.label}`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <nav className="mtab" aria-label="Điều hướng chính">
        {TAB_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActivePath(pathname, item.href) ? "mtab-item active" : "mtab-item"}
          >
            <span className="mtab-icon" aria-hidden="true">{item.icon}</span>
            <span className="mtab-label">{item.shortLabel ?? item.label}</span>
          </Link>
        ))}
        <button
          ref={moreRef}
          type="button"
          className={moreActive ? "mtab-more active" : "mtab-more"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="mtab-icon" aria-hidden="true">⋯</span>
          <span className="mtab-label">Thêm</span>
        </button>
      </nav>
    </>
  );
}
```

In `apps/web/src/components/shell/AppShell.tsx` add the import `import { MobileTabBar } from "./MobileTabBar";` and render it after `<main>`:

```tsx
    <div className={`app-frame${fontSizeClass}`}>
      <Sidebar />
      <main className="main">{children}</main>
      <MobileTabBar />
    </div>
```

- [ ] **Step 4: Append the shell CSS**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

/* ── Mobile shell (phone mode: ≤ 820px) ──────────────────
   Both Sidebar and MobileTabBar are always rendered; CSS picks one. */
.mtab,
.mtab-sheet,
.mtab-backdrop {
  display: none;
}

@media (max-width: 820px) {
  :root {
    --tabbar-h: 56px;
  }

  .sidebar {
    display: none;
  }

  .app-frame {
    min-height: 100vh;
    min-height: 100dvh;
  }

  .app-frame::before {
    display: none;
  }

  .mtab {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .mtab-item,
  .mtab-more {
    flex: 1;
    min-width: 0;
    min-height: var(--tabbar-h);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 2px;
    color: var(--ink-soft);
    background: none;
    border: 0;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  .mtab-item.active,
  .mtab-more.active {
    color: var(--accent);
  }

  .mtab-icon {
    font-size: 20px;
    line-height: 1;
  }

  .mtab-label {
    font-size: 11px;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .mtab-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(54, 42, 51, 0.45);
  }

  .mtab-sheet {
    display: block;
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
    z-index: 45;
    max-height: 70vh;
    max-height: 70dvh;
    overflow-y: auto;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -18px 40px -20px rgba(54, 42, 51, 0.35);
  }

  .mtab-sheet ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mtab-sheet a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 14px;
    border-radius: 14px;
    color: var(--ink);
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
  }

  .mtab-sheet a.active {
    background: var(--surface-2);
    color: var(--accent);
  }

  .main {
    padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 24px);
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/components/shell` — Expected: PASS (MobileTabBar, navItems, Sidebar, AppShell).
Run: `npm run typecheck` — Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shell/MobileTabBar.tsx apps/web/src/components/shell/MobileTabBar.test.tsx apps/web/src/components/shell/AppShell.tsx apps/web/src/styles/bloom.css
git commit -m "feat(web): phone bottom tab bar with a 'Thêm' sheet" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Viewport, safe areas, layout base

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/layout.test.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)

**Interfaces:**
- Produces: `export const viewport: Viewport` and `appleWebApp` in `metadata` from `app/layout.tsx`.

- [ ] **Step 1: Extend the layout test (failing first)**

In `apps/web/src/app/layout.test.tsx` change the import line to `import RootLayout, { metadata, viewport } from "./layout";` and add inside the `describe`:

```tsx
  it("exports a mobile viewport that covers the notch area", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
    expect(viewport.viewportFit).toBe("cover");
  });

  it("declares a web-app-capable iOS Home Screen launch", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "LexiCore" });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/layout.test.tsx`
Expected: FAIL (`viewport` is undefined / `metadata.appleWebApp` missing).

- [ ] **Step 3: Implement**

Replace `apps/web/src/app/layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import type { Viewport } from "next";
import "@/styles/bloom.css";

export const metadata = {
  title: "LexiCore",
  description: "Personal Vietnamese-first language-learning app",
  appleWebApp: { capable: true, title: "LexiCore", statusBarStyle: "default" as const },
};

// viewport-fit=cover lets the layout extend under the iPhone notch/home
// indicator; bloom.css pads with env(safe-area-inset-*) accordingly.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#241923" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Append the base CSS**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

/* ── Phone base layout (≤ 820px) ─────────────────────────── */
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

@media (max-width: 820px) {
  .main {
    padding-top: calc(16px + env(safe-area-inset-top));
    padding-left: calc(16px + env(safe-area-inset-left));
    padding-right: calc(16px + env(safe-area-inset-right));
    /* bottom padding is set by the tab bar rules above */
  }

  .iv-dock {
    padding-bottom: calc(18px + env(safe-area-inset-bottom));
  }
}
```

(Both `.main` rules live inside phone media queries and merge: the earlier block sets `padding-bottom`, this one the other three sides.)

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/app/layout.test.tsx` — Expected: PASS.
Run: `npm run typecheck` — Expected: no errors (if `Viewport`'s `themeColor` array form is rejected by the installed Next types, adapt to the accepted shape and report it).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/layout.test.tsx apps/web/src/styles/bloom.css
git commit -m "feat(web): mobile viewport, safe-area padding and iOS web-app metadata" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Phone type scale

**Files:**
- Modify: `apps/web/src/styles/bloom.css` (mechanical rewrite of every `font-size`, plus new variable rules)
- Create: `apps/web/src/styles/bloom.fontSize.test.ts`
- Scratch (not committed): `<scratchpad>/scale-font-sizes.mjs`

**Interfaces:**
- Produces: CSS variables `--device-type-scale`, `--user-type-scale`, `--type-scale`; convention that every `font-size` in `bloom.css` is `calc(N<unit> * var(--type-scale))` (or `max(12px, calc(...))` for originals under 13.5 px, or a relative `em`/`%`/`inherit`, or the single iOS guard `16px !important`).

- [ ] **Step 1: Write the convention test (it fails until the rewrite is done)**

Create `apps/web/src/styles/bloom.fontSize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(import.meta.dirname, "bloom.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const SCALED = /^(?:max\(12px, )?calc\([0-9.]+(?:px|rem) \* var\(--type-scale\)\)\)?$/;
const RELATIVE = /^(?:[0-9.]+(?:em|%)|inherit)$/;
const IOS_GUARD = "16px !important";

describe("bloom.css font-size convention", () => {
  const values = [...css.matchAll(/font-size:\s*([^;}]+?)\s*[;}]/g)].map((m) => m[1]);

  it("finds the font-size declarations", () => {
    expect(values.length).toBeGreaterThan(100);
  });

  it("scales every font-size with --type-scale (or is relative / the single iOS input guard)", () => {
    const offenders = values.filter((v) => !(SCALED.test(v) || RELATIVE.test(v) || v === IOS_GUARD));
    expect(offenders).toEqual([]);
  });

  it("uses the iOS 16px guard exactly once", () => {
    expect(values.filter((v) => v === IOS_GUARD)).toHaveLength(1);
  });

  it("defines the scale variables, with the phone device scale at 0.9", () => {
    expect(css).toMatch(/--device-type-scale:\s*1/);
    expect(css).toMatch(/--device-type-scale:\s*0\.9/);
    expect(css).toMatch(/--user-type-scale:\s*0\.9/);
    expect(css).toMatch(/--user-type-scale:\s*1\.15/);
  });
});
```

Run: `npx vitest run src/styles/bloom.fontSize.test.ts` — Expected: FAIL (declarations are still plain px; variables missing).

- [ ] **Step 2: Write and run the one-off rewrite script**

Write this script to the scratchpad directory (NOT inside the repo) as `scale-font-sizes.mjs`:

```js
// Usage: node scale-font-sizes.mjs <path-to-bloom.css>
// Rewrites `font-size: Npx|Nrem;` into the --type-scale form. Idempotent.
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const original = readFileSync(file, "utf8");
let converted = 0;

const rewritten = original.replace(
  /font-size:\s*([0-9]*\.?[0-9]+)(px|rem)(\s*!important)?\s*;/g,
  (_m, num, unit, imp) => {
    const px = unit === "rem" ? Number(num) * 16 : Number(num);
    const body = `calc(${num}${unit} * var(--type-scale))`;
    converted += 1;
    return `font-size: ${px < 13.5 ? `max(12px, ${body})` : body}${imp ? " !important" : ""};`;
  }
);

writeFileSync(file, rewritten);
const leftovers = [...rewritten.matchAll(/font-size:\s*([^;}]+?)\s*[;}]/g)]
  .map((m) => m[1])
  .filter((v) => !/calc\(/.test(v));
console.log(`converted ${converted} declarations`);
console.log(`left unchanged (review these): ${JSON.stringify([...new Set(leftovers)])}`);
const shorthand = [...rewritten.matchAll(/^\s*font:\s*[^;]*\d(?:px|rem)[^;]*;/gm)].map((m) => m[0].trim());
console.log(`font: shorthands containing a size (handle manually): ${JSON.stringify(shorthand)}`);
```

Run from `apps/web/`: `node <scratchpad>/scale-font-sizes.mjs src/styles/bloom.css`
Expected: prints the converted count (about 170) and a list of leftovers. For each leftover and each `font:` shorthand with a size, decide: relative units (`em`, `%`, `inherit`) stay as is (the convention test allows them); a shorthand with a px/rem size must be split into `font-size` (converted) plus the other properties, preserving the rendered result.

- [ ] **Step 3: Verify desktop is numerically unchanged**

Reverse the rewrite on a temp copy and diff it with the pre-change file from git:

```bash
git show HEAD:apps/web/src/styles/bloom.css > <scratchpad>/bloom.before.css
node -e "const fs=require('fs');let c=fs.readFileSync('src/styles/bloom.css','utf8');c=c.replace(/font-size:\s*max\(12px, calc\(([0-9.]+(?:px|rem)) \* var\(--type-scale\)\)\)/g,'font-size: \$1').replace(/font-size:\s*calc\(([0-9.]+(?:px|rem)) \* var\(--type-scale\)\)/g,'font-size: \$1');fs.writeFileSync(process.argv[1],c)" <scratchpad>/bloom.reversed.css
```

then compare only the font-size declarations of the two files in order (extract with a regex, e.g. `grep -o 'font-size: [^;]*' | sed 's/ !important//'`) — the sequences up to the point where Tasks 2–3 appended new rules must be identical, and the new rules' converted values must equal their written sizes. Report the result (identical / differences). (The reversal shows `calc(N * 1)` equals `N`; this is the proof the desktop render is unchanged.)

- [ ] **Step 4: Add the scale variables and the phone rules**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

/* ── Type scale ───────────────────────────────────────────
   Every font-size is calc(N * var(--type-scale)). Desktop: 1.
   Phone (≤ 820px): device scale 0.9 × the user's font-size setting.
   The desktop `zoom` for .fs-small/.fs-large stays for desktop only. */
:root {
  --device-type-scale: 1;
  --user-type-scale: 1;
  --type-scale: 1;
}

.app-frame {
  --type-scale: calc(var(--device-type-scale) * var(--user-type-scale));
}

@media (max-width: 820px) {
  :root {
    --device-type-scale: 0.9;
    --type-scale: 0.9;
  }

  .app-frame.fs-small {
    zoom: 1;
    --user-type-scale: 0.9;
  }

  .app-frame.fs-large {
    zoom: 1;
    --user-type-scale: 1.15;
  }

  /* iOS Safari zooms the whole page when a focused field's font-size is
     below 16px. This is the only font-size !important in the stylesheet. */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),
  textarea,
  select {
    font-size: 16px !important;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/styles/bloom.fontSize.test.ts` — Expected: PASS.
Run: `npm run typecheck` and the full `npm test` — Expected: all pass (no test depends on CSS values).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/bloom.css apps/web/src/styles/bloom.fontSize.test.ts
git commit -m "feat(web): phone type scale via --type-scale, with an iOS input guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Audit tooling and generic phone layout rules

**Files:**
- Create: `apps/web/scripts/mobile-audit.mjs`
- Modify: `.gitignore` (repo root; add `apps/web/audit-out/`)
- Modify: `apps/web/src/styles/bloom.css` (append)

**Interfaces:**
- Produces: `node --experimental-websocket scripts/mobile-audit.mjs` (run from `apps/web/`, needs a dev server on `AUDIT_BASE_URL`, default `http://localhost:3000`); writes PNG screenshots and `report.json` to `apps/web/audit-out/`, prints a table, exits 1 if any route has horizontal overflow or an input below 16 px.

- [ ] **Step 1: Write the audit script**

Create `apps/web/scripts/mobile-audit.mjs`:

```js
// Dev-only: renders routes in headless Chrome at iPhone 11 size through the
// DevTools protocol (no npm dependencies; needs Node >= 20.10 with
// --experimental-websocket, or Node >= 22) and reports horizontal overflow,
// too-small inputs and too-small tap targets. Signed-out states only.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.env.AUDIT_OUT_DIR ?? "audit-out");
const PORT = Number(process.env.AUDIT_DEBUG_PORT ?? 9333);
const WIDTH = Number(process.env.AUDIT_WIDTH ?? 414);
const HEIGHT = Number(process.env.AUDIT_HEIGHT ?? 896);
const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);

const ROUTES = (process.env.AUDIT_ROUTES?.split(",") ?? [
  "/dashboard", "/lookup", "/vocab-bank", "/practice",
  "/reading", "/reading/bilingual", "/reading/part5", "/reading/part6", "/reading/part7",
  "/word-radar", "/knowledge", "/knowledge/new", "/listening", "/listening/dictation",
  "/listening/comprehension", "/interview", "/conversation", "/settings",
]).map((r) => r.trim());

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (["auto", "scroll", "hidden", "clip"].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  const smallInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select')]
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const smallTargets = [...document.querySelectorAll("button,a[href],input,select,textarea")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44); }).length;
  return { vw, scrollWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > vw, offenders: offenders.slice(0, 12), smallInputs, smallTargets };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome not up yet */
    }
    await sleep(500);
  }
  throw new Error("Chrome DevTools target did not appear");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((r) => {
            const i = ++id;
            pending.set(i, r);
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
        close: () => ws.close(),
      });
  });
}

async function evaluate(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return res.result?.result?.value;
}

async function load(cdp, route) {
  await cdp.send("Page.navigate", { url: BASE + route });
  for (let i = 0; i < 120; i++) {
    if ((await evaluate(cdp, "document.readyState")) === "complete") break;
    await sleep(500);
  }
  await sleep(2500); // let client components render
}

async function shot(cdp, name) {
  const { result } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(result.data, "base64"));
}

if (!CHROME) throw new Error("No Chrome/Edge found; set CHROME_PATH");
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), "mobile-audit-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-gpu", "about:blank",
], { stdio: "ignore" });

const results = [];
try {
  const cdp = await connect(await waitForTarget());
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  for (const route of ROUTES) {
    await load(cdp, route);
    const m = await evaluate(cdp, MEASURE);
    const slug = route.replace(/^\//, "").replace(/\//g, "_") || "root";
    await shot(cdp, slug);
    results.push({ route, ...m });
  }

  // The "Thêm" sheet.
  await load(cdp, "/dashboard");
  await evaluate(cdp, `document.querySelector(".mtab-more")?.click()`);
  await sleep(500);
  await shot(cdp, "more-sheet");
  cdp.close();
} finally {
  chrome.kill();
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
let failed = false;
for (const r of results) {
  const bad = r.overflowX || r.smallInputs > 0;
  failed ||= bad;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${r.route.padEnd(28)} scrollW=${r.scrollWidth}/${r.vw} smallInputs=${r.smallInputs} smallTargets=${r.smallTargets}` +
      (r.offenders.length ? `\n      offenders: ${JSON.stringify(r.offenders.slice(0, 5))}` : "")
  );
}
console.log(`screenshots + report.json in ${OUT}`);
process.exit(failed ? 1 : 0);
```

Add to the repo-root `.gitignore` a line: `apps/web/audit-out/`.

- [ ] **Step 2: Run the baseline audit (before the layout rules)**

In one shell start the dev server: `npm run dev` (from `apps/web/`, background; it reads `.env.local`). Wait until it responds on `http://localhost:3000`.
Then run: `node --experimental-websocket scripts/mobile-audit.mjs` (from `apps/web/`).
Expected: the script completes and prints one line per route plus the "Thêm" screenshot; at this point (shell + type scale done, generic rules not yet) some routes may FAIL on overflow. Save the console output into the task report as the BEFORE baseline. If a route 404s or the dev server cannot reach Firebase, note it and continue (those routes just show their signed-out/empty state).

- [ ] **Step 3: Append the generic phone layout rules**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

/* ── Phone layout rules (≤ 820px) ────────────────────────────
   Last in the file so they win at equal specificity. Desktop is untouched. */
@media (max-width: 820px) {
  /* Two-column layouts stack; side columns go below the main column. */
  .iv-setup-layout,
  .iv-session-body,
  .vb-shell {
    flex-direction: column;
  }

  .iv-setup-main {
    width: 100%;
  }

  .iv-setup-side,
  .iv-session-side {
    width: 100%;
  }

  .reading-result-row,
  .knowledge-detail-columns,
  .settings-page,
  .mc-question-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Fixed widths relax. */
  .iv-score-total {
    width: 100%;
  }

  .iv-score-criteria,
  .iv-grow,
  .cv-input {
    min-width: 0;
  }

  /* Grids shrink. */
  .iv-type-grid,
  .iv-voice-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .iv-improve-grid,
  .iv-criteria-grid,
  .iv-feedback-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Vocab bank: the detail drawer becomes a bottom sheet above the tab bar. */
  .vb-list-wrap {
    max-height: none;
  }

  .vb-drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
    width: auto;
    max-height: 75vh;
    max-height: 75dvh;
    overflow-y: auto;
    z-index: 45;
    border-left: 0;
    border-top: 1px solid var(--border);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -18px 40px -20px rgba(54, 42, 51, 0.35);
  }

  .vb-drawer-inner {
    width: 100%;
  }

  /* Popovers stay inside the screen. */
  .vb-topic-popover {
    width: min(320px, calc(100vw - 32px));
  }

  .word-popover {
    width: min(220px, calc(100vw - 32px));
  }

  /* Modals become bottom sheets. */
  .modal-backdrop {
    align-items: flex-end;
  }

  .modal {
    width: 100%;
    max-width: 100%;
    max-height: 90vh;
    max-height: 90dvh;
    border-radius: 20px 20px 0 0;
  }

  /* Touch targets. */
  .btn-primary,
  .btn-secondary,
  .vb-chip,
  .vb-page-btn,
  .iv-icon-btn,
  .iv-phrase,
  .cv-chip-btn,
  .cv-tab,
  .cv-pick {
    min-height: 44px;
  }

  /* Long words wrap inside cards and bubbles. */
  .cv-bubble,
  .vrow .word,
  .vrow .meaning,
  .knowledge-card,
  .reading-hub-card {
    overflow-wrap: anywhere;
  }

  /* A tall composer must not swallow the screen when the keyboard is open. */
  .cv-input {
    max-height: 40vh;
    max-height: 40dvh;
  }
}
```

- [ ] **Step 4: Re-run the audit and the tests**

Run: `node --experimental-websocket scripts/mobile-audit.mjs` — record the AFTER output in the task report. Goal: no `FAIL` lines. For every remaining FAIL, read its `offenders` (class + coordinates), find the CSS rule in `bloom.css`, and add the narrowest phone-only fix to the same media block; re-run until clean or document why a route cannot be made clean.
Open a few screenshots from `audit-out/` (at least `dashboard.png`, `more-sheet.png`, `vocab-bank.png`) with the Read tool and describe what you see (tab bar visible, content not clipped, text legible).
Run: `npm run typecheck` and the full `npm test` — Expected: pass. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/mobile-audit.mjs .gitignore apps/web/src/styles/bloom.css
git commit -m "feat(web): phone layout rules and a headless mobile audit script" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Per-area pass A — Tổng quan, Tra từ, Từ vựng, Ôn tập

**Files:**
- Modify: `apps/web/src/styles/bloom.css` (phone rules for these areas, inside `@media (max-width: 820px)`; append at the end of the file)
- Modify (only if CSS cannot fix it): components under `apps/web/src/components/{shared,vocab-bank,practice}/`, `apps/web/src/app/(app)/{dashboard,lookup,vocab-bank,practice}/page.tsx`, with tests kept green.

**What to review** (read the components and their CSS; classes in `bloom.css`): `.dash-*` (stat grid, 7-column weekly chart `.dash-chart`, CEFR rows `.dash-cefr-row`), `.lookup-*`, `.suggestion-*`/`.suggestions-*`, `.related-*`, `.vb-*` and `.vrow` (search bar, toolbar chips, list rows, topic popover, pagination, the drawer sheet from Task 5), `.vb-chip-clear`, `.practice-*`, `.fc-*` (flashcards), `.mc-*`, `.pe-*`, `.cloze-*` where used by practice, `.pron-*`.

- [ ] **Step 1: Baseline** — start `npm run dev`; run `AUDIT_ROUTES=/dashboard,/lookup,/vocab-bank,/practice node --experimental-websocket scripts/mobile-audit.mjs`; read the four screenshots; list every visual problem (clipped text, overlapping controls, tiny targets, unreadable chart labels, popovers off-screen).
- [ ] **Step 2: Review signed-in layouts by reading code** — for each class above find fixed `width`/`min-width`, multi-column `grid`/`flex` layouts, hover-only affordances, absolute-positioned popovers, and tables; decide the narrowest phone fix (stack, `min-width: 0`, `overflow-x: auto` inside the container, `max-width: 100%`, bigger tap target, wrap).
- [ ] **Step 3: Implement** the fixes as phone-only CSS (append a clearly commented `/* ── Phone: dashboard, lookup, vocab bank, practice ── */` block inside `@media (max-width: 820px) { ... }` at the end of `bloom.css`). Keep desktop numerically unchanged.
- [ ] **Step 4: Verify** — re-run the audit for these routes (no FAIL), view the screenshots again, run `npm run typecheck` and the full `npm test`.
- [ ] **Step 5: Report** — in the task report list: problems found, fixes made (selector → change), and a "needs real-device check" list of signed-in states you could not render (e.g. vocab drawer open, practice cards).
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/bloom.css
git commit -m "feat(web): phone layout for dashboard, lookup, vocab bank and practice" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Stage any component files you had to change too, by explicit path.)

---

### Task 7: Per-area pass B — Hội thoại and Phỏng vấn

**Files:**
- Modify: `apps/web/src/styles/bloom.css` (append a phone block inside `@media (max-width: 820px)`)
- Modify only if needed: `apps/web/src/components/{conversation,interview}/*`, `apps/web/src/app/(app)/{conversation,interview}/**/page.tsx` (keep their tests green)

**What to review:** `.iv-*` (setup layout, form rows `.iv-form-row`, `.iv-type-grid`, `.iv-voice-grid`, docs grid, session `.iv-session*`, thread/bubbles `.iv-bubble*`, dock `.iv-dock*`, mic button, report `.iv-score*`, `.iv-qr*`, `.iv-diff`), `.cv-*` (tabs, picks, preview, thread, bubbles, hints, composer `.cv-input-row`, suggest panel, goals, wrap-up, report), `ReadinessCard`, `RecentSessions`/`RecentConversations`, `CvUpload`.

Specific points to verify on a phone (the session pages hide the tab bar, so the dock sits at the very bottom):
- The sticky dock/composer stays above the iOS home indicator (`env(safe-area-inset-bottom)` already applied in Task 3) and does not exceed about half the viewport with the keyboard open (`.cv-input` capped in Task 5).
- Buttons in the composer row (`+ Nói thêm`, mic, `Gửi`) wrap onto a second line instead of overflowing; mic button ≥ 44 px.
- The role-play goal checklist (`.iv-session-side`) sits below the thread on phones and does not push the composer off-screen (consider making it a collapsed `<details>`-like block only if a CSS-only solution is impossible; otherwise leave it stacked).
- Report pages: score cards, criteria bars and correction diffs wrap; "Nghe lại giọng tôi" buttons are tappable.

- [ ] **Step 1: Baseline** — dev server up; `AUDIT_ROUTES=/interview,/conversation node --experimental-websocket scripts/mobile-audit.mjs`; read the screenshots.
- [ ] **Step 2: Review by reading** the CSS and components above for the points listed; list problems.
- [ ] **Step 3: Implement** the phone fixes (commented block `/* ── Phone: conversation + interview ── */` inside the media query at the end of `bloom.css`).
- [ ] **Step 4: Verify** — audit again (no FAIL for the two routes), view screenshots, `npm run typecheck`, full `npm test`.
- [ ] **Step 5: Report** problems/fixes and a "needs real-device check" list (session page with keyboard open, role-play checklist, report pages).
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/bloom.css
git commit -m "feat(web): phone layout for conversation and interview" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Per-area pass C — Đọc, Nghe, Quét từ, Kiến thức

**Files:**
- Modify: `apps/web/src/styles/bloom.css` (append a phone block inside `@media (max-width: 820px)`)
- Modify only if needed: `apps/web/src/components/{reading,listening,knowledge}/*`, their `app/(app)/**/page.tsx`

**What to review:** `.reading-*` (hub cards, passage block, result row/stats, review, `.reading-result-row` already stacks), `.mc-*`/`.mc-question-*`, `.word-*`, `.known-*`, `.word-popover`, `.selection-*` (text-selection speak button), `.translation-*`, `.bold-text`, `.dictation-*`, `.cloze-*`, `.diff-*`, listening seek sliders and audio controls, `.knowledge-*` (card grids, detail columns, compose/new forms `.compose-*`, group grid), `.suggestion*` used by Quét từ.

Specific points:
- Text-selection features (selection speak button, word popovers) rely on hover/selection: make sure the popover/button positions stay inside the viewport and tap targets are ≥ 44 px; if a hover-only affordance cannot work on touch, add a tap equivalent only when a small CSS/markup change suffices, otherwise list it under "needs follow-up".
- Reading passages: comfortable line length and padding at 16 px side margins; long headwords wrap.
- Range sliders (listening seek) full width with a tall enough touch area.

- [ ] **Step 1: Baseline** — `AUDIT_ROUTES=/reading,/reading/bilingual,/reading/part5,/reading/part6,/reading/part7,/word-radar,/knowledge,/knowledge/new,/listening,/listening/dictation,/listening/comprehension node --experimental-websocket scripts/mobile-audit.mjs`; read the screenshots.
- [ ] **Step 2: Review by reading** the CSS/components above; list problems.
- [ ] **Step 3: Implement** phone-only fixes (commented block `/* ── Phone: reading, listening, word radar, knowledge ── */` inside the media query at the end of `bloom.css`).
- [ ] **Step 4: Verify** — audit again (no FAIL), view screenshots, `npm run typecheck`, full `npm test`.
- [ ] **Step 5: Report** problems/fixes, plus a "needs real-device check" list.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/bloom.css
git commit -m "feat(web): phone layout for reading, listening, word radar and knowledge" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Per-area pass D — Cài đặt, full sweep, docs, final verification

**Files:**
- Modify: `apps/web/src/styles/bloom.css` (phone block for settings; final fixes from the sweep)
- Modify: `CLAUDE.md` (repo root): add a short "Mobile web (phone mode)" bullet list
- Modify: `README.md`: one line under the web app section
- Modify only if needed: `apps/web/src/components/settings/*`

**What to review:** `.settings-*` (cards, appearance font-size picker, AI provider section with `ModelPicker`/dropdown, language section, danger zone, account), and every `SimpleDropdown`/select-like popover for overflow off-screen.

- [ ] **Step 1: Settings pass** — same procedure as Tasks 6–8 for `/settings` (baseline audit, read code, phone-only fixes in a commented block, re-audit).
- [ ] **Step 2: Full sweep** — with the dev server up run the complete audit: `node --experimental-websocket scripts/mobile-audit.mjs` (all routes + the "Thêm" sheet). Expected: exit code 0, no FAIL lines. Fix any residual overflow with the narrowest phone-only rule. Also run it once at `AUDIT_WIDTH=375` (iPhone SE-size) to catch tight spots, and fix cheaply fixable ones.
- [ ] **Step 3: Desktop regression check** — run the audit once at `AUDIT_WIDTH=1280` (it should show the sidebar layout; check `dashboard.png` and `vocab-bank.png` visually against expectations: sidebar visible, no tab bar) and confirm via the Task 4 reversal check (re-run the font-size reversal comparison) that desktop font-size values are unchanged.
- [ ] **Step 4: Docs** — add to repo-root `CLAUDE.md` (a new short section after "Theme (Flutter)" or under the web notes): "Mobile web: phone mode is `@media (max-width: 820px)` in `apps/web/src/styles/bloom.css`; navigation data lives in `apps/web/src/components/shell/navItems.ts`; every `font-size` must be `calc(N * var(--type-scale))` (enforced by `bloom.fontSize.test.ts`); inputs stay 16 px on phones; live interview/conversation session pages hide the tab bar; audit with `node --experimental-websocket apps/web/scripts/mobile-audit.mjs` against `npm run dev`." Add one README line describing the phone layout.
- [ ] **Step 5: Final verification** — `npm run typecheck`, full `npm test` (report totals), `npm run build` (must succeed; revert any `apps/web/next-env.d.ts` change, do not commit it). List remaining "needs real-device check" items from all area reports in your report.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/bloom.css CLAUDE.md README.md
git commit -m "feat(web): phone layout for settings, full audit sweep and docs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Stage any settings component files you changed, by explicit path.)

---

## Self-Review

**Spec coverage:** §4.1 mode switch (Tasks 2, 5) · §4.2 navigation, shared data, tab bar, sheet, hidden on live sessions (Tasks 1, 2) · §4.3 viewport/safe areas/dvh/base padding/text-size-adjust (Tasks 2, 3) · §4.4 type scale incl. floor, user scale, zoom disabled on phone, iOS guard, convention test (Task 4) · §4.5 generic phone rules (Task 5) · §4.6 per-area pass in the specified order (Tasks 6–9) · §5 verification: Vitest for tab bar/navItems/convention (Tasks 1, 2, 4), headless Chrome script (Task 5, used in 6–9), real-device feedback (listed per task) · §6 risks (desktop-unchanged proof in Task 4 step 3 and Task 9 step 3) · §7 deploy: none beyond push (done by the controller after the final review).

**Placeholders:** Tasks 6–9 are audit-and-fix tasks; their steps are concrete procedures with exact commands, a defined list of selectors to review, prescribed fix patterns, and a measurable acceptance (audit exits 0, no FAIL lines); unavoidable discovery is bounded by the audit tool added in Task 5.

**Type/name consistency:** `NAV_GROUPS`, `TAB_ITEMS`, `MORE_ITEMS`, `isActivePath`, `isMoreActive`, `hidesTabBar` defined in Task 1 and used in Task 2; classes `.mtab*` and `--tabbar-h` defined in Task 2 and used by Task 5 (`.vb-drawer` offset) and Task 3 (`.main`); `--type-scale`, `--device-type-scale`, `--user-type-scale` defined in Task 4 only.
