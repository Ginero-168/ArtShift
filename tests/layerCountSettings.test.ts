import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerCountSettings } from "@/components/Canvas/PropertiesPanel/LayerCountSettings";

afterEach(() => {
  cleanup();
});

function renderSettings(onRun = vi.fn()) {
  render(createElement(LayerCountSettings, { busy: false, onRun }));
  return onRun;
}

describe("Layer count settings", () => {
  it("starts at 4 layers and runs that count when the user does not edit it", () => {
    const onRun = renderSettings();
    const input = screen.getByLabelText("Number of layers") as HTMLInputElement;
    expect(input.value).toBe("4");
    expect(screen.getByText(/2–8 layers/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run Layer" }));
    expect(onRun).toHaveBeenCalledWith(4);
  });

  it("steps within 2–8 and stops at the bounds", () => {
    renderSettings();
    const input = screen.getByLabelText("Number of layers") as HTMLInputElement;
    const decrease = screen.getByRole("button", {
      name: "Decrease layer count",
    }) as HTMLButtonElement;
    const increase = screen.getByRole("button", {
      name: "Increase layer count",
    }) as HTMLButtonElement;

    fireEvent.click(increase);
    expect(input.value).toBe("5");
    fireEvent.change(input, { target: { value: "8" } });
    expect(increase.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "2" } });
    expect(decrease.disabled).toBe(true);
  });

  it("rejects non-integers and clamps out-of-range counts with an in-UI message", () => {
    const onRun = renderSettings();
    const input = screen.getByLabelText("Number of layers") as HTMLInputElement;
    const run = () => screen.getByRole("button", { name: "Run Layer" }) as HTMLButtonElement;

    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.getByRole("alert").textContent).toMatch(/whole number from 2 to 8/);
    expect(run().disabled).toBe(true);
    fireEvent.click(run());
    expect(onRun).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "12" } });
    expect(screen.getByRole("alert").textContent).toMatch(/accepts 2–8 layers/);
    expect(run().disabled).toBe(true);

    fireEvent.blur(input);
    expect(input.value).toBe("8");
    expect(screen.getByRole("alert").textContent).toMatch(/Adjusted to 8/);
    fireEvent.click(run());
    expect(onRun).toHaveBeenCalledWith(8);
  });
});
