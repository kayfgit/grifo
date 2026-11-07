// Usage: node scripts/laws/fetch-laws.mjs <out-dir>
// Downloads each law page listed in laws.config.mjs from planalto.gov.br.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAWS } from "./laws.config.mjs";

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node scripts/laws/fetch-laws.mjs <out-dir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

async function download(law, attempt = 1) {
  try {
    const res = await fetch(law.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) grifo-lei-seca" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(outDir, `${law.id}.htm`), buf);
    console.log(`${law.id.padEnd(7)} ${(buf.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    if (attempt < 3) return download(law, attempt + 1);
    throw new Error(`${law.id}: ${err.message}`, { cause: err });
  }
}

await Promise.all(LAWS.map((law) => download(law)));
