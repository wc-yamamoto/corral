import { memo, useEffect, useState } from "react";
import type { State } from "../../shared/model";
import { locate, panes } from "../../shared/tree";
import { displayCombo } from "../../shared/keys";
import { corral } from "../bridge";
import { act, prompt, runCommand } from "../commands";
import { comboFor } from "../keys";
import { attentionOrder, spaceLabel, STATUS_LABEL, tabLabel, worstStatus } from "../labels";
import { StatusDot } from "./StatusDot";

function ago(since: number, now: number) {
  const s = Math.max(0, Math.round((now - since) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const Sidebar = memo(function Sidebar({ state }: { state: State }) {
  const now = useNow(5000);
  const agents = attentionOrder(state);
  const needsYou = agents.filter((t) => t.agent!.status === "blocked" || t.agent!.status === "done").length;
  const paletteKey = comboFor("palette.open");

  return (
    <aside className="sidebar">
      <div className="sidebar-titlebar" />

      <section className="sidebar-section">
        <header className="sidebar-header">
          <span>Spaces</span>
          <button className="icon-button" onClick={() => runCommand("space.new")} aria-label="New space" title="New space">
            +
          </button>
        </header>
        <div className="space-list">
          {state.spaces.map((space) => {
            const ids = space.tabs.flatMap((t) => panes(t.root).map((p) => p.terminalId));
            const active = space.id === state.activeSpaceId;
            return (
              <div
                key={space.id}
                className={`space-row${active ? " space-active" : ""}`}
                onClick={() => act({ type: "space.activate", spaceId: space.id })}
                onDoubleClick={() =>
                  prompt("Rename space", space.name ?? "", (name) => act({ type: "space.rename", spaceId: space.id, name }))
                }
              >
                <StatusDot status={worstStatus(state, ids)} />
                <span className="space-name">{spaceLabel(state, space)}</span>
                <span className="space-count">{space.tabs.length}</span>
                <button
                  className="row-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    act({ type: "space.close", spaceId: space.id });
                  }}
                  aria-label="Close space"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sidebar-section sidebar-agents">
        <header className="sidebar-header">
          <span>Agents</span>
          {needsYou > 0 && <span className="needs-you">{needsYou} need you</span>}
        </header>
        <div className="agent-list">
          {agents.length === 0 && (
            <p className="empty">
              Start <code>claude</code>, <code>codex</code> or <code>gemini</code> in any terminal and it shows up here.
            </p>
          )}
          {agents.map((t) => {
            const where = locate(state, t.id);
            const agent = t.agent!;
            return (
              <div
                key={t.id}
                className={`agent-row agent-${agent.status}`}
                onClick={() => act({ type: "terminal.reveal", terminalId: t.id })}
                title={t.title || t.cwd}
              >
                <StatusDot status={agent.status} />
                <div className="agent-text">
                  <div className="agent-line">
                    <span className="agent-kind">{agent.kind}</span>
                    <span className={`agent-status status-${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
                  </div>
                  <div className="agent-where">
                    {where ? `${spaceLabel(state, where.space)} › ${tabLabel(state, where.tab)}` : t.cwd}
                    <span className="agent-id"> · {t.id}</span>
                  </div>
                </div>
                <span className="agent-ago">{ago(agent.since, now)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="sidebar-footer">
        <button className="footer-button" onClick={() => runCommand("palette.open")}>
          Commands {paletteKey && <kbd>{displayCombo(paletteKey, corral.platform)}</kbd>}
        </button>
      </footer>
    </aside>
  );
});
