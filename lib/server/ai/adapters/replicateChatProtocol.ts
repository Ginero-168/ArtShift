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
    "Reasoning: low",
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
    if (candidate.kind === "tool_calls" && Array.isArray(candidate.calls)) {
      rawCalls = candidate.calls;
    } else if (candidate.kind === "tool_call" && isRecord(candidate.call)) {
      rawCalls = [candidate.call];
    }
  }

  if (!text && rawCalls.length === 0) text = extractFallbackText(raw);
  const toolCalls: AiToolCallContent[] = [];
  rawCalls.slice(0, 12).forEach((value, index) => {
    if (!isRecord(value)) {
      warnings.push("Provider returned a malformed tool call.");
      return;
    }
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!name || !allowedTools.has(name)) {
      warnings.push("Provider returned a tool that is not enabled for this request.");
      return;
    }
    if (!isRecord(value.input)) {
      warnings.push(`Provider tool ${name} did not include an object input.`);
      return;
    }
    const id =
      typeof value.id === "string" && value.id.length > 0 && value.id.length <= 200
        ? value.id
        : `replicate-call-${index + 1}`;
    toolCalls.push({ type: "tool_call", id, name, input: value.input });
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
