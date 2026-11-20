// Reads the JSON a Claude Code hook gets on stdin, for `corral report --hook`.

import fs from "node:fs";

const MAX_LENGTH = 100;

/** One short line saying what the agent waits for or just finished, or undefined when the input has none. */
export function hookMessage(input: string): string | undefined {
  let data: any;
  try {
    data = JSON.parse(input);
  } catch {
    return undefined;
  }
  // Notification hooks carry a message; Stop hooks carry the last reply or the transcript it is in.
  const text = data?.message ?? data?.last_assistant_message ?? (typeof data?.transcript_path === "string" ? lastReply(data.transcript_path) : undefined);
  return typeof text === "string" ? oneLine(text) : undefined;
}

/** The text of the agent's last reply in a transcript, if the current turn has one. */
export function lastReply(transcriptPath: string): string | undefined {
  let lines: string[];
  try {
    lines = fs.readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return undefined;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: any;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry.isSidechain) continue;
    const content = entry.message?.content;
    if (entry.type === "assistant" && Array.isArray(content)) {
      const text = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
      if (text) return text;
    }
    // A user entry that is not a tool result is the prompt that began this turn; replies before it are stale.
    if (entry.type === "user" && !(Array.isArray(content) && content.every((c: any) => c.type === "tool_result"))) return undefined;
  }
  return undefined;
}

/** The first line of some Markdown as plain text, cut to fit a notification. */
export function oneLine(text: string): string | undefined {
  for (const raw of text.split("\n")) {
    const line = raw
      .replace(/^\s*(#+|[-*+]|\d+\.|>)\s+/, "")
      .replace(/\*\*|__|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line) return line.length > MAX_LENGTH ? line.slice(0, MAX_LENGTH - 1) + "…" : line;
  }
  return undefined;
}
