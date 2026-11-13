// Reading a terminal's text and typing into it the way a person would.
// Kept apart from Session so it can be tested without a pty.

import type { Terminal } from "@xterm/headless";

/** The last `lines` lines of screen and scrollback as plain text, wrapped lines joined. */
export function lastLines(screen: Terminal, lines: number): string {
  const buf = screen.buffer.active;
  let end = buf.length - 1;
  while (end >= 0 && !buf.getLine(end)?.translateToString(true).trim()) end--;
  const out: string[] = [];
  // Walk back far enough to collect `lines` logical lines, then forward to join wraps.
  let start = end;
  for (let count = 0; start >= 0; start--) {
    if (!buf.getLine(start)?.isWrapped && ++count === lines) break;
  }
  for (let y = Math.max(0, start); y <= end; y++) {
    const line = buf.getLine(y);
    const text = line?.translateToString(true) ?? "";
    if (line?.isWrapped && out.length) out[out.length - 1] += text;
    else out.push(text);
  }
  return out.join("\n");
}

/**
 * Text as a paste. Agents' prompts take a bracketed paste as one block of input,
 * so newlines in it do not submit early; a plain shell gets the text as typed.
 */
export function pasteData(text: string, bracketed: boolean) {
  const clean = text.replace(/\x1b\[20[01]~/g, "");
  return bracketed ? `\x1b[200~${clean}\x1b[201~` : clean.replace(/\r?\n/g, "\r");
}
