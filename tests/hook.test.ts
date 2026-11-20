import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hookMessage, lastReply, oneLine } from "../src/cli/hook";
import { titleTask } from "../src/renderer/labels";

function transcript(entries: unknown[]) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "corral-")), "t.jsonl");
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return file;
}

const prompt = (text: string) => ({ type: "user", message: { role: "user", content: text } });
const reply = (...content: unknown[]) => ({ type: "assistant", message: { role: "assistant", content } });
const toolResult = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }] } };

describe("hook messages", () => {
  it("uses a notification's message", () => {
    expect(hookMessage(JSON.stringify({ hook_event_name: "Notification", message: "Claude needs your permission to use Bash" }))).toBe(
      "Claude needs your permission to use Bash",
    );
  });

  it("takes the last reply of the turn from the transcript", () => {
    const file = transcript([
      prompt("old task"),
      reply({ type: "text", text: "Old answer" }),
      prompt("fix the login bug"),
      reply({ type: "text", text: "Looking." }, { type: "tool_use", id: "x", name: "Read", input: {} }),
      toolResult,
      reply({ type: "text", text: "## Fixed the **login** bug\n\nDetails…" }),
      { type: "system", content: "noise" },
    ]);
    expect(hookMessage(JSON.stringify({ hook_event_name: "Stop", transcript_path: file }))).toBe("Fixed the login bug");
  });

  it("does not reach back into an earlier turn", () => {
    const file = transcript([prompt("a"), reply({ type: "text", text: "Old answer" }), prompt("b"), reply({ type: "tool_use", id: "x", name: "Bash", input: {} })]);
    expect(lastReply(file)).toBeUndefined();
  });

  it("prefers last_assistant_message and ignores input it cannot read", () => {
    expect(hookMessage(JSON.stringify({ last_assistant_message: "Done.", transcript_path: "/nope" }))).toBe("Done.");
    expect(hookMessage(JSON.stringify({ transcript_path: "/nope" }))).toBeUndefined();
    expect(hookMessage("not json")).toBeUndefined();
  });

  it("cuts long lines", () => {
    const line = oneLine("x".repeat(300))!;
    expect(line).toHaveLength(100);
    expect(line.endsWith("…")).toBe(true);
  });
});

describe("titleTask", () => {
  it("reads the task an agent names in its title", () => {
    expect(titleTask("✳ Fix login bug")).toBe("Fix login bug");
    expect(titleTask("⠂ Fix login bug")).toBe("Fix login bug");
    expect(titleTask("✳ Claude Code")).toBeUndefined();
    expect(titleTask("user@host: ~/src")).toBeUndefined();
  });
});
