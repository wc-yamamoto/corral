// The core's model: spaces, tabs, pane trees and the terminals in them.
// Windows send actions; the core applies them and broadcasts the new state.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { Action, AgentStatus, PaneNode, Space, State, Tab, TerminalInfo } from "../shared/model";
import { activeSpace, activeTab, findPane, locate, panes, removePane, setSizes, splitPane } from "../shared/tree";
import { statePath } from "../shared/paths";
import { Session } from "./session";
import { agentKind, nextAgent } from "./agents";
import { cwdsOf, foregroundByTty, programName, ttyName } from "./procs";

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

interface Persisted {
  version: 1;
  spaces: Space[];
  activeSpaceId: string;
  terminals: Record<string, { cwd: string; title?: string }>;
  nextTerminal: number;
}

const newId = (prefix: string) => `${prefix}${crypto.randomBytes(4).toString("hex")}`;

export interface CoreEvents {
  changed(state: State): void;
  output(terminalId: string, data: string): void;
}

export class Core {
  private state: State = { spaces: [], activeSpaceId: "", terminals: {} };
  private sessions = new Map<string, Session>();
  private nextTerminal = 1;
  private watched = new Set<string>();
  private saveTimer?: NodeJS.Timeout;
  private changeTimer?: NodeJS.Timeout;
  private scanTimer?: NodeJS.Timeout;
  private scans = 0;
  private titlesChanged = false;

  constructor(private readonly events: CoreEvents) {}

  start() {
    this.load();
    if (this.state.spaces.length === 0) this.createSpace(os.homedir());
    this.scanTimer = setInterval(() => void this.scan(), 1000);
  }

  snapshot(): State {
    return this.state;
  }

  session(id: string) {
    return this.sessions.get(id);
  }

  // ---- persistence ----

  private load() {
    let saved: Persisted;
    try {
      saved = JSON.parse(fs.readFileSync(statePath(), "utf8"));
      if (saved.version !== 1) return;
    } catch {
      return;
    }
    this.nextTerminal = saved.nextTerminal ?? 1;
    this.state.spaces = saved.spaces;
    this.state.activeSpaceId = saved.activeSpaceId;
    // After a reboot or a core restart, kept panes get fresh shells in their last folders.
    for (const space of saved.spaces) {
      for (const tab of space.tabs) {
        for (const pane of panes(tab.root)) {
          const cwd = saved.terminals[pane.terminalId]?.cwd ?? os.homedir();
          this.spawn(pane.terminalId, cwd);
        }
      }
    }
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    const data: Persisted = {
      version: 1,
      spaces: this.state.spaces,
      activeSpaceId: this.state.activeSpaceId,
      terminals: Object.fromEntries(
        Object.values(this.state.terminals).map((t) => [t.id, { cwd: t.cwd, title: t.title }]),
      ),
      nextTerminal: this.nextTerminal,
    };
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    const tmp = statePath() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, statePath());
  }

  private changed(persist = true) {
    if (persist) this.scheduleSave();
    this.titlesChanged = false;
    // Coalesce bursts (a scan touching many terminals) into one broadcast.
    if (this.changeTimer) return;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined;
      this.events.changed(this.state);
    }, 16);
  }

  // ---- terminals ----

  private spawn(id: string, cwd: string) {
    const session = new Session(id, cwd, DEFAULT_COLS, DEFAULT_ROWS, {
      output: (tid, data) => this.events.output(tid, data),
      title: (tid, title) => this.setTitle(tid, title),
      exit: (tid) => this.onExit(tid),
    });
    this.sessions.set(id, session);
    this.state.terminals[id] = { id, cwd, title: "", program: "" };
    return session;
  }

  private newTerminal(cwd: string) {
    const id = `t${this.nextTerminal++}`;
    this.spawn(id, cwd);
    return id;
  }

  private newPane(cwd: string): Extract<PaneNode, { kind: "pane" }> {
    return { kind: "pane", id: newId("p"), terminalId: this.newTerminal(cwd) };
  }

  private patchTerminal(id: string, patch: Partial<TerminalInfo>, persist: boolean) {
    const t = this.state.terminals[id];
    if (!t) return;
    this.state.terminals = { ...this.state.terminals, [id]: { ...t, ...patch } };
    this.changed(persist);
  }

  // Agents animate their titles many times a second, and only a tooltip shows them,
  // so title changes ride along with the next scan instead of each sending the whole state.
  private setTitle(id: string, title: string) {
    const t = this.state.terminals[id];
    if (!t || t.title === title) return;
    this.state.terminals = { ...this.state.terminals, [id]: { ...t, title } };
    this.titlesChanged = true;
  }

  private onExit(id: string) {
    const where = locate(this.state, id);
    if (where) this.closePane(where.pane.id);
  }

  private endTerminal(id: string) {
    this.sessions.get(id)?.kill();
    this.sessions.delete(id);
    const { [id]: _gone, ...rest } = this.state.terminals;
    this.state.terminals = rest;
  }

  /** The terminal a new one inherits its folder from: the given one, else the focused one. */
  private sourceTerminal(terminalId?: string) {
    if (terminalId && this.state.terminals[terminalId]) return terminalId;
    const tab = activeTab(activeSpace(this.state));
    return tab && findPane(tab.root, tab.focusedPaneId)?.terminalId;
  }

  private cwdFor(terminalId?: string) {
    const source = this.sourceTerminal(terminalId);
    return (source && this.state.terminals[source]?.cwd) || os.homedir();
  }

  /** Reads a shell's folder now rather than waiting for the next scan, so a `cd` just before a split counts. */
  private async refreshCwd(terminalId?: string) {
    const source = this.sourceTerminal(terminalId);
    const session = source && this.sessions.get(source);
    if (!session || session.closed) return;
    const cwd = (await cwdsOf([session.pid])).get(session.pid);
    if (cwd && cwd !== this.state.terminals[source]?.cwd) this.patchTerminal(source, { cwd }, true);
  }

  // ---- model edits ----

  private updateSpaces(fn: (space: Space) => Space) {
    this.state = { ...this.state, spaces: this.state.spaces.map(fn) };
  }

  private updateTab(tabId: string, fn: (tab: Tab) => Tab) {
    this.updateSpaces((s) =>
      s.tabs.some((t) => t.id === tabId) ? { ...s, tabs: s.tabs.map((t) => (t.id === tabId ? fn(t) : t)) } : s,
    );
  }

  private spaceOfTab(tabId: string) {
    return this.state.spaces.find((s) => s.tabs.some((t) => t.id === tabId));
  }

  private makeTab(cwd: string): Tab {
    const pane = this.newPane(cwd);
    return { id: newId("b"), root: pane, focusedPaneId: pane.id };
  }

  private createSpace(cwd: string) {
    const tab = this.makeTab(cwd);
    const space: Space = { id: newId("s"), tabs: [tab], activeTabId: tab.id };
    this.state = { ...this.state, spaces: [...this.state.spaces, space], activeSpaceId: space.id };
  }

  private closeSpace(spaceId: string) {
    const index = this.state.spaces.findIndex((s) => s.id === spaceId);
    if (index < 0) return;
    for (const tab of this.state.spaces[index].tabs) for (const p of panes(tab.root)) this.endTerminal(p.terminalId);
    const spaces = this.state.spaces.filter((s) => s.id !== spaceId);
    const next = spaces[Math.min(index, spaces.length - 1)];
    this.state = { ...this.state, spaces, activeSpaceId: next?.id ?? "" };
    if (spaces.length === 0) this.createSpace(os.homedir());
  }

  private closeTab(tabId: string) {
    const space = this.spaceOfTab(tabId);
    if (!space) return;
    if (space.tabs.length === 1) return this.closeSpace(space.id);
    const index = space.tabs.findIndex((t) => t.id === tabId);
    for (const p of panes(space.tabs[index].root)) this.endTerminal(p.terminalId);
    const tabs = space.tabs.filter((t) => t.id !== tabId);
    const activeTabId = space.activeTabId === tabId ? tabs[Math.min(index, tabs.length - 1)].id : space.activeTabId;
    this.updateSpaces((s) => (s.id === space.id ? { ...s, tabs, activeTabId } : s));
  }

  private closePane(paneId: string) {
    for (const space of this.state.spaces) {
      for (const tab of space.tabs) {
        const pane = findPane(tab.root, paneId);
        if (!pane) continue;
        const root = removePane(tab.root, paneId);
        if (!root) return this.closeTab(tab.id);
        this.endTerminal(pane.terminalId);
        const remaining = panes(root);
        const focusedPaneId = remaining.some((p) => p.id === tab.focusedPaneId) ? tab.focusedPaneId : remaining[0].id;
        const zoomedPaneId = tab.zoomedPaneId === paneId ? undefined : tab.zoomedPaneId;
        this.updateTab(tab.id, (t) => ({ ...t, root, focusedPaneId, zoomedPaneId }));
        return;
      }
    }
  }

  private activateTab(tabId: string) {
    const space = this.spaceOfTab(tabId);
    if (!space) return;
    this.updateSpaces((s) => (s.id === space.id ? { ...s, activeTabId: tabId } : s));
    this.state = { ...this.state, activeSpaceId: space.id };
  }

  private queue: Promise<void> = Promise.resolve();

  /** Applies actions one at a time, in the order they arrived. */
  apply(action: Action) {
    this.queue = this.queue
      .then(async () => {
        if (action.type === "space.create" || action.type === "tab.create") await this.refreshCwd(action.fromTerminalId);
        if (action.type === "pane.split") await this.refreshCwd(this.paneTerminal(action.paneId));
        this.applyNow(action);
      })
      .catch((err) => console.error("action failed", action, err));
  }

  private paneTerminal(paneId: string) {
    for (const space of this.state.spaces) for (const tab of space.tabs) {
      const pane = findPane(tab.root, paneId);
      if (pane) return pane.terminalId;
    }
    return undefined;
  }

  private applyNow(action: Action) {
    switch (action.type) {
      case "space.create":
        this.createSpace(this.cwdFor(action.fromTerminalId));
        break;
      case "space.rename":
        this.updateSpaces((s) => (s.id === action.spaceId ? { ...s, name: action.name.trim() || undefined } : s));
        break;
      case "space.close":
        this.closeSpace(action.spaceId);
        break;
      case "space.activate":
        if (this.state.spaces.some((s) => s.id === action.spaceId)) {
          this.state = { ...this.state, activeSpaceId: action.spaceId };
        }
        break;
      case "tab.create": {
        const tab = this.makeTab(this.cwdFor(action.fromTerminalId));
        this.updateSpaces((s) => (s.id === action.spaceId ? { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id } : s));
        this.state = { ...this.state, activeSpaceId: action.spaceId };
        break;
      }
      case "tab.rename":
        this.updateTab(action.tabId, (t) => ({ ...t, name: action.name.trim() || undefined }));
        break;
      case "tab.close":
        this.closeTab(action.tabId);
        break;
      case "tab.activate":
        this.activateTab(action.tabId);
        break;
      case "tab.move": {
        const space = this.spaceOfTab(action.tabId);
        if (!space) break;
        const tabs = space.tabs.filter((t) => t.id !== action.tabId);
        const moved = space.tabs.find((t) => t.id === action.tabId)!;
        tabs.splice(Math.max(0, Math.min(action.toIndex, tabs.length)), 0, moved);
        this.updateSpaces((s) => (s.id === space.id ? { ...s, tabs } : s));
        break;
      }
      case "pane.split": {
        for (const space of this.state.spaces) {
          for (const tab of space.tabs) {
            const pane = findPane(tab.root, action.paneId);
            if (!pane) continue;
            const added = this.newPane(this.cwdFor(pane.terminalId));
            const root = splitPane(tab.root, pane.id, action.dir, added, newId("x"));
            this.updateTab(tab.id, (t) => ({ ...t, root, focusedPaneId: added.id, zoomedPaneId: undefined }));
          }
        }
        break;
      }
      case "pane.close":
        this.closePane(action.paneId);
        break;
      case "pane.focus":
        for (const space of this.state.spaces) {
          for (const tab of space.tabs) {
            if (findPane(tab.root, action.paneId)) {
              this.updateTab(tab.id, (t) => ({
                ...t,
                focusedPaneId: action.paneId,
                zoomedPaneId: t.zoomedPaneId && t.zoomedPaneId !== action.paneId ? undefined : t.zoomedPaneId,
              }));
            }
          }
        }
        break;
      case "pane.zoom":
        for (const space of this.state.spaces) {
          for (const tab of space.tabs) {
            if (findPane(tab.root, action.paneId) && panes(tab.root).length > 1) {
              this.updateTab(tab.id, (t) => ({
                ...t,
                focusedPaneId: action.paneId,
                zoomedPaneId: t.zoomedPaneId === action.paneId ? undefined : action.paneId,
              }));
            }
          }
        }
        break;
      case "pane.resize":
        this.updateSpaces((s) => ({
          ...s,
          tabs: s.tabs.map((t) => ({ ...t, root: setSizes(t.root, action.splitId, action.sizes) })),
        }));
        break;
      case "terminal.reveal": {
        const where = locate(this.state, action.terminalId);
        if (!where) break;
        this.activateTab(where.tab.id);
        this.updateTab(where.tab.id, (t) => ({
          ...t,
          focusedPaneId: where.pane.id,
          zoomedPaneId: t.zoomedPaneId && t.zoomedPaneId !== where.pane.id ? undefined : t.zoomedPaneId,
        }));
        break;
      }
    }
    this.changed();
  }

  // ---- agents ----

  setWatched(ids: Set<string>) {
    this.watched = ids;
    let touched = false;
    for (const id of ids) {
      const t = this.state.terminals[id];
      if (t?.agent?.status === "done") {
        this.state.terminals = { ...this.state.terminals, [id]: { ...t, agent: { ...t.agent, status: "idle", since: Date.now() } } };
        touched = true;
      }
    }
    if (touched) this.changed(false);
  }

  report(terminalId: string, status: AgentStatus | "clear", kind?: string) {
    const t = this.state.terminals[terminalId];
    if (!t) throw new Error(`no terminal ${terminalId}`);
    if (status === "clear") {
      this.patchTerminal(terminalId, { agent: t.agent && { ...t.agent, reported: false } }, false);
      return;
    }
    const agentKindName = kind ?? t.agent?.kind ?? "agent";
    const effective = status === "done" && this.watched.has(terminalId) ? "idle" : status;
    this.patchTerminal(terminalId, { agent: { kind: agentKindName, status: effective, reported: true, since: Date.now() } }, false);
  }

  private async scan() {
    const fg = await foregroundByTty();
    const now = Date.now();
    const scanCwd = this.scans++ % 3 === 0;
    const cwds = scanCwd ? await cwdsOf([...this.sessions.values()].filter((s) => !s.closed).map((s) => s.pid)) : undefined;
    let next = this.state.terminals;
    let cwdChanged = false;
    for (const [id, session] of this.sessions) {
      const t = next[id];
      if (!t || session.closed) continue;
      const tty = ttyName(session.tty);
      const procs = (tty && fg.get(tty)) || [];
      const program = procs.length ? programName(procs[0]) : process.platform === "win32" ? session.pty.process : "";
      let kind: string | undefined;
      for (const args of procs) kind ??= agentKind(args, session.title);
      if (!kind && t.agent?.reported) kind = t.agent.kind;
      const agent = kind
        ? nextAgent(
            t.agent,
            kind,
            {
              screen: session.bottomText(),
              title: session.title,
              msSinceOutput: now - session.lastOutputAt,
              watched: this.watched.has(id),
            },
            now,
          )
        : undefined;
      const cwd = cwds?.get(session.pid) ?? t.cwd;
      if (cwd !== t.cwd) cwdChanged = true;
      if (program !== t.program || cwd !== t.cwd || JSON.stringify(agent) !== JSON.stringify(t.agent)) {
        next = { ...next, [id]: { ...t, program, cwd, agent } };
      }
    }
    if (next !== this.state.terminals) {
      this.state = { ...this.state, terminals: next };
      this.changed(cwdChanged);
    } else if (this.titlesChanged) {
      this.changed(false);
    }
  }

  shutdown() {
    clearInterval(this.scanTimer);
    this.saveNow();
    for (const s of this.sessions.values()) s.kill();
  }
}
