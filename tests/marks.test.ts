import { describe, expect, test } from "vitest";
import { applyRange, decodeMarks, encodeMarks, snapEnd, snapStart, type Range } from "../src/marks";

describe("applyRange", () => {
  test("paints over an empty paragraph", () => {
    expect(applyRange([], 2, 5, "y")).toEqual([[2, 5, "y"]]);
  });
  test("newest color wins where strokes overlap", () => {
    const list: Range[] = [[0, 10, "y"]];
    expect(applyRange(list, 4, 6, "g")).toEqual([
      [0, 4, "y"],
      [4, 6, "g"],
      [6, 10, "y"],
    ]);
  });
  test("erasing splits a highlight", () => {
    expect(applyRange([[0, 10, "y"]], 3, 7, null)).toEqual([
      [0, 3, "y"],
      [7, 10, "y"],
    ]);
  });
  test("touching ranges of the same color merge", () => {
    expect(applyRange([[0, 4, "p"]], 4, 8, "p")).toEqual([[0, 8, "p"]]);
  });
  test("does not mutate the input", () => {
    const list: Range[] = [[0, 4, "p"]];
    applyRange(list, 2, 8, "p");
    expect(list).toEqual([[0, 4, "p"]]);
  });
});

describe("word snapping", () => {
  const t = "Art. 5º Todos são iguais perante a lei";
  test("expands to whole words, accents and ordinals included", () => {
    expect(t.slice(snapStart(t, 10), snapEnd(t, 10))).toBe("Todos");
    expect(t.slice(snapStart(t, 6), snapEnd(t, 6))).toBe("5º");
    expect(t.slice(snapStart(t, 15), snapEnd(t, 16))).toBe("são");
  });
});

describe("encode/decode", () => {
  const paras = [
    { k: "art-1", i: 0, t: "Art. 1º Texto um." },
    { k: "art-2", i: 0, t: "Art. 2º Texto dois." },
  ];
  test("round-trips highlights and notes", () => {
    const marks = new Map<number, Range[]>([[1, [[8, 13, "b"]]]]);
    const data = encodeMarks(marks, paras, { "art-2": "nota" });
    expect(data).toEqual({ v: 1, hl: ["art-2|0|8|13|b"], notes: { "art-2": "nota" } });
    expect(decodeMarks(data, paras)).toEqual(marks);
  });
  test("drops entries for paragraphs that no longer exist or bad colors, clamps to text length", () => {
    const decoded = decodeMarks({ v: 1, hl: ["art-9|0|0|3|y", "art-1|0|0|4|x", "art-1|0|8|999|g"], notes: {} }, paras);
    expect(decoded).toEqual(new Map([[0, [[8, 17, "g"]]]]));
  });
});
