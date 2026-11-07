import { describe, expect, test } from "vitest";
import { createStore, memoryKV, parseBackup } from "../src/storage";

describe("store", () => {
  test("returns empty marks for a law never touched", async () => {
    const store = createStore(memoryKV());
    expect(await store.load("cf")).toEqual({ v: 1, hl: [], notes: {} });
  });

  test("saves and loads, last write wins", async () => {
    const store = createStore(memoryKV());
    store.save("cf", { v: 1, hl: ["art-5|0|8|13|y"], notes: {} });
    store.save("cf", { v: 1, hl: ["art-5|0|8|20|g"], notes: { "art-5": "x" } });
    expect(await store.load("cf")).toEqual({ v: 1, hl: ["art-5|0|8|20|g"], notes: { "art-5": "x" } });
  });

  test("ignores corrupted stored data", async () => {
    const store = createStore(memoryKV({ "law:cf": "{oops" }));
    expect(await store.load("cf")).toEqual({ v: 1, hl: [], notes: {} });
  });

  test("backup round trip skips empty laws and other keys", async () => {
    const kv = memoryKV({ "law:cc": JSON.stringify({ v: 1, hl: [], notes: {} }), prefs: "{}" });
    const store = createStore(kv);
    await store.save("cf", { v: 1, hl: ["art-1|0|0|3|y"], notes: { "art-1": "n" } });
    const backup = await store.exportAll(new Date("2026-11-06T12:00:00Z"));
    expect(backup).toEqual({
      app: "grifo",
      v: 1,
      exportedAt: "2026-11-06T12:00:00.000Z",
      laws: { cf: { v: 1, hl: ["art-1|0|0|3|y"], notes: { "art-1": "n" } } },
    });

    const other = createStore(memoryKV());
    expect(await other.importAll(parseBackup(JSON.stringify(backup)))).toBe(1);
    expect(await other.load("cf")).toEqual(backup.laws.cf);
  });

  test("rejects files that are not Grifo backups", () => {
    expect(() => parseBackup("not json")).toThrow(/não é um backup/);
    expect(() => parseBackup(JSON.stringify({ app: "other", laws: {} }))).toThrow(/não é um backup/);
    expect(() => parseBackup(JSON.stringify({ app: "grifo", laws: { cf: { hl: [1] } } }))).toThrow(/corrompido/);
  });
});
