// Asks the OS which program is in the foreground of each terminal, and where shells are.

import { execFile } from "node:child_process";
import fs from "node:fs/promises";

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, timeout: 3000 }, (_err, stdout) => resolve(stdout ?? ""));
  });
}

/** Foreground command lines per tty name ("ttys012", "pts/3"), oldest process first. */
export async function foregroundByTty(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (process.platform === "win32") return out;
  const text = await run("ps", ["-A", "-o", "tty=,stat=,pid=,args="]);
  const rows: { tty: string; pid: number; args: string }[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\S+)\s+(\S+)\s+(\d+)\s+(.*)$/);
    // "+" marks the foreground process group. An agent's own child commands share it.
    if (m && m[2].includes("+")) rows.push({ tty: m[1], pid: Number(m[3]), args: m[4] });
  }
  rows.sort((a, b) => a.pid - b.pid);
  for (const row of rows) {
    const list = out.get(row.tty) ?? [];
    list.push(row.args);
    out.set(row.tty, list);
  }
  return out;
}

export async function cwdsOf(pids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (pids.length === 0) return out;
  if (process.platform === "linux") {
    await Promise.all(
      pids.map(async (pid) => {
        try {
          out.set(pid, await fs.readlink(`/proc/${pid}/cwd`));
        } catch {}
      }),
    );
    return out;
  }
  if (process.platform === "darwin") {
    const text = await run("lsof", ["-a", "-d", "cwd", "-Fpn", "-p", pids.join(",")]);
    let pid = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1));
      else if (line.startsWith("n") && pid) out.set(pid, line.slice(1));
    }
  }
  return out;
}

export function ttyName(ptsName: string | undefined) {
  return ptsName?.replace(/^\/dev\//, "");
}

export function programName(args: string) {
  const first = args.trim().split(/\s+/)[0] ?? "";
  return first.slice(first.lastIndexOf("/") + 1).replace(/^-/, "");
}
