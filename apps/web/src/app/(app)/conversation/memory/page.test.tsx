import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MemoryPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  deleteTopicFact,
  deleteTopicMemory,
  deleteTrackedMistake,
  getMistakeMemory,
  listTopicMemories,
  getPrepCoverage,
  deleteCoveredItem,
  listPrepSceneMemories,
} from "@/lib/learnerMemory";
import type { TrackedMistake, TopicMemory } from "@/lib/learnerMemoryTypes";

vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/learnerMemory", () => ({
  getMistakeMemory: vi.fn(),
  listTopicMemories: vi.fn(),
  deleteTrackedMistake: vi.fn(),
  deleteTopicFact: vi.fn(),
  deleteTopicMemory: vi.fn(),
  getPrepCoverage: vi.fn(),
  deleteCoveredItem: vi.fn(),
  listPrepSceneMemories: vi.fn(),
}));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

function mistake(over: Partial<TrackedMistake>): TrackedMistake {
  return {
    id: "m1",
    pattern: "Thiếu mạo từ",
    rule: "Danh từ đếm được số ít cần a/the.",
    example: { said: "I have car", better: "I have a car" },
    source: "conversation",
    createdAt: "2026-11-01T00:00:00.000Z",
    lastSeenAt: "2026-11-01T00:00:00.000Z",
    sm2Repetitions: 0,
    sm2EaseFactor: 2.5,
    sm2Interval: 0,
    nextReviewAt: "2026-11-12T12:00:00.000Z",
    ...over,
  };
}

const MISTAKES = [
  mistake({}),
  mistake({ id: "m2", pattern: "Sai thì quá khứ", rule: "Dùng V2 cho việc đã xảy ra.", example: { said: "I go", better: "I went" }, sm2Repetitions: 3 }),
];
const TOPICS: TopicMemory[] = [
  {
    key: "topic_travel",
    label: "Du lịch",
    updatedAt: "2026-11-02T00:00:00.000Z",
    facts: [
      { id: "f1", fact: "Đã đi Đà Lạt", asked: ["đi với ai", "ăn gì"], updatedAt: "2026-11-02T00:00:00.000Z" },
      { id: "f2", fact: "Thích biển", asked: [], updatedAt: "2026-11-02T00:00:00.000Z" },
    ],
  },
];

const COVERAGE = {
  patterns: [{ text: "I'd like to walk you through ___", lastSeenAt: "2026-11-05T00:00:00.000Z" }],
  words: [{ text: "behind schedule", lastSeenAt: "2026-11-05T00:00:00.000Z" }],
  updatedAt: "2026-11-05T00:00:00.000Z",
};
const SCENES: TopicMemory[] = [
  {
    key: "prep_p1",
    label: "Báo cáo trễ tiến độ",
    updatedAt: "2026-11-05T00:00:00.000Z",
    facts: [{ id: "s1", fact: "Told the client the task is 3 days late", asked: ["cause"], updatedAt: "2026-11-05T00:00:00.000Z" }],
  },
];

function load(mistakes = MISTAKES, topics = TOPICS, coverage = COVERAGE, scenes = SCENES) {
  vi.mocked(getMistakeMemory).mockResolvedValue({ items: mistakes, updatedAt: "x" });
  vi.mocked(listTopicMemories).mockResolvedValue(topics);
  vi.mocked(getPrepCoverage).mockResolvedValue(coverage);
  vi.mocked(listPrepSceneMemories).mockResolvedValue(scenes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(deleteTrackedMistake).mockResolvedValue();
  vi.mocked(deleteTopicFact).mockResolvedValue();
  vi.mocked(deleteTopicMemory).mockResolvedValue();
  load();
});

describe("MemoryPage", () => {
  it("asks signed-out users to sign in", () => {
    vi.mocked(useAuthUser).mockReturnValue({ user: null, loading: false } as never);
    render(<MemoryPage />);
    expect(screen.getByRole("button", { name: "Đăng nhập với Google" })).toBeInTheDocument();
  });

  it("lists mistakes with rule, example, status chip and review date", async () => {
    render(<MemoryPage />);
    const section = await screen.findByRole("region", { name: "Lỗi hay mắc" });
    expect(screen.getByRole("heading", { name: "AI nhớ gì về bạn" })).toBeInTheDocument();
    expect(within(section).getByText("Thiếu mạo từ")).toBeInTheDocument();
    expect(within(section).getByText("Danh từ đếm được số ít cần a/the.")).toBeInTheDocument();
    expect(within(section).getByText("I have car → I have a car")).toBeInTheDocument();
    expect(within(section).getByText("Đang luyện")).toBeInTheDocument();
    expect(within(section).getByText("Đã quen")).toBeInTheDocument();
    expect(within(section).getAllByText("Nhắc lại: 12/11").length).toBe(2);
  });

  it("lists topic groups with facts and asked angles", async () => {
    render(<MemoryPage />);
    const section = await screen.findByRole("region", { name: "Nội dung đã kể" });
    expect(within(section).getByText("Du lịch")).toBeInTheDocument();
    expect(within(section).getByText("Đã đi Đà Lạt")).toBeInTheDocument();
    expect(within(section).getByText("AI đã hỏi: đi với ai, ăn gì")).toBeInTheDocument();
    expect(within(section).getByText("Thích biển")).toBeInTheDocument();
  });

  it("deletes a mistake only after confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MemoryPage />);
    await screen.findByText("Thiếu mạo từ");
    const btn = screen.getByRole("button", { name: "Xoá lỗi Thiếu mạo từ" });
    fireEvent.click(btn);
    expect(deleteTrackedMistake).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(deleteTrackedMistake).toHaveBeenCalledWith("u1", "m1"));
    await waitFor(() => expect(screen.queryByText("Thiếu mạo từ")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("deletes a fact only after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MemoryPage />);
    await screen.findByText("Đã đi Đà Lạt");
    const btn = screen.getByRole("button", { name: "Xoá: Đã đi Đà Lạt" });
    fireEvent.click(btn);
    expect(deleteTopicFact).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(deleteTopicFact).toHaveBeenCalledWith("u1", "topic_travel", "f1"));
    await waitFor(() => expect(screen.queryByText("Đã đi Đà Lạt")).not.toBeInTheDocument());
    expect(screen.getByText("Thích biển")).toBeInTheDocument();
  });

  it("deletes a whole group only after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MemoryPage />);
    await screen.findByText("Du lịch");
    const btn = screen.getByRole("button", { name: "Xoá cả nhóm Du lịch" });
    fireEvent.click(btn);
    expect(deleteTopicMemory).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(deleteTopicMemory).toHaveBeenCalledWith("u1", "topic_travel"));
    await waitFor(() => expect(screen.queryByText("Du lịch")).not.toBeInTheDocument());
  });

  it("shows the empty state only when every store is empty", async () => {
    load([], [], { patterns: [], words: [], updatedAt: "" }, []);
    render(<MemoryPage />);
    expect(await screen.findByText(/Chưa có gì ở đây/)).toBeInTheDocument();
  });

  it("shows what Chuẩn bị kits taught and the kit role-play memory with a link to the kit", async () => {
    load();
    render(<MemoryPage />);
    const taught = await screen.findByRole("region", { name: "Chuẩn bị tình huống — đã học" });
    expect(within(taught).getByText("I'd like to walk you through ___")).toBeInTheDocument();
    expect(within(taught).getByText("behind schedule")).toBeInTheDocument();
    const scenes = screen.getByRole("region", { name: "Chuẩn bị tình huống — diễn biến nhập vai" });
    expect(within(scenes).getByText("Told the client the task is 3 days late")).toBeInTheDocument();
    expect(within(scenes).getByRole("link", { name: "Báo cáo trễ tiến độ" })).toHaveAttribute("href", "/conversation/prep/p1");
  });

  it("deletes a taught word after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteCoveredItem).mockResolvedValueOnce();
    load();
    render(<MemoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá: behind schedule" }));
    await waitFor(() => expect(screen.queryByText("behind schedule")).not.toBeInTheDocument());
    expect(deleteCoveredItem).toHaveBeenCalledWith("u1", "words", "behind schedule");
  });

  it("deletes a kit scene fact", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteTopicFact).mockResolvedValueOnce();
    load();
    render(<MemoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá: Told the client the task is 3 days late" }));
    await waitFor(() => expect(deleteTopicFact).toHaveBeenCalledWith("u1", "prep_p1", "s1"));
  });

  it("shows an error line when loading fails", async () => {
    vi.mocked(getMistakeMemory).mockRejectedValue(new Error("boom"));
    render(<MemoryPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được bộ nhớ");
  });

  it("still shows the other sections when one read fails", async () => {
    vi.mocked(listPrepSceneMemories).mockRejectedValue(new Error("boom"));
    render(<MemoryPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được bộ nhớ");
    expect(await screen.findByText("Thiếu mạo từ")).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có gì ở đây/)).not.toBeInTheDocument();
  });

  it("shows an error line when a delete fails and keeps the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteTrackedMistake).mockRejectedValue(new Error("x"));
    render(<MemoryPage />);
    await screen.findByText("Thiếu mạo từ");
    fireEvent.click(screen.getByRole("button", { name: "Xoá lỗi Thiếu mạo từ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không xoá được");
    expect(screen.getByText("Thiếu mạo từ")).toBeInTheDocument();
  });
});
