// Electron main process: starts the core if needed and connects each window to it.
// The window arranges terminals; the core runs them.

import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { coreLogPath, ensureHome, homeDir, keysPath, socketPath } from "../shared/paths";
import { onMessages, send } from "../shared/wire";

const KEYS_TEMPLATE = `{
  // Bind a key to a command id, or to null to unbind a default.
  // Run "Show commands" (palette) to see every command id.
  // Modifiers: cmd, ctrl, alt, shift. Example:
  //   "cmd+shift+t": "tab.new"
  "bindings": {
  }
}
`;

function connectOnce(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath());
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function startCore() {
  ensureHome();
  const log = fs.openSync(coreLogPath(), "a", 0o600);
  // The core runs on this app's own runtime as plain node, detached so it outlives the app.
  const child = spawn(process.execPath, [path.join(__dirname, "daemon.js")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    detached: true,
    stdio: ["ignore", log, log],
    cwd: homeDir(),
  });
  child.unref();
}

async function connectCore(): Promise<net.Socket> {
  try {
    return await connectOnce();
  } catch {
    startCore();
  }
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      return await connectOnce();
    } catch {}
  }
  throw new Error(`could not start the core; see ${coreLogPath()}`);
}

// ---- keys.json ----

function stripJsonComments(text: string) {
  return text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? "");
}

let userKeys: { bindings: Record<string, string | null>; error?: string } = { bindings: {} };

function loadKeys() {
  try {
    const text = fs.readFileSync(keysPath(), "utf8");
    const parsed = JSON.parse(stripJsonComments(text).replace(/,(\s*[}\]])/g, "$1"));
    if (typeof parsed?.bindings !== "object") throw new Error('expected an object with "bindings"');
    userKeys = { bindings: parsed.bindings };
  } catch (err: any) {
    // A broken edit keeps the last good bindings and reports the error.
    if (err.code === "ENOENT") userKeys = { bindings: {} };
    else userKeys = { bindings: userKeys.bindings, error: `keys.json: ${err.message}` };
  }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("keys", userKeys);
}

function watchKeys() {
  ensureHome();
  let timer: NodeJS.Timeout | undefined;
  // Watch the folder: editors often replace the file instead of writing it.
  fs.watch(homeDir(), (_event, name) => {
    if (name !== "keys.json") return;
    clearTimeout(timer);
    timer = setTimeout(loadKeys, 100);
  });
}

// ---- windows ----

const sockets = new Map<number, net.Socket>();

async function attachCore(win: BrowserWindow) {
  const id = win.webContents.id;
  let socket: net.Socket;
  try {
    socket = await connectCore();
  } catch (err) {
    win.webContents.send("core-error", (err as Error).message);
    return;
  }
  if (win.isDestroyed()) return socket.destroy();
  sockets.set(id, socket);
  win.webContents.send("core-reset");
  onMessages(socket, (msg) => {
    if (!win.isDestroyed()) win.webContents.send("core", msg);
  });
  socket.on("close", () => {
    if (sockets.get(id) !== socket) return;
    sockets.delete(id);
    // The core went away (crash or "Stop core"): start a new one and reconnect.
    if (!win.isDestroyed()) setTimeout(() => attachCore(win), 300);
  });
  send(socket, { type: "hello", role: "window" });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#16171d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const id = win.webContents.id;
  win.on("closed", () => {
    sockets.get(id)?.destroy();
    sockets.delete(id);
  });
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("keys", userKeys);
    attachCore(win);
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.on("core-send", (event, msg) => {
  const socket = sockets.get(event.sender.id);
  if (socket) send(socket, msg);
});

ipcMain.handle("open-keys", async () => {
  if (!fs.existsSync(keysPath())) fs.writeFileSync(keysPath(), KEYS_TEMPLATE);
  return shell.openPath(keysPath());
});

ipcMain.on("new-window", () => createWindow());
ipcMain.on("open-external", (_e, url: string) => {
  if (/^https?:/.test(url)) shell.openExternal(url);
});
ipcMain.on("badge", (_e, count: number) => {
  if (process.platform === "darwin") app.dock?.setBadge(count > 0 ? String(count) : "");
  else app.setBadgeCount(count);
});

function buildMenu() {
  // No accelerators for keys the window binds (cmd+w, cmd+t, ...): keys.json owns those.
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { type: "separator" },
              { role: "quit" },
            ] as Electron.MenuItemConstructorOptions[],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }],
    },
    {
      label: "View",
      submenu: [{ role: "toggleDevTools" }, { role: "togglefullscreen" }],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.setName("Corral");

// A page loaded in place of ours would get the preload bridge, and with it every shell.
// So pages never navigate (a dropped file would otherwise open in the window) and never open windows.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
});

app.whenReady().then(() => {
  // A packaged app shows its bundle's icon; `npm start` runs Electron.app, so set it here.
  if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, "..", "assets", "icon.png"));
  buildMenu();
  loadKeys();
  watchKeys();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Closing windows never stops terminals: the core keeps them.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
