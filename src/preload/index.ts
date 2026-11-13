// The window's only door to the main process.

import { contextBridge, ipcRenderer } from "electron";

function listen(channel: string, cb: (...args: any[]) => void) {
  const handler = (_e: unknown, ...args: any[]) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  platform: process.platform,
  send: (msg: unknown) => ipcRenderer.send("core-send", msg),
  onMessage: (cb: (msg: any) => void) => listen("core", cb),
  onReset: (cb: () => void) => listen("core-reset", cb),
  onError: (cb: (message: string) => void) => listen("core-error", cb),
  onKeys: (cb: (keys: { bindings: Record<string, string | null>; error?: string }) => void) => listen("keys", cb),
  openKeys: () => ipcRenderer.invoke("open-keys"),
  newWindow: () => ipcRenderer.send("new-window"),
  openExternal: (url: string) => ipcRenderer.send("open-external", url),
  setBadge: (count: number) => ipcRenderer.send("badge", count),
};

export type CorralApi = typeof api;

contextBridge.exposeInMainWorld("corral", api);
