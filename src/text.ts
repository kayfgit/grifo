// Text helpers for statute rendering: escaping, accent-insensitive search, labels.
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** Lowercase and strip accents, for search that ignores "ç", "ã", etc. */
export const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const SMALL = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "ou",
  "em",
  "a",
  "o",
  "as",
  "os",
  "à",
  "às",
  "ao",
  "aos",
  "na",
  "no",
  "nas",
  "nos",
  "por",
  "para",
  "com",
  "contra",
  "sobre",
  "entre",
]);

/** "DOS DIREITOS SOCIAIS" -> "Dos Direitos Sociais"; mixed-case input is returned as is. */
export function nice(s: string): string {
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export const LABEL_RE =
  /^(Art\.\s*\d+(?:\.\d+)*(?:\s*[º°])?(?:-[A-Z]{1,2})*(?:\s*\.)?|§\s*\d+(?:\s*[º°])?(?:\s*\.)?|Par[áa]grafo [úu]nico\.?|[IVXLCDM]+\s*[-–—]|[a-z]\)|\d+\s*[-–—)])/;

export type ParaKind = "" | "cap" | "par" | "inc" | "ali" | "item" | "rub";

/** Which kind of provision a paragraph is: caput, parágrafo, inciso, alínea or item. */
export function kindOf(t: string, i: number, articleKey: string): ParaKind {
  if (articleKey.endsWith("intro") || articleKey === "preambulo") return "";
  if (i === 0 && /^Art\./.test(t)) return "cap";
  if (/^(§|Par[áa]grafo [úu]nico)/.test(t)) return "par";
  if (/^[IVXLCDM]+\s*[-–—]/.test(t)) return "inc";
  if (/^[a-z]\)/.test(t)) return "ali";
  if (/^\d+\s*[-–—)]/.test(t)) return "item";
  return "";
}

/** Human label for an article key: "art-1228" -> "Art. 1.228", "adct-art-5" -> "ADCT Art. 5º". */
export function artLabel(k: string): string {
  if (k === "preambulo") return "Preâmbulo";
  if (k.endsWith("intro")) return "Abertura";
  const m = k.match(/^(adct-)?art-(\d+)(.*)$/);
  if (!m) return k;
  const n = +m[2];
  const num = n >= 1000 ? n.toLocaleString("pt-BR") : String(n);
  return `${m[1] ? "ADCT " : ""}Art. ${num}${n < 10 ? "º" : ""}${m[3]}`;
}

/** Parse what the reader types in "go to article": "5", "1.228", "121-A", "adct 10". */
export function articleKeyFromInput(v: string): string | null {
  const m = v
    .trim()
    .toLowerCase()
    .match(/^(adct\s*)?(?:art\.?\s*)?([\d.]+)\s*[º°o]?\s*(?:-?\s*([a-z]{1,2}))?$/);
  if (!m) return null;
  return `${m[1] ? "adct-" : ""}art-${m[2].replace(/\./g, "")}${m[3] ? "-" + m[3].toUpperCase() : ""}`;
}
