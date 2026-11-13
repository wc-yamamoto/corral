// Where the core keeps its socket and files. Node-only (core, main process, CLI).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const VERSION = "0.1.0";

export function homeDir() {
  return process.env.CORRAL_HOME || path.join(os.homedir(), ".corral");
}

export function socketPath() {
  // Named pipes share one namespace across users; keep each user's core separate.
  if (process.platform === "win32") return `\\\\.\\pipe\\corral-core-${os.userInfo().username}`;
  return path.join(homeDir(), "core.sock");
}

/**
 * Creates the folder if needed and makes it private. The core's socket lets whoever
 * can reach it type into your shells, so only you may enter this folder.
 */
export function ensureHome() {
  fs.mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(homeDir(), 0o700);
}

export const statePath = () => path.join(homeDir(), "state.json");
export const keysPath = () => path.join(homeDir(), "keys.json");
export const coreLogPath = () => path.join(homeDir(), "core.log");
