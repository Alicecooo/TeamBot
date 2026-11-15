import fs from "node:fs";
import path from "node:path";

/** Node keys compile-cache entries by full path, and a translocated macOS app runs from a new path each launch. */
export function serverChildLaunch({ resourcesPath, userData, exists = fs.existsSync }) {
  const serverDir = path.join(resourcesPath, "server");
  const bootstrap = path.join(serverDir, "desktop-entry.mjs");
  if (!exists(bootstrap)) return { entry: path.join(serverDir, "index.js"), compileCacheDir: null };
  const pathChangesEachLaunch = resourcesPath.includes("/AppTranslocation/");
  return {
    entry: bootstrap,
    compileCacheDir: pathChangesEachLaunch ? null : path.join(userData, "server-compile-cache"),
  };
}
