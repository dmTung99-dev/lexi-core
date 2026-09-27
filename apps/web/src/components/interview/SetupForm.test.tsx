import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETUP_DRAFT, SetupForm } from "./SetupForm";

describe("SetupForm", () => {
  it("edits every field through onChange", () => {
    const onChange = vi.fn();
    render(<SetupForm value={DEFAULT_SETUP_DRAFT} onChange={onChange} onPreviewVoice={vi.fn()} cvSlot={<div>CV</div>} />);

    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "Data Analyst" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, role: "Data Analyst" });

    fireEvent.click(screen.getByRole("button", { name: "Senior" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, level: "senior" });

    fireEvent.click(screen.getByRole("button", { name: /Technical/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, type: "technical" });

    fireEvent.click(screen.getByRole("button", { name: "10 câu" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, questionCount: 10 });

    fireEvent.click(screen.getByRole("button", { name: /Nữ 2/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, voice: "female2" });

    fireEvent.change(screen.getByLabelText(/Mô tả công việc/), { target: { value: "JD" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, jd: "JD" });

    fireEvent.click(screen.getByLabelText("Xem lại bản chép lời trước khi gửi"));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, reviewTranscript: false });

    expect(screen.getByText("CV")).toBeInTheDocument();
  });

  it("marks the selected options and previews a voice", () => {
    const onPreviewVoice = vi.fn();
    render(<SetupForm value={DEFAULT_SETUP_DRAFT} onChange={vi.fn()} onPreviewVoice={onPreviewVoice} cvSlot={null} />);
    expect(screen.getByRole("button", { name: "Junior" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Nghe thử giọng" })[3]);
    expect(onPreviewVoice).toHaveBeenCalledWith("female2");
  });
});
