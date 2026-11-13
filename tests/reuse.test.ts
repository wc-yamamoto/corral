import { describe, expect, it } from "vitest";
import { reuse } from "../src/renderer/reuse";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("reuse", () => {
  const prev = {
    spaces: [{ id: "s1", tabs: [{ id: "b1", root: { kind: "pane", id: "p1", terminalId: "t1" } }] }],
    terminals: { t1: { id: "t1", cwd: "/a", agent: { status: "idle" } }, t2: { id: "t2", cwd: "/b" } },
  };

  it("returns the previous object when nothing changed", () => {
    expect(reuse(prev, clone(prev))).toBe(prev);
  });

  it("keeps unchanged parts and replaces changed ones", () => {
    const next = clone(prev);
    next.terminals.t1.agent.status = "working";
    const out = reuse(prev, next);
    expect(out).not.toBe(prev);
    expect(out).toEqual(next);
    expect(out.spaces).toBe(prev.spaces);
    expect(out.terminals.t2).toBe(prev.terminals.t2);
    expect(out.terminals.t1).not.toBe(prev.terminals.t1);
  });

  it("notices added and removed keys and items", () => {
    const added = clone(prev) as any;
    added.terminals.t3 = { id: "t3", cwd: "/c" };
    expect(reuse(prev, added)).toEqual(added);
    expect(reuse(prev, added).terminals).not.toBe(prev.terminals);

    const removed = clone(prev) as any;
    delete removed.terminals.t2;
    expect(reuse(prev, removed).terminals).toEqual({ t1: prev.terminals.t1 });
    expect(reuse(prev, removed).terminals.t1).toBe(prev.terminals.t1);

    const shorter = clone(prev);
    shorter.spaces = [];
    expect(reuse(prev, shorter).spaces).toEqual([]);
  });

  it("handles a first state and type changes", () => {
    expect(reuse(undefined, prev)).toBe(prev);
    expect(reuse({ a: [1] }, { a: { 0: 1 } })).toEqual({ a: { 0: 1 } });
  });
});
