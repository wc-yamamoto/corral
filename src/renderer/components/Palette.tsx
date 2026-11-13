import { useEffect, useMemo, useRef, useState } from "react";
import type { State } from "../../shared/model";
import { displayCombo } from "../../shared/keys";
import { corral } from "../bridge";
import { COMMANDS, placeEntries, type Command } from "../commands";
import { fuzzyScore } from "../fuzzy";
import { comboFor } from "../keys";
import { setUi } from "../store";

export function Palette({ state }: { state: State }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => input.current?.focus(), []);

  const entries = useMemo(() => {
    const all: Command[] = [...COMMANDS.filter((c) => c.id !== "palette.open"), ...placeEntries(state)];
    return all
      .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.title) ?? -Infinity, fuzzyScore(query, c.id) ?? -Infinity) }))
      .filter((x) => x.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [query, state]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current?.querySelector(".palette-item-active")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const close = () => setUi({ palette: false });
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="palette-input"
          placeholder="Type a command, space or tab…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
              e.preventDefault();
              setIndex((i) => Math.min(entries.length - 1, i + 1));
            } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") run(entries[index]);
          }}
        />
        <div className="palette-list" ref={list}>
          {entries.length === 0 && <div className="palette-empty">No matches</div>}
          {entries.map((c, i) => {
            const combo = comboFor(c.id);
            return (
              <div
                key={c.id}
                className={`palette-item${i === index ? " palette-item-active" : ""}`}
                onMouseMove={() => setIndex(i)}
                onClick={() => run(c)}
              >
                <span>{c.title}</span>
                {combo && <kbd>{displayCombo(combo, corral.platform)}</kbd>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
