// Builds assets/icon.png and assets/icon.icns from assets/icon.svg. macOS only:
// AppKit draws the SVG at each size onto a transparent canvas, iconutil packs the sizes.
// (QuickLook is no use here: it fills the corners outside the rounded square with white.)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// JavaScript for Automation: run(svg, png, px) draws the SVG into a px × px RGBA bitmap.
const RENDER = `
ObjC.import("AppKit");
function run([input, output, size]) {
  const px = Number(size);
  const image = $.NSImage.alloc.initWithContentsOfFile(input);
  if (!image || image.isNil()) throw new Error("cannot read " + input);
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, px, px, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  image.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, px, px), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);
  $.NSGraphicsContext.restoreGraphicsState;
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(output, true);
}`;

const svg = path.resolve("assets/icon.svg");
const render = (out, px) =>
  execFileSync("osascript", ["-l", "JavaScript", "-e", RENDER, svg, out, String(px)], { stdio: ["ignore", "ignore", "inherit"] });

const work = fs.mkdtempSync(path.join(os.tmpdir(), "corral-icon-"));
// iconutil wants every size at 1x and 2x.
const iconset = path.join(work, "icon.iconset");
fs.mkdirSync(iconset);
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    render(path.join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`), size * scale);
  }
}
fs.copyFileSync(path.join(iconset, "icon_512x512@2x.png"), "assets/icon.png");
execFileSync("iconutil", ["-c", "icns", iconset, "-o", "assets/icon.icns"]);
fs.rmSync(work, { recursive: true, force: true });
console.log("assets/icon.icns");
