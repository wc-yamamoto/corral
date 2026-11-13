// Bundles the core, main process, preload, CLI and window into dist/.
import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");
const common = { bundle: true, sourcemap: true, logLevel: "info", target: "es2023" };

const builds = [
  { ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main.js", platform: "node", format: "cjs", external: ["electron"] },
  { ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist/preload.js", platform: "node", format: "cjs", external: ["electron"] },
  { ...common, entryPoints: ["src/daemon/index.ts"], outfile: "dist/daemon.js", platform: "node", format: "cjs", external: ["node-pty"] },
  { ...common, entryPoints: ["src/cli/index.ts"], outfile: "dist/cli.js", platform: "node", format: "cjs" },
  {
    ...common,
    entryPoints: { app: "src/renderer/main.tsx" },
    outdir: "dist/renderer",
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    minify: !watch,
    define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
    loader: { ".woff2": "file" },
  },
];

fs.mkdirSync("dist/renderer", { recursive: true });
fs.copyFileSync("src/renderer/index.html", "dist/renderer/index.html");

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
