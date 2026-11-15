import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SPAWNED_PROXIES } from "../proxy-paths.ts";

export type LocalComputerConnection = {
  command: string;
  args: string[];
  env: Record<string, string>;
  platform: "darwin" | "win32";
  generation?: string;
  scope: "local-computer";
};

export function gatedLocalComputer(
  connection: LocalComputerConnection,
  control: { url: string; token: string },
): LocalComputerConnection {
  return {
    ...connection,
    command: process.execPath,
    args: ["--experimental-strip-types", SPAWNED_PROXIES.localComputer],
    env: {
      ...connection.env,
      // Packaged, execPath is Electron: without this the MCP client relaunches OMB instead of the headless gate.
      ELECTRON_RUN_AS_NODE: "1",
      OMB_CUA_COMMAND: connection.command,
      OMB_CUA_ARGS: JSON.stringify(connection.args),
      OMB_CONTROL_URL: control.url,
      OMB_CONTROL_TOKEN: control.token,
    },
  };
}

type LegacyConnectionDescriptor = {
  mode?: string;
  socketPath?: unknown;
  mcpCommand?: unknown;
  mcpArgs?: unknown;
  mcpEnv?: unknown;
  status?: unknown;
};

function legacyPlatform(platform: NodeJS.Platform): "darwin" | "win32" | null {
  if (platform === "darwin" || platform === "win32") return platform;
  return null;
}

function decodeLegacyDescriptor(
  value: LegacyConnectionDescriptor,
  platform: NodeJS.Platform,
): LocalComputerConnection | null {
  const supportedPlatform = legacyPlatform(platform);
  if (!supportedPlatform || !value ||
      !(value.mode === "embedded" || (supportedPlatform === "darwin" && value.mode === "standalone")) ||
      (Object.hasOwn(value, "status") && value.status !== "ready") ||
      typeof value.socketPath !== "string" || !value.socketPath ||
      typeof value.mcpCommand !== "string" || !value.mcpCommand.trim()) {
    return null;
  }
  if (!Array.isArray(value.mcpArgs) || value.mcpArgs[0] !== "mcp") return null;
  if (!value.mcpEnv || typeof value.mcpEnv !== "object" || Array.isArray(value.mcpEnv)) return null;
  const args = value.mcpArgs;
  if (!args.every((arg) => typeof arg === "string")) return null;
  const env = value.mcpEnv;
  if (!Object.values(env).every((entry) => typeof entry === "string")) return null;
  return {
    command: value.mcpCommand,
    args,
    env: env as Record<string, string>,
    platform: supportedPlatform,
    scope: "local-computer",
  };
}

/** Legacy descriptors name any command, so the file must be a regular non-symlink owned by this user and closed to
 * group/other writes. libuv reports every writable Windows file as uid 0 mode 0o666, so only the symlink rule applies there. */
function validateLegacyDescriptorRuntime(
  descriptorFile: string,
  platform: NodeJS.Platform,
  { uid = process.getuid?.() ?? -1 }: { uid?: number } = {},
): boolean {
  try {
    const stat = lstatSync(descriptorFile);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    if (platform !== "win32" && (stat.uid !== uid || (stat.mode & 0o022) !== 0)) return false;
    return true;
  } catch {
    return false;
  }
}

/** An older fallback never overrides a present but unavailable, malformed or unreadable descriptor. */
function firstPresentCuaDescriptor(candidates: string[]): string | null {
  for (const file of new Set(candidates)) {
    try {
      lstatSync(file);
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return file;
    }
  }
  return null;
}

export function readCuaConnection({
  platform = process.platform,
  userData = process.env.OMB_USER_DATA,
  home = homedir(),
  validateLegacyRuntime = validateLegacyDescriptorRuntime,
}: {
  platform?: NodeJS.Platform;
  userData?: string;
  home?: string;
  validateLegacyRuntime?: (file: string, platform: NodeJS.Platform) => boolean;
} = {}): LocalComputerConnection | null {
  const candidates = userData ? [join(userData, "cua-connection.json")] : [];
  if (platform === "darwin" && !userData) {
    for (const directory of ["OpenMausBot", "openmausbot", "OpenGrokBot", "opengrokbot"]) {
      candidates.push(join(home, "Library", "Application Support", directory, "cua-connection.json"));
    }
  }

  const file = firstPresentCuaDescriptor(candidates);
  if (!file) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const decoded = decodeLegacyDescriptor(raw, platform);
    if (decoded && validateLegacyRuntime(file, platform)) return decoded;
  } catch {
  }
  return null;
}

/** Diagnostic only: never a connection, and only a private, well-formed macOS/Windows descriptor may supply text. */
export function readCuaUnavailableReason({
  platform = process.platform,
  userData = process.env.OMB_USER_DATA,
  home = homedir(),
}: {
  platform?: NodeJS.Platform;
  userData?: string;
  home?: string;
} = {}): string | null {
  if (!legacyPlatform(platform)) return null;
  const candidates = userData ? [join(userData, "cua-connection.json")] : [];
  if (platform === "darwin" && !userData) {
    for (const directory of ["OpenMausBot", "openmausbot", "OpenGrokBot", "opengrokbot"]) {
      candidates.push(join(home, "Library", "Application Support", directory, "cua-connection.json"));
    }
  }
  const file = firstPresentCuaDescriptor(candidates);
  if (!file) return null;
  try {
    if (validateLegacyDescriptorRuntime(file, platform)) {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw) &&
          Object.keys(raw).length === 2 &&
          (raw as Record<string, unknown>).mode === "unavailable") {
        const reason = (raw as Record<string, unknown>).reason;
        if (typeof reason === "string" && reason.trim() && reason.length <= 2_000) return reason.trim();
      }
    }
  } catch {
  }
  return null;
}
