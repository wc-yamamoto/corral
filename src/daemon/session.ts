// One live terminal: the shell's pty plus a headless copy of its screen,
// so a window that connects later sees exactly what is there now.

import * as pty from "node-pty";
import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { socketPath } from "../shared/paths";
import { lastLines, pasteData } from "./screen";

const SCROLLBACK = 5000;
// A burst of output (a build log, `cat`) arrives as thousands of small reads.
// Collect them for a few ms so windows get one message instead of thousands.
const BATCH_MS = 5;
const BATCH_MAX = 256 * 1024;

export interface SessionEvents {
  output(id: string, data: string): void;
  title(id: string, title: string): void;
  exit(id: string): void;
}

function defaultShell() {
  if (process.platform === "win32") return process.env.COMSPEC || "powershell.exe";
  return process.env.SHELL || "/bin/zsh";
}

function childEnv(id: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // The core runs on Electron's node; shells must not inherit that mode.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  const binDir = path.join(__dirname, "..", "bin");
  return {
    ...env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "corral",
    LANG: env.LANG || "en_US.UTF-8",
    CORRAL_TERMINAL_ID: id,
    CORRAL_SOCKET: socketPath(),
    CORRAL_NODE: process.execPath,
    PATH: `${binDir}${path.delimiter}${env.PATH ?? ""}`,
  };
}

export class Session {
  readonly pty: pty.IPty;
  readonly screen: Terminal;
  private readonly serializer = new SerializeAddon();
  private pending = "";
  private flushTimer?: NodeJS.Timeout;
  lastOutputAt = 0;
  title = "";
  closed = false;

  constructor(
    readonly id: string,
    cwd: string,
    cols: number,
    rows: number,
    private readonly events: SessionEvents,
  ) {
    const dir = fs.existsSync(cwd) ? cwd : os.homedir();
    const shell = defaultShell();
    this.screen = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true });
    // The addon is typed against the browser terminal but works on the headless one.
    this.screen.loadAddon(this.serializer as never);
    this.screen.onTitleChange((title) => {
      this.title = title;
      events.title(id, title);
    });
    this.pty = pty.spawn(shell, process.platform === "win32" ? [] : ["-l"], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: dir,
      env: childEnv(id),
    });
    this.pty.onData((data) => {
      this.lastOutputAt = Date.now();
      // Forward only after the headless screen has parsed it, so a snapshot
      // plus a flush (see `flush`) matches exactly the output already sent.
      this.screen.write(data, () => this.queue(data));
    });
    this.pty.onExit(() => {
      this.flush();
      this.closed = true;
      events.exit(id);
    });
  }

  private queue(data: string) {
    this.pending += data;
    if (this.pending.length >= BATCH_MAX) this.flush();
    else this.flushTimer ??= setTimeout(() => this.flush(), BATCH_MS);
  }

  /** Sends parsed output still being collected. Call before snapshotting for a new viewer. */
  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (!this.pending) return;
    const data = this.pending;
    this.pending = "";
    this.events.output(this.id, data);
  }

  get pid() {
    return this.pty.pid;
  }

  get tty(): string | undefined {
    return (this.pty as unknown as { ptsName?: string }).ptsName;
  }

  write(data: string) {
    if (!this.closed) this.pty.write(data);
  }

  /** Types `text` as a paste, the way the program asked for pastes. */
  paste(text: string) {
    this.write(pasteData(text, this.screen.modes.bracketedPasteMode));
  }

  /** The last `lines` lines of screen and scrollback as plain text. */
  text(lines: number) {
    return lastLines(this.screen, lines);
  }

  resize(cols: number, rows: number) {
    if (this.closed || cols < 2 || rows < 1) return;
    if (cols === this.screen.cols && rows === this.screen.rows) return;
    this.pty.resize(cols, rows);
    this.screen.resize(cols, rows);
  }

  snapshot() {
    return this.serializer.serialize({ scrollback: SCROLLBACK });
  }

  /** The last `lines` non-empty lines of the visible screen. */
  bottomText(lines = 20) {
    const buf = this.screen.buffer.active;
    const out: string[] = [];
    for (let y = buf.baseY + this.screen.rows - 1; y >= buf.baseY && out.length < lines; y--) {
      const text = buf.getLine(y)?.translateToString(true) ?? "";
      if (text.trim()) out.unshift(text);
    }
    return out.join("\n");
  }

  kill() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.flushTimer);
    try {
      this.pty.kill();
    } catch {}
    this.screen.dispose();
  }
}
