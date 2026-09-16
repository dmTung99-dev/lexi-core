# Reading Result: Select-to-Speak + Sentence Hover Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two enhancements to the web "Đọc & gõ" result screen's passage review block: (1) selecting text in the English passage shows a floating button that speaks the selection aloud via an uncached TTS call, (2) hovering a sentence in the English passage or the Vietnamese translation highlights the paired sentence in the other block.

**Architecture:** Both features live entirely inside `apps/web/src/components/reading/PassageReview.tsx` and two small new sibling files in the same directory — a selection-tracking hook (`useTextSelectionSpeak`) and a presentational button (`SelectionSpeakButton`) that calls the existing uncached `synthesizeSpeech` client (already used by Nghe chép/Nghe hiểu). The sentence-hover feature adds one piece of local state (`hoveredIndex`) to `PassageReview` and wraps the previously-flat Vietnamese translation into per-sentence `<span>`s matching the English side's existing per-sentence spans.

**Tech Stack:** Next.js/React (web app, `apps/web/`), Vitest + Testing Library (`@testing-library/react`), existing `synthesizeSpeech`/`toAudioDataUrl` client (`apps/web/src/lib/synthesizeSpeechClient.ts`).

**Spec:** `docs/superpowers/specs/2026-09-16-reading-result-selection-speak-sentence-hover-design.md`

## Global Constraints

- Web only — no Flutter changes in this plan (Flutter's result screen has no equivalent passage/translation block yet; out of scope per the spec).
- Select-to-speak applies **only** to the English passage text, never the Vietnamese translation and never the vocab list (which already has its own cached `PronunciationButton`).
- Select-to-speak audio is **never cached** — always a fresh `synthesizeSpeech` call, mirroring Nghe chép/Nghe hiểu's existing uncached usage. Do not route it through `getPronunciationUrl`/`PronunciationButton` (that's the cached word/sentence path and is a different feature).
- No voice picker for select-to-speak — call `synthesizeSpeech` with `language: "en"` only, no `voice`.
- Sentence hover is bidirectional through one shared `hoveredIndex` state — no separate "which side triggered it" logic.
- No touch/tap fallback for sentence hover — it's a pure `:hover` enhancement; nothing regresses when it doesn't activate.

---

### Task 1: Sentence hover sync in `PassageReview`

**Files:**
- Modify: `apps/web/src/components/reading/PassageReview.tsx`
- Modify: `apps/web/src/styles/bloom.css:1954-1959` (existing `.reading-review-translation` rule — add a new rule after it)
- Test: `apps/web/src/components/reading/PassageReview.test.tsx` (new file — `PassageReview` has no test file today)

**Interfaces:**
- Consumes: `BilingualSentence` type from `@/lib/readingPassage` (existing: `{ target: string; vietnamese: string; vocabWords: string[] }`), `highlightVocabWords` from the same module (existing, unchanged signature: `(text: string, vocabWords: string[]) => { text: string; highlighted: boolean }[]`).
- Produces: `PassageReview` component keeps its existing exported signature (`{ sentences: BilingualSentence[] }`) — no change to how `apps/web/src/app/(app)/reading/bilingual/page.tsx` calls it. Each rendered sentence `<span>` (both English and Vietnamese sides) carries `data-testid={"en-sentence-" + index}` / `data-testid={"vi-sentence-" + index}` for later tasks and tests to target.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/src/components/reading/PassageReview.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PassageReview } from "./PassageReview";

const sentences = [
  { target: "Hello there.", vietnamese: "Xin chào.", vocabWords: [] },
  { target: "Nice to meet you.", vietnamese: "Rất vui được gặp bạn.", vocabWords: [] },
];

describe("PassageReview", () => {
  it("renders nothing when there are no sentences", () => {
    const { container } = render(<PassageReview sentences={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the English passage and the Vietnamese translation", () => {
    render(<PassageReview sentences={sentences} />);
    expect(screen.getByText("Hello there.")).toBeInTheDocument();
    expect(screen.getByText("Xin chào.")).toBeInTheDocument();
  });

  it("highlights the paired sentence when hovering the English side", () => {
    render(<PassageReview sentences={sentences} />);
    const en = screen.getByTestId("en-sentence-0");
    const vi = screen.getByTestId("vi-sentence-0");

    expect(en).not.toHaveClass("reading-sentence-hover");
    expect(vi).not.toHaveClass("reading-sentence-hover");

    fireEvent.mouseEnter(en);
    expect(en).toHaveClass("reading-sentence-hover");
    expect(vi).toHaveClass("reading-sentence-hover");

    fireEvent.mouseLeave(en);
    expect(en).not.toHaveClass("reading-sentence-hover");
    expect(vi).not.toHaveClass("reading-sentence-hover");
  });

  it("highlights the paired sentence when hovering the Vietnamese side", () => {
    render(<PassageReview sentences={sentences} />);
    const en = screen.getByTestId("en-sentence-0");
    const vi = screen.getByTestId("vi-sentence-0");

    fireEvent.mouseEnter(vi);
    expect(en).toHaveClass("reading-sentence-hover");
    expect(vi).toHaveClass("reading-sentence-hover");
  });

  it("only highlights the hovered sentence's own pair, not other sentences", () => {
    render(<PassageReview sentences={sentences} />);
    const firstEn = screen.getByTestId("en-sentence-0");
    const secondEn = screen.getByTestId("en-sentence-1");

    fireEvent.mouseEnter(firstEn);
    expect(firstEn).toHaveClass("reading-sentence-hover");
    expect(secondEn).not.toHaveClass("reading-sentence-hover");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/reading/PassageReview.test.tsx`
Expected: FAIL — `getByTestId("en-sentence-0")` finds nothing (no `data-testid` on the current spans) and the hover tests fail with "Unable to find an element by: [data-testid=...]".

- [ ] **Step 3: Read the current file**

Read `apps/web/src/components/reading/PassageReview.tsx` (10 lines today — unchanged from when it was written) before editing, so the diff below applies cleanly.

- [ ] **Step 4: Rewrite `PassageReview.tsx` with hover state + per-sentence spans on both sides**

Replace the full contents of `apps/web/src/components/reading/PassageReview.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { highlightVocabWords, type BilingualSentence } from "@/lib/readingPassage";

interface PassageReviewProps {
  sentences: BilingualSentence[];
}

export function PassageReview({ sentences }: PassageReviewProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (sentences.length === 0) return null;

  return (
    <div className="reading-review">
      <p className="reading-passage reading-review-passage">
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            data-testid={`en-sentence-${sIdx}`}
            className={sIdx === hoveredIndex ? "reading-sentence-hover" : undefined}
            onMouseEnter={() => setHoveredIndex(sIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {highlightVocabWords(sentence.target, sentence.vocabWords).map((seg, segIdx) =>
              seg.highlighted ? (
                <mark className="reading-vocab-highlight" key={segIdx}>
                  {seg.text}
                </mark>
              ) : (
                <span key={segIdx}>{seg.text}</span>
              )
            )}{" "}
          </span>
        ))}
      </p>
      <p className="reading-review-translation">
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            data-testid={`vi-sentence-${sIdx}`}
            className={sIdx === hoveredIndex ? "reading-sentence-hover" : undefined}
            onMouseEnter={() => setHoveredIndex(sIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {sentence.vietnamese}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Add the CSS rule**

In `apps/web/src/styles/bloom.css`, find the existing block:

```css
.reading-review-translation {
  color: var(--ink-soft);
  font-size: 17px;
  font-style: italic;
  margin: 0;
}
```

Add immediately after it:

```css
.reading-sentence-hover {
  background: var(--surface-3);
  border-radius: 4px;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/reading/PassageReview.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 7: Run the full web test suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: PASS — in particular `src/app/(app)/reading/bilingual/page.test.tsx` must still pass unchanged (it asserts on visible sentence text, not on the exact span structure, so this should be unaffected).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/reading/PassageReview.tsx apps/web/src/components/reading/PassageReview.test.tsx apps/web/src/styles/bloom.css
git commit -m "feat(reading): hover a passage sentence to highlight its translation pair"
```

---

### Task 2: `useTextSelectionSpeak` hook

**Files:**
- Create: `apps/web/src/components/reading/useTextSelectionSpeak.ts`
- Test: `apps/web/src/components/reading/useTextSelectionSpeak.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — standalone, browser `Selection`/`Range` APIs only.
- Produces: `useTextSelectionSpeak<T extends HTMLElement>(containerRef: RefObject<T | null>): { text: string; rect: DOMRect } | null` — Task 4 calls this from `PassageReview` with a ref to the passage `<p>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/reading/useTextSelectionSpeak.test.ts`:

```ts
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { renderHook, fireEvent } from "@testing-library/react";
import { useTextSelectionSpeak } from "./useTextSelectionSpeak";

function setup(text: string) {
  const container = document.createElement("p");
  const textNode = document.createTextNode(text);
  container.appendChild(textNode);
  document.body.appendChild(container);
  const ref = createRef<HTMLParagraphElement>();
  (ref as { current: HTMLParagraphElement | null }).current = container;
  return { container, textNode, ref };
}

function selectText(node: Text, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

describe("useTextSelectionSpeak", () => {
  it("returns null before any selection is made", () => {
    const { ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));
    expect(result.current).toBeNull();
  });

  it("returns the selected text after a selection inside the container", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5); // "Hello"
    fireEvent.mouseUp(document);

    expect(result.current?.text).toBe("Hello");
  });

  it("returns null for a selection outside the container", () => {
    const { ref } = setup("Hello world");
    const outside = document.createElement("p");
    const outsideText = document.createTextNode("Somewhere else");
    outside.appendChild(outsideText);
    document.body.appendChild(outside);

    const { result } = renderHook(() => useTextSelectionSpeak(ref));
    selectText(outsideText, 0, 9);
    fireEvent.mouseUp(document);

    expect(result.current).toBeNull();
  });

  it("clears the selection once it collapses (e.g. a plain click elsewhere)", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5);
    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello");

    window.getSelection()!.removeAllRanges();
    fireEvent.mouseUp(document);

    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/reading/useTextSelectionSpeak.test.ts`
Expected: FAIL — `Cannot find module './useTextSelectionSpeak'`.

- [ ] **Step 3: Write the hook**

Create `apps/web/src/components/reading/useTextSelectionSpeak.ts`:

```ts
import { useEffect, useState, type RefObject } from "react";

export interface TextSelectionSpeak {
  text: string;
  rect: DOMRect;
}

/**
 * Tracks the current browser text selection, reporting it only while it's
 * both non-empty and fully inside `containerRef`'s element. A plain click
 * anywhere (which collapses any prior selection — the browser's own default
 * behavior) naturally clears the result on the next mouseup, so no separate
 * "dismiss on click elsewhere" handling is needed.
 */
export function useTextSelectionSpeak<T extends HTMLElement>(
  containerRef: RefObject<T | null>
): TextSelectionSpeak | null {
  const [selection, setSelection] = useState<TextSelectionSpeak | null>(null);

  useEffect(() => {
    function handleMouseUp() {
      const container = containerRef.current;
      const sel = window.getSelection();
      if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      setSelection(text ? { text, rect: range.getBoundingClientRect() } : null);
    }

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef]);

  return selection;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/reading/useTextSelectionSpeak.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reading/useTextSelectionSpeak.ts apps/web/src/components/reading/useTextSelectionSpeak.test.ts
git commit -m "feat(reading): add useTextSelectionSpeak hook for tracking passage text selection"
```

---

### Task 3: `SelectionSpeakButton` component

**Files:**
- Create: `apps/web/src/components/reading/SelectionSpeakButton.tsx`
- Test: `apps/web/src/components/reading/SelectionSpeakButton.test.tsx`

**Interfaces:**
- Consumes: `synthesizeSpeech`, `toAudioDataUrl` from `@/lib/synthesizeSpeechClient` (existing — `synthesizeSpeech(request: { text: string; language: "vi" | "en"; voice?: ... }): Promise<{ audioBase64: string }>`, `toAudioDataUrl(audioBase64: string): string`).
- Produces: `SelectionSpeakButton({ text: string; rect: DOMRect }): JSX.Element` — Task 4 renders this from `PassageReview` using the hook's output from Task 2.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/reading/SelectionSpeakButton.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SelectionSpeakButton } from "./SelectionSpeakButton";
import { synthesizeSpeech } from "@/lib/synthesizeSpeechClient";

vi.mock("@/lib/synthesizeSpeechClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/synthesizeSpeechClient")>(
    "@/lib/synthesizeSpeechClient"
  );
  return { ...actual, synthesizeSpeech: vi.fn() };
});

const rect = { top: 100, left: 50, width: 40, height: 20 } as DOMRect;

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

describe("SelectionSpeakButton", () => {
  it("calls synthesizeSpeech with the selected text (English, no voice) and plays the audio", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ audioBase64: "AAAA" });
    render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm: favorable/ }));

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(synthesizeSpeech).toHaveBeenCalledWith({ text: "favorable", language: "en" });
  });

  it("shows a loading state while the request is in flight", async () => {
    let resolvePromise!: (v: { audioBase64: string }) => void;
    vi.mocked(synthesizeSpeech).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm/ }));
    expect(await screen.findByText("…")).toBeInTheDocument();

    resolvePromise({ audioBase64: "AAAA" });
    await waitFor(() => expect(screen.queryByText("…")).toBeNull());
  });

  it("shows a warning icon after a failed request, and stays clickable to retry", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValueOnce(new Error("network"));
    render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm/ }));
    expect(await screen.findByText("⚠️")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nghe phát âm/ })).not.toBeDisabled();
  });

  it("resets to idle when the selected text prop changes", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValueOnce(new Error("network"));
    const { rerender } = render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm/ }));
    expect(await screen.findByText("⚠️")).toBeInTheDocument();

    rerender(<SelectionSpeakButton text="ongoing impasse" rect={rect} />);
    expect(screen.getByText("🔊")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/reading/SelectionSpeakButton.test.tsx`
Expected: FAIL — `Cannot find module './SelectionSpeakButton'`.

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/reading/SelectionSpeakButton.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { synthesizeSpeech, toAudioDataUrl } from "@/lib/synthesizeSpeechClient";

interface SelectionSpeakButtonProps {
  text: string;
  rect: DOMRect;
}

export function SelectionSpeakButton({ text, rect }: SelectionSpeakButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // A new selection (different text) starts from a clean idle state rather
  // than carrying over a previous selection's error/loading flag.
  useEffect(() => {
    setError(false);
    setLoading(false);
  }, [text]);

  async function handlePlay() {
    setError(false);
    setLoading(true);
    try {
      const { audioBase64 } = await synthesizeSpeech({ text, language: "en" });
      await new Audio(toAudioDataUrl(audioBase64)).play();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="pron-btn selection-speak-btn"
      style={{ top: rect.top, left: rect.left + rect.width / 2 }}
      onClick={() => void handlePlay()}
      disabled={loading}
      aria-label={`Nghe phát âm: ${text}`}
      title="Nghe phát âm"
    >
      {loading ? "…" : error ? "⚠️" : "🔊"}
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/reading/SelectionSpeakButton.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reading/SelectionSpeakButton.tsx apps/web/src/components/reading/SelectionSpeakButton.test.tsx
git commit -m "feat(reading): add SelectionSpeakButton for uncached ad-hoc pronunciation"
```

---

### Task 4: Wire select-to-speak into `PassageReview`

**Files:**
- Modify: `apps/web/src/components/reading/PassageReview.tsx`
- Modify: `apps/web/src/styles/bloom.css` (add `.selection-speak-btn`, near the `.reading-sentence-hover` rule added in Task 1)
- Modify: `apps/web/src/components/reading/PassageReview.test.tsx` (append integration tests)

**Interfaces:**
- Consumes: `useTextSelectionSpeak` from `./useTextSelectionSpeak` (Task 2), `SelectionSpeakButton` from `./SelectionSpeakButton` (Task 3).
- Produces: no new exports — this is the integration point where Tasks 1–3 come together inside the already-exported `PassageReview`.

- [ ] **Step 1: Write the failing integration tests**

Edit `apps/web/src/components/reading/PassageReview.test.tsx`. Replace its two existing top import lines:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
```

with:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { synthesizeSpeech } from "@/lib/synthesizeSpeechClient";
```

and add this `vi.mock` call right after the existing `import { PassageReview } from "./PassageReview";` line:

```tsx
vi.mock("@/lib/synthesizeSpeechClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/synthesizeSpeechClient")>(
    "@/lib/synthesizeSpeechClient"
  );
  return { ...actual, synthesizeSpeech: vi.fn() };
});
```

Then add this helper and `describe` block at the end of the file (after the existing `describe("PassageReview", ...)` block's closing `});`):

```tsx
function selectWithin(element: HTMLElement) {
  const textNode = element.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(document);
}

describe("PassageReview select-to-speak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  it("shows a speak button after selecting text in the English passage", () => {
    render(<PassageReview sentences={sentences} />);
    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();

    const enSegment = screen.getByText("Hello there.");
    selectWithin(enSegment);

    expect(screen.getByRole("button", { name: /Nghe phát âm: Hello there\./ })).toBeInTheDocument();
  });

  it("does not show a speak button for a selection in the Vietnamese translation", () => {
    render(<PassageReview sentences={sentences} />);
    const viSegment = screen.getByText("Xin chào.");
    selectWithin(viSegment);

    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();
  });

  it("speaks the selected English text when the button is clicked", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ audioBase64: "AAAA" });
    render(<PassageReview sentences={sentences} />);

    selectWithin(screen.getByText("Hello there."));
    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm: Hello there\./ }));

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(synthesizeSpeech).toHaveBeenCalledWith({ text: "Hello there.", language: "en" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/reading/PassageReview.test.tsx`
Expected: FAIL — the 3 new tests fail because no speak button is ever rendered yet (the 5 Task-1 tests still pass).

- [ ] **Step 3: Wire the hook and button into `PassageReview.tsx`**

Replace the full contents of `apps/web/src/components/reading/PassageReview.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { highlightVocabWords, type BilingualSentence } from "@/lib/readingPassage";
import { useTextSelectionSpeak } from "./useTextSelectionSpeak";
import { SelectionSpeakButton } from "./SelectionSpeakButton";

interface PassageReviewProps {
  sentences: BilingualSentence[];
}

export function PassageReview({ sentences }: PassageReviewProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const passageRef = useRef<HTMLParagraphElement>(null);
  const selection = useTextSelectionSpeak(passageRef);

  if (sentences.length === 0) return null;

  return (
    <div className="reading-review">
      <p className="reading-passage reading-review-passage" ref={passageRef}>
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            data-testid={`en-sentence-${sIdx}`}
            className={sIdx === hoveredIndex ? "reading-sentence-hover" : undefined}
            onMouseEnter={() => setHoveredIndex(sIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {highlightVocabWords(sentence.target, sentence.vocabWords).map((seg, segIdx) =>
              seg.highlighted ? (
                <mark className="reading-vocab-highlight" key={segIdx}>
                  {seg.text}
                </mark>
              ) : (
                <span key={segIdx}>{seg.text}</span>
              )
            )}{" "}
          </span>
        ))}
      </p>
      <p className="reading-review-translation">
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            data-testid={`vi-sentence-${sIdx}`}
            className={sIdx === hoveredIndex ? "reading-sentence-hover" : undefined}
            onMouseEnter={() => setHoveredIndex(sIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {sentence.vietnamese}{" "}
          </span>
        ))}
      </p>
      {selection && <SelectionSpeakButton text={selection.text} rect={selection.rect} />}
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS rule for the floating button's fixed positioning**

In `apps/web/src/styles/bloom.css`, find the `.reading-sentence-hover` rule added in Task 1:

```css
.reading-sentence-hover {
  background: var(--surface-3);
  border-radius: 4px;
}
```

Add immediately after it:

```css
.selection-speak-btn {
  position: fixed;
  z-index: 20;
  transform: translate(-50%, calc(-100% - 8px));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/reading/PassageReview.test.tsx`
Expected: PASS — all 8 tests green (5 from Task 1 + 3 new).

- [ ] **Step 6: Run the full web test suite and typecheck**

Run: `cd apps/web && npx vitest run`
Expected: PASS — no regressions, in particular `src/app/(app)/reading/bilingual/page.test.tsx`.

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/reading/PassageReview.tsx apps/web/src/components/reading/PassageReview.test.tsx apps/web/src/styles/bloom.css
git commit -m "feat(reading): select English passage text to hear it spoken (uncached)"
```

---

## Final verification (after all 4 tasks)

- [ ] Run `cd apps/web && npx vitest run` once more — full suite green.
- [ ] Run `cd apps/web && npx tsc --noEmit` once more — clean.
- [ ] Manually smoke-test in a browser (`npm run dev` in `apps/web/`, navigate to a completed "Đọc & gõ" session's result screen): select a word/phrase in the English passage, confirm the 🔊 button appears and plays audio; hover a sentence on either side, confirm both sides highlight together. This plan's automated tests cover behavior in jsdom, but jsdom never lays out real pixel positions (`getBoundingClientRect()` returns zeros there) — only a real browser confirms the floating button is positioned sensibly over the selection.
