import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CvUpload } from "./CvUpload";
import { extractCvText } from "@/lib/cvExtract";
import { callInterviewAi } from "@/lib/interviewAi";
import { deleteCvProfile, saveCvProfile } from "@/lib/cvProfile";
import { DEFAULT_SETTINGS } from "@/lib/settings";

vi.mock("@/lib/cvExtract", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cvExtract")>("@/lib/cvExtract");
  return { ...actual, extractCvText: vi.fn() };
});
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn() }));
vi.mock("@/lib/cvProfile", () => ({ saveCvProfile: vi.fn(), deleteCvProfile: vi.fn() }));

const SUMMARY_JSON = JSON.stringify({ summary: "React dev", topics: ["2 năm React", "VNPay"] });
const PROFILE = { fileName: "cv.pdf", text: "t", summary: "s", topics: ["2 năm React", "VNPay"], updatedAt: "x" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callInterviewAi).mockResolvedValue(SUMMARY_JSON);
  vi.mocked(saveCvProfile).mockResolvedValue(undefined);
  vi.mocked(deleteCvProfile).mockResolvedValue(undefined);
});

function upload(name = "cv.pdf") {
  fireEvent.change(screen.getByTestId("cv-file-input"), {
    target: { files: [new File(["x"], name)] },
  });
}

describe("CvUpload", () => {
  it("extracts, summarizes, saves and reports the new profile", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: true, text: "CV TEXT" });
    const onChange = vi.fn();
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={onChange} />);
    expect(screen.getByText(/Kéo thả CV vào đây/)).toBeInTheDocument();
    upload();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = vi.mocked(saveCvProfile).mock.calls[0][1];
    expect(saved).toMatchObject({ fileName: "cv.pdf", text: "CV TEXT", summary: "React dev", topics: ["2 năm React", "VNPay"] });
    expect(onChange).toHaveBeenCalledWith(saved);
  });

  it("offers DOCX and paste fallbacks when the PDF has no text", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: false, reason: "no_text" });
    const onChange = vi.fn();
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={onChange} />);
    upload("scan.pdf");
    expect(await screen.findByText(/có thể là bản scan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải bản DOCX" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dán nội dung CV" }));
    fireEvent.change(screen.getByLabelText("Nội dung CV"), { target: { value: "word ".repeat(80) } });
    fireEvent.click(screen.getByRole("button", { name: "Dùng nội dung này" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(vi.mocked(saveCvProfile).mock.calls[0][1].fileName).toBe("Nội dung dán");
  });

  it("rejects pasted text that is too short", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: false, reason: "no_text" });
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={vi.fn()} />);
    upload("scan.pdf");
    fireEvent.click(await screen.findByRole("button", { name: "Dán nội dung CV" }));
    fireEvent.change(screen.getByLabelText("Nội dung CV"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Dùng nội dung này" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("quá ngắn");
    expect(callInterviewAi).not.toHaveBeenCalled();
  });

  it("shows an error for unsupported files", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: false, reason: "unsupported" });
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={vi.fn()} />);
    upload("cv.png");
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF hoặc DOCX");
  });

  it("shows a saved profile with topics and can remove it", async () => {
    const onChange = vi.fn();
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={PROFILE} onChange={onChange} />);
    expect(screen.getByText("cv.pdf")).toBeInTheDocument();
    expect(screen.getByText("VNPay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gỡ CV" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(deleteCvProfile).toHaveBeenCalledWith("u1");
  });
});
