const DESKTOP_PLATFORMS = new Set(["darwin", "win32"]);
const UNAVAILABLE_LOCAL_STATUSES = new Set(["disabled", "checking", "starting", "error", "stopped", "unavailable"]);

function normalizedPlatform(platform) {
  return DESKTOP_PLATFORMS.has(platform) ? platform : "other";
}

function nativeDesktopActions(platform) {
  const appleNative = normalizedPlatform(platform) === "darwin";
  return Object.freeze({
    appleMediaPermissions: appleNative,
    applePrivacySettings: appleNative,
    appleSpeech: appleNative,
  });
}

function localComputerReady(platform, connection) {
  const validLegacyConnection = connection &&
    (!Object.hasOwn(connection, "status") || connection.status === "ready") &&
    typeof connection.socketPath === "string" && connection.socketPath.length > 0 &&
    typeof connection.mcpCommand === "string" && connection.mcpCommand.trim().length > 0 &&
    Array.isArray(connection.mcpArgs) && connection.mcpArgs[0] === "mcp" &&
    connection.mcpArgs.every((arg) => typeof arg === "string") &&
    connection.mcpEnv && typeof connection.mcpEnv === "object" && !Array.isArray(connection.mcpEnv) &&
    Object.values(connection.mcpEnv).every((value) => typeof value === "string");
  
  if (platform === "win32") {
    return Boolean(validLegacyConnection && connection.mode === "embedded");
  }
  return false;
}

function desktopCapabilities({
  platform = process.platform,
  packaged = false,
  localConnection = null,
  homeDir = require("node:os").homedir(),
  // A remote server's page: this computer's screen, voice and local control are never on offer.
  remote = false,
} = {}) {
  const hostPlatform = normalizedPlatform(platform);
  const localAvailable = localComputerReady(hostPlatform, localConnection);
  const localStatus = localAvailable ? "ready" :
    UNAVAILABLE_LOCAL_STATUSES.has(localConnection?.status) ? localConnection.status : "unavailable";
  const localComputer = {
    available: localAvailable,
    support: localAvailable ? "supported" : "unsupported",
    enabled: connectionEnabled(hostPlatform, localConnection),
    status: localStatus,
  };
  // Local-machine detail (driver, seat, diagnostics): a remote page must never receive these.
  if (!remote) {
    if (localConnection?.mode === "unavailable" && typeof localConnection.reason === "string" &&
        localConnection.reason.trim() && localConnection.reason.length <= 2_000) {
      localComputer.message = localConnection.reason.trim();
    }
    if (typeof localConnection?.message === "string") {
      localComputer.message = localConnection.message;
    }
    if (typeof localConnection?.driver?.path === "string") {
      localComputer.driverPath = localConnection.driver.path;
    }
    if (typeof localConnection?.driver?.version === "string") {
      localComputer.driverVersion = localConnection.driver.version;
    }
    if (typeof localConnection?.driver?.source === "string") {
      localComputer.driverSource = localConnection.driver.source;
    }
  }
  if (!localAvailable) {
    localComputer.reasonCode =
      localConnection?.reasonCode ??
      ("unsupported-platform");
  }

  if (remote) {
    const unavailable = { reasonCode: "remote-server" };
    Object.assign(localComputer, {
      available: false,
      support: "unsupported",
      enabled: false,
      status: "unavailable",
      driverPath: "",
      driverVersion: "",
      driverSource: "",
      session: "",
      compositor: "",
      message: "",
    }, unavailable);
  }

  return {
    remote: Boolean(remote),
    host: {
      platform: hostPlatform,
      label:
        hostPlatform === "win32"
              ? "Windows"
              : "Desktop",
      session: "unknown",
      packaged: Boolean(packaged),
      // The sandboxed preload has no Node builtins; a remote page learns nothing about this computer's users.
      homeDir: remote ? "" : homeDir,
    },
    windowChrome:
      hostPlatform === "win32" ? "win-caption" : "native",
    localComputer};
}

function connectionEnabled(platform, connection) {
  if (platform === "win32") {
    return localComputerReady(platform, connection);
  }
  return false;
}

module.exports = {
  connectionEnabled,
  desktopCapabilities,
  localComputerReady,
  nativeDesktopActions,
};
