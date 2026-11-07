// Highlight model. Each paragraph holds a sorted list of non-overlapping ranges [start, end, color].
export type Color = "y" | "g" | "p" | "b" | "o";
export type Range = [number, number, Color];

export const COLORS: Record<Color, string> = { y: "amarelo", g: "verde", p: "rosa", b: "azul", o: "laranja" };
export const isColor = (c: string): c is Color => c in COLORS;

/** Paint [s, e) with color c (newest wins), or erase it when c is null. Adjacent same-color ranges merge. */
export function applyRange(list: Range[], s: number, e: number, c: Color | null): Range[] {
  const out: Range[] = [];
  for (const [a, b, cc] of list) {
    if (b <= s || a >= e) out.push([a, b, cc]);
    else {
      if (a < s) out.push([a, s, cc]);
      if (b > e) out.push([e, b, cc]);
    }
  }
  if (c && e > s) out.push([s, e, c]);
  out.sort((x, y) => x[0] - y[0]);
  const merged: Range[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last[2] === r[2] && last[1] >= r[0]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1], r[2]]);
  }
  return merged;
}

const WORD = /[\p{L}\p{N}º°ª§-]/u;
/** Move a start offset back to the beginning of its word. */
export function snapStart(t: string, s: number): number {
  while (s > 0 && WORD.test(t[s - 1])) s--;
  return s;
}
/** Move an end offset forward to the end of its word. */
export function snapEnd(t: string, e: number): number {
  while (e < t.length && WORD.test(t[e])) e++;
  return e;
}

/** What is stored per law: highlights as "articleKey|paraIndex|start|end|color" plus notes per article. */
export interface LawMarks {
  v: 1;
  hl: string[];
  notes: Record<string, string>;
}
export const emptyMarks = (): LawMarks => ({ v: 1, hl: [], notes: {} });

export interface ParaRef {
  k: string;
  i: number;
  t: string;
}

export function encodeMarks(marks: Map<number, Range[]>, paras: ParaRef[], notes: Record<string, string>): LawMarks {
  const hl: string[] = [];
  for (const [g, list] of marks) {
    const p = paras[g];
    if (!p) continue;
    for (const [s, e, c] of list) hl.push(`${p.k}|${p.i}|${s}|${e}|${c}`);
  }
  return { v: 1, hl, notes: { ...notes } };
}

/** Rebuild highlights against the current text; entries for paragraphs that no longer exist are dropped. */
export function decodeMarks(data: LawMarks, paras: ParaRef[]): Map<number, Range[]> {
  const index = new Map<string, number>();
  paras.forEach((p, g) => index.set(`${p.k}|${p.i}`, g));
  const out = new Map<number, Range[]>();
  for (const s of data.hl ?? []) {
    const [k, i, a, b, c] = s.split("|");
    const g = index.get(`${k}|${i}`);
    if (g == null || !isColor(c)) continue;
    const len = paras[g].t.length;
    const start = Math.min(+a, len);
    const end = Math.min(+b, len);
    if (!(end > start)) continue;
    out.set(g, applyRange(out.get(g) ?? [], start, end, c));
  }
  return out;
}
