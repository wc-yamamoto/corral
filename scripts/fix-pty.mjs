// node-pty's macOS prebuilds ship spawn-helper without its execute bit,
// which makes every spawn fail with "posix_spawnp failed".
import fs from "node:fs";
import path from "node:path";

const root = path.join("node_modules", "node-pty");
for (const dir of ["prebuilds/darwin-arm64", "prebuilds/darwin-x64", "build/Release"]) {
  const helper = path.join(root, dir, "spawn-helper");
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
