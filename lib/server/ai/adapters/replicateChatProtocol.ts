import type {
  AiAssistantChatInput,
  AiAssistantChatOutput,
  AiChatContent,
  AiChatMessage,
  AiToolCallContent,
  AiToolDefinition,
} from "@/lib/ai-runtime/contracts";
import { parseJsonCandidate } from "./shared";

const HARMONY_START = "<｜start｜>";
const HARMONY_END = "<｜end｜>";
const HARMONY_MESSAGE = "<｜message｜>";
const HARMONY_CHANNEL = "<｜channel｜>";
const HARMONY_RETURN = "<｜return｜>";
const HARMONY_CALL = "<｜call｜>";
const HARMONY_CONSTRAIN = "<｜constrain｜>";
const MAX_TOOL_SCHEMA_CHARS = 6_000;
const MAX_TOOL_SECTION_CHARS = 30_000;

export type ParsedReplicateAssistantOutput = {
  output: AiAssistantChatOutput;
  warnings: string[];
};

/**
 * Render the provider-neutral ArtShift chat contract into the Harmony format
 * expected by gpt-oss. Replicate's public wrapper accepts a single prompt, so
 * the adapter keeps tool schemas in the developer message and validates the
 * returned JSON envelope locally.
 */
export function renderHarmonyPrompt(input: AiAssistantChatInput): string {
  const system = [
    "You are ChatGPT, a large language model trained by OpenAI.",
    "Knowledge cutoff: 2024-06",
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
    "Reasoning: high",
    "# Valid channels: analysis, commentary, final.",
  ].join("\n");
  const developer = [
    input.system?.trim() || "You are the ArtShift in-app design assistant.",
    renderToolSection(input.tools ?? []),
    [
      "# ArtShift response contract",
      "Return exactly one JSON object in the final response and no markdown.",
      'For a normal reply use {"kind":"text","text":"..."}.',
      'For tool calls use {"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"exact_tool_name","input":{}}]}.',
      "When calling propose_creative_direction with image-task, include: summary, refinedPrompt, specialist, capability, modelAlias, knowledgeSkillIds, reviewCriteria, search, outputCount.",
      "Only call a tool listed in the ArtShift tools section.",
      "Never mutate the document yourself; return a proposal/tool call for ArtShift to validate.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  const messages = [
    formatHarmonyMessage("system", system),
    formatHarmonyMessage("developer", developer),
    ...input.messages.map(renderConversationMessage),
  ];
  return `${messages.join("")}${HARMONY_START}assistant`;
}

export function renderGeminiSystemInstruction(input: AiAssistantChatInput): string {
  return [
    input.system?.trim() || "You are the ArtShift in-app design assistant.",
    renderToolSection(input.tools ?? []),
    [
      "# ArtShift response contract",
      "CRITICAL: You MUST always produce a non-empty text response. Never return an empty output under any circumstances.",
      "Return exactly one JSON object in the final response and no markdown.",
      'For a normal reply use {"kind":"text","text":"..."}.',
      'For tool calls use {"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"exact_tool_name","input":{}}]}.',
      "Only call a tool listed in the ArtShift tools section.",
      "Never mutate the document yourself; return a proposal/tool call for ArtShift to validate.",
      'If uncertain, always return at minimum {"kind":"text","text":"I understand your request."}.',
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function renderConversationPrompt(messages: AiChatMessage[]): string {
  return messages
    .map((message) => {
      const role =
        message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System";
      return `${role}: ${renderContent(message.content)}`;
    })
    .join("\n\n");
}

export function parseReplicateAssistantOutput(
  raw: string,
  tools: AiToolDefinition[],
): ParsedReplicateAssistantOutput {
  const warnings: string[] = [];
  const candidate = parseJsonCandidate(raw);
  const allowedTools = new Set(tools.map((tool) => tool.name));
  let text = "";
  let rawCalls: unknown[] = [];

  if (isRecord(candidate)) {
    if (typeof candidate.text === "string") text = candidate.text.trim();
    if (Array.isArray(candidate.calls)) {
      rawCalls = candidate.calls;
    } else if (Array.isArray(candidate.tool_calls)) {
      rawCalls = candidate.tool_calls;
    } else if (isRecord(candidate.call)) {
      rawCalls = [candidate.call];
    } else if (isRecord(candidate.tool_call)) {
      rawCalls = [candidate.tool_call];
    } else if (isRecord(candidate.calls)) {
      rawCalls = [candidate.calls];
    } else if (typeof candidate.name === "string" && allowedTools.has(candidate.name)) {
      rawCalls = [candidate];
    } else if (typeof candidate.tool === "string" && allowedTools.has(candidate.tool)) {
      rawCalls = [candidate];
    } else if (typeof candidate.action === "string" && allowedTools.has(candidate.action)) {
      rawCalls = [candidate];
    } else if (
      isRecord(candidate.function) &&
      typeof candidate.function.name === "string" &&
      allowedTools.has(candidate.function.name)
    ) {
      rawCalls = [
        {
          name: candidate.function.name,
          input:
            candidate.function.arguments ??
            candidate.function.input ??
            candidate.function.parameters ??
            candidate.function.args ??
            {},
        },
      ];
    } else if (isRecord(candidate.propose_creative_direction)) {
      rawCalls = [
        { name: "propose_creative_direction", input: candidate.propose_creative_direction },
      ];
    } else if (isRecord(candidate.propose_design_plan)) {
      rawCalls = [{ name: "propose_design_plan", input: candidate.propose_design_plan }];
    } else if (isRecord(candidate.propose_sequential_plan)) {
      rawCalls = [{ name: "propose_sequential_plan", input: candidate.propose_sequential_plan }];
    } else if (
      allowedTools.has("propose_creative_direction") &&
      (candidate.kind === "image-task" || candidate.kind === "clarification")
    ) {
      rawCalls = [{ name: "propose_creative_direction", input: candidate }];
    } else if (
      allowedTools.has("propose_creative_direction") &&
      candidate.kind === "answer" &&
      typeof candidate.text === "string"
    ) {
      rawCalls = [{ name: "propose_creative_direction", input: candidate }];
    } else if (
      allowedTools.has("propose_design_plan") &&
      (candidate.kind === "design-plan" ||
        Array.isArray(candidate.commands) ||
        (isRecord(candidate.proposal) && Array.isArray(candidate.proposal.commands)))
    ) {
      rawCalls = [{ name: "propose_design_plan", input: candidate.proposal ?? candidate }];
    } else if (
      allowedTools.has("propose_sequential_plan") &&
      (candidate.kind === "sequential-plan" ||
        Array.isArray(candidate.steps) ||
        (isRecord(candidate.plan) && Array.isArray(candidate.plan.steps)))
    ) {
      rawCalls = [{ name: "propose_sequential_plan", input: candidate.plan ?? candidate }];
    } else if (
      allowedTools.has("review_creative_output") &&
      (typeof candidate.passed === "boolean" ||
        (isRecord(candidate.review) && typeof candidate.review.passed === "boolean"))
    ) {
      rawCalls = [
        {
          name: "review_creative_output",
          input: isRecord(candidate.review) ? candidate.review : candidate,
        },
      ];
    }
  }

  if (rawCalls.length === 0 && raw.includes(HARMONY_CALL)) {
    const callPattern =
      /<｜call｜>([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?([\s\S]*?)(?:<｜(?:return|call|end)｜>|$)/g;
    let match = callPattern.exec(raw);
    while (match !== null) {
      const toolName = match[1]?.trim();
      const callId = match[2]?.trim();
      const jsonText = match[3]?.trim();
      if (toolName && allowedTools.has(toolName) && jsonText) {
        const parsedInput = parseJsonCandidate(jsonText);
        if (isRecord(parsedInput)) {
          rawCalls.push({ id: callId, name: toolName, input: parsedInput });
        }
      }
      match = callPattern.exec(raw);
    }
  }

  if (!text && rawCalls.length === 0) text = extractFallbackText(raw);
  const toolCalls: AiToolCallContent[] = [];
  rawCalls.slice(0, 12).forEach((value, index) => {
    if (!isRecord(value)) {
      warnings.push("Provider returned a malformed tool call.");
      return;
    }
    let name = typeof value.name === "string" ? value.name.trim() : "";
    if (!name && isRecord(value.function) && typeof value.function.name === "string") {
      name = value.function.name.trim();
    }
    if (!name && typeof value.tool === "string") {
      name = value.tool.trim();
    }
    if (!name && typeof value.action === "string") {
      name = value.action.trim();
    }
    if (!name && allowedTools.size === 1) {
      name = Array.from(allowedTools)[0];
    }
    if (!name || !allowedTools.has(name)) {
      warnings.push("Provider returned a tool that is not enabled for this request.");
      return;
    }
    let callInput: Record<string, unknown> | null = null;
    const rawInput =
      value.input ??
      value.arguments ??
      value.parameters ??
      value.args ??
      (isRecord(value.function)
        ? (value.function.input ??
          value.function.arguments ??
          value.function.parameters ??
          value.function.args)
        : undefined) ??
      value.action_input;

    if (isRecord(rawInput)) {
      callInput = rawInput;
    } else if (typeof rawInput === "string") {
      const parsed = parseJsonCandidate(rawInput);
      if (isRecord(parsed)) callInput = parsed;
    }
    if (!callInput) {
      warnings.push(`Provider tool ${name} did not include an object input.`);
      return;
    }
    const id =
      typeof value.id === "string" && value.id.length > 0 && value.id.length <= 200
        ? value.id
        : `replicate-call-${index + 1}`;
    toolCalls.push({ type: "tool_call", id, name, input: callInput });
  });

  const content: AiChatContent[] = [];
  if (text) content.push({ type: "text", text });
  content.push(...toolCalls);
  const assistantMessage: AiChatMessage = {
    role: "assistant",
    content: content.length > 0 ? content : text || raw.trim(),
  };
  return {
    output: {
      text,
      stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
      assistantMessage,
      toolCalls,
    },
    warnings,
  };
}

function renderToolSection(tools: AiToolDefinition[]): string {
  if (!tools.length) return "";
  const body = tools
    .map((tool) => {
      const schema = JSON.stringify(tool.inputSchema).slice(0, MAX_TOOL_SCHEMA_CHARS);
      return [`## ${tool.name}`, tool.description, `JSON Schema: ${schema}`].join("\n");
    })
    .join("\n\n")
    .slice(0, MAX_TOOL_SECTION_CHARS);
  return `# ArtShift tools\n${body}`;
}

function renderConversationMessage(message: AiChatMessage): string {
  return formatHarmonyMessage(message.role, renderContent(message.content));
}

function renderContent(content: string | AiChatContent[]): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_call") {
        return `<tool_call id="${block.id}" name="${block.name}">${JSON.stringify(block.input)}</tool_call>`;
      }
      return `<tool_result id="${block.toolCallId}" error="${block.isError ? "true" : "false"}">${block.content}</tool_result>`;
    })
    .join("\n");
}

function formatHarmonyMessage(
  role: "system" | "developer" | "user" | "assistant",
  content: string,
): string {
  return `${HARMONY_START}${role}${HARMONY_MESSAGE}${content}${HARMONY_END}`;
}

function extractFallbackText(raw: string): string {
  const finalPrefix = `${HARMONY_START}assistant${HARMONY_CHANNEL}final${HARMONY_MESSAGE}`;
  const finalStart = raw.lastIndexOf(finalPrefix);
  if (finalStart >= 0) {
    const start = finalStart + finalPrefix.length;
    const end = raw.indexOf(HARMONY_END, start);
    return raw.slice(start, end >= 0 ? end : undefined).trim();
  }
  return raw
    .replaceAll(HARMONY_START, "")
    .replaceAll(HARMONY_END, "")
    .replaceAll(HARMONY_MESSAGE, "")
    .replaceAll(HARMONY_CHANNEL, "")
    .replaceAll(HARMONY_RETURN, "")
    .replaceAll(HARMONY_CALL, "")
    .replaceAll(HARMONY_CONSTRAIN, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
