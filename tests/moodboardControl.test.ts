import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import MoodboardControl from "@/components/Moodboard/MoodboardControl";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function mount() {
  return render(createElement(MoodboardControl));
}

describe("MoodboardControl compact row", () => {
  it("starts collapsed with a summary, AI action, and expand toggle", () => {
    mount();
    const region = screen.getByRole("region", { name: "Moodboard" });
    expect(region.getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByRole("textbox", { name: "Moodboard prompt" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    const summary = screen.getByRole("button", { name: /3×3/ });
    expect(summary.textContent).toContain("≈ $0.11");
    const run = screen.getByRole("button", { name: "AI ×9" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    const toggle = screen.getByRole("button", { name: "Expand Moodboard controls" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(region.textContent).not.toContain("Stock");
  });

  it("expands into a horizontal keyword, count, and cost row", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand Moodboard controls" }));

    const region = screen.getByRole("region", { name: "Moodboard" });
    expect(region.getAttribute("data-expanded")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Moodboard prompt" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /9/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /16/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /25/ })).toBeTruthy();
    expect(region.textContent).toContain("gpt-image-2.5-flare low");
    expect(region.textContent).toContain("≈ $0.11");

    fireEvent.click(screen.getByRole("radio", { name: /25/ }));
    expect(screen.getByRole("button", { name: "AI ×25" })).toBeTruthy();
    expect(region.textContent).toContain("≈ $0.30");
    expect(region.textContent).toContain("5×5");

    fireEvent.click(screen.getByRole("button", { name: "Collapse Moodboard controls" }));
    expect(region.getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByRole("textbox", { name: "Moodboard prompt" })).toBeNull();
    expect(screen.getByRole("button", { name: /5×5/ }).textContent).toContain("≈ $0.30");
  });

  it("remembers the last open state", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand Moodboard controls" }));
    expect(window.localStorage.getItem("artshift:moodboard:controls-expanded")).toBe("1");
    view.unmount();

    mount();
    expect(screen.getByRole("textbox", { name: "Moodboard prompt" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Moodboard controls" }));
    expect(window.localStorage.getItem("artshift:moodboard:controls-expanded")).toBe("0");
  });

  it("keeps the AI run available from the collapsed row once a keyword exists", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Prompt or keyword/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Moodboard prompt" }), {
      target: { value: "สาวไทย" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Collapse Moodboard controls" }));

    const summary = screen.getByRole("button", { name: /สาวไทย/ });
    expect(summary.textContent).toContain("3×3");
    expect(summary.textContent).toContain("≈ $0.11");
    const run = screen.getByRole("button", { name: "AI ×9" }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
  });
});
