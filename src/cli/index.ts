// `corral` command: talk to a running core from any shell.

import net from "node:net";
import type { AgentStatus, ClientMessage, ServerMessage, State } from "../shared/model";
import { folderName, panes } from "../shared/tree";
import { socketPath } from "../shared/paths";
import { onMessages, send } from "../shared/wire";

const USAGE = `usage: corral <command>

  ls                         list spaces, tabs and terminals
  agents                     list agents and their status
  send <t> <text>            type text into terminal t and press Enter
       [--no-enter]          type only; leave it unsent
       [--wait]              then wait until its agent stops working
                             with no text, reads it from stdin
  read <t> [--lines N]       print the last N lines of t (default 50)
  wait <t> [--timeout S]     wait until the agent in t stops working (default 600s)
  report <status> [--kind K] report this terminal's agent status
                             status: working | blocked | done | idle | clear
  stop                       stop the core (ends every terminal; the layout is kept)

<t> is a terminal id from "corral ls", such as t3.
report reads CORRAL_TERMINAL_ID, which every corral terminal sets.
Pass --terminal <id> to report for another terminal.

wait exits 0 when the agent stopped (done, blocked or idle), 2 on timeout,
3 when it never started working after a send, and 1 when the terminal is gone.`;

function request(message: ClientMessage): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(process.env.CORRAL_SOCKET || socketPath());
    socket.on("error", () => reject(new Error("corral core is not running")));
    socket.on("connect", () => {
      send(socket, { type: "hello", role: "cli" });
      send(socket, message);
    });
    onMessages(socket, (msg: ServerMessage) => {
      if (msg.type === "welcome") return;
      socket.end();
      resolve(msg);
    });
  });
}

function flag(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Arguments that are not flags or flag values. */
function positional(args: string[], withValue: string[]) {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (withValue.includes(args[i])) i++;
    else if (!args[i].startsWith("--")) out.push(args[i]);
  }
  return out;
}

function seconds(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!(n > 0)) throw new Error(`expected a number of seconds, got "${value}"`);
  return n;
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text.replace(/\n$/, "");
}

/** Waits for an agent and prints how it ended. Exit codes are in USAGE. */
async function waitFor(terminalId: string, timeoutS: number, startMs: number) {
  const res = await request({ type: "wait", terminalId, timeoutMs: timeoutS * 1000, startMs });
  if (res.type === "error") throw new Error(res.message);
  if (res.type !== "waited") return;
  const who = res.kind ? `${terminalId} ${res.kind}` : terminalId;
  switch (res.reason) {
    case "stopped":
      console.log(`${who}: ${res.status}`);
      return;
    case "timeout":
      console.log(`${who}: still working after ${timeoutS}s`);
      process.exit(2);
    case "not_started":
      console.log(`${who}: ${res.status}; it did not start working. Check it with corral read ${terminalId}`);
      process.exit(3);
    case "exited":
      console.log(`${terminalId}: gone`);
      process.exit(1);
  }
}

function printLayout(state: State) {
  for (const space of state.spaces) {
    const first = panes(space.tabs[0].root)[0];
    const label = space.name ?? folderName(state.terminals[first?.terminalId]?.cwd ?? "");
    console.log(`${space.id === state.activeSpaceId ? "*" : " "} ${label}`);
    for (const tab of space.tabs) {
      console.log(`    ${tab.id === space.activeTabId ? "*" : " "} ${tab.name ?? "(tab)"}`);
      for (const pane of panes(tab.root)) {
        const t = state.terminals[pane.terminalId];
        if (!t) continue;
        const agent = t.agent ? `  [${t.agent.kind}: ${t.agent.status}]` : "";
        console.log(`        ${t.id.padEnd(5)} ${(t.program || "-").padEnd(10)} ${t.cwd}${agent}`);
      }
    }
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "ls": {
      const res = await request({ type: "list" });
      if (res.type === "state") printLayout(res.state);
      break;
    }
    case "agents": {
      const res = await request({ type: "list" });
      if (res.type !== "state") break;
      for (const t of Object.values(res.state.terminals)) {
        if (t.agent) console.log(`${t.id.padEnd(5)} ${t.agent.kind.padEnd(10)} ${t.agent.status.padEnd(8)} ${t.cwd}`);
      }
      break;
    }
    case "send": {
      const [terminalId, ...words] = positional(args, ["--timeout"]);
      if (!terminalId) throw new Error("usage: corral send <t> <text>");
      if (terminalId === process.env.CORRAL_TERMINAL_ID) throw new Error(`${terminalId} is this terminal`);
      if (args.includes("--no-enter") && args.includes("--wait")) throw new Error("--wait needs the prompt sent; drop --no-enter");
      const text = words.length ? words.join(" ") : process.stdin.isTTY ? "" : await readStdin();
      if (!text.trim()) throw new Error("nothing to send");
      const res = await request({ type: "send", terminalId, text, submit: !args.includes("--no-enter") });
      if (res.type === "error") throw new Error(res.message);
      // Give the agent time to take the prompt before deciding it never started.
      if (args.includes("--wait")) await waitFor(terminalId, seconds(flag(args, "--timeout"), 600), 15_000);
      break;
    }
    case "read": {
      const [terminalId] = positional(args, ["--lines"]);
      if (!terminalId) throw new Error("usage: corral read <t> [--lines N]");
      const lines = Number(flag(args, "--lines") ?? 50);
      if (!(Number.isInteger(lines) && lines > 0)) throw new Error("--lines takes a positive whole number");
      const res = await request({ type: "read", terminalId, lines });
      if (res.type === "error") throw new Error(res.message);
      if (res.type === "text") console.log(res.text);
      break;
    }
    case "wait": {
      const [terminalId] = positional(args, ["--timeout"]);
      if (!terminalId) throw new Error("usage: corral wait <t> [--timeout S]");
      await waitFor(terminalId, seconds(flag(args, "--timeout"), 600), 0);
      break;
    }
    case "report": {
      const status = args[0] as AgentStatus | "clear";
      if (!["working", "blocked", "done", "idle", "clear"].includes(status)) {
        console.error(USAGE);
        process.exit(2);
      }
      const terminalId = flag(args, "--terminal") ?? process.env.CORRAL_TERMINAL_ID;
      if (!terminalId) throw new Error("not inside a corral terminal; pass --terminal <id>");
      const res = await request({ type: "report", terminalId, status, kind: flag(args, "--kind") });
      if (res.type === "error") throw new Error(res.message);
      break;
    }
    case "stop":
      await request({ type: "shutdown" });
      console.log("core stopped");
      break;
    default:
      console.log(USAGE);
      process.exit(command ? 2 : 0);
  }
}

main().catch((err) => {
  console.error(`corral: ${err.message}`);
  process.exit(1);
});
