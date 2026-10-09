import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ConversationSetupForm,
  DEFAULT_CONVERSATION_DRAFT,
  draftToSetup,
  isDraftReady,
  type ConversationDraft,
} from "./ConversationSetupForm";

function setup(value: ConversationDraft = DEFAULT_CONVERSATION_DRAFT) {
  const onChange = vi.fn();
  const onBuildScenario = vi.fn();
  render(
    <ConversationSetupForm
      value={value}
      onChange={onChange}
      onPreviewVoice={vi.fn()}
      onBuildScenario={onBuildScenario}
      building={false}
      buildError={null}
    />
  );
  return { onChange, onBuildScenario };
}

describe("draft helpers", () => {
  it("topic mode is ready with a topic; role-play also needs persona and a goal", () => {
    expect(isDraftReady(DEFAULT_CONVERSATION_DRAFT)).toBe(false);
    expect(isDraftReady({ ...DEFAULT_CONVERSATION_DRAFT, topic: "Travel" })).toBe(true);
    const rp = { ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay" as const, topic: "Cafe" };
    expect(isDraftReady(rp)).toBe(false);
    expect(isDraftReady({ ...rp, persona: "A barista", goals: ["Gọi cà phê"] })).toBe(true);
  });
  it("draftToSetup trims, and clears persona/goals in topic mode", () => {
    const s = draftToSetup({ ...DEFAULT_CONVERSATION_DRAFT, topic: " Travel ", persona: "x", goals: ["a"] });
    expect(s).toMatchObject({ mode: "topic", topic: "Travel", persona: null, goals: [] });
    const r = draftToSetup({ ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay", topic: "Cafe", persona: " Barista ", goals: [" a ", " "] });
    expect(r).toMatchObject({ persona: "Barista", goals: ["a"] });
  });
});

describe("ConversationSetupForm", () => {
  it("switches mode", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tình huống nhập vai" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "roleplay", topic: "", presetId: null }));
  });

  it("picking a topic card fills the topic", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Du lịch/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presetId: "travel", topic: "Travel and memorable trips" }));
  });

  it("typing a custom topic clears the selected card", () => {
    const { onChange } = setup({ ...DEFAULT_CONVERSATION_DRAFT, presetId: "travel", topic: "Travel and memorable trips" });
    fireEvent.change(screen.getByLabelText("Hoặc tự nhập chủ đề của bạn"), { target: { value: "Football" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presetId: null, topic: "Football" }));
  });

  it("picking a role-play preset fills persona and goals, and shows the editable preview", () => {
    const { onChange } = setup({ ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay" });
    fireEvent.click(screen.getByRole("button", { name: /Gọi món ở nhà hàng/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: "restaurant", persona: expect.stringContaining("waiter"), goals: expect.arrayContaining(["Gọi đồ uống"]) })
    );
  });

  it("custom role-play: describe, then build the scenario", () => {
    const { onBuildScenario } = setup({ ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay", presetId: "custom", topic: "Renting a flat" });
    fireEvent.click(screen.getByRole("button", { name: "Dựng tình huống" }));
    expect(onBuildScenario).toHaveBeenCalled();
  });

  it("edits a goal in the preview", () => {
    const { onChange } = setup({
      ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay", presetId: "restaurant", topic: "Gọi món ở nhà hàng",
      persona: "A waiter", goals: ["Gọi đồ uống", "Xin thanh toán"],
    });
    fireEvent.change(screen.getByLabelText("Mục tiêu 2"), { target: { value: "Trả tiền" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ goals: ["Gọi đồ uống", "Trả tiền"] }));
  });

  it("toggles level and the two switches", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "B2" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ level: "B2" }));
    fireEvent.click(screen.getByLabelText("AI đọc to câu trả lời"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ speakAloud: false }));
    fireEvent.click(screen.getByLabelText("Xem lại bản chép lời trước khi gửi"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ reviewTranscript: false }));
  });
});
