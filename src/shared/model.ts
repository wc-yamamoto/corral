// The model the core owns and every connected window renders.

export type SplitDir = "row" | "column";

export type PaneNode =
  | { kind: "pane"; id: string; terminalId: string }
  | { kind: "split"; id: string; dir: SplitDir; children: PaneNode[]; sizes: number[] };

export interface Tab {
  id: string;
  /** Set when the user names the tab; otherwise the window labels it from its terminal. */
  name?: string;
  root: PaneNode;
  focusedPaneId: string;
  zoomedPaneId?: string;
}

export interface Space {
  id: string;
  /** Set when the user names the space; otherwise it follows its first terminal's folder. */
  name?: string;
  tabs: Tab[];
  activeTabId: string;
}

export type AgentStatus = "working" | "blocked" | "done" | "idle";

export interface AgentInfo {
  kind: string;
  status: AgentStatus;
  /** Set when the status came from `corral report` rather than from watching the screen. */
  reported: boolean;
  since: number;
  /** What the agent said along with its reported status, e.g. what it finished. Cleared when the status changes. */
  message?: string;
}

export interface TerminalInfo {
  id: string;
  cwd: string;
  title: string;
  /** Foreground program name, e.g. "zsh", "vim", "claude". */
  program: string;
  agent?: AgentInfo;
}

export interface State {
  spaces: Space[];
  activeSpaceId: string;
  terminals: Record<string, TerminalInfo>;
}

export type Action =
  | { type: "space.create"; fromTerminalId?: string }
  | { type: "space.rename"; spaceId: string; name: string }
  | { type: "space.close"; spaceId: string }
  | { type: "space.activate"; spaceId: string }
  | { type: "tab.create"; spaceId: string; fromTerminalId?: string }
  | { type: "tab.rename"; tabId: string; name: string }
  | { type: "tab.close"; tabId: string }
  | { type: "tab.activate"; tabId: string }
  | { type: "tab.move"; tabId: string; toIndex: number }
  | { type: "pane.split"; paneId: string; dir: SplitDir }
  | { type: "pane.close"; paneId: string }
  | { type: "pane.focus"; paneId: string }
  | { type: "pane.zoom"; paneId: string }
  | { type: "pane.resize"; splitId: string; sizes: number[] }
  | { type: "terminal.reveal"; terminalId: string };

/** Window or CLI → core. Newline-delimited JSON over the core socket. */
export type ClientMessage =
  | { type: "hello"; role: "window" | "cli" }
  | { type: "action"; action: Action }
  | { type: "input"; terminalId: string; data: string }
  | { type: "resize"; terminalId: string; cols: number; rows: number }
  | { type: "attach"; terminalIds: string[] }
  | { type: "view"; visible: string[]; focused: boolean }
  | { type: "report"; terminalId: string; status: AgentStatus | "clear"; kind?: string; message?: string }
  | { type: "send"; terminalId: string; text: string; submit: boolean }
  | { type: "read"; terminalId: string; lines: number }
  | { type: "wait"; terminalId: string; timeoutMs: number; startMs: number }
  | { type: "list" }
  | { type: "shutdown" };

/** Core → window or CLI. */
export type ServerMessage =
  | { type: "welcome"; version: string; pid: number }
  | { type: "state"; state: State }
  | { type: "snapshot"; terminalId: string; data: string }
  | { type: "output"; terminalId: string; data: string }
  | { type: "error"; message: string }
  | { type: "text"; text: string }
  | { type: "waited"; terminalId: string; reason: "stopped" | "timeout" | "not_started" | "exited"; status?: AgentStatus; kind?: string }
  | { type: "ok" };
