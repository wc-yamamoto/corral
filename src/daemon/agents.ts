// Recognizes coding agents and guesses their status from what the terminal shows.
// Agents that run `corral report` (e.g. from hooks) override the guess.

import type { AgentInfo, AgentStatus } from "../shared/model";

const KNOWN_AGENTS: Record<string, string> = {
  claude: "claude",
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  aider: "aider",
  opencode: "opencode",
  "cursor-agent": "cursor",
  copilot: "copilot",
  amp: "amp",
  kiro: "kiro",
  "kiro-cli": "kiro",
  kimi: "kimi",
  goose: "goose",
  crush: "crush",
  qwen: "qwen",
  droid: "droid",
};

const SHELLS = new Set(["zsh", "bash", "fish", "sh", "dash", "nu", "pwsh", "login"]);

/** The agent a foreground command line belongs to, if any. Looks past `node`, `bun`, `npx` and the like. */
export function agentKind(args: string, title = ""): string | undefined {
  const words = args.trim().split(/\s+/).slice(0, 3);
  const bases = words.map((w) => w.slice(w.lastIndexOf("/") + 1).replace(/^-/, "").replace(/\.(js|mjs|cjs|exe)$/, ""));
  for (const base of bases) if (KNOWN_AGENTS[base]) return KNOWN_AGENTS[base];
  // A title outlives its program, so it only counts while something other than a bare shell runs.
  const bareShell = SHELLS.has(bases[0]) && words.slice(1).every((w) => w.startsWith("-"));
  if (!bareShell && /claude code/i.test(title)) return "claude";
  return undefined;
}

const BLOCKED = [
  /do you want to/i,
  /would you like to/i,
  /❯\s*1\.\s*yes/i,
  /\((y\/n)\)|\[y\/n\]/i,
  /press enter to (continue|confirm)/i,
  /waiting for (your )?(input|approval|permission)/i,
  /(approve|allow) (this|these|command|edit|once)/i,
];

const WORKING = [/esc to (interrupt|cancel)/i, /ctrl\+c to (interrupt|cancel)/i];

// Claude Code and others animate a spinner in the title while busy.
const TITLE_SPINNER = /^[⠀-⣿✶✻✽✢✳·*]\s/;
const TITLE_IDLE = /^✳\s/;

export interface Signals {
  /** Bottom lines of the visible screen. */
  screen: string;
  title: string;
  msSinceOutput: number;
  /** A connected window shows this terminal and has focus. */
  watched: boolean;
}

export function guessStatus(prev: AgentStatus | undefined, s: Signals): AgentStatus {
  if (BLOCKED.some((re) => re.test(s.screen))) return "blocked";
  const spinning = TITLE_SPINNER.test(s.title) && !TITLE_IDLE.test(s.title);
  const busyScreen = WORKING.some((re) => re.test(s.screen));
  if (busyScreen || (spinning && s.msSinceOutput < 3000)) return "working";
  if (prev === "working" && s.msSinceOutput < 1500) return "working";
  return settle(prev, s.watched);
}

/** What a quiet agent becomes: a run nobody watched finish is done until someone looks. */
export function settle(prev: AgentStatus | undefined, watched: boolean): AgentStatus {
  if (watched) return "idle";
  if (prev === "working" || prev === "done") return "done";
  return "idle";
}

export function nextAgent(prev: AgentInfo | undefined, kind: string, s: Signals, now: number): AgentInfo {
  let status: AgentStatus;
  let reported = false;
  if (prev?.reported) {
    reported = true;
    status = prev.status === "done" && s.watched ? "idle" : prev.status;
  } else {
    status = guessStatus(prev?.status, s);
  }
  if (prev && prev.status === status && prev.kind === kind) return { ...prev, reported };
  return { kind, status, reported, since: now };
}
