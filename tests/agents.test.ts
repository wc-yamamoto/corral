import { describe, expect, it } from "vitest";
import { agentKind, guessStatus, nextAgent, type Signals } from "../src/daemon/agents";

const quiet: Signals = { screen: "", title: "", msSinceOutput: 60_000, watched: false };

describe("agent detection", () => {
  it("recognizes agents behind runtimes and paths", () => {
    expect(agentKind("claude")).toBe("claude");
    expect(agentKind("node /usr/local/lib/node_modules/@openai/codex/bin/codex.js")).toBe("codex");
    expect(agentKind("/opt/homebrew/bin/gemini --yolo")).toBe("gemini");
    expect(agentKind("vim notes.md")).toBeUndefined();
  });

  it("uses the title only while a program other than a bare shell runs", () => {
    expect(agentKind("node cli.js", "✳ Claude Code")).toBe("claude");
    expect(agentKind("/bin/zsh -l", "✳ Claude Code")).toBeUndefined();
    expect(agentKind("-zsh", "✳ Claude Code")).toBeUndefined();
  });

  it("reads working, blocked and settled states from the screen", () => {
    expect(guessStatus(undefined, { ...quiet, screen: "✻ Thinking… (esc to interrupt)", msSinceOutput: 100 })).toBe("working");
    expect(guessStatus("working", { ...quiet, screen: "Do you want to proceed?\n❯ 1. Yes" })).toBe("blocked");
    expect(guessStatus("working", quiet)).toBe("done");
    expect(guessStatus("working", { ...quiet, watched: true })).toBe("idle");
    expect(guessStatus("blocked", quiet)).toBe("idle");
  });

  it("keeps a done agent done until someone looks", () => {
    expect(guessStatus("done", quiet)).toBe("done");
    expect(guessStatus("done", { ...quiet, watched: true })).toBe("idle");
  });

  it("prefers a reported status and only moves done to idle when watched", () => {
    const reported = { kind: "claude", status: "done" as const, reported: true, since: 1 };
    expect(nextAgent(reported, "claude", { ...quiet, screen: "esc to interrupt" }, 2).status).toBe("done");
    expect(nextAgent(reported, "claude", { ...quiet, watched: true }, 2)).toMatchObject({ status: "idle", since: 2 });
  });
});
