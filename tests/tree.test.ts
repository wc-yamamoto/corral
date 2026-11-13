import { describe, expect, it } from "vitest";
import type { PaneNode } from "../src/shared/model";
import { neighbor, panes, removePane, setSizes, splitPane } from "../src/shared/tree";

const pane = (id: string): PaneNode => ({ kind: "pane", id, terminalId: `t-${id}` });

describe("pane tree", () => {
  it("splits a lone pane into two halves", () => {
    const root = splitPane(pane("a"), "a", "row", pane("b"), "x");
    expect(root).toMatchObject({ kind: "split", dir: "row", sizes: [0.5, 0.5] });
    expect(panes(root).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("adds a sibling when splitting in the same direction, sharing the old pane's room", () => {
    let root = splitPane(pane("a"), "a", "row", pane("b"), "x");
    root = splitPane(root, "b", "row", pane("c"), "y");
    expect(root.kind === "split" && root.sizes).toEqual([0.5, 0.25, 0.25]);
    expect(panes(root).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("nests a split when the direction differs", () => {
    let root = splitPane(pane("a"), "a", "row", pane("b"), "x");
    root = splitPane(root, "b", "column", pane("c"), "y");
    expect(root.kind === "split" && root.children[1]).toMatchObject({ kind: "split", dir: "column" });
  });

  it("collapses a split left with one child and renormalizes sizes", () => {
    let root = splitPane(pane("a"), "a", "row", pane("b"), "x");
    root = splitPane(root, "b", "row", pane("c"), "y");
    const without = removePane(root, "a")!;
    expect(without.kind === "split" && without.sizes).toEqual([0.5, 0.5]);
    expect(removePane(removePane(without, "b")!, "c")).toBeUndefined();
    expect(removePane(without, "b")).toMatchObject({ kind: "pane", id: "c" });
  });

  it("clamps resized panes so none vanishes", () => {
    const root = setSizes(splitPane(pane("a"), "a", "row", pane("b"), "x"), "x", [1, 0]);
    const sizes = root.kind === "split" ? root.sizes : [];
    expect(sizes[1]).toBeGreaterThan(0.04);
    expect(sizes[0] + sizes[1]).toBeCloseTo(1);
  });

  it("finds the neighbor in each direction", () => {
    // a | (b over c)
    let root = splitPane(pane("a"), "a", "row", pane("b"), "x");
    root = splitPane(root, "b", "column", pane("c"), "y");
    expect(neighbor(root, "a", "right")).toBe("b");
    expect(neighbor(root, "c", "left")).toBe("a");
    expect(neighbor(root, "b", "down")).toBe("c");
    expect(neighbor(root, "c", "up")).toBe("b");
    expect(neighbor(root, "a", "left")).toBeUndefined();
  });
});
