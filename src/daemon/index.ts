// The corral core: a background process that runs the terminals.
// Windows connect over a local socket; closing every window leaves it running.

import net from "node:net";
import fs from "node:fs";
import type { ClientMessage, ServerMessage } from "../shared/model";
import { ensureHome, socketPath, VERSION } from "../shared/paths";
import { onMessages, send } from "../shared/wire";
import { Core } from "./core";
import { checkWait, type Waiter } from "./wait";

interface Client {
  socket: net.Socket;
  window: boolean;
  attached: Set<string>;
  visible: string[];
  focused: boolean;
}

const clients = new Set<Client>();

function broadcast(message: ServerMessage, filter: (c: Client) => boolean = (c) => c.window) {
  for (const c of clients) if (filter(c)) send(c.socket, message);
}

const core = new Core({
  changed: (state) => {
    broadcast({ type: "state", state });
    for (const w of waits) settleWait(w);
  },
  output: (terminalId, data) => broadcast({ type: "output", terminalId, data }, (c) => c.attached.has(terminalId)),
});

// Agents read a prompt as typed only after a pause; an Enter sent with the paste can be taken as a newline.
const SUBMIT_DELAY_MS = 200;

// ---- corral wait ----

interface Waiting {
  client: Client;
  waiter: Waiter;
  timers: NodeJS.Timeout[];
}

const waits = new Set<Waiting>();

function startWait(client: Client, msg: Extract<ClientMessage, { type: "wait" }>) {
  const t = core.snapshot().terminals[msg.terminalId];
  if (!t) return send(client.socket, { type: "error", message: `no terminal ${msg.terminalId}` });
  if (!t.agent) return send(client.socket, { type: "error", message: `${msg.terminalId} is not running an agent` });
  const now = Date.now();
  const waiter: Waiter = {
    terminalId: msg.terminalId,
    started: msg.startMs <= 0,
    sinceAtStart: t.agent.since,
    startDeadline: now + msg.startMs,
    deadline: now + msg.timeoutMs,
  };
  const w: Waiting = { client, waiter, timers: [] };
  waits.add(w);
  // Status changes settle waits as they happen; timers only cover the deadlines.
  for (const ms of msg.startMs > 0 ? [msg.startMs, msg.timeoutMs] : [msg.timeoutMs]) {
    w.timers.push(setTimeout(() => settleWait(w), ms + 10));
  }
  settleWait(w);
}

function settleWait(w: Waiting) {
  if (!waits.has(w)) return;
  const t = core.snapshot().terminals[w.waiter.terminalId];
  const result = checkWait(w.waiter, t, Date.now());
  if (!result) return;
  endWait(w);
  send(w.client.socket, { type: "waited", terminalId: w.waiter.terminalId, ...result, kind: t?.agent?.kind });
}

function endWait(w: Waiting) {
  waits.delete(w);
  for (const timer of w.timers) clearTimeout(timer);
}

function updateWatched() {
  const watched = new Set<string>();
  for (const c of clients) if (c.window && c.focused) for (const id of c.visible) watched.add(id);
  core.setWatched(watched);
}

function handle(client: Client, msg: ClientMessage) {
  switch (msg.type) {
    case "hello":
      client.window = msg.role === "window";
      send(client.socket, { type: "welcome", version: VERSION, pid: process.pid });
      if (client.window) send(client.socket, { type: "state", state: core.snapshot() });
      break;
    case "action":
      core.apply(msg.action);
      break;
    case "input":
      core.session(msg.terminalId)?.write(msg.data);
      break;
    case "resize":
      core.session(msg.terminalId)?.resize(msg.cols, msg.rows);
      break;
    case "attach":
      for (const id of msg.terminalIds) {
        const session = core.session(id);
        if (!session || client.attached.has(id)) continue;
        // Output already in the snapshot must not also reach this client as a later batch.
        session.flush();
        client.attached.add(id);
        send(client.socket, { type: "snapshot", terminalId: id, data: session.snapshot() });
      }
      break;
    case "view":
      client.visible = msg.visible;
      client.focused = msg.focused;
      updateWatched();
      break;
    case "report":
      try {
        core.report(msg.terminalId, msg.status, msg.kind);
        send(client.socket, { type: "ok" });
      } catch (err) {
        send(client.socket, { type: "error", message: (err as Error).message });
      }
      break;
    case "send": {
      const session = core.session(msg.terminalId);
      if (!session || session.closed) {
        send(client.socket, { type: "error", message: `no terminal ${msg.terminalId}` });
        break;
      }
      session.paste(msg.text);
      if (!msg.submit) {
        send(client.socket, { type: "ok" });
        break;
      }
      setTimeout(() => {
        session.write("\r");
        send(client.socket, { type: "ok" });
      }, SUBMIT_DELAY_MS);
      break;
    }
    case "read": {
      const session = core.session(msg.terminalId);
      if (!session || session.closed) send(client.socket, { type: "error", message: `no terminal ${msg.terminalId}` });
      else send(client.socket, { type: "text", text: session.text(msg.lines) });
      break;
    }
    case "wait":
      startWait(client, msg);
      break;
    case "list":
      send(client.socket, { type: "state", state: core.snapshot() });
      break;
    case "shutdown":
      send(client.socket, { type: "ok" });
      stop();
      break;
  }
}

const server = net.createServer((socket) => {
  const client: Client = { socket, window: false, attached: new Set(), visible: [], focused: false };
  clients.add(client);
  onMessages(socket, (msg) => handle(client, msg));
  socket.on("error", () => {});
  socket.on("close", () => {
    clients.delete(client);
    for (const w of waits) if (w.client === client) endWait(w);
    updateWatched();
  });
});

function stop() {
  core.shutdown();
  server.close();
  if (process.platform !== "win32") fs.rmSync(socketPath(), { force: true });
  setTimeout(() => process.exit(0), 50);
}

function listen() {
  server.listen(socketPath(), () => {
    if (process.platform !== "win32") fs.chmodSync(socketPath(), 0o600);
    core.start();
    console.log(`corral core ${VERSION} listening on ${socketPath()} (pid ${process.pid})`);
  });
}

// Files the core creates (socket, state.json) are yours alone, with no gap before a chmod.
process.umask(0o077);
ensureHome();

// One core per user: if another answers on the socket, leave it be; a dead socket is stale.
const probe = net.connect(socketPath());
probe.on("connect", () => {
  console.log("another core is already running");
  probe.destroy();
  process.exit(0);
});
probe.on("error", () => {
  if (process.platform !== "win32") fs.rmSync(socketPath(), { force: true });
  listen();
});

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("SIGHUP", () => {});
process.on("uncaughtException", (err) => console.error("uncaught", err));
