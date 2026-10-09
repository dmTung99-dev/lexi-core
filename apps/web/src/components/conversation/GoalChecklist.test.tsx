import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalChecklist } from "./GoalChecklist";

describe("GoalChecklist", () => {
  it("marks done goals and shows progress", () => {
    render(<GoalChecklist persona="A waiter" goals={["Gọi đồ uống", "Gọi món", "Xin thanh toán", "Cảm ơn"]} goalsDone={[0]} />);
    expect(screen.getByText("Gọi đồ uống")).toHaveClass("cv-goal-done");
    expect(screen.getByText("Gọi món")).not.toHaveClass("cv-goal-done");
    expect(screen.getByText("1/4 hoàn thành")).toBeInTheDocument();
    expect(screen.getByText("A waiter")).toBeInTheDocument();
  });
});
