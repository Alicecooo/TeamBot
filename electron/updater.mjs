// macOS auto-update requires a signed app, so this runs only when packaged. electron-updater is vendored
// because the packaged app ships no node_modules.
import { app, ipcMain } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createUpdaterCoordinator } from "./updater-coordinator.mjs";

const require = createRequire(import.meta.url);

let autoUpdater = null;
let win = null;
let state = { status: "idle" };
let updaterCoordinator = null;
let pageAllowed = () => false;

function updaterLogger() {
  const directory = app.getPath("logs");
  const file = join(directory, "updater.log");
  const write = (level, values) => {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const message = values
        .map((value) => (value instanceof Error ? value.stack ?? value.message : String(value)))
        .join(" ");
      appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`, { mode: 0o600 });
    } catch {
    }
  };
  return Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (...values) => write(level, values)]));
}

function setState(patch) {
  state = { ...state, ...patch };
  try {
    const contents = win?.webContents;
    if (contents && pageAllowed({ sender: contents, senderFrame: contents.mainFrame })) contents.send("update:state", state);
  } catch {
  }
}

export function sendUpdaterState() {
  setState({});
}

export function registerUpdaterIpc({ pageAllowed: allowed }) {
  pageAllowed = allowed;
  const guarded = (channel, handler) => (event) => {
    if (!pageAllowed(event)) throw new Error(`${channel} is only available in this app's window`);
    return handler();
  };
  ipcMain.handle("update:get-state", guarded("update:get-state", () => state));
  ipcMain.handle("update:check", guarded("update:check", () => updaterCoordinator?.check(true)));
  ipcMain.handle("update:install", guarded("update:install", () => updaterCoordinator?.install()));
}

// macOS keeps the process (and updater) alive after its window closes, so each new window is retargeted here.
export function attachUpdaterWindow(mainWindow) {
  win = mainWindow;
}

export function startUpdater() {
  if (!app.isPackaged) {
    updaterCoordinator = null;
    setState({ status: "idle" });
    return;
  }
  try {
    ({ autoUpdater } = require("./vendor/electron-updater.cjs"));
  } catch {
    updaterCoordinator = null;
    setState({ status: "error", message: "updater unavailable" });
    return;
  }
  // The coordinator starts each download itself, so it owns macOS staging and quiet failures.
  autoUpdater.autoDownload = false;
  autoUpdater.logger = updaterLogger();

  // macOS starts Squirrel.Mac's native staging at once; Windows restarts into the NSIS update.
  autoUpdater.autoInstallOnAppQuit = true;
  setState({ installMode: "restart" });
  updaterCoordinator = createUpdaterCoordinator(autoUpdater, setState, {
    nativeStaging: process.platform === "darwin",
  });

  setTimeout(() => void updaterCoordinator?.check(), 15_000).unref?.();
  setInterval(() => void updaterCoordinator?.check(), 60 * 60 * 1000).unref?.();
}
