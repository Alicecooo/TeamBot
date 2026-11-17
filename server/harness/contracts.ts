// Ported from upstream's provider contracts with Promises for Effect and listeners for Stream; shapes and names are kept.

// Ported from upstream's provider contracts with Promises for Effect and listeners for Stream; shapes and names are kept.
import type { ApprovalMode } from "../../shared/tool/approval-mode.ts";
import type { ToolScope } from "../../shared/tool/tool-scope.ts";
import type { EffortLevel } from "../../shared/thread/wire.ts";
import type { DriverKind, InstanceId, ModelVariantOption, RuntimeEventListener, ThreadId, TurnId } from "../../shared/thread/runtime-events.ts";
import type { ProviderIcon } from "../../shared/view/provider-icon.ts";

export type { EffortLevel, ModelSelection } from "../../shared/thread/wire.ts";
export type {
  DriverKind, InstanceId, ModelVariantOption, ModelVariantState, RuntimeEvent,
  RuntimeEventBase, RuntimeEventListener, ThreadId, TurnId,
} from "../../shared/thread/runtime-events.ts";

export type ProviderErrorCode =
  | "missing_cli"
  | "invalid_credentials"
  | "inactive_subscription"
  /** The account has no credit left for a pay-as-you-go model. */
  | "insufficient_funds"
  | "quota_or_region_restriction"
  | "upstream_outage"
  | "model_catalog_outage";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderError";
    this.code = code;
  }
}

/** Variants are opaque provider IDs, not the cross-engine effort enum. */
export function isModelVariant(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/\p{Cc}/u.test(value);
}

/** An image already admitted to the private attachment store; drivers get this, never a host path in the prompt. */
export interface TurnImageInput {
  path: string;
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  bytes: number;
}

// `driver` is any slug: an unknown driver round-trips as an unavailable shadow snapshot.
export interface InstanceConfig {
  driver: DriverKind;
  displayName?: string;
  accentColor?: string;
  /** Presentation override for this instance only. */
  icon?: ProviderIcon;
  environment?: Record<string, string>;
  enabled?: boolean;
  /** Picker group over the driver's default: an `openai-compat` instance on a provider's own key is "api". */
  access?: EngineAccess;
  config?: unknown;
}

export type InstanceConfigMap = Record<InstanceId, InstanceConfig>;

/** `allowed-once` grants only the asked-about action; `unavailable` is the fail-closed default: no answerer, no action. */
export type RequestOutcome = "allowed-once" | "rejected" | "answered" | "unavailable";

// Sessions start implicitly on the first turn; resumeCursor carries the provider-native continuation (e.g. a Claude session id).
export interface SendTurnInput {
  threadId: ThreadId;
  /** Drivers namespace process-level resources (broker socket, CLI session) by botId too: threadIds may coincide across bots. */
  botId?: string;
  text: string;
  /** The recall block the harness put in front of `text`; it informs this turn only, so a replay can leave it out. */
  recalled?: string;
  /** Reasserted every turn so a resumed native session cannot keep a stale, more permissive mode. */
  approvalMode?: ApprovalMode;
  /** Fresh owner selection, independent of execution approval and resume state. */
  toolScope?: ToolScope;
  /** A guest turn: no shell or command execution, no reads outside its folder. Sent only to drivers whose guestTurns is "confined". */
  guestConfined?: boolean;
  /** Why this turn is confined, in the owner's words, for a refusal to end with. */
  confinedWhy?: string;
  /** Images for this user turn only; kept out of replay transcripts. */
  images?: TurnImageInput[];
  model?: string;
  effort?: EffortLevel;
  variant?: string;
  resumeCursor?: unknown;
  /** Start without the previous native context or retained process; wins over resumeCursor. */
  sessionReset?: boolean;
  /** The turn with the conversation replayed inline, sent once on a fresh session when the provider refuses resumeCursor before reading the prompt. */
  recoveryText?: string;
  /** Prior turns for transcript-replay providers (API-backed drivers). */
  transcript?: Array<{ role: "user" | "assistant"; text: string }>;
  /** Bot persona (name/title/description) as a system prompt. */
  system?: string;
  /** `system` without its volatile sections (systemVolatile). A per-thread CLI process keys on this half; request-per-turn drivers
   * carry the volatile half in the newest user message so the cached prefix stays byte-identical. */
  systemStable?: string;
  systemVolatile?: string;
  /** The message tags teammates, so digest-based delivery must not suppress the mentions note even when it is unchanged. */
  mentionTurn?: boolean;

  /** Per-bot integrations the driver may hand to the agent as tools. */
  integrations?: {
    /** A harness-owned stdio bridge to Composio, so connection requests become trusted chat cards. */
    composio?: { command: string; args: string[]; env: Record<string, string> };
    /** Stdio connection to a computer MCP server. `scope` is set only for the host desktop, so host-only approval rules never apply elsewhere. */
    localComputer?: {
      command: string;
      args: string[];
      env: Record<string, string>;
      platform?: "darwin" | "win32";
      generation?: string;
      scope?: "local-computer";
    };
    /** Peer-agent MCP proxy (list_bots / coordinate_bots); the harness owns turns, permissions and recursion limits. */
    agents?: { command: string; args: string[]; env: Record<string, string> };

    /** dweb daemon tools; `url` is the dweb HTTP base. */
    dweb?: { url: string };
    /** The user's MCP servers, mounted without any pre-allow; a driver skips a kind it cannot speak. */
    custom?: Record<string, McpServerSpec>;
    /** Characters of one tool result per `custom` server; 0 = never trim, a missing name = the app default. */
    customResultBudgets?: Record<string, number>;
  };
  cwd?: string;
  /** Per-call ceiling (ms) for this turn's MCP tools; absent is the driver's default (10 min). */
  mcpCallTimeoutMs?: number;
  /** Times an API-model turn that answers after a failed tool call is sent back to re-run it (`loopGuard.correctiveRounds`); never after a denial. */
  toolErrorCorrectiveRounds?: number;
}

/** An MCP server this machine starts and talks to over stdio. */
export interface StdioMcpSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** An MCP server over streamable HTTP (`http`) or the older SSE transport; header values are credentials and never go on argv. */
export interface RemoteMcpSpec {
  type: "http" | "sse";
  url: string;
  headers: Record<string, string>;
}

export type McpServerSpec = StdioMcpSpec | RemoteMcpSpec;

export interface TurnStartResult {
  turnId: TurnId;
}

export interface ProviderAdapter {
  readonly provider: DriverKind;
  readonly capabilities: {
    sessionModelSwitch: "in-session" | "unsupported";
    /** The driver mounts integrations.agents. Every *Mcp flag guards one rule: never tell a bot about tools its driver cannot mount. */
    agentsMcp?: boolean;
    /** The driver mounts isolated computer MCP descriptors. */
    computerMcp?: boolean;
    /** The driver mounts integrations.composio. */
    composioMcp?: boolean;

    /** The engine accepts images in the prompt (gates composer paste). */
    images?: boolean;
    /** sendTurn consumes `images` as structured input, so dispatch strips the attachment path from `text`. */
    nativeImageInput?: boolean;
    /** Effort levels the driver can pass to its CLI, ascending; absent hides the control. */
    effortLevels?: readonly EffortLevel[];
    /** The driver validates and applies model-specific variant IDs per session. */
    modelVariants?: boolean;
    /** The driver keeps a live session and can take a user message mid-turn (steer). */
    queueing?: boolean;
    /** steer() delivers `images` as structured input; requires queueing and nativeImageInput. */
    steerImages?: boolean;
    /** True only when local MCP calls can reach the human approval channel; full-auto/bypass instances must leave this false. */
    localComputerMcp?: boolean;
    /** The driver mounts integrations.custom. */
    customMcp?: boolean;
    /** A resumeCursor turn runs in that exact native session, or fails, or starts a new one from recoveryText (session.started says
     * `rebuilt`), never a blank one. */
    strictResume?: boolean;
    /** "confined": sendTurn honours `guestConfined`; absent, a guest turn is refused. */
    guestTurns?: "confined";
    /** "meter": `contextTokens` / `contextWindow` are the engine's own report, shown on the context meter but never used to time compaction. */
    contextReading?: "meter";
  };
  sendTurn(input: SendTurnInput): Promise<TurnStartResult>;
  interruptTurn(threadId: ThreadId, turnId?: TurnId): Promise<void>;
  /** Never throws for a vanished ask: `unavailable` means nobody could take the answer, and the caller treats it as a deny. */
  respondToRequest(
    threadId: ThreadId,
    requestId: string,
    decision: {
      behavior: "allow" | "deny" | "answer";
      message?: string;
      /** "Always allow this session": the provider's own remembered approval; the app keeps no grant of its own. */
      always?: boolean;
    },
  ): Promise<RequestOutcome>;
  /** Deliver a user message into the running turn (drivers with `capabilities.queueing`).
   * - "steered": accepted into the live turn.
   * - "refused": provably not delivered; the caller may queue it.
   * - "indeterminate": maybe delivered; the caller must NOT re-queue, or it could run twice.
   * A driver that cannot read an attached image refuses the whole steer. */
  steer?(threadId: ThreadId, text: string, images?: readonly TurnImageInput[]): Promise<SteerOutcome>;
  hasSession(threadId: ThreadId): boolean;
  stopAll(): Promise<void>;
  onEvent(listener: RuntimeEventListener): () => void;
}

export type SteerOutcome = "steered" | "refused" | "indeterminate";

export interface ProviderSnapshot {
  state: "available" | "unavailable";
  reason?: string;
  authenticated?: boolean;
  /** Display identity from the provider, never credentials; `method` is the workspace API key. */
  account?: { email?: string; organization?: string; method?: "api-key" };
  version?: string | null;
  /** On a subscription a reported cost is notional. */
  billing?: "metered" | "subscription";
}

export interface ModelCatalog {
  default: string;
  options: Array<{
    id: string;
    label: string;
    custom?: boolean;
    loaded?: boolean;
    /** Upstream provider id (e.g. "zai"), shown as a badge so BYOK duplicates stay distinguishable. */
    provider?: string;
    /** Context window in tokens, when known; sizes the model-facing rebuild. */
    contextWindow?: number;
    /** Discovery hints; the native session revalidates these before each turn. */
    variants?: ModelVariantOption[];
  }>;
}

/** "gpt-5.4-mini" → "Gpt 5.4 Mini", splitting on the caller's word breaks. */
export function titleCaseModelId(id: string, wordBreaks: RegExp): string {
  return id
    .split(wordBreaks)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** A picker label with a second facet (display name, provider host) unless the id already says it. */
export function qualifiedModelLabel(
  id: string,
  qualifier: string | null | undefined,
  options: {
    redundantWhen?: (id: string, qualifier: string) => boolean;
    decorate?: (qualifier: string) => string;
  } = {},
): string {
  const { redundantWhen = () => false, decorate = (facet) => ` — ${facet}` } = options;
  if (!qualifier || redundantWhen(id, qualifier)) return id;
  return `${id}${decorate(qualifier)}`;
}

export interface DriverCreateInput<Config> {
  instanceId: InstanceId;
  displayName: string | undefined;
  environment: Record<string, string>;
  enabled: boolean;
  config: Config;
}

export interface TextGenerationUsage {
  model: string;
  input?: number;
  output?: number;
  cachedInput?: number;
  costUsd?: number;
}

export interface TextGenerationOptions {
  signal?: AbortSignal;
  onUsage?: (usage: TextGenerationUsage) => void;
  /** Only the helper model setting passes it: one of this instance's models instead of the driver's quick-call choice. */
  model?: string;
  /** How long the caller will wait; drivers with their own process timer use it instead of their default. */
  timeoutMs?: number;
}

export interface ProviderInstance {
  readonly instanceId: InstanceId;
  readonly driverKind: DriverKind;
  readonly displayName: string | undefined;
  readonly enabled: boolean;
  readonly models: ModelCatalog;
  readonly adapter: ProviderAdapter;
  snapshot(): Promise<ProviderSnapshot>;
  /** Cheap one-shot text call (titles, summaries); the signal is a best-effort cap. */
  generateText?(prompt: string, options?: TextGenerationOptions): Promise<string>;
  /** One-shot text for background steps only, on engines whose turns are whole agent processes; never for titles or compaction. */
  generateMemoryText?(prompt: string, options?: TextGenerationOptions): Promise<string>;
  /** Isolated, tool-free permission review; separate from generateText so no security capability is inferred from a generic helper. */
  reviewPermission?(prompt: string, signal?: AbortSignal): Promise<string>;
  dispose(): Promise<void>;
}

/** How an engine is presented in the picker rail.
 *  `subscription` — first-party cloud catalog; Custom is extra.
 *  `custom` — no subscription catalog; Custom is the product.
 *  `api` — a cloud model catalog billed through an API key. */
export type EngineAccess = "subscription" | "custom" | "api";

export interface ProviderDriver<Config = unknown> {
  readonly driverKind: DriverKind;
  readonly metadata: {
    displayName: string;
    supportsMultipleInstances?: boolean;
    access?: EngineAccess;
  };
  /** Decode the opaque config envelope; throw on invalid (→ shadow). */
  decodeConfig(raw: unknown): Config;
  defaultConfig(): Config;
  readonly models: ModelCatalog;
  /** Owns all per-instance state; must reject, never throw synchronously (a rejection becomes an unavailable shadow snapshot). */
  create(input: DriverCreateInput<Config>): Promise<ProviderInstance>;
}

export type AnyProviderDriver = ProviderDriver<any>;

let eventCounter = 0;
export const newEventId = () => `ev-${Date.now().toString(36)}-${(eventCounter++).toString(36)}`;
export const newId = () => crypto.randomUUID();
