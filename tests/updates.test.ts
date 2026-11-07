import { describe, expect, test } from "vitest";
import type { CatalogEntry } from "../src/laws";
import { currentHashes, isLawData, lawsToDownload, mergeCatalog, pruneDownloads } from "../src/updates";

const e = (id: string, hash: string, updated = "2026-11-06", tab = "Adm"): CatalogEntry => ({
  id,
  tab,
  short: id,
  topic: id,
  title: id,
  articles: 1,
  hash,
  updated,
});

describe("law updates", () => {
  const bundled = [e("cf", "a", "2026-11-06", "CF/88"), e("clt", "b")];

  test("downloads only laws whose hash differs, including new ones", () => {
    const manifest = { schema: 1, generated: "", laws: [e("cf", "a"), e("clt", "b2", "2026-11-09"), e("l9999", "n")] };
    expect(lawsToDownload(manifest, currentHashes(bundled, {})).map((l) => l.id)).toEqual(["clt", "l9999"]);
    expect(lawsToDownload(manifest, currentHashes(bundled, { clt: e("clt", "b2") })).map((l) => l.id)).toEqual([
      "l9999",
    ]);
  });
  test("a newer app version makes older downloads obsolete", () => {
    const downloaded = { clt: e("clt", "old", "2026-10-01"), l9999: e("l9999", "n", "2026-11-09") };
    expect(Object.keys(pruneDownloads(bundled, downloaded))).toEqual(["l9999"]);
  });
  test("catalog follows the manifest order and adds new laws", () => {
    const merged = mergeCatalog(bundled, { l9999: e("l9999", "n") }, ["cf", "l9999", "clt"]);
    expect(merged.map((m) => m.id)).toEqual(["cf", "l9999", "clt"]);
    expect(mergeCatalog(bundled, {}).map((m) => m.id)).toEqual(["cf", "clt"]);
  });
  test("rejects files that are not laws", () => {
    expect(isLawData({ title: "Lei", items: [{ k: "art-1", p: [] }] })).toBe(true);
    expect(isLawData({ title: "Lei", items: [] })).toBe(false);
    expect(isLawData("<html>404</html>")).toBe(false);
  });
});
