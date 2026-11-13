// Routes bound keys to commands before the terminal sees them.

import { defaultBindings, eventCombo, mergeBindings, type Bindings } from "../shared/keys";
import { corral } from "./bridge";
import { COMMAND_IDS, runCommand } from "./commands";
import { getUi, setUi, toast } from "./store";

const defaults = defaultBindings(corral.platform);
let bindings: Bindings = mergeBindings(defaults, {}, COMMAND_IDS).bindings;

export function getBindings() {
  return bindings;
}

/** command id → the first combo bound to it. */
export function comboFor(commandId: string) {
  return Object.keys(bindings).find((combo) => bindings[combo] === commandId);
}

export function startKeys() {
  corral.onKeys(({ bindings: user, error }) => {
    const merged = mergeBindings(defaults, user, COMMAND_IDS);
    bindings = merged.bindings;
    setUi({});
    const problems = [error, ...merged.problems.map((p) => `keys.json: ${p}`)].filter(Boolean);
    if (problems.length) toast(problems.join("\n"));
  });

  window.addEventListener(
    "keydown",
    (e) => {
      // Leave IME composition (Japanese, Chinese, ...) alone.
      if (e.isComposing || e.keyCode === 229) return;
      const combo = eventCombo(e);
      const id = combo && bindings[combo];
      if (!id) return;
      const ui = getUi();
      if (ui.prompt) return;
      e.preventDefault();
      e.stopPropagation();
      if (ui.palette && id !== "palette.open") setUi({ palette: false });
      runCommand(id);
    },
    true,
  );
}
