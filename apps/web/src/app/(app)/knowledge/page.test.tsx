import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
  getKnowledgeNotes,
  restoreStarters,
  seedStartersIfNeeded,
  upsertKnowledgeNote,
} from "@/lib/knowledgeNotes";
import { startersFor } from "@/lib/knowledgeStarters";
import { getVocabRecords } from "@/lib/vocabRecords";
import { noteFixture, renderKnowledgePage } from "@/components/knowledge/testUtils";
import KnowledgePage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/knowledgeNotes", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/knowledgeNotes")>("@/lib/knowledgeNotes");
  return {
    ...actual,
    getKnowledgeNotes: vi.fn(),
    seedStartersIfNeeded: vi.fn(),
    restoreStarters: vi.fn(),
    upsertKnowledgeNote: vi.fn(),
  };
});
vi.mock("@/lib/knowledgeStarters", () => ({ startersFor: vi.fn(() => []) }));
vi.mock("@/lib/vocabRecords", () => ({ getVocabRecords: vi.fn() }));
vi.mock("@/components/SignInButton", () => ({
  SignInButton: () => <button>Đăng nhập với Google</button>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(seedStartersIfNeeded).mockResolvedValue([]);
  vi.mocked(restoreStarters).mockResolvedValue([]);
  vi.mocked(startersFor).mockReturnValue([]);
  vi.mocked(getVocabRecords).mockResolvedValue([]);
  vi.mocked(upsertKnowledgeNote).mockResolvedValue(undefined);
});

describe("KnowledgePage", () => {
  it("shows a group grid with counts", async () => {
    renderKnowledgePage(<KnowledgePage />, {
      notes: [
        noteFixture({ id: "n1", groupId: "en_tenses", title: "Thì hiện tại đơn" }),
        noteFixture({ id: "n2", groupId: "en_tenses", title: "Thì hiện tại hoàn thành" }),
        noteFixture({ id: "n3", groupId: "en_conditionals", title: "Câu điều kiện loại 2" }),
      ],
    });

    expect(await screen.findByText("Thì")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("typing in search switches to a filtered flat list", async () => {
    renderKnowledgePage(<KnowledgePage />, {
      notes: [
        noteFixture({ id: "n1", groupId: "en_tenses", title: "Thì hiện tại đơn" }),
        noteFixture({ id: "n3", groupId: "en_conditionals", title: "Câu điều kiện loại 2" }),
      ],
    });

    fireEvent.change(await screen.findByPlaceholderText(/Tìm/), {
      target: { value: "dieu kien" },
    });

    expect(await screen.findByText("Câu điều kiện loại 2")).toBeInTheDocument();
    expect(screen.queryByText("Thì hiện tại đơn")).toBeNull();
  });

  it("Khôi phục ghi chú mẫu calls restoreStarters", async () => {
    renderKnowledgePage(<KnowledgePage />, {
      notes: [noteFixture({ id: "n1", groupId: "en_tenses", title: "Thì hiện tại đơn" })],
    });

    fireEvent.click(await screen.findByRole("button", { name: /Khôi phục/ }));

    await waitFor(() => expect(restoreStarters).toHaveBeenCalled());
    expect(getKnowledgeNotes).toHaveBeenCalledWith("u1", "english");
  });

  it("'+ Nhờ AI soạn' links to the compose page", async () => {
    renderKnowledgePage(<KnowledgePage />, {
      notes: [noteFixture({ id: "n1", groupId: "en_tenses", title: "Thì hiện tại đơn" })],
    });

    expect(await screen.findByRole("link", { name: "+ Nhờ AI soạn" })).toHaveAttribute(
      "href",
      "/knowledge/compose",
    );
  });

  it("empty-state 'Nhờ AI soạn' links to the compose page", async () => {
    renderKnowledgePage(<KnowledgePage />, { notes: [] });

    expect(await screen.findByRole("link", { name: "Nhờ AI soạn" })).toHaveAttribute(
      "href",
      "/knowledge/compose",
    );
  });

  it("caps the tag bar and opens a modal with the rest on '+N'", async () => {
    // 10 distinct tags across notes — exceeds the 8-tag cap, so 2 must be
    // tucked behind the "+2" trigger instead of rendering unbounded.
    const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
    renderKnowledgePage(<KnowledgePage />, {
      notes: tags.map((tag, i) => noteFixture({ id: `n${i}`, tags: [tag] })),
    });

    await screen.findByText("tag-0");
    for (let i = 0; i < 8; i++) {
      expect(screen.getByText(`tag-${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText("tag-8")).toBeNull();
    expect(screen.queryByText("tag-9")).toBeNull();

    fireEvent.click(screen.getByText("+2"));

    expect(screen.getByRole("dialog", { name: "Lọc theo thẻ" })).toBeInTheDocument();
    expect(screen.getByText("tag-8")).toBeInTheDocument();
    expect(screen.getByText("tag-9")).toBeInTheDocument();
  });

  it("selecting a hidden tag from the modal filters the list", async () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
    renderKnowledgePage(<KnowledgePage />, {
      notes: tags.map((tag, i) => noteFixture({ id: `n${i}`, title: `Note ${i}`, tags: [tag] })),
    });

    await screen.findByText("tag-0");
    fireEvent.click(screen.getByText("+2"));
    fireEvent.click(screen.getByText("tag-9"));

    expect(await screen.findByText("Note 9")).toBeInTheDocument();
    expect(screen.queryByText("Note 0")).toBeNull();
  });

  it("'Xoá lọc' on the home tag bar clears the tag selection", async () => {
    renderKnowledgePage(<KnowledgePage />, {
      notes: [
        noteFixture({ id: "n1", title: "Note 1", tags: ["toeic"] }),
        noteFixture({ id: "n2", title: "Note 2" }),
      ],
    });

    fireEvent.click(await screen.findByText("toeic"));
    expect(await screen.findByText("Note 1")).toBeInTheDocument();
    expect(screen.queryByText("Note 2")).toBeNull();

    fireEvent.click(screen.getByText("✕ Xoá lọc"));

    // Clearing the only active filter drops back to the group grid (no
    // query, no tags = not list mode) rather than a flat note list.
    await waitFor(() => expect(screen.queryByText("✕ Xoá lọc")).toBeNull());
    expect(screen.getByText("toeic")).not.toHaveClass("active");
  });

  it("'Bỏ chọn hết' inside the tag modal clears the selection without closing it", async () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
    renderKnowledgePage(<KnowledgePage />, {
      notes: tags.map((tag, i) => noteFixture({ id: `n${i}`, title: `Note ${i}`, tags: [tag] })),
    });

    await screen.findByText("tag-0");
    fireEvent.click(screen.getByText("+2"));
    fireEvent.click(screen.getByText("tag-9"));
    expect(await screen.findByText("Note 9")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Bỏ chọn hết"));

    // Modal stays open (unlike the outer "✕ Xoá lọc", this is a bulk-clear
    // inside an already-open picker, not a dismiss action) even though
    // clearing the selection drops the page back out of list mode.
    expect(screen.getByRole("dialog", { name: "Lọc theo thẻ" })).toBeInTheDocument();
    expect(screen.queryByText("Bỏ chọn hết")).toBeNull();
  });
});
