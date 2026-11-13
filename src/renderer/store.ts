// Window-side store: the core's state plus this window's own UI state.

import { useSyncExternalStore } from "react";
import type { ServerMessage, State } from "../shared/model";
import { activeSpace, activeTab, findPane, panes } from "../shared/tree";
import { corral } from "./bridge";
import { reuse } from "./reuse";
import { terminals } from "./terminals";

export type Prompt = { title: string; value: string; submit: (value: string) => void };

export interface UiState {
  core?: State;
  connected: boolean;
  error?: string;
  sidebar: boolean;
  palette: boolean;
  prompt?: Prompt;
  fontSize: number;
  toast?: string;
}

const FONT_KEY = "corral.fontSize";

function readFontSize() {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    return n >= 8 && n <= 32 ? n : 13;
  } catch {
    return 13;
  }
}

let ui: UiState = { connected: false, sidebar: true, palette: false, fontSize: readFontSize() };
const listeners = new Set<() => void>();

export function getUi() {
  return ui;
}

export function setUi(patch: Partial<UiState>) {
  ui = { ...ui, ...patch };
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useUi() {
  return useSyncExternalStore(subscribe, () => ui);
}

/** Re-renders only when the selected value changes, so `select` must return something stable. */
export function useUiSelect<T>(select: (ui: UiState) => T): T {
  return useSyncExternalStore(subscribe, () => select(ui));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string) {
  setUi({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: undefined }), 4000);
}

export function setFontSize(size: number) {
  const n = Math.max(8, Math.min(32, size));
  try {
    localStorage.setItem(FONT_KEY, String(n));
  } catch {}
  terminals.setFontSize(n);
  setUi({ fontSize: n });
}

/** The focused terminal of the shown tab, if any. */
export function focusedTerminal(state = ui.core) {
  if (!state) return undefined;
  const tab = activeTab(activeSpace(state));
  const pane = tab && findPane(tab.root, tab.focusedPaneId);
  return pane ? { tab, pane, terminalId: pane.terminalId } : undefined;
}

/** Terminals this window shows right now: the active tab, or just its zoomed pane. */
export function visibleTerminals(state = ui.core) {
  const tab = state && activeTab(activeSpace(state));
  if (!tab) return [];
  const all = panes(tab.root);
  const shown = tab.zoomedPaneId ? all.filter((p) => p.id === tab.zoomedPaneId) : all;
  return shown.map((p) => p.terminalId);
}

function reportView() {
  corral.send({ type: "view", visible: visibleTerminals(), focused: document.hasFocus() });
}

let lastView = "";
function reportViewIfChanged() {
  const key = JSON.stringify([visibleTerminals(), document.hasFocus()]);
  if (key === lastView) return;
  lastView = key;
  reportView();
}

export function startStore(onState: (prev: State | undefined, next: State) => void) {
  terminals.setFontSize(ui.fontSize);
  corral.onReset(() => {
    terminals.detachAll();
    lastView = "";
    setUi({ connected: true, error: undefined });
  });
  corral.onError((message) => setUi({ connected: false, error: message }));
  corral.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case "state": {
        const prev = ui.core;
        const next = reuse(prev, msg.state);
        // Always sync: after a reconnect every terminal needs re-attaching even if nothing changed.
        terminals.sync(Object.keys(next.terminals));
        if (next === prev) break;
        setUi({ core: next });
        reportViewIfChanged();
        onState(prev, next);
        break;
      }
      case "snapshot":
        terminals.snapshot(msg.terminalId, msg.data);
        break;
      case "output":
        terminals.output(msg.terminalId, msg.data);
        break;
      case "error":
        toast(msg.message);
        break;
    }
  });
  window.addEventListener("focus", reportViewIfChanged);
  window.addEventListener("blur", reportViewIfChanged);
}
