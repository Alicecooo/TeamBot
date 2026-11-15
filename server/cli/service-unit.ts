import { homedir, userInfo } from "node:os";
import { posix } from "node:path";

// Launch agents use POSIX paths, even when rendered in a Windows test process.
const { dirname, join } = posix;

export interface ServiceSpec {
  node: string;
  script: string;
  serveArgs: string[];
  dataDir: string;
  user: string;
  home: string;
  bindsLowPorts: boolean;
  label?: string;
}

export const LAUNCHD_LABEL = "com.openmausbot.serve";

function needsStripTypes(script: string): boolean {
  return script.endsWith(".ts");
}

export function serviceCommand(spec: Pick<ServiceSpec, "node" | "script" | "serveArgs">): string[] {
  return [spec.node, ...(needsStripTypes(spec.script) ? ["--experimental-strip-types"] : []), spec.script, "serve", ...spec.serveArgs];
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function launchdPlist(spec: ServiceSpec): string {
  const args = serviceCommand(spec).map((arg) => `\t\t<string>${xml(arg)}</string>`).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>Label</key>",
    `\t<string>${LAUNCHD_LABEL}</string>`,
    "\t<key>ProgramArguments</key>",
    "\t<array>",
    args,
    "\t</array>",
    "\t<key>EnvironmentVariables</key>",
    "\t<dict>",
    "\t\t<key>HOME</key>",
    `\t\t<string>${xml(spec.home)}</string>`,
    "\t\t<key>OMB_DATA_DIR</key>",
    `\t\t<string>${xml(spec.dataDir)}</string>`,
    "\t\t<key>PATH</key>",
    "\t\t<string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>",
    "\t</dict>",
    "\t<key>WorkingDirectory</key>",
    `\t<string>${xml(spec.home)}</string>`,
    "\t<key>RunAtLoad</key>",
    "\t<true/>",
    "\t<key>KeepAlive</key>",
    "\t<true/>",
    "\t<key>StandardOutPath</key>",
    `\t<string>${xml(join(spec.dataDir, "logs", "service.log"))}</string>`,
    "\t<key>StandardErrorPath</key>",
    `\t<string>${xml(join(spec.dataDir, "logs", "service.log"))}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** An `npx` cache path is pruned without notice; a service must not point at it. */
export function unstableInstallWarning(script: string): string | null {
  const normalized = script.replace(/\\/g, "/");
  if (/\/_npx\//.test(normalized) || /\/\.npm\/_npx\//.test(normalized)) {
    return `this command runs from an npx cache (${dirname(script)}), which npm may delete at any time. Install it permanently first (npm install -g openmausbot) and run \`openmausbot service install\` from that install.`;
  }
  return null;
}

export function servicePlan(platform: NodeJS.Platform, dataDir: string, home = homedir()): { file: string; installed: string; activate: string[]; deactivate: string[] } | null {
  if (platform === "darwin") {
    const installed = join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
    return {
      file: join(dataDir, `${LAUNCHD_LABEL}.plist`),
      installed,
      activate: [`mkdir -p ${dirname(installed)} && cp ${join(dataDir, `${LAUNCHD_LABEL}.plist`)} ${installed}`, `launchctl bootstrap gui/$(id -u) ${installed}`],
      deactivate: [`launchctl bootout gui/$(id -u)/${LAUNCHD_LABEL}`, `rm ${installed}`],
    };
  }
  return null;
}

export const SENTINEL_LAUNCHD_LABEL = "com.openmausbot.sentinel";
export const SENTINEL_INTERVAL_SECONDS = 120;

export type SentinelServiceSpec = Pick<ServiceSpec, "node" | "script" | "dataDir" | "home"> & {
  out: string;
  /** `node` is the desktop app's own executable, run as Node. */
  electronRunAsNode?: boolean;
};

/** The app's executable run as Node (ELECTRON_RUN_AS_NODE) survives app updates and Node upgrades; null for an app predating Sentinel. */
export function shippedSentinelCli(
  platform: NodeJS.Platform, home: string, exists: (path: string) => boolean, hasSentinel: (script: string) => boolean = () => true,
): { node: string; script: string } | null {
  const candidates = platform === "darwin"
    ? ["/Applications/OpenMausBot.app", join(home, "Applications", "OpenMausBot.app")].map((app) => ({
      node: join(app, "Contents", "MacOS", "OpenMausBot"), script: join(app, "Contents", "Resources", "server", "openmausbot.js"),
    }))
    : [];
  return candidates.find((cli) => exists(cli.node) && exists(cli.script) && hasSentinel(cli.script)) ?? null;
}

export function sentinelCommand(spec: Pick<SentinelServiceSpec, "node" | "script" | "dataDir" | "out">): string[] {
  return [spec.node, ...(needsStripTypes(spec.script) ? ["--experimental-strip-types"] : []), spec.script, "sentinel", "--once", "--data-dir", spec.dataDir, "--out", spec.out];
}

function shellArg(value: string): string {
  return /^[\w@%+=:,./~-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

export function sentinelLaunchdPlist(spec: SentinelServiceSpec): string {
  for (const [label, value] of [["home", spec.home], ["node", spec.node], ["script", spec.script], ["data dir", spec.dataDir], ["output", spec.out]] as const) assertUnitValue(label, value);
  const args = sentinelCommand(spec).map((arg) => `\t\t<string>${xml(arg)}</string>`).join("\n");
  const log = xml(join(spec.out, "sentinel.log"));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>Label</key>",
    `\t<string>${SENTINEL_LAUNCHD_LABEL}</string>`,
    "\t<key>ProgramArguments</key>",
    "\t<array>",
    args,
    "\t</array>",
    "\t<key>EnvironmentVariables</key>",
    "\t<dict>",
    "\t\t<key>HOME</key>",
    `\t\t<string>${xml(spec.home)}</string>`,
    ...(spec.electronRunAsNode ? ["\t\t<key>ELECTRON_RUN_AS_NODE</key>", "\t\t<string>1</string>"] : []),
    "\t</dict>",
    "\t<key>StartInterval</key>",
    `\t<integer>${SENTINEL_INTERVAL_SECONDS}</integer>`,
    "\t<key>RunAtLoad</key>",
    "\t<true/>",
    "\t<key>ProcessType</key>",
    "\t<string>Background</string>",
    "\t<key>LowPriorityIO</key>",
    "\t<true/>",
    "\t<key>StandardOutPath</key>",
    `\t<string>${log}</string>`,
    "\t<key>StandardErrorPath</key>",
    `\t<string>${log}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** A line break or NUL in a unit file value would start a line of its own. */
function assertUnitValue(label: string, value: string): void {
  if (/[\r\n\0]/.test(value)) throw new Error(`the ${label} path contains a line break or NUL, which a service file cannot hold; choose a path without one`);
}

export function sentinelServicePlan(platform: NodeJS.Platform, out: string, home = homedir()): { files: Array<{ name: string; installed: string }>; activate: string[]; deactivate: string[] } | null {
  if (platform === "darwin") {
    const name = `${SENTINEL_LAUNCHD_LABEL}.plist`;
    const installed = join(home, "Library", "LaunchAgents", name);
    return {
      files: [{ name, installed }],
      activate: [`mkdir -p ${shellArg(dirname(installed))} && cp ${shellArg(join(out, name))} ${shellArg(installed)}`, `launchctl bootstrap gui/$(id -u) ${shellArg(installed)}`],
      deactivate: [`launchctl bootout gui/$(id -u)/${SENTINEL_LAUNCHD_LABEL}`, `rm ${shellArg(installed)}`],
    };
  }
  return null;
}

export function sentinelUnitCommand(text: string): { node: string; script: string } | null {
  const plist = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text);
  if (!plist) return null;
  const args = [...plist[1]!.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  const at = args.indexOf("sentinel");
  return at >= 2 ? { node: args[0]!, script: args[at - 1]! } : null;
}

export type SentinelInstallCheck =
  | { status: "ok"; unit: string; node: string; script: string }
  | { status: "stale"; unit: string; node: string; script: string; missing: string[] }
  | { status: "not_installed" | "unreadable"; unit: string }
  | { status: "unsupported" };

/** launchd fails silently on every run once an app update or Node upgrade moves the node or script. */
export function checkSentinelInstall(platform: NodeJS.Platform, home: string, fs: { exists(path: string): boolean; read(path: string): string }): SentinelInstallCheck {
  const plan = sentinelServicePlan(platform, "", home);
  if (!plan) return { status: "unsupported" };
  const unit = plan.files[0]!.installed;
  if (!fs.exists(unit)) return { status: "not_installed", unit };
  let command: { node: string; script: string } | null;
  try {
    command = sentinelUnitCommand(fs.read(unit));
  } catch {
    command = null;
  }
  if (!command) return { status: "unreadable", unit };
  const missing = [command.node, command.script].filter((path) => !fs.exists(path));
  return missing.length ? { status: "stale", unit, ...command, missing } : { status: "ok", unit, ...command };
}

export function currentUser(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER || process.env.USERNAME || "openmausbot";
  }
}
