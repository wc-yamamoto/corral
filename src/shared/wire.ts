// Newline-delimited JSON over a socket. Node-only.

import type { Socket } from "node:net";

export function send(socket: Socket, message: unknown) {
  if (!socket.destroyed) socket.write(JSON.stringify(message) + "\n");
}

export function onMessages(socket: Socket, handle: (message: any) => void) {
  let buffered = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffered += chunk;
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      try {
        handle(JSON.parse(line));
      } catch (err) {
        console.error("bad message", err);
      }
    }
  });
}
