import { memo, useState } from "react";
import type { Space, State } from "../../shared/model";
import { panes } from "../../shared/tree";
import { act, prompt, runCommand } from "../commands";
import { tabLabel, worstStatus } from "../labels";
import { StatusDot } from "./StatusDot";

export const TabBar = memo(function TabBar({ state, space, inset }: { state: State; space: Space; inset: boolean }) {
  const [dragging, setDragging] = useState<string | null>(null);

  return (
    <div className={`tabbar${inset ? " tabbar-inset" : ""}`}>
      <div className="tabs">
        {space.tabs.map((tab, index) => {
          const status = worstStatus(
            state,
            panes(tab.root).map((p) => p.terminalId),
          );
          const label = tabLabel(state, tab);
          return (
            <div
              key={tab.id}
              className={`tab${tab.id === space.activeTabId ? " tab-active" : ""}${dragging === tab.id ? " tab-dragging" : ""}`}
              draggable
              onDragStart={(e) => {
                setDragging(tab.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== tab.id) {
                  act({ type: "tab.move", tabId: dragging, toIndex: index });
                }
                setDragging(null);
              }}
              onMouseDown={(e) => {
                if (e.button === 0) act({ type: "tab.activate", tabId: tab.id });
              }}
              onAuxClick={(e) => {
                if (e.button === 1) act({ type: "tab.close", tabId: tab.id });
              }}
              onDoubleClick={() =>
                prompt("Rename tab", tab.name ?? "", (name) => act({ type: "tab.rename", tabId: tab.id, name }))
              }
              title={label}
            >
              {status && <StatusDot status={status} />}
              <span className="tab-label">{label}</span>
              <button
                className="tab-close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => act({ type: "tab.close", tabId: tab.id })}
                aria-label="Close tab"
              >
                ×
              </button>
            </div>
          );
        })}
        <button className="tab-new" onClick={() => runCommand("tab.new")} aria-label="New tab">
          +
        </button>
      </div>
    </div>
  );
});
