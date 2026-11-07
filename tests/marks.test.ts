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
    expect(data).toEqual({ v: 1, hl: ["art-2|0|8|13|b|Texto"], notes: { "art-2": "nota" } });
    expect(decodeMarks(data, paras)).toEqual(marks);
  });
  test("drops entries for paragraphs that no longer exist or bad colors, clamps to text length", () => {
    const decoded = decodeMarks({ v: 1, hl: ["art-9|0|0|3|y", "art-1|0|0|4|x", "art-1|0|8|999|g"], notes: {} }, paras);
    expect(decoded).toEqual(new Map([[0, [[8, 17, "g"]]]]));
  });
});

describe("highlights survive law updates", () => {
  const before = [
    { k: "art-5", i: 0, t: "Art. 5º Todos são iguais perante a lei:" },
    { k: "art-5", i: 1, t: "I - homens e mulheres são iguais;" },
    { k: "art-5", i: 2, t: "II - ninguém será obrigado a fazer;" },
  ];
  const stored = encodeMarks(new Map<number, Range[]>([[2, [[5, 34, "g"]]]]), before, {});

  test("stores the highlighted words with the position", () => {
    expect(stored.hl[0]).toBe(`art-5|2|5|34|g|${encodeURIComponent("ninguém será obrigado a fazer")}`);
  });
  test("follows the words when an inciso is inserted above", () => {
    const after = [
      before[0],
      before[1],
      { k: "art-5", i: 2, t: "I-A - inciso novo inserido;" },
      { ...before[2], i: 3 },
    ];
    expect(decodeMarks(stored, after)).toEqual(new Map([[3, [[5, 34, "g"]]]]));
  });
  test("follows the words when the wording around them changes", () => {
    const after = [
      before[0],
      before[1],
      { k: "art-5", i: 2, t: "II - nenhuma pessoa: ninguém será obrigado a fazer;" },
    ];
    expect(decodeMarks(stored, after)).toEqual(new Map([[2, [[21, 50, "g"]]]]));
  });
  test("drops a highlight whose words were removed", () => {
    const after = [before[0], before[1], { k: "art-5", i: 2, t: "II - (revogado);" }];
    expect(decodeMarks(stored, after).size).toBe(0);
  });
  test("old entries without text still load by position", () => {
    expect(decodeMarks({ v: 1, hl: ["art-5|0|8|13|y"], notes: {} }, before)).toEqual(new Map([[0, [[8, 13, "y"]]]]));
  });
});
