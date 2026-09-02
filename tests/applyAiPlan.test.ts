import { beforeEach, describe, expect, it } from "vitest";
import { type AiPlan, applyAiPlan, applyAiPlanToDocument } from "@/lib/engine/applyAiPlan";
import { createRect, createText } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";
import type { EngineDoc } from "@/lib/engine/types";

function fixture(): EngineDoc {
  const layer = createEngineLayer("free", { name: "Artwork" });
  const title = {
    ...createText({ x: 100, y: 100, width: 500, height: 80, text: "Original" }),
    id: "title",
  };
  const accent = { ...createRect({ x: 100, y: 220, width: 200, height: 100 }), id: "accent" };
  layer.objectIds = [title.id, accent.id];
  return {
    id: "doc-1",
    title: "Test Artwork",
    width: 1920,
    height: 1080,
    slides: [
      {
        id: "artwork-1",
        name: "Artwork 1",
        background: "#ffffff",
        elements: [title, accent],
        layers: [layer],
        width: 1920,
        height: 1080,
      },
    ],
    snapGrid: null,
    workspaceStrictness: 1,
    strictnessLevel: 1,
    strictnessValues: { 2: 1, 3: 2 },
    updatedAt: 100,
    schemaVersion: 5,
  };
}

function updatePlan(doc: EngineDoc, commands: AiPlan["commands"]): AiPlan {
  return {
    protocolVersion: 1,
    planId: "plan-1",
    executionToken: "token-1",
    baseRevision: doc.updatedAt,
    summary: "Apply a targeted Artwork edit",
    commands,
    estimatedRemoteCostUsd: 0,
    requiresApproval: false,
  };
}

describe("AI plan application", () => {
  it("updates only the targeted object and preserves unrelated objects", () => {
    const doc = fixture();
    const result = applyAiPlanToDocument(
      doc,
      updatePlan(doc, [
        {
          id: "command-1",
          kind: "update",
          target: {
            docId: doc.id,
            artworkId: "artwork-1",
            objectId: "title",
            baseRevision: 100,
            elementVersion: 1,
          },
          patch: { text: "Updated", x: 140 },
        },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slide = result.doc.slides[0];
    expect(slide.elements.find((element) => element.id === "title")).toMatchObject({
      text: "Updated",
      x: 140,
    });
    expect(slide.elements.find((element) => element.id === "accent")).toEqual(
      doc.slides[0].elements[1],
    );
    expect(result.receipts).toEqual([{ commandId: "command-1", status: "applied" }]);
  });

  it("rejects stale plans without changing the document", () => {
    const doc = fixture();
    const plan = updatePlan(doc, [
      {
        id: "command-1",
        kind: "update",
        target: {
          docId: doc.id,
          artworkId: "artwork-1",
          objectId: "title",
          baseRevision: 99,
          elementVersion: 1,
        },
        patch: { text: "Must not apply" },
      },
    ]);

    const result = applyAiPlanToDocument(doc, plan);

    expect(result.ok).toBe(false);
    expect(result.doc).toEqual(doc);
    expect(result.receipts[0]).toMatchObject({ commandId: "command-1", status: "failed" });
  });

  it("rejects locked targets", () => {
    const doc = fixture();
    doc.slides[0].elements[0].locked = true;
    const result = applyAiPlanToDocument(
      doc,
      updatePlan(doc, [
        {
          id: "command-1",
          kind: "update",
          target: {
            docId: doc.id,
            artworkId: "artwork-1",
            objectId: "title",
            baseRevision: 100,
            elementVersion: 1,
          },
          patch: { text: "Must not apply" },
        },
      ]),
    );

    expect(result.ok).toBe(false);
    expect(result.doc).toEqual(doc);
    expect(result.receipts[0]).toMatchObject({ status: "failed" });
  });

  it("commits no command when a later required command fails", () => {
    const doc = fixture();
    const result = applyAiPlanToDocument(
      doc,
      updatePlan(doc, [
        {
          id: "command-1",
          kind: "update",
          target: {
            docId: doc.id,
            artworkId: "artwork-1",
            objectId: "title",
            baseRevision: 100,
            elementVersion: 1,
          },
          patch: { text: "First change" },
        },
        {
          id: "command-2",
          kind: "update",
          target: { docId: doc.id, artworkId: "artwork-1", objectId: "missing", baseRevision: 100 },
          patch: { text: "Second change" },
        },
      ]),
    );

    expect(result.ok).toBe(false);
    expect(result.doc).toEqual(doc);
    expect(result.receipts.every((receipt) => receipt.status === "failed")).toBe(true);
  });

  it("inserts editable text and shapes into the targeted Free Layer", () => {
    const doc = fixture();
    const layerId = doc.slides[0].layers[0].id;
    const result = applyAiPlanToDocument(
      doc,
      updatePlan(doc, [
        {
          id: "command-text",
          kind: "insert_text",
          target: { docId: doc.id, artworkId: "artwork-1", layerId, baseRevision: 100 },
          payload: { text: "New headline", x: 400, y: 400, width: 500, height: 80, fontSize: 48 },
        },
        {
          id: "command-shape",
          kind: "insert_shape",
          target: { docId: doc.id, artworkId: "artwork-1", layerId, baseRevision: 100 },
          payload: { shape: "rect", x: 380, y: 380, width: 540, height: 120, fill: "#ffffff" },
        },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.slides[0].elements).toHaveLength(4);
    expect(result.doc.slides[0].elements.filter((element) => element.type === "text")).toHaveLength(
      2,
    );
    expect(result.doc.slides[0].layers[0].objectIds).toHaveLength(4);
  });

  describe("store commit", () => {
    beforeEach(() => {
      const doc = fixture();
      useEngine.setState({
        doc,
        currentSlideId: "artwork-1",
        activeLayerId: doc.slides[0].layers[0].id,
        selectedIds: new Set(),
      });
    });

    it("creates one undo boundary for an applied plan", () => {
      const before = useEngine.getState().doc;
      const result = applyAiPlan(
        updatePlan(before, [
          {
            id: "command-1",
            kind: "update",
            target: {
              docId: before.id,
              artworkId: "artwork-1",
              objectId: "title",
              baseRevision: 100,
              elementVersion: 1,
            },
            patch: { text: "Updated" },
          },
          {
            id: "command-2",
            kind: "update",
            target: {
              docId: before.id,
              artworkId: "artwork-1",
              objectId: "accent",
              baseRevision: 100,
              elementVersion: 1,
            },
            patch: { opacity: 0.5 },
          },
        ]),
      );

      expect(result.ok).toBe(true);
      expect(
        useEngine.getState().doc.slides[0].elements.find((element) => element.id === "title"),
      ).toMatchObject({
        text: "Updated",
      });
      useEngine.getState().undo();
      expect(useEngine.getState().doc).toEqual(before);
      expect(useEngine.getState().history.past).toHaveLength(0);
    });
  });
});
