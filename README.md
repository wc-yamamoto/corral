# Corral

Corral is a desktop app for terminals and coding agents. Keep work in spaces, see which agents need you, and leave terminals running when you close the window.

日本語の使い方: [docs/usage.ja.md](docs/usage.ja.md)

## Install

Corral runs from source for now. You need Node.js and npm.

```sh
npm install
npm run package
```

This builds `out/Corral-darwin-arm64/Corral.app`. Move it to `/Applications` and open it like any other app.
It runs on Apple silicon Macs with macOS 13 or later. It is signed ad hoc, not with an Apple Developer ID, so a copy sent to another Mac is blocked by Gatekeeper until its owner allows it (see the Japanese guide, "他の人に渡す").

`npm start` runs the app straight from the repo instead. macOS then calls it "Electron" in the Dock and menu bar, because the name comes from the app bundle.

A running core keeps going when you switch between the two. To pick up a new build of the core, stop it with `corral stop` (this ends every terminal) and open the app again.

## Find your work

A **space** holds one piece of work, usually one repo. Each space has **tabs**. Split a tab into **panes** to put terminals beside each other.

An unnamed space follows its first terminal's folder. An unnamed tab follows its focused terminal. Double-click a space or tab to name it; leave the name empty to follow the folder again.

New tabs and panes start in the focused terminal's folder.
Drag a tab to reorder it. Middle-click a tab to close it.

The window arranges terminals. The core runs them.
Closing the window, or quitting the app, leaves them running; closing a pane or tab ends its terminals.
A window that reconnects gets each screen back as it was, with up to 5,000 lines of scrollback.
After a reboot or after the core stops, kept panes get fresh shells in their last folders, not their old programs.

## Agents

The agents sidebar brings agents from every space into one list. Corral finds claude, codex, gemini, aider, opencode and other agents from the program running in each terminal.

Each agent shows as:

- **Working:** still busy.
- **Blocked:** waiting for you.
- **Done:** finished while you were looking elsewhere.
- **Idle:** not working, or a finished agent you have looked at.

Corral guesses the status from what the terminal shows, such as `esc to interrupt` or `Do you want to proceed?`, and from a spinner in the title.
When an agent you are not looking at becomes Blocked or Done, you get a notification and the Dock badge counts it.
Press `⌘⇧A` to jump to the next agent that needs you. Click an agent in the sidebar to see it.

### Report status from an agent

An agent can report its own status instead of being guessed. Inside a Corral terminal, the `corral` command is on PATH.

```sh
corral report working|blocked|done|idle [--kind <name>]
corral report clear     # go back to guessing
```

For Claude Code, add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "[ -n \"$CORRAL_TERMINAL_ID\" ] && corral report working --kind claude || true" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "[ -n \"$CORRAL_TERMINAL_ID\" ] && corral report blocked --kind claude || true" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "[ -n \"$CORRAL_TERMINAL_ID\" ] && corral report done --kind claude || true" }] }]
  }
}
```

The hooks do nothing outside Corral.

## Make it yours

Open the command palette to find an action by name. It also finds spaces and tabs.
Change any key in `~/.corral/keys.json`. Open it with `⌘,` or the palette's "Open keys.json".
Save the file and the window picks it up. A broken edit keeps the last good keys and reports the error.

```jsonc
{
  "bindings": {
    "cmd+shift+t": "tab.new",
    "cmd+k": null            // unbind a default
  }
}
```

Command ids are listed in `src/renderer/commands.ts`; the palette also matches them when you type one. Modifiers are `cmd`, `ctrl`, `alt` and `shift`.

### Default keys on macOS

| Key | Command |
| --- | --- |
| `⌘⇧P` | Command palette |
| `⌘T` / `⌘⇧W` | New tab / close tab |
| `⌘D` / `⌘⇧D` | Split right / split down |
| `⌘W` | Close pane |
| `⌘⌥←↑→↓` | Move between panes |
| `⌘⇧↩` | Zoom pane |
| `⌘⇧[` `⌘⇧]` | Previous / next tab |
| `⌘1`–`⌘8` / `⌘9` | Go to tab / last tab |
| `⌘⇧N` / `⌘⌃[` `⌘⌃]` | New space / previous, next space |
| `⌘⇧A` | Next agent that needs you |
| `⌘B` | Toggle sidebar |
| `⌘K` | Clear screen |
| `⌘=` `⌘-` `⌘0` | Font size |
| `⌘N` | New window |
| `⌘,` | Open keys.json |

Linux and Windows use `Ctrl+Shift`, `Ctrl+Alt` and `Alt+1`–`Alt+9`, so plain `Ctrl` stays with the shell. See `src/shared/keys.ts` for the full list.

## For agents

```sh
corral ls       # spaces, tabs and terminals
corral agents   # agents and their status
corral stop     # stop the core: ends every terminal, keeps the layout
```

### Talk to another session

An agent in one terminal can hand work to an agent in another. Find its id with `corral ls`, such as `t3`.

```sh
corral send t3 "Review src/x.ts and write findings to /tmp/review.md"
corral send --wait t3 "Recheck the fix"   # send, then wait until it stops working
corral read t3 --lines 100                # its screen and scrollback as text
corral wait t3                            # wait until it stops working
```

`send` pastes the text and presses Enter, so a multi-line prompt arrives as one message. `--no-enter` types it without sending. With no text, `send` reads it from standard input.

`wait` returns when the agent is no longer Working: Done, Blocked or Idle. It exits 2 on timeout (`--timeout`, default 600 seconds) and 3 when a sent prompt never started any work; read the screen before sending again. Waits follow the status in the sidebar, so an agent that reports its status gives the sharpest answer.

Ask for long answers in a file, and read the file rather than the screen.

Outside a Corral terminal, run `bin/corral` from this repo.
Set `CORRAL_HOME` to keep Corral's files somewhere other than `~/.corral`.

## How it works

```
Electron window ──IPC── main process ──unix socket── core
  (React + xterm.js)                 ~/.corral/core.sock  ├ runs shells with node-pty
                                                          ├ keeps each screen in @xterm/headless
                                                          └ saves the layout to state.json
```

The core is its own process. It runs on the app's Electron as plain Node (`ELECTRON_RUN_AS_NODE=1`), so it outlives every window and the app itself.
Only you can reach its socket: `~/.corral` is private to your user.

## Build from source

```sh
npm install
npm run dev          # rebuild on change (esbuild watch)
npx electron .       # in another terminal
```

`npm test` runs the unit tests. `npm run typecheck` checks types.

The app icon is drawn in `assets/icon.svg`. After changing it, run `npm run icon` on a Mac to rebuild `assets/icon.png` and `assets/icon.icns`.

The macOS prebuild of node-pty ships `spawn-helper` without execute permission. `postinstall` (`scripts/fix-pty.mjs`) adds it.
