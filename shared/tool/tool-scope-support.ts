import { parseToolScope, type ToolScope } from "./tool-scope.ts";

/** Native contracts and app-supplied MCP gates are separate capabilities. */
export const TOOL_SCOPE_SUPPORT = {
  ompAgent: "native-and-mcp",
  "openai-compat": "native-and-mcp",
} as const;

export function assertToolScopeSupported(engine: string, value: unknown): ToolScope | undefined {
  const parsed = parseToolScope(value);
  if (!parsed.ok) throw new Error(parsed.error);
  const support: (typeof TOOL_SCOPE_SUPPORT)[keyof typeof TOOL_SCOPE_SUPPORT] | undefined =
    TOOL_SCOPE_SUPPORT[engine as keyof typeof TOOL_SCOPE_SUPPORT];
  if (parsed.scope !== undefined && support !== "native-and-mcp" && (parsed.scope.allow !== undefined || parsed.scope.deny?.length)) {
    throw new Error(`${engine}: tool selection is not supported by this engine. Choose a supported engine.`);
  }
  return parsed.scope;
}
