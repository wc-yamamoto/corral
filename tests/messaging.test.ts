import { describe, expect, it } from "vitest";
import { Terminal } from "@xterm/headless";
import { lastLines, pasteData } from "../src/daemon/screen";
import { checkWait, type Waiter } from "../src/daemon/wait";
import type { TerminalInfo } from "../src/shared/model";

const write = (term: Terminal, data: string) => new Promise<void>((resolve) => term.write(data, resolve));

describe("lastLines", () => {
  it("returns the last lines, skipping blank rows below them", async () => {
    const term = new Terminal({ cols: 20, rows: 5, allowProposedApi: true });
    await write(term, Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\r\n"));
    expect(lastLines(term, 3)).toBe("line 10\nline 11\nline 12");
    expect(lastLines(term, 100).split("\n")).toHaveLength(12);
  });

  it("joins wrapped rows into one line", async () => {
    const term = new Terminal({ cols: 10, rows: 5, allowProposedApi: true });
    await write(term, "first\r\n" + "x".repeat(25) + "\r\nlast");
    expect(lastLines(term, 2)).toBe("x".repeat(25) + "\nlast");
  });
});

describe("pasteData", () => {
  it("brackets a paste when the program asked for it", () => {
    expect(pasteData("fix it\nnow", true)).toBe("\x1b[200~fix it\nnow\x1b[201~");
  });

  it("types into a plain shell with returns", () => {
    expect(pasteData("a\nb", false)).toBe("a\rb");
  });

  it("drops paste markers inside the text so it cannot end the paste early", () => {
    expect(pasteData("a\x1b[201~rm -rf", true)).toBe("\x1b[200~arm -rf\x1b[201~");
  });
});

describe("checkWait", () => {
  const agent = (status: "working" | "done" | "idle" | "blocked", since: number): TerminalInfo => ({
    id: "t1",
    cwd: "/",
    title: "",
    program: "claude",
    agent: { kind: "claude", status, reported: false, since },
  });
  const waiter = (started: boolean): Waiter => ({
    terminalId: "t1",
    started,
    sinceAtStart: 100,
    startDeadline: 1_000,
    deadline: 10_000,
  });

  it("answers at once for an agent that is not working", () => {
    expect(checkWait(waiter(true), agent("idle", 100), 0)).toEqual({ reason: "stopped", status: "idle" });
  });

  it("keeps waiting while working, then reports the new status", () => {
    const w = waiter(true);
    expect(checkWait(w, agent("working", 100), 500)).toBeUndefined();
    expect(checkWait(w, agent("blocked", 600), 700)).toEqual({ reason: "stopped", status: "blocked" });
  });

  it("after a send, waits for the work to start", () => {
    const w = waiter(false);
    expect(checkWait(w, agent("idle", 100), 500)).toBeUndefined();
    expect(checkWait(w, agent("working", 600), 700)).toBeUndefined();
    expect(w.started).toBe(true);
    expect(checkWait(w, agent("done", 900), 2_000)).toEqual({ reason: "stopped", status: "done" });
  });

  it("counts a run that finished between scans as started", () => {
    expect(checkWait(waiter(false), agent("done", 300), 500)).toEqual({ reason: "stopped", status: "done" });
  });

  it("gives up when the work never starts, or runs past the deadline", () => {
    expect(checkWait(waiter(false), agent("idle", 100), 1_000)).toEqual({ reason: "not_started", status: "idle" });
    expect(checkWait(waiter(true), agent("working", 100), 10_000)).toEqual({ reason: "timeout", status: "working" });
  });

  it("reports a terminal that is gone", () => {
    expect(checkWait(waiter(true), undefined, 0)).toEqual({ reason: "exited" });
  });
});
