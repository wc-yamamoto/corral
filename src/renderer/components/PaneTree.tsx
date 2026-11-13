import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PaneNode, Tab } from "../../shared/model";
import { findPane, panes } from "../../shared/tree";
import { corral } from "../bridge";
import { terminalLabel } from "../labels";
import { useUiSelect } from "../store";
import { terminals } from "../terminals";
import { StatusDot } from "./StatusDot";

type PaneLeaf = Extract<PaneNode, { kind: "pane" }>;
type SplitNode = Extract<PaneNode, { kind: "split" }>;

// Each part is memoized: the store keeps unchanged parts of the state identical, so a
// change re-renders only the panes it touches. Panes read their own terminal from the store.

export const TabView = memo(function TabView({ tab }: { tab: Tab }) {
  const zoomed = tab.zoomedPaneId ? findPane(tab.root, tab.zoomedPaneId) : undefined;
  const multi = panes(tab.root).length > 1;
  return (
    <div className="tab-view">
      {zoomed ? (
        <Pane pane={zoomed} focused multi={false} zoomed />
      ) : (
        <Node node={tab.root} focusedPaneId={tab.focusedPaneId} multi={multi} />
      )}
    </div>
  );
});

const Node = memo(function Node(props: { node: PaneNode; focusedPaneId: string; multi: boolean }) {
  const { node } = props;
  if (node.kind === "pane") {
    return <Pane pane={node} focused={node.id === props.focusedPaneId} multi={props.multi} />;
  }
  return <Split {...props} node={node} />;
});

const Split = memo(function Split({ node, focusedPaneId, multi }: { node: SplitNode; focusedPaneId: string; multi: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // While dragging, sizes live here; the core's echo of the final sizes replaces them.
  const [dragSizes, setDragSizes] = useState<number[] | null>(null);
  useEffect(() => setDragSizes(null), [node.sizes]);
  const sizes = dragSizes ?? node.sizes;
  const horizontal = node.dir === "row";

  const startDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const box = ref.current!.getBoundingClientRect();
    const length = horizontal ? box.width : box.height;
    const start = horizontal ? e.clientX : e.clientY;
    const initial = [...sizes];
    const pair = initial[index] + initial[index + 1];
    let latest = initial;
    const move = (ev: MouseEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / length;
      const first = Math.min(pair - 0.05, Math.max(0.05, initial[index] + delta));
      latest = [...initial];
      latest[index] = first;
      latest[index + 1] = pair - first;
      setDragSizes(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("resizing-row", "resizing-column");
      corral.send({ type: "action", action: { type: "pane.resize", splitId: node.id, sizes: latest } });
    };
    document.body.classList.add(horizontal ? "resizing-row" : "resizing-column");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div ref={ref} className={`split split-${node.dir}`}>
      {node.children.map((child, i) => (
        <div key={child.id} className="split-cell" style={{ flex: `${sizes[i]} 1 0` }}>
          <Node node={child} focusedPaneId={focusedPaneId} multi={multi} />
          {i < node.children.length - 1 && (
            <div className={`divider divider-${node.dir}`} onMouseDown={(e) => startDrag(i, e)} />
          )}
        </div>
      ))}
    </div>
  );
});

const Pane = memo(function Pane({ pane, focused, multi, zoomed }: { pane: PaneLeaf; focused: boolean; multi: boolean; zoomed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = pane.terminalId;
  const info = useUiSelect((ui) => ui.core?.terminals[id]);
  const overlayOpen = useUiSelect((ui) => ui.palette || !!ui.prompt);

  useLayoutEffect(() => {
    const el = ref.current!;
    terminals.mount(id, el);
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => terminals.fit(id));
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      terminals.unmount(id, el);
    };
  }, [id]);

  useEffect(() => {
    if (focused && !overlayOpen) terminals.focus(id);
  }, [focused, id, overlayOpen]);

  const focus = () => {
    if (!focused) corral.send({ type: "action", action: { type: "pane.focus", paneId: pane.id } });
  };

  return (
    <div className={`pane${focused && multi ? " pane-focused" : ""}`} onMouseDown={focus}>
      {(multi || zoomed) && (
        <div className="pane-label">
          {info?.agent && <StatusDot status={info.agent.status} />}
          <span>{terminalLabel(info)}</span>
          <span className="pane-id">{id}</span>
          {zoomed && <span className="pane-zoom">zoomed</span>}
        </div>
      )}
      <div ref={ref} className="pane-term" />
    </div>
  );
});
