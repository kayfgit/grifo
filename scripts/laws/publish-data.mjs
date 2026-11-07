// Usage: node scripts/laws/publish-data.mjs   (npm run laws:publish)
// Downloads every law from planalto.gov.br, converts it, checks it, and publishes the laws that changed to
// the public data repo github.com/kayfgit/grifo-leis, which the app downloads updates from.
// Runs from a computer in Brazil: planalto.gov.br refuses requests from cloud servers such as GitHub's.
// The data repo is cloned into .cache/leis (or LEIS_DIR) the first time.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataRepo = process.env.LEIS_DIR ?? ".cache/leis";
const raw = ".cache/raw";
const out = ".cache/out";
const report = ".cache/laws-report.md";
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
const git = (...args) => execFileSync("git", ["-C", dataRepo, ...args], { encoding: "utf8" }).trim();

if (!existsSync(join(dataRepo, "manifest.json"))) {
  run("git", ["clone", "git@github.com:kayfgit/grifo-leis.git", dataRepo]);
} else {
  run("git", ["-C", dataRepo, "pull", "--ff-only", "--quiet"]);
}

rmSync(out, { recursive: true, force: true });
run("node", ["scripts/laws/fetch-laws.mjs", raw]);
try {
  run("node", ["scripts/laws/build-laws.mjs", raw, out]);
} catch {
  // Laws with problems are listed in problems.json; publish.mjs keeps their published version.
}
run("node", ["scripts/laws/publish.mjs", out, dataRepo, report]);

if (git("status", "--porcelain")) {
  const day = new Date().toLocaleDateString("sv-SE");
  git("add", "manifest.json", "laws");
  git("commit", "-m", `Atualizar leis (${day})`);
  run("git", ["-C", dataRepo, "push", "--quiet"]);
  console.log(`\nPublished. The app picks the changes up on its next daily check. Report: ${report}`);
} else {
  console.log(`\nNothing to publish. Report: ${report}`);
}
