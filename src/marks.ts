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

/** Up to this many characters of the highlighted text are stored, to find it again if the law changes. */
const SNIPPET = 60;

/** Each highlight is "articleKey|paragraph|start|end|color|text", text being the start of the highlighted words. */
export function encodeMarks(marks: Map<number, Range[]>, paras: ParaRef[], notes: Record<string, string>): LawMarks {
  const hl: string[] = [];
  for (const [g, list] of marks) {
    const p = paras[g];
    if (!p) continue;
    for (const [s, e, c] of list)
      hl.push(`${p.k}|${p.i}|${s}|${e}|${c}|${encodeURIComponent(p.t.slice(s, Math.min(e, s + SNIPPET)))}`);
  }
  return { v: 1, hl, notes: { ...notes } };
}

/**
 * Rebuild highlights against the current text. When a law was updated and the highlighted words are no
 * longer at the stored position, look for them in the same article (the nearest paragraph wins).
 * Highlights whose words are gone are dropped.
 */
export function decodeMarks(data: LawMarks, paras: ParaRef[]): Map<number, Range[]> {
  const index = new Map<string, number>();
  const byArticle = new Map<string, number[]>();
  paras.forEach((p, g) => {
    index.set(`${p.k}|${p.i}`, g);
    byArticle.set(p.k, [...(byArticle.get(p.k) ?? []), g]);
  });
  const out = new Map<number, Range[]>();
  const add = (g: number, start: number, end: number, c: Color) => {
    const len = paras[g].t.length;
    const s = Math.min(start, len);
    const e = Math.min(end, len);
    if (e > s) out.set(g, applyRange(out.get(g) ?? [], s, e, c));
  };
  for (const entry of data.hl ?? []) {
    const [k, i, a, b, c, enc] = entry.split("|");
    if (!isColor(c)) continue;
    const start = +a;
    const end = +b;
    const g = index.get(`${k}|${i}`);
    let snippet: string | null;
    try {
      snippet = enc ? decodeURIComponent(enc) : null;
    } catch {
      snippet = null;
    }
    // Old entries without text, or text still in place: use the stored position.
    if (!snippet) {
      if (g != null) add(g, start, end, c);
      continue;
    }
    if (g != null && paras[g].t.slice(start, start + snippet.length) === snippet) {
      add(g, start, end, c);
      continue;
    }
    const candidates = (byArticle.get(k) ?? [])
      .slice()
      .sort((x, y) => Math.abs(paras[x].i - +i) - Math.abs(paras[y].i - +i));
    for (const cg of candidates) {
      const at = paras[cg].t.indexOf(snippet);
      if (at >= 0) {
        add(cg, at, at + (end - start), c);
        break;
      }
    }
  }
  return out;
}
