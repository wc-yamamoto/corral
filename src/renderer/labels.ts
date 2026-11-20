// What the window calls things that the user has not named.

import type { AgentStatus, Space, State, Tab, TerminalInfo } from "../shared/model";
import { findPane, folderName, panes } from "../shared/tree";

const SHELLS = new Set(["zsh", "bash", "fish", "sh", "dash", "nu", "pwsh", "powershell", "cmd", "login", ""]);

/** An unnamed space follows its first terminal's folder. */
export function spaceLabel(state: State, space: Space) {
  if (space.name) return space.name;
  const first = space.tabs[0] && panes(space.tabs[0].root)[0];
  const cwd = first && state.terminals[first.terminalId]?.cwd;
  return cwd ? folderName(cwd) : "space";
}

export function terminalLabel(t: TerminalInfo | undefined) {
  if (!t) return "terminal";
  if (t.agent) return t.agent.kind;
  if (!SHELLS.has(t.program)) return t.program;
  return folderName(t.cwd);
}

/** An unnamed tab is labelled from its focused terminal. */
export function tabLabel(state: State, tab: Tab) {
  if (tab.name) return tab.name;
  const pane = findPane(tab.root, tab.focusedPaneId) ?? panes(tab.root)[0];
  return terminalLabel(pane && state.terminals[pane.terminalId]);
}

// Claude Code and others name the task in the title, behind a spinner or ✳.
const TITLE_TASK = /^[⠀-⣿✶✻✽✢✳·*]\s+(.+)$/;

/** The task an agent's title names, if it names one. */
export function titleTask(title: string) {
  const task = title.match(TITLE_TASK)?.[1].trim();
  return task && !/^claude code$/i.test(task) ? task : undefined;
}

const RANK: Record<AgentStatus, number> = { blocked: 0, done: 1, working: 2, idle: 3 };

/** Agents, the ones that need you first. */
export function attentionOrder(state: State): TerminalInfo[] {
  return Object.values(state.terminals)
    .filter((t) => t.agent)
    .sort((a, b) => RANK[a.agent!.status] - RANK[b.agent!.status] || a.agent!.since - b.agent!.since);
}

/** The most urgent agent status among a set of terminals. */
export function worstStatus(state: State, terminalIds: string[]): AgentStatus | undefined {
  let worst: AgentStatus | undefined;
  for (const id of terminalIds) {
    const s = state.terminals[id]?.agent?.status;
    if (s && (!worst || RANK[s] < RANK[worst])) worst = s;
  }
  return worst;
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: "Working",
  blocked: "Blocked",
  done: "Done",
  idle: "Idle",
};
