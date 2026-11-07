// Renders the Grifo icon (lines of text, one swiped with a yellow highlighter) into assets/ for @capacitor/assets.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const RUBY = "#9b1c33";
const PAPER = "#fbf3f4";
const MARKER = "#ffd93b";
const INK = "#2b0b12";
mkdirSync("assets", { recursive: true });

// Glyph drawn in a 1024 box; `scale` shrinks it toward the center (adaptive icons keep a safe zone).
function glyph(scale) {
  const lines = [
    { y: 330, w: 560 },
    { y: 450, w: 620, marked: true },
    { y: 570, w: 600 },
    { y: 690, w: 380 },
  ];
  const x0 = 212;
  const parts = lines.map(({ y, w, marked }) => {
    const marker = marked
      ? `<path d="M${x0 - 34} ${y - 44} L${x0 + w + 40} ${y - 52} L${x0 + w + 30} ${y + 46} L${x0 - 26} ${y + 52} Z" fill="${MARKER}" opacity="0.95"/>`
      : "";
    return `${marker}<rect x="${x0}" y="${y - 18}" width="${w}" height="36" rx="18" fill="${marked ? INK : PAPER}"/>`;
  });
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${parts.join("")}</g>`;
}
const svg = (body, bg) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ""}${body}</svg>`,
  );

await sharp(svg(glyph(0.92), RUBY))
  .png()
  .toFile("assets/icon-only.png");
await sharp(svg(glyph(0.62)))
  .png()
  .toFile("assets/icon-foreground.png");
await sharp(svg("", RUBY)).png().toFile("assets/icon-background.png");
const splash = (bg) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="${bg}"/><g transform="translate(1066 1066) scale(0.586)"><rect width="1024" height="1024" rx="230" fill="${RUBY}"/>${glyph(0.92)}</g></svg>`,
  );
await sharp(splash("#ffffff")).png().toFile("assets/splash.png");
await sharp(splash("#191617")).png().toFile("assets/splash-dark.png");
console.log("icons written to assets/");
