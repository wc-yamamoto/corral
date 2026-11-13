// `corral wait`: when a waiting client gets its answer.

import type { AgentStatus, TerminalInfo } from "../shared/model";

export interface Waiter {
  terminalId: string;
  /** Wait for the agent to start working first (after a send); otherwise it already counts as started. */
  started: boolean;
  /** The agent's `since` when the wait began: any later status change means it took the work. */
  sinceAtStart: number;
  startDeadline: number;
  deadline: number;
}

export type WaitResult =
  | { reason: "stopped"; status: AgentStatus }
  | { reason: "timeout"; status: AgentStatus }
  | { reason: "not_started"; status: AgentStatus }
  | { reason: "exited" };

/** The result for this waiter now, or undefined to keep waiting. Updates `started`. */
export function checkWait(w: Waiter, t: TerminalInfo | undefined, now: number): WaitResult | undefined {
  if (!t) return { reason: "exited" };
  const status = t.agent?.status ?? "idle";
  if (!w.started) {
    // A quick run can go working → done between two scans, so a newer status also counts.
    if (status === "working" || (t.agent && t.agent.since > w.sinceAtStart)) w.started = true;
    else if (now >= w.startDeadline) return { reason: "not_started", status };
    else return undefined;
  }
  if (status !== "working") return { reason: "stopped", status };
  if (now >= w.deadline) return { reason: "timeout", status };
  return undefined;
}
