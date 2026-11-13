// Builds Corral.app into out/. macOS takes the name in the Dock, menu bar and ⌘Tab
// from the app bundle, so `npm start` (node_modules' Electron.app) always says "Electron".
import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";

execFileSync("node", ["scripts/build.mjs"], { stdio: "inherit" });

const [appPath] = await packager({
  dir: ".",
  out: "out",
  overwrite: true,
  name: "Corral",
  appBundleId: "corral",
  appCategoryType: "public.app-category.developer-tools",
  icon: "assets/icon.icns",
  // No asar: the core runs dist/daemon.js as plain node, terminals put bin/ on PATH,
  // and node-pty's native module and spawn-helper must stay real files.
  asar: false,
  ignore: [
    /^\/(src|tests|scripts|out|assets)(\/|$)/,
    /^\/(tsconfig\.json|README\.md)$/,
    /\.map$/,
    // node-pty ships its sources and every platform's binaries; keep only this one's.
    /^\/node_modules\/node-pty\/(deps|third_party|src)(\/|$)/,
    new RegExp(`^/node_modules/node-pty/prebuilds/(?!${process.platform}-${process.arch}(/|$))`),
  ],
});

if (process.platform === "darwin") {
  // Renaming the bundle invalidates Electron's signature; Apple silicon will not run
  // an app with a broken one, so sign it ad hoc for this machine.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", `${appPath}/Corral.app`], { stdio: "inherit" });
}

console.log(`\n${appPath}/Corral.app`);
