// Usage: node build-laws.mjs <raw-html-dir> <out-dir>
// Parses each downloaded planalto page into <out-dir>/<id>.json and writes laws.json (the catalog).
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

const catalog = [];
for (const law of LAWS) {
  const html = decode(readFileSync(join(rawDir, `${law.id}.htm`)));
  const items = buildLaw(extractLines(html));
  const arts = items.filter((i) => i.k && !/(intro|preambulo)/.test(i.k));
  const dupes = arts.filter((a) => a.k.includes("~")).map((a) => a.k);
  const data = { ...law, fetched: new Date().toLocaleDateString("sv-SE"), items };
  const json = JSON.stringify(data);
  writeFileSync(join(outDir, `${law.id}.json`), json);
  const { url, ...meta } = law;
  catalog.push({ ...meta, url, articles: arts.length });
  console.log(
    `${law.id.padEnd(7)} arts=${String(arts.length).padStart(5)} heads=${String(items.filter((i) => "h" in i).length).padStart(4)} ` +
      `first=${arts[0]?.k} last=${arts.at(-1)?.k} dupes=${dupes.length}${dupes.length ? " " + dupes.slice(0, 5).join(",") : ""} ` +
      `${(json.length / 1024).toFixed(0)}KB`,
  );
}
writeFileSync(join(outDir, "laws.json"), JSON.stringify(catalog, null, 1));
