import { describe, expect, it } from "vitest";
import { defaultBindings, displayCombo, eventCombo, mergeBindings, normalizeCombo } from "../src/shared/keys";

const key = (code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  code,
  key: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("keys", () => {
  it("normalizes modifier order and aliases", () => {
    expect(normalizeCombo("Shift+Cmd+P")).toBe("cmd+shift+p");
    expect(normalizeCombo("option+command+Left")).toBe("cmd+alt+left");
    expect(normalizeCombo("cmd+shift")).toBeUndefined();
  });

  it("reads physical keys so shifted symbols stay stable", () => {
    expect(eventCombo(key("BracketRight", { metaKey: true, shiftKey: true }))).toBe("cmd+shift+]");
    expect(eventCombo(key("KeyT", { metaKey: true }))).toBe("cmd+t");
    expect(eventCombo(key("ShiftLeft", { shiftKey: true }))).toBeUndefined();
  });

  it("lets keys.json add, replace and unbind", () => {
    const known = new Set(["tab.new", "pane.close", "palette.open"]);
    const { bindings, problems } = mergeBindings(
      { "cmd+t": "tab.new", "cmd+w": "pane.close" },
      { "Cmd+Shift+T": "tab.new", "cmd+w": null, "cmd+x": "nope", "cmd+": "tab.new" },
      known,
    );
    expect(bindings).toEqual({ "cmd+t": "tab.new", "cmd+shift+t": "tab.new" });
    expect(problems).toEqual(['unknown command "nope"', 'bad key "cmd+"']);
  });

  it("gives every platform a palette key and no duplicate combos", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      const bindings = defaultBindings(platform);
      expect(Object.values(bindings)).toContain("palette.open");
      const normalized = Object.keys(bindings).map(normalizeCombo);
      expect(new Set(normalized).size).toBe(normalized.length);
    }
  });

  it("displays combos per platform", () => {
    expect(displayCombo("cmd+shift+p", "darwin")).toBe("⌘⇧P");
    expect(displayCombo("ctrl+shift+p", "linux")).toBe("Ctrl+Shift+P");
  });
});
