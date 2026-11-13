import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import type { State } from "../shared/model";
import { locate } from "../shared/tree";
import { App } from "./App";
import { corral } from "./bridge";
import { act } from "./commands";
import { startKeys } from "./keys";
import { spaceLabel, tabLabel } from "./labels";
import { startStore, visibleTerminals } from "./store";

/** Tell the user when an agent they are not looking at needs them, and keep the dock badge current. */
function notifyAgents(prev: State | undefined, next: State) {
  const waiting = Object.values(next.terminals).filter((t) => t.agent?.status === "blocked" || t.agent?.status === "done");
  corral.setBadge(waiting.length);
  if (!prev) return;
  const watched = document.hasFocus() ? new Set(visibleTerminals(next)) : new Set<string>();
  for (const t of waiting) {
    const before = prev.terminals[t.id]?.agent?.status;
    if (before === t.agent!.status || watched.has(t.id)) continue;
    const where = locate(next, t.id);
    const title = `${t.agent!.kind} ${t.agent!.status === "blocked" ? "needs you" : "is done"}`;
    const body = where ? `${spaceLabel(next, where.space)} › ${tabLabel(next, where.tab)}` : t.cwd;
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => {
      window.focus();
      act({ type: "terminal.reveal", terminalId: t.id });
    };
  }
}

// Files dropped on the window do nothing (the main process also blocks the navigation they would cause).
for (const type of ["dragover", "drop"] as const) {
  document.addEventListener(type, (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
}

startStore(notifyAgents);
startKeys();
createRoot(document.getElementById("root")!).render(<App />);
