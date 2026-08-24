export type PointerGestureInput = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  isPan: boolean;
};

export type PointerGestureAction =
  | { kind: "ignore" }
  | { kind: "forward" }
  | { kind: "panStart"; x: number; y: number; tx: number; ty: number; pointerId: number }
  | { kind: "panMove"; tx: number; ty: number }
  | { kind: "panEnd"; pointerId: number };

type PanState = Extract<PointerGestureAction, { kind: "panStart" }>;

/**
 * Small, framework-free seam for the Canvas viewport gesture lifecycle.
 * React owns rendering and DOM capture; this module owns the pan-vs-content
 * routing state so CanvasRoot does not also become a gesture state machine.
 */
export function createPointerGestureRouter() {
  let pan: PanState | null = null;

  return {
    pointerDown(
      input: PointerGestureInput,
      view: { tx: number; ty: number },
    ): PointerGestureAction {
      if (input.isPan) {
        pan = {
          kind: "panStart",
          x: input.clientX,
          y: input.clientY,
          tx: view.tx,
          ty: view.ty,
          pointerId: input.pointerId,
        };
        return pan;
      }
      return input.button === 0 ? { kind: "forward" } : { kind: "ignore" };
    },

    pointerMove(input: Pick<PointerGestureInput, "clientX" | "clientY">): PointerGestureAction {
      if (!pan) return { kind: "forward" };
      return {
        kind: "panMove",
        tx: pan.tx + (input.clientX - pan.x),
        ty: pan.ty + (input.clientY - pan.y),
      };
    },

    pointerUp(): PointerGestureAction {
      if (!pan) return { kind: "forward" };
      const ended = { kind: "panEnd", pointerId: pan.pointerId } as const;
      pan = null;
      return ended;
    },

    cancel(): PointerGestureAction {
      if (!pan) return { kind: "forward" };
      const ended = { kind: "panEnd", pointerId: pan.pointerId } as const;
      pan = null;
      return ended;
    },

    isPanning(): boolean {
      return pan !== null;
    },
  };
}
