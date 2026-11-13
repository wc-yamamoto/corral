// Key bindings: defaults per platform, merged with the user's keys.json.

export type Bindings = Record<string, string>;

const MAC: Bindings = {
  "cmd+shift+p": "palette.open",
  "cmd+t": "tab.new",
  "cmd+w": "pane.close",
  "cmd+shift+w": "tab.close",
  "cmd+d": "pane.split_right",
  "cmd+shift+d": "pane.split_down",
  "cmd+alt+left": "pane.focus_left",
  "cmd+alt+right": "pane.focus_right",
  "cmd+alt+up": "pane.focus_up",
  "cmd+alt+down": "pane.focus_down",
  "cmd+shift+enter": "pane.zoom",
  "cmd+shift+]": "tab.next",
  "cmd+shift+[": "tab.prev",
  "cmd+1": "tab.goto_1",
  "cmd+2": "tab.goto_2",
  "cmd+3": "tab.goto_3",
  "cmd+4": "tab.goto_4",
  "cmd+5": "tab.goto_5",
  "cmd+6": "tab.goto_6",
  "cmd+7": "tab.goto_7",
  "cmd+8": "tab.goto_8",
  "cmd+9": "tab.goto_last",
  "cmd+shift+n": "space.new",
  "cmd+ctrl+]": "space.next",
  "cmd+ctrl+[": "space.prev",
  "cmd+shift+a": "agents.next_attention",
  "cmd+b": "sidebar.toggle",
  "cmd+k": "terminal.clear",
  "cmd+=": "font.bigger",
  "cmd+-": "font.smaller",
  "cmd+0": "font.reset",
  "cmd+n": "window.new",
  "cmd+,": "keys.open",
};

/** Linux and Windows: ctrl+shift, so plain ctrl stays with the shell. */
const OTHER: Bindings = {
  "ctrl+shift+p": "palette.open",
  "ctrl+shift+t": "tab.new",
  "ctrl+shift+w": "pane.close",
  "ctrl+alt+w": "tab.close",
  "ctrl+shift+d": "pane.split_right",
  "ctrl+alt+d": "pane.split_down",
  "ctrl+alt+left": "pane.focus_left",
  "ctrl+alt+right": "pane.focus_right",
  "ctrl+alt+up": "pane.focus_up",
  "ctrl+alt+down": "pane.focus_down",
  "ctrl+shift+enter": "pane.zoom",
  "ctrl+shift+]": "tab.next",
  "ctrl+shift+[": "tab.prev",
  "alt+1": "tab.goto_1",
  "alt+2": "tab.goto_2",
  "alt+3": "tab.goto_3",
  "alt+4": "tab.goto_4",
  "alt+5": "tab.goto_5",
  "alt+6": "tab.goto_6",
  "alt+7": "tab.goto_7",
  "alt+8": "tab.goto_8",
  "alt+9": "tab.goto_last",
  "ctrl+shift+n": "space.new",
  "ctrl+alt+]": "space.next",
  "ctrl+alt+[": "space.prev",
  "ctrl+shift+a": "agents.next_attention",
  "ctrl+shift+b": "sidebar.toggle",
  "ctrl+shift+k": "terminal.clear",
  "ctrl+=": "font.bigger",
  "ctrl+-": "font.smaller",
  "ctrl+0": "font.reset",
  "ctrl+shift+m": "window.new",
  "ctrl+,": "keys.open",
};

export function defaultBindings(platform: string): Bindings {
  return { ...(platform === "darwin" ? MAC : OTHER) };
}

const ORDER = ["cmd", "ctrl", "alt", "shift"];
const ALIASES: Record<string, string> = {
  command: "cmd",
  meta: "cmd",
  super: "cmd",
  control: "ctrl",
  option: "alt",
  opt: "alt",
  return: "enter",
  esc: "escape",
  plus: "=",
};

/** "Shift+Cmd+P" → "cmd+shift+p". Returns undefined for a combo with no key. */
export function normalizeCombo(combo: string): string | undefined {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ALIASES[p] ?? p);
  // "cmd++" splits to an empty last part; treat it as "=" like most terminals.
  if (combo.endsWith("++")) parts.push("=");
  const mods = ORDER.filter((m) => parts.includes(m));
  const keys = parts.filter((p) => !ORDER.includes(p));
  if (keys.length !== 1) return undefined;
  return [...mods, keys[0]].join("+");
}

export function mergeBindings(
  defaults: Bindings,
  user: Record<string, string | null>,
  known: Set<string>,
): { bindings: Bindings; problems: string[] } {
  const bindings: Bindings = {};
  const problems: string[] = [];
  for (const [combo, command] of Object.entries(defaults)) bindings[normalizeCombo(combo)!] = command;
  for (const [combo, command] of Object.entries(user)) {
    const key = normalizeCombo(combo);
    if (!key) {
      problems.push(`bad key "${combo}"`);
      continue;
    }
    if (command === null) delete bindings[key];
    else if (!known.has(command)) problems.push(`unknown command "${command}"`);
    else bindings[key] = command;
  }
  return { bindings, problems };
}

const CODE_KEYS: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "=",
  Minus: "-",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Enter: "enter",
  NumpadEnter: "enter",
  Escape: "escape",
  Tab: "tab",
  Space: "space",
  Backspace: "backspace",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};

/** Physical key → combo, so shift+] reads as "shift+]" rather than "}". */
export function eventCombo(e: { code: string; key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }) {
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F[0-9]{1,2}$/.test(e.code)) key = e.code.toLowerCase();
  else key = CODE_KEYS[e.code];
  if (!key) return undefined;
  const mods = [e.metaKey && "cmd", e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift"].filter(Boolean);
  return [...mods, key].join("+");
}

/** "cmd+shift+p" → "⌘⇧P" on macOS, "Ctrl+Shift+P" elsewhere. */
export function displayCombo(combo: string, platform: string) {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const keyLabel = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
  if (platform === "darwin") {
    const sym: Record<string, string> = { cmd: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" };
    const arrows: Record<string, string> = { left: "←", right: "→", up: "↑", down: "↓", enter: "↩" };
    return parts.map((p) => sym[p]).join("") + (arrows[key] ?? keyLabel);
  }
  const names: Record<string, string> = { cmd: "Super", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };
  return [...parts.map((p) => names[p]), keyLabel].join("+");
}
