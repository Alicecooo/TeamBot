import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { executableTarget, verifyCloudflaredExecutable } from "../setup/prepare-https-tunnel.mjs";

async function requireRealDirectory(directory) {
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Package resource must be a real directory: ${directory}`);
  }
}

async function requireRegularFile(file) {
  const details = await lstat(file);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Package resource must be a regular file: ${file}`);
  }
}

async function validateCloudflared(resources, platform, required) {
  const root = path.join(resources, "cloudflared");
  try {
    await lstat(root);
  } catch (error) {
    // Local fixtures may omit packaged resources. A real electron-builder
    // context must fail closed because its copier only warns when an
    // extraResources `from` path is missing.
    if (error?.code === "ENOENT" && !required) return;
    throw error;
  }

  await requireRealDirectory(root);
  const executable = path.join(root, "cloudflared.exe");
  if (JSON.stringify(await readdir(root)) !== JSON.stringify([path.basename(executable)])) {
    throw new Error(`Unexpected entries in packaged cloudflared resource: ${root}`);
  }
  await requireRegularFile(executable);
  const target = executableTarget(await readFile(executable));
  const allowed = { win32: new Set(["win32-x64"]) }[platform];
  if (!allowed?.has(target)) {
    throw new Error(`Packaged ${platform} app contains the wrong cloudflared target: ${target}`);
  }
  verifyCloudflaredExecutable(executable, target);

  const licenses = path.join(resources, "licenses");
  await requireRealDirectory(licenses);
  await requireRegularFile(path.join(licenses, "cloudflared-LICENSE.txt"));
}

// Validate the exact copied resource tree before the Windows artifact is assembled.
export default async function afterPack(context) {
  const resources = context.packager?.getResourcesDir?.(context.appOutDir) ?? (
    path.join(context.appOutDir, "resources")
  );
  await validateCloudflared(resources, context.electronPlatformName, Boolean(context.packager));
}
