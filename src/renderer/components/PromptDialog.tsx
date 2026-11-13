import { useEffect, useRef, useState } from "react";
import { setUi, type Prompt } from "../store";

export function PromptDialog({ prompt }: { prompt: Prompt }) {
  const [value, setValue] = useState(prompt.value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const close = () => setUi({ prompt: undefined });

  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="prompt"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          close();
          prompt.submit(value);
        }}
      >
        <label className="prompt-title">{prompt.title}</label>
        <input
          ref={input}
          className="palette-input"
          value={value}
          placeholder="Leave empty to follow the folder"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !e.nativeEvent.isComposing) close();
          }}
        />
      </form>
    </div>
  );
}
