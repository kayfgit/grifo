// Prints the CHANGELOG.md section for one version. Usage: node scripts/changelog-section.mjs 0.1.0
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/changelog-section.mjs <version>");
  process.exit(1);
}
const lines = readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && l.startsWith("## ["));
console.log(
  lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim(),
);
