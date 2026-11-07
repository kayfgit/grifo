import { describe, expect, test } from "vitest";
import { checkAgainstPrevious, checkExpected, contentHash, lawStats } from "../scripts/laws/quality.mjs";
import { planPublish, reportMarkdown } from "../scripts/laws/publish.mjs";

const entry = (id, articles, maxArt, hash, updated = "2026-11-06") => ({
  id,
  tab: "Adm",
  short: id.toUpperCase(),
  topic: "",
  title: "",
  articles,
  maxArt,
  hash,
  updated,
});

describe("quality checks", () => {
  test("stats ignore intro and ADCT numbering", () => {
    const items = [
      { k: "intro", p: [] },
      { k: "art-1", p: [] },
      { k: "art-2-A", p: [] },
      { k: "adct-art-90", p: [] },
    ];
    expect(lawStats(items)).toEqual({ articles: 3, maxArt: 2, dupes: [] });
  });
  test("hash ignores the download date", () => {
    const law = { title: "Lei", items: [{ k: "art-1", p: [{ t: "x" }] }] };
    expect(contentHash({ ...law, fetched: "2026-01-01" })).toBe(contentHash({ ...law, fetched: "2027-01-01" }));
    expect(contentHash(law)).not.toBe(contentHash({ ...law, items: [{ k: "art-1", p: [{ t: "y" }] }] }));
  });
  test("expected last article: laws may grow a little, not shrink or explode", () => {
    expect(checkExpected({ articles: 200, maxArt: 196, dupes: [] }, 194)).toEqual([]);
    expect(checkExpected({ articles: 10, maxArt: 10, dupes: [] }, 194)[0]).toMatch(/esperado pelo menos 194/);
    expect(checkExpected({ articles: 210, maxArt: 337, dupes: [] }, 194)[0]).toMatch(/muito além/);
    expect(checkExpected({ articles: 0, maxArt: 0, dupes: [] }, 0)[0]).toMatch(/nenhum artigo/);
  });
  test("against the published version", () => {
    const prev = { articles: 800, maxArt: 922 };
    expect(checkAgainstPrevious({ articles: 805, maxArt: 922 }, prev)).toEqual([]);
    expect(checkAgainstPrevious({ articles: 2, maxArt: 2 }, prev)).toHaveLength(2);
    expect(checkAgainstPrevious({ articles: 900, maxArt: 1300 }, prev)[0]).toMatch(/saltou/);
  });
});

describe("planPublish", () => {
  const prevManifest = {
    laws: [
      entry("cf", 411, 250, "aaa", "2026-01-01"),
      entry("clt", 843, 922, "bbb", "2026-01-01"),
      entry("old", 5, 5, "ccc"),
    ],
  };
  test("publishes changed and new laws, keeps unchanged dates, drops removed ones", () => {
    const build = [entry("cf", 411, 250, "aaa"), entry("clt", 845, 922, "zzz"), entry("l9784", 80, 70, "ddd")];
    const r = planPublish(build, {}, prevManifest);
    expect(r.changed.map((c) => [c.id, c.isNew])).toEqual([
      ["clt", false],
      ["l9784", true],
    ]);
    expect(r.laws.find((l) => l.id === "cf").updated).toBe("2026-01-01");
    expect(r.laws.find((l) => l.id === "clt").updated).toBe("2026-11-06");
    expect(r.removed).toEqual(["old"]);
  });
  test("a law that fails keeps its published version and is reported", () => {
    const build = [entry("cf", 411, 250, "aaa"), entry("clt", 2, 2, "broken")];
    const r = planPublish(build, { cf: [] }, prevManifest);
    expect(r.failed.map((f) => f.id)).toEqual(["clt"]);
    expect(r.laws.find((l) => l.id === "clt").hash).toBe("bbb");
    expect(reportMarkdown(r, "2026-11-09")).toMatch(/Não publicadas[\s\S]*CLT/);
  });
  test("a new law with build problems is not published at all", () => {
    const r = planPublish([entry("nova", 3, 3, "x")], { nova: ["termina cedo"] }, null);
    expect(r.laws).toEqual([]);
    expect(r.failed).toHaveLength(1);
  });
});
