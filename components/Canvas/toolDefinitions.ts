/** Compatibility exports for modules that still consume the old tool-definition path. */
export type { ToolDefinition as ToolDef } from "./toolRegistry";
export {
  SHAPE_TOOL_DEFINITIONS as SHAPE_TOOLS,
  TOOLBAR_TOOLS,
} from "./toolRegistry";
