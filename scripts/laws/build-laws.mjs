// Usage: node build-laws.mjs <raw-html-dir> <out-dir>
// Parses each downloaded planalto page into <out-dir>/<id>.json and writes laws.json (the catalog the app reads).
// Exits non-zero when a law's highest article number differs from the `last` expected in laws.config.mjs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { extractLines, buildLaw, decode } from "./parse.mjs";
import { LAWS } from "./laws.config.mjs";

const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error("Usage: node build-laws.mjs <raw-html-dir> <out-dir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const fetched = new Date().toLocaleDateString("sv-SE");
const catalog = [];
const problems = [];
for (const law of LAWS) {
  const html = decode(readFileSync(join(rawDir, `${law.id}.htm`)));
  const items = buildLaw(extractLines(html), { annex: law.annex });
  const arts = items.filter((i) => i.k && !/(intro|preambulo)/.test(i.k));
  const dupes = arts.filter((a) => a.k.includes("~") && !a.k.includes("intro")).map((a) => a.k);
  const maxArt = Math.max(
    0,
    ...arts.filter((a) => !a.k.startsWith("adct-")).map((a) => parseInt(a.k.split("-")[1], 10)),
  );
  const { last, ...meta } = law;
  writeFileSync(join(outDir, `${law.id}.json`), JSON.stringify({ ...meta, fetched, items }));
  catalog.push({
    id: law.id,
    tab: law.tab,
    short: law.short,
    topic: law.topic,
    title: law.title,
    articles: arts.length,
  });
  const flag = last && maxArt !== last ? `  <-- expected last art. ${last}` : "";
  if (flag || dupes.length) problems.push(law.id);
  console.log(
    `${law.id.padEnd(8)} arts=${String(arts.length).padStart(5)} heads=${String(items.filter((i) => "h" in i).length).padStart(4)} ` +
      `max=${maxArt} dupes=${dupes.length}${dupes.length ? " " + dupes.slice(0, 4).join(",") : ""}${flag}`,
  );
}
writeFileSync(join(outDir, "laws.json"), JSON.stringify(catalog));
if (problems.length) {
  console.error(`\nCheck these laws: ${problems.join(", ")}`);
  process.exitCode = 1;
}
