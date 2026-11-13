import { expect, it } from "vitest";
import { fuzzyScore } from "../src/renderer/fuzzy";

it("matches subsequences and ranks word starts higher", () => {
  expect(fuzzyScore("spr", "Split right")).toBeDefined();
  expect(fuzzyScore("xyz", "Split right")).toBeUndefined();
  expect(fuzzyScore("nt", "New tab")!).toBeGreaterThan(fuzzyScore("nt", "Go to tab 1") ?? -Infinity);
});
