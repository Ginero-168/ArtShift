import type { AiToolDefinition } from "@/lib/ai-runtime/contracts";

export const DESIGN_PLAN_TOOL: AiToolDefinition = {
  name: "propose_design_plan",
  description:
    "Return a reviewable, side-effect-free Canvas mutation plan. Use exact target ids and exact user-provided text. Never claim that commands were already applied.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 20_000 },
      requiresApproval: { type: "boolean" },
      commands: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            kind: {
              type: "string",
              enum: ["update", "delete", "background", "insert_text", "insert_shape"],
            },
            target: {
              type: "object",
              additionalProperties: false,
              properties: {
                docId: { type: "string" },
                artworkId: { type: "string" },
                layerId: { type: "string" },
                objectId: { type: "string" },
                elementVersion: { type: "integer", minimum: 0 },
                baseRevision: { oneOf: [{ type: "number" }, { type: "string" }] },
              },
              required: ["docId", "artworkId", "baseRevision"],
            },
            patch: { type: "object", additionalProperties: true },
            color: { type: "string" },
            payload: {
              type: "object",
              additionalProperties: true,
              properties: {
                text: { type: "string" },
                shape: { type: "string", enum: ["rect", "ellipse", "triangle"] },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
                fontSize: { type: "number" },
                fontFamily: { type: "string" },
                textAlign: { type: "string", enum: ["left", "center", "right"] },
                fill: { type: "string" },
                stroke: { type: "string" },
                strokeWidth: { type: "number" },
                cornerRadius: { type: "number" },
              },
            },
          },
          required: ["id", "kind", "target"],
        },
      },
    },
    required: ["summary", "commands", "requiresApproval"],
  },
};
