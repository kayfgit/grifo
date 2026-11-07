import { describe, expect, test } from "vitest";
import type { LawData } from "../src/laws";
import { buildQueue, cardsFromMarks, emptySrs, grade, schedule } from "../src/review";
import { agenda, markRead, parseDay, segmentsOf, splitSessions, studyDays, unitsOf, type Plan } from "../src/plan";

const law: LawData = {
  id: "x",
  title: "Lei X",
  url: "",
  fetched: "2026-11-06",
  items: [
    { h: 4, l: "CAPÍTULO I", n: "", id: "h1" },
    { k: "art-1", p: [{ t: "Art. 1º Todos são iguais perante a lei." }] },
    { k: "art-2", p: [{ t: "Art. 2º São direitos:" }, { t: "I - a educação;" }, { t: "II - a saúde;" }] },
    { k: "art-3", p: [{ t: "Art. 3º (Revogado)." }], r: 1 },
    { k: "art-4", p: [{ t: "Art. 4º Texto bem mais longo que os outros para pesar mais na divisão das sessões." }] },
  ],
};

describe("spaced repetition", () => {
  test("first reviews follow 1, 3 days, then grow by ease", () => {
    let s = schedule(undefined, 2, 100);
    expect([s.ivl, s.due]).toEqual([1, 101]);
    s = schedule(s, 2, 101);
    expect([s.ivl, s.due]).toEqual([3, 104]);
    s = schedule(s, 2, 104);
    expect(s.ivl).toBe(8); // round(3 * 2.5)
  });
  test("a miss resets the card to today and lowers ease, never below 1.3", () => {
    let s = schedule(undefined, 2, 1);
    for (let i = 0; i < 10; i++) s = schedule(s, 0, 2);
    expect(s).toMatchObject({ due: 2, ivl: 0, reps: 0, lapses: 10, ease: 1.3 });
  });
  test("easy jumps further than good", () => {
    expect(schedule(undefined, 3, 0).ivl).toBeGreaterThan(schedule(undefined, 2, 0).ivl);
  });
});

describe("cards", () => {
  const marks = { v: 1 as const, hl: ["art-2|1|4|12|y", "art-1|0|8|13|p", "art-4|0|0|3|g"], notes: {} };
  test("one card per highlighted paragraph, caput as context for incisos", () => {
    const cards = cardsFromMarks("x", law, marks);
    expect(cards.map((c) => c.id)).toEqual(["x|art-1|0", "x|art-2|1", "x|art-4|0"]);
    expect(cards[1]).toMatchObject({ text: "I - a educação;", hide: [[4, 12]], context: "Art. 2º São direitos:" });
    expect(cards[0].context).toBeUndefined();
  });
  test("color filter", () => {
    expect(cardsFromMarks("x", law, marks, new Set(["p"])).map((c) => c.id)).toEqual(["x|art-1|0"]);
  });
  test("queue: due first, then new cards up to the daily limit", () => {
    const cards = cardsFromMarks("x", law, marks);
    let srs = emptySrs();
    srs = grade(srs, cards[2], 2, 10); // due day 11
    expect(buildQueue(cards, srs, 10, 1).map((c) => c.id)).toEqual([]); // 1 new already introduced today
    expect(buildQueue(cards, srs, 11, 1).map((c) => c.id)).toEqual(["x|art-4|0", "x|art-1|0"]);
  });
});

describe("cronograma", () => {
  const units = unitsOf("x", law);
  test("units skip revoked articles and weigh by length", () => {
    expect(units.map((u) => u.k)).toEqual(["art-1", "art-2", "art-4"]);
    expect(units[2].weight).toBeGreaterThan(units[0].weight);
  });
  test("study days respect chosen weekdays and stop before the exam", () => {
    const mon = parseDay("2026-11-09"); // a Monday
    expect(studyDays(mon, mon + 7, [1, 3, 5]).map((d) => d - mon)).toEqual([0, 2, 4]);
  });
  test("sessions are contiguous and balanced by weight", () => {
    const s = splitSessions(units, 2);
    expect(s.map((x) => x.map((u) => u.k))).toEqual([["art-1", "art-2"], ["art-4"]]);
    expect(segmentsOf(s[0])).toEqual([{ lawId: "x", fromKey: "art-1", toKey: "art-2", count: 2 }]);
  });
  test("agenda spreads what is left, keeps review days, and moves on after today is finished", () => {
    const mon = parseDay("2026-11-09");
    const plan: Plan = {
      name: "TJ",
      examDate: "2026-11-30",
      weekdays: [1, 2, 3, 4, 5],
      lawIds: ["x"],
      done: [],
      createdAt: "",
    };
    const a = agenda(plan, units, mon);
    expect(a.todayIsStudyDay).toBe(true);
    expect(a.reviewDays).toBe(2); // 15 study days -> 2 for review
    expect(a.readingDaysLeft).toBe(13);
    expect(a.today.length).toBeGreaterThan(0);
    const after = markRead(
      plan,
      a.today.map((u) => u.id),
      mon,
      true,
    );
    const b = agenda(after, units, mon);
    expect(b.finishedToday).toBe(true);
    expect(b.today).toEqual([]);
    expect(b.remaining).toBe(units.length - a.today.length);
  });
  test("flags when the exam is too close", () => {
    const day = parseDay("2026-11-09");
    const plan: Plan = { name: "", examDate: "2026-11-09", weekdays: [1], lawIds: ["x"], done: [], createdAt: "" };
    expect(agenda(plan, units, day).noTime).toBe(true);
  });
});
