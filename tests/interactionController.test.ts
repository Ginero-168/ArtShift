import { describe, expect, it } from "vitest";
import { createInteractionController, type PreviewPatch } from "@/lib/engine/interactionController";

function scheduler() {
  let callback: (() => void) | null = null;
  let nextId = 0;
  return {
    frame: {
      request(next: () => void) {
        callback = next;
        nextId += 1;
        return nextId;
      },
      cancel() {
        callback = null;
      },
    },
    run() {
      const next = callback;
      callback = null;
      next?.();
    },
  };
}

const patch = (x: number): PreviewPatch[] => [{ id: "object-1", patch: { x } }];

describe("editor interaction controller", () => {
  it("coalesces pointer updates and applies only the latest patch per frame", () => {
    const host = scheduler();
    const applied: PreviewPatch[][] = [];
    const controller = createInteractionController((next) => applied.push(next), host.frame);

    controller.preview(patch(10));
    controller.preview(patch(20));
    expect(applied).toEqual([]);

    host.run();
    expect(applied).toEqual([patch(20)]);
  });

  it("flushes a pending update immediately and cancels the scheduled frame", () => {
    const host = scheduler();
    const applied: PreviewPatch[][] = [];
    const controller = createInteractionController((next) => applied.push(next), host.frame);

    controller.preview(patch(30));
    controller.flush();
    host.run();

    expect(applied).toEqual([patch(30)]);
  });

  it("cancels pending work without applying it", () => {
    const host = scheduler();
    const applied: PreviewPatch[][] = [];
    const controller = createInteractionController((next) => applied.push(next), host.frame);

    controller.preview(patch(40));
    controller.cancel();
    host.run();

    expect(applied).toEqual([]);
  });
});
