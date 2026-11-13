// One xterm per core terminal, kept alive while its tab is hidden so switching
// back is instant. Panes borrow a terminal's element while they show it.

import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { corral } from "./bridge";

export const THEME: ITheme = {
  background: "#16171d",
  foreground: "#d6d8e1",
  cursor: "#e8e9ef",
  cursorAccent: "#16171d",
  selectionBackground: "#3a3f5a",
  black: "#1e2029",
  red: "#ef6b73",
  green: "#8bd49c",
  yellow: "#ebc17a",
  blue: "#6cb6ff",
  magenta: "#c49ef0",
  cyan: "#5fd7d7",
  white: "#d6d8e1",
  brightBlack: "#5c6070",
  brightRed: "#ff8a91",
  brightGreen: "#a5e5b4",
  brightYellow: "#f5d59a",
  brightBlue: "#91c9ff",
  brightMagenta: "#d8bbf7",
  brightCyan: "#8be8e8",
  brightWhite: "#ffffff",
};

const FONT_FAMILY = '"JetBrains Mono", "SF Mono", Menlo, Monaco, "Cascadia Mono", Consolas, monospace';

interface Entry {
  term: Terminal;
  fit: FitAddon;
  el: HTMLDivElement;
  opened: boolean;
  attached: boolean;
}

class Terminals {
  private entries = new Map<string, Entry>();
  private fontSize = 13;

  setFontSize(size: number) {
    this.fontSize = size;
    for (const [id, e] of this.entries) {
      e.term.options.fontSize = size;
      this.fit(id);
    }
  }

  private get(id: string): Entry {
    let e = this.entries.get(id);
    if (e) return e;
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: this.fontSize,
      lineHeight: 1.15,
      theme: THEME,
      scrollback: 10000,
      allowProposedApi: true,
      cursorBlink: true,
      macOptionClickForcesSelection: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_event, uri) => corral.openExternal(uri)));
    term.onData((data) => corral.send({ type: "input", terminalId: id, data }));
    term.onBinary((data) => corral.send({ type: "input", terminalId: id, data }));
    const el = document.createElement("div");
    el.className = "term-host";
    e = { term, fit, el, opened: false, attached: false };
    this.entries.set(id, e);
    return e;
  }

  /** Keeps exactly the given terminals, asking the core for the ones this window lacks. */
  sync(ids: string[]) {
    const wanted = new Set(ids);
    for (const [id, e] of this.entries) {
      if (!wanted.has(id)) {
        e.term.dispose();
        e.el.remove();
        this.entries.delete(id);
      }
    }
    const missing = ids.filter((id) => !this.get(id).attached);
    for (const id of missing) this.get(id).attached = true;
    if (missing.length) corral.send({ type: "attach", terminalIds: missing });
  }

  /** The core restarted or reconnected: everything is re-attached from fresh snapshots. */
  detachAll() {
    for (const e of this.entries.values()) e.attached = false;
  }

  snapshot(id: string, data: string) {
    const e = this.entries.get(id);
    if (!e) return;
    e.term.reset();
    e.term.write(data);
  }

  output(id: string, data: string) {
    this.entries.get(id)?.term.write(data);
  }

  mount(id: string, container: HTMLElement) {
    const e = this.get(id);
    if (e.el.parentElement !== container) container.appendChild(e.el);
    if (!e.opened) {
      e.term.open(e.el);
      e.opened = true;
    }
    this.fit(id);
  }

  unmount(id: string, container: HTMLElement) {
    const e = this.entries.get(id);
    if (e && e.el.parentElement === container) container.removeChild(e.el);
  }

  fit(id: string) {
    const e = this.entries.get(id);
    if (!e?.opened || !e.el.isConnected || e.el.clientWidth === 0) return;
    const dims = e.fit.proposeDimensions();
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
    const cols = Math.max(2, dims.cols);
    const rows = Math.max(1, dims.rows);
    if (cols !== e.term.cols || rows !== e.term.rows) e.term.resize(cols, rows);
    corral.send({ type: "resize", terminalId: id, cols, rows });
  }

  focus(id: string) {
    this.entries.get(id)?.term.focus();
  }

  clear(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    e.term.clear();
    // Ctrl+L asks the shell to redraw its prompt on the cleared screen.
    corral.send({ type: "input", terminalId: id, data: "\x0c" });
  }
}

export const terminals = new Terminals();
