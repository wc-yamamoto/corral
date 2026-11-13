// Everything a key or the palette can do. Ids are what keys.json binds.

import type { Action, State } from "../shared/model";
import { activeSpace, activeTab, neighbor, type Direction } from "../shared/tree";
import { corral } from "./bridge";
import { focusedTerminal, getUi, setFontSize, setUi } from "./store";
import { spaceLabel, tabLabel, attentionOrder } from "./labels";
import { terminals } from "./terminals";

export interface Command {
  id: string;
  title: string;
  run(): void;
}

export const act = (action: Action) => corral.send({ type: "action", action });

function core(): State | undefined {
  return getUi().core;
}

function cycle<T extends { id: string }>(items: T[], currentId: string, step: number) {
  const i = items.findIndex((x) => x.id === currentId);
  return items[(i + step + items.length) % items.length];
}

function focusDir(dir: Direction) {
  const f = focusedTerminal();
  if (!f) return;
  const target = neighbor(f.tab.root, f.pane.id, dir);
  if (target) act({ type: "pane.focus", paneId: target });
}

function gotoTab(index: number | "last") {
  const space = activeSpace(core()!);
  const tab = index === "last" ? space?.tabs.at(-1) : space?.tabs[index];
  if (tab) act({ type: "tab.activate", tabId: tab.id });
}

export function prompt(title: string, value: string, submit: (value: string) => void) {
  setUi({ prompt: { title, value, submit }, palette: false });
}

export const COMMANDS: Command[] = [
  { id: "palette.open", title: "Show commands", run: () => setUi({ palette: !getUi().palette }) },

  {
    id: "space.new",
    title: "New space",
    run: () => act({ type: "space.create", fromTerminalId: focusedTerminal()?.terminalId }),
  },
  {
    id: "space.rename",
    title: "Rename space",
    run: () => {
      const state = core();
      const space = state && activeSpace(state);
      if (space) prompt("Rename space", space.name ?? "", (name) => act({ type: "space.rename", spaceId: space.id, name }));
    },
  },
  {
    id: "space.close",
    title: "Close space",
    run: () => {
      const space = activeSpace(core()!);
      if (space) act({ type: "space.close", spaceId: space.id });
    },
  },
  {
    id: "space.next",
    title: "Next space",
    run: () => {
      const state = core()!;
      act({ type: "space.activate", spaceId: cycle(state.spaces, state.activeSpaceId, 1).id });
    },
  },
  {
    id: "space.prev",
    title: "Previous space",
    run: () => {
      const state = core()!;
      act({ type: "space.activate", spaceId: cycle(state.spaces, state.activeSpaceId, -1).id });
    },
  },

  {
    id: "tab.new",
    title: "New tab",
    run: () => {
      const space = activeSpace(core()!);
      if (space) act({ type: "tab.create", spaceId: space.id, fromTerminalId: focusedTerminal()?.terminalId });
    },
  },
  {
    id: "tab.rename",
    title: "Rename tab",
    run: () => {
      const tab = activeTab(activeSpace(core()!));
      if (tab) prompt("Rename tab", tab.name ?? "", (name) => act({ type: "tab.rename", tabId: tab.id, name }));
    },
  },
  {
    id: "tab.close",
    title: "Close tab",
    run: () => {
      const tab = activeTab(activeSpace(core()!));
      if (tab) act({ type: "tab.close", tabId: tab.id });
    },
  },
  {
    id: "tab.next",
    title: "Next tab",
    run: () => {
      const space = activeSpace(core()!);
      if (space) act({ type: "tab.activate", tabId: cycle(space.tabs, space.activeTabId, 1).id });
    },
  },
  {
    id: "tab.prev",
    title: "Previous tab",
    run: () => {
      const space = activeSpace(core()!);
      if (space) act({ type: "tab.activate", tabId: cycle(space.tabs, space.activeTabId, -1).id });
    },
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `tab.goto_${n}`, title: `Go to tab ${n}`, run: () => gotoTab(n - 1) })),
  { id: "tab.goto_last", title: "Go to last tab", run: () => gotoTab("last") },

  {
    id: "pane.split_right",
    title: "Split right",
    run: () => {
      const f = focusedTerminal();
      if (f) act({ type: "pane.split", paneId: f.pane.id, dir: "row" });
    },
  },
  {
    id: "pane.split_down",
    title: "Split down",
    run: () => {
      const f = focusedTerminal();
      if (f) act({ type: "pane.split", paneId: f.pane.id, dir: "column" });
    },
  },
  {
    id: "pane.close",
    title: "Close pane",
    run: () => {
      const f = focusedTerminal();
      if (f) act({ type: "pane.close", paneId: f.pane.id });
    },
  },
  {
    id: "pane.zoom",
    title: "Zoom pane (toggle)",
    run: () => {
      const f = focusedTerminal();
      if (f) act({ type: "pane.zoom", paneId: f.pane.id });
    },
  },
  { id: "pane.focus_left", title: "Focus pane left", run: () => focusDir("left") },
  { id: "pane.focus_right", title: "Focus pane right", run: () => focusDir("right") },
  { id: "pane.focus_up", title: "Focus pane above", run: () => focusDir("up") },
  { id: "pane.focus_down", title: "Focus pane below", run: () => focusDir("down") },

  {
    id: "agents.next_attention",
    title: "Go to next agent that needs you",
    run: () => {
      const state = core();
      if (!state) return;
      const current = focusedTerminal()?.terminalId;
      const waiting = attentionOrder(state).filter((t) => t.agent!.status === "blocked" || t.agent!.status === "done");
      const next = waiting.find((t) => t.id !== current) ?? waiting[0];
      if (next) act({ type: "terminal.reveal", terminalId: next.id });
    },
  },

  { id: "sidebar.toggle", title: "Toggle sidebar", run: () => setUi({ sidebar: !getUi().sidebar }) },
  {
    id: "terminal.clear",
    title: "Clear terminal",
    run: () => {
      const f = focusedTerminal();
      if (f) terminals.clear(f.terminalId);
    },
  },
  { id: "font.bigger", title: "Bigger text", run: () => setFontSize(getUi().fontSize + 1) },
  { id: "font.smaller", title: "Smaller text", run: () => setFontSize(getUi().fontSize - 1) },
  { id: "font.reset", title: "Reset text size", run: () => setFontSize(13) },
  { id: "window.new", title: "New window", run: () => corral.newWindow() },
  { id: "keys.open", title: "Open keys.json", run: () => void corral.openKeys() },
  {
    id: "core.restart",
    title: "Restart core (ends running programs, keeps the layout)",
    run: () => corral.send({ type: "shutdown" }),
  },
];

export const COMMAND_IDS = new Set(COMMANDS.map((c) => c.id));

export function runCommand(id: string) {
  if (!getUi().core && id !== "palette.open") return;
  COMMANDS.find((c) => c.id === id)?.run();
}

/** Palette entries beyond commands: jump to any space or tab. */
export function placeEntries(state: State): Command[] {
  return state.spaces.flatMap((space) => [
    {
      id: `space:${space.id}`,
      title: `Go to space: ${spaceLabel(state, space)}`,
      run: () => act({ type: "space.activate", spaceId: space.id }),
    },
    ...space.tabs.map((tab) => ({
      id: `tab:${tab.id}`,
      title: `Go to tab: ${spaceLabel(state, space)} › ${tabLabel(state, tab)}`,
      run: () => act({ type: "tab.activate", tabId: tab.id }),
    })),
  ]);
}
