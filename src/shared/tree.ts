// Pure helpers over the pane tree, shared by the core and the window.

import type { PaneNode, SplitDir, Space, State, Tab } from "./model";

export function panes(node: PaneNode): Extract<PaneNode, { kind: "pane" }>[] {
  return node.kind === "pane" ? [node] : node.children.flatMap(panes);
}

export function findPane(node: PaneNode, paneId: string) {
  return panes(node).find((p) => p.id === paneId);
}

export function findSplit(node: PaneNode, splitId: string): Extract<PaneNode, { kind: "split" }> | undefined {
  if (node.kind === "pane") return undefined;
  if (node.id === splitId) return node;
  for (const child of node.children) {
    const found = findSplit(child, splitId);
    if (found) return found;
  }
  return undefined;
}

/** Replaces `paneId` with a split holding the old pane and `added` after it. */
export function splitPane(root: PaneNode, paneId: string, dir: SplitDir, added: PaneNode, splitId: string): PaneNode {
  if (root.kind === "pane") {
    if (root.id !== paneId) return root;
    return { kind: "split", id: splitId, dir, children: [root, added], sizes: [0.5, 0.5] };
  }
  const index = root.children.findIndex((c) => c.kind === "pane" && c.id === paneId);
  if (index >= 0 && root.dir === dir) {
    // Same direction: add a sibling and share the old pane's room with it.
    const children = [...root.children];
    children.splice(index + 1, 0, added);
    const sizes = [...root.sizes];
    const half = sizes[index] / 2;
    sizes.splice(index, 1, half, half);
    return { ...root, children, sizes };
  }
  return { ...root, children: root.children.map((c) => splitPane(c, paneId, dir, added, splitId)) };
}

/** Removes a pane; returns undefined when it was the last one. Single-child splits collapse. */
export function removePane(root: PaneNode, paneId: string): PaneNode | undefined {
  if (root.kind === "pane") return root.id === paneId ? undefined : root;
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  root.children.forEach((child, i) => {
    const next = removePane(child, paneId);
    if (next) {
      children.push(next);
      sizes.push(root.sizes[i]);
    }
  });
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  const total = sizes.reduce((a, b) => a + b, 0);
  return { ...root, children, sizes: sizes.map((s) => s / total) };
}

export function setSizes(root: PaneNode, splitId: string, sizes: number[]): PaneNode {
  if (root.kind === "pane") return root;
  if (root.id === splitId) {
    if (sizes.length !== root.children.length) return root;
    const clamped = sizes.map((s) => Math.max(0.05, s));
    const total = clamped.reduce((a, b) => a + b, 0);
    return { ...root, sizes: clamped.map((s) => s / total) };
  }
  return { ...root, children: root.children.map((c) => setSizes(c, splitId, sizes)) };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each pane's place in a unit square, for directional focus. */
export function paneRects(node: PaneNode, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }, out = new Map<string, Rect>()) {
  if (node.kind === "pane") {
    out.set(node.id, rect);
    return out;
  }
  let offset = 0;
  node.children.forEach((child, i) => {
    const share = node.sizes[i];
    const childRect =
      node.dir === "row"
        ? { x: rect.x + offset * rect.w, y: rect.y, w: share * rect.w, h: rect.h }
        : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: share * rect.h };
    paneRects(child, childRect, out);
    offset += share;
  });
  return out;
}

export type Direction = "left" | "right" | "up" | "down";

export function neighbor(root: PaneNode, paneId: string, dir: Direction): string | undefined {
  const rects = paneRects(root);
  const from = rects.get(paneId);
  if (!from) return undefined;
  const eps = 1e-6;
  let best: { id: string; dist: number; overlap: number } | undefined;
  for (const [id, r] of rects) {
    if (id === paneId) continue;
    let dist: number;
    let overlap: number;
    if (dir === "left" || dir === "right") {
      dist = dir === "left" ? from.x - (r.x + r.w) : r.x - (from.x + from.w);
      overlap = Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y);
    } else {
      dist = dir === "up" ? from.y - (r.y + r.h) : r.y - (from.y + from.h);
      overlap = Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x);
    }
    if (dist < -eps || overlap <= eps) continue;
    if (!best || dist < best.dist - eps || (Math.abs(dist - best.dist) <= eps && overlap > best.overlap)) {
      best = { id, dist, overlap };
    }
  }
  return best?.id;
}

export function activeSpace(state: State): Space | undefined {
  return state.spaces.find((s) => s.id === state.activeSpaceId) ?? state.spaces[0];
}

export function activeTab(space: Space | undefined): Tab | undefined {
  return space?.tabs.find((t) => t.id === space.activeTabId) ?? space?.tabs[0];
}

/** Where a terminal lives, for the agents sidebar and reveal. */
export function locate(state: State, terminalId: string) {
  for (const space of state.spaces) {
    for (const tab of space.tabs) {
      const pane = panes(tab.root).find((p) => p.terminalId === terminalId);
      if (pane) return { space, tab, pane };
    }
  }
  return undefined;
}

export function folderName(cwd: string) {
  const trimmed = cwd.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "/";
}
