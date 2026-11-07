// Turns a planalto.gov.br law page into structured "lei seca" data:
// headings (Parte, Livro, Título, Subtítulo, Capítulo, Seção, Subseção) and articles,
// with revoked (struck-through) text removed and amendment notes split off.
import * as cheerio from "cheerio";

const BLOCK = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "td",
  "th",
  "tr",
  "table",
  "li",
  "ul",
  "ol",
  "blockquote",
  "center",
  "body",
  "html",
  "dd",
  "dt",
  "dl",
  "pre",
  "hr",
  "tbody",
  "thead",
]);
const BR = " ";

/** Extract the visible, non-revoked text of a page as an array of lines. */
export function extractLines(html) {
  const $ = cheerio.load(html);
  $("script, style, strike, s, del, img, head").remove();
  $("[style]").each((_, el) => {
    if (/line-through/i.test($(el).attr("style") || "")) $(el).remove();
  });
  $("sup").each((_, el) => {
    const t = $(el).text().trim();
    if (/^[oº°]$/i.test(t)) $(el).replaceWith("º");
    else if (/^[aª]$/i.test(t)) $(el).replaceWith("ª");
  });

  const lines = [];
  let buf = "";
  const flush = () => {
    for (const raw of buf.split(BR)) {
      const line = normalize(raw);
      if (line) lines.push(line);
    }
    buf = "";
  };
  const walk = (node) => {
    if (node.type === "text") {
      buf += node.data.replace(/[\r\n\t]+/g, " ");
      return;
    }
    if (node.type !== "tag" && node.type !== "root") return;
    const name = node.name?.toLowerCase();
    if (name === "br") {
      buf += BR;
      return;
    }
    const block = node.type === "root" || BLOCK.has(name);
    if (block) flush();
    for (const child of node.children || []) walk(child);
    if (block) flush();
  };
  walk($.root()[0]);
  flush();
  return lines;
}

// Bytes 0x80-0x9F in cp1252. Node decodes "windows-1252" as plain Latin-1, and
// numeric entities like &#150; also arrive as C1 controls, so map them by hand.
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f" + "\u0090‘’“”•–—˜™š›œ\u009džŸ";
const fixC1 = (s) => s.replace(/[\u0080-\u009f]/g, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]);

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

export function normalize(input) {
  let s = fixC1(input).replaceAll(ZERO_WIDTH_SPACE, "").replace(/\s+/g, " ").trim();
  // "P A R T E G E R A L" -> "PARTE GERAL"
  if (/^(?:[A-ZÀ-Ú] ){3,}[A-ZÀ-Ú]$/.test(s)) {
    s = s.replace(/ /g, "").replace(/^(PARTE|LIVRO)(?=[A-Z])/, "$1 ");
  }
  return s
    .replace(/^Art\s*\.\s*/i, "Art. ")
    .replace(/(Art\.\s*\d[\d.]*|§\s*\d+)\s*o(?=[\s.\-–—,;:]|$)/g, "$1º")
    .replace(/(Art\.\s*\d[\d.]*|§\s*\d+)\s+º/g, "$1º")
    .replace(/§\s*(\d)/g, "§ $1")
    .trim();
}

const NOTE_START =
  /^(Reda[çc][ãa]o|Inclu[íi]d|Acrescentad|Acrescid|Revogad|Vide\b|Ver\b|Veja|Vig[êe]ncia|Regulament|Renumerad|Promulga|Produ[çc][ãa]o de efeito|Express[ãa]o|Com reda[çc][ãa]o|Declarad|Suspens|Em vigor|Transformad|Alterad|Restabelecid|Convers[ãa]o|Mantid|Retificad|Revigorad|Execu[çc][ãa]o|Prorrogad|Inconstitucional|ADI|ADC|ADPF|Efic[áa]cia|Vigora|Publica[çc][ãa]o|Interpreta[çc][ãa]o|Nova reda|Texto (?:inclu|alter|revog|compil)|Dispositivo|Par[áa]grafo (?:inclu|acresc|renum|revog)|Artigo (?:inclu|acresc|renum|revog)|Inciso (?:inclu|acresc|revog)|Al[íi]nea (?:inclu|acresc|revog)|Partes? mantid|Vetad[oa] (?:pelo|pela)|Derrubad|Cancelad|Sem efeito|Aplica-se|Efeitos|Decis[ãa]o|Medida Provis[óo]ria)/i;

const TRAILING_GROUP = /\s*\(((?:[^()]|\([^()]*\))*)\)\s*[.;]?\s*$/;

/** Split trailing amendment notes "(Redação dada pela Lei nº ...)" from law text. */
export function splitNotes(text) {
  const notes = [];
  let rest = text;
  for (;;) {
    const m = rest.match(TRAILING_GROUP);
    if (!m || !NOTE_START.test(m[1].trim())) break;
    notes.unshift(m[1].trim());
    rest = rest.slice(0, m.index).trimEnd();
  }
  return { text: rest, notes };
}

const HEADING =
  /^(PARTE|LIVRO|T[ÍI]TULO|SUBT[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+([IVXLCDM]+(?:\s*[-–]\s*[A-Z])?|[ÚU]NIC[OA]|GERAL|ESPECIAL|COMPLEMENTAR|PRELIMINAR|\d+)(?![a-zà-ú])\.?\s*(?:[-–—:.]\s*)?(.*)$/i;
const LEVEL = { PARTE: 0, LIVRO: 1, TITULO: 2, SUBTITULO: 3, CAPITULO: 4, SECAO: 5, SUBSECAO: 6 };
const MINOR = 7;
const SPECIAL_HEADING =
  /^(ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS|PRE[ÂA]MBULO|DISPOSI[ÇC][ÕO]ES (?:FINAIS|TRANSIT[ÓO]RIAS|GERAIS|PRELIMINARES)(?: E (?:FINAIS|TRANSIT[ÓO]RIAS))?|DISPOSI[ÇC][ÃA]O (?:FINAL|PRELIMINAR|TRANSIT[ÓO]RIA))\.?$/i;
const ADCT = /^ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS/;
const ARTICLE = /^Art\.\s*(\d[\d.]*)\s*(?:º|°)?((?:\s?-[A-Z]{1,2}(?![A-Za-zÀ-ú]))*)/;
const STRUCTURAL =
  /^(Art\.|§|Par[áa]grafo [úu]nico|[IVXLCDM]+\s*(?:[-–—.(]|$)|[a-z]\)|\d+\s*[-–—).]|\(VETADO\)|\(Revogad)/i;
const START =
  /^(O PRESIDENTE DA REP|A PRESIDENTA DA REP|O VICE-PRESIDENTE|O PRESIDENTE DO SENADO|PRE[ÂA]MBULO|N[óo]s,? representantes|O CONGRESSO NACIONAL|Fa[çc]o saber|A MESA DA C[ÂA]MARA)/i;
const END = /^((Bras[íi]lia|Rio de Janeiro),?\s+(em\s+)?\d|Este texto n[ãa]o substitui)/i;
// Leftovers of struck-out text: a lone numeral or letter, or a row of dots.
const FRAGMENT = /^([IVXLCDM]+|[A-Za-z]|[.…\s]{3,})$/;
// Heading names that end in one of these words continue on the next line.
const OPEN_END = / (DE|DA|DO|DAS|DOS|E|OU|EM|AO|AOS|À|ÀS|COM|PARA|POR|SOBRE|CONTRA|A|O|AS|OS|NA|NO|NAS|NOS)$/;

const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const isUpper = (s) => /[A-ZÀ-Ú]{2,}/.test(s) && s === s.toUpperCase();
const isNoteOnly = (s) => {
  const { text, notes } = splitNotes(s);
  return text === "" && notes.length > 0;
};
const isHeadingLike = (s) => HEADING.test(s) || SPECIAL_HEADING.test(s) || ARTICLE.test(s);

export function articleKey(text, prefix = "") {
  const m = text.match(ARTICLE);
  if (!m) return null;
  const num = m[1].replace(/\./g, "").replace(/^0+(?=\d)/, "");
  return `${prefix}art-${num}${m[2].replace(/\s/g, "")}`;
}

/**
 * Build the structured law from extracted lines.
 * Items are either headings {h, l, n, id, a?} or articles {k, p:[{t, n?, r?}], rb?, r?}.
 */
export function buildLaw(lines) {
  const items = [];
  const seen = new Map();
  let started = false;
  let article = null;
  let prefix = "";
  let pendingRubric = null;
  let hCount = 0;
  let lastText = null; // last paragraph or heading, for stray note lines

  const uniqueKey = (key) => {
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}~${n}`;
  };
  const pushHeading = (level, label, name, notes) => {
    article = null;
    const h = { h: level, l: label, n: name || "", id: `h${++hCount}` };
    if (notes.length) h.a = notes;
    items.push(h);
    lastText = h;
    return h;
  };
  const addPara = (raw, rubric = false) => {
    const { text, notes } = splitNotes(raw);
    if (!article) {
      article = { k: uniqueKey(prefix + "intro"), p: [] };
      items.push(article);
    }
    const para = { t: text || raw };
    if (notes.length && text) para.n = notes;
    if (rubric) para.r = 1;
    article.p.push(para);
    lastText = para;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FRAGMENT.test(line.replace(/[“”"]/g, "").trim())) continue;
    const next = lines[i + 1] || "";
    // Quoted text is an amendment to another law: keep it as plain text of the article.
    if (started && article && /^[“"]/.test(line)) {
      addPara(line);
      continue;
    }
    if (!started) {
      if (
        START.test(line) ||
        HEADING.test(line) ||
        (isUpper(line) && SPECIAL_HEADING.test(line)) ||
        ARTICLE.test(line)
      ) {
        started = true;
      } else continue;
    }
    if (END.test(line) && items.some((it) => it.k && !it.k.endsWith("intro"))) {
      // The CF is dated before the ADCT; skip the signatures and keep going.
      const adct = lines.slice(i + 1, i + 60).findIndex((l) => ADCT.test(l));
      if (adct >= 0 && !prefix) {
        i += adct;
        continue;
      }
      break;
    }

    if (isNoteOnly(line)) {
      if (lastText) {
        const { notes } = splitNotes(line);
        if ("t" in lastText) lastText.n = [...(lastText.n || []), ...notes];
        else lastText.a = [...(lastText.a || []), ...notes];
      }
      continue;
    }

    const hm = line.match(HEADING);
    if (hm && !ARTICLE.test(line)) {
      const word = stripAccents(hm[1]).toUpperCase();
      const label = `${hm[1]} ${hm[2]}`.replace(/\s+/g, " ").replace(/\s*[-–]\s*/, "-");
      let { text: name, notes } = splitNotes(hm[3] || "");
      if (!name && next && !STRUCTURAL.test(next) && !HEADING.test(next) && !ARTICLE.test(next) && next.length < 260) {
        const s = splitNotes(next);
        name = s.text;
        notes = notes.concat(s.notes);
        i++;
      }
      while (isUpper(name) && OPEN_END.test(name)) {
        const after = splitNotes(lines[i + 1] || "");
        if (!isUpper(after.text) || STRUCTURAL.test(after.text) || isHeadingLike(after.text)) break;
        name = `${name} ${after.text}`;
        notes = notes.concat(after.notes);
        i++;
      }
      pushHeading(LEVEL[word], label, name, notes);
      continue;
    }
    const { text: plain, notes: plainNotes } = splitNotes(line);
    if (isUpper(plain) && SPECIAL_HEADING.test(plain)) {
      if (ADCT.test(plain)) prefix = "adct-";
      pushHeading(0, plain, "", plainNotes);
      if (/PRE[ÂA]MBULO/i.test(plain)) {
        article = { k: uniqueKey("preambulo"), p: [] };
        items.push(article);
      }
      continue;
    }
    if (ARTICLE.test(line)) {
      article = { k: uniqueKey(articleKey(line, prefix)), p: [] };
      if (pendingRubric) article.rb = pendingRubric;
      pendingRubric = null;
      items.push(article);
      addPara(line);
      continue;
    }
    // Epígrafe (rubric): short title line followed by an article or paragraph.
    if (
      plain.length < 120 &&
      !STRUCTURAL.test(plain) &&
      !/[.;:,]$/.test(plain) &&
      (ARTICLE.test(next) || /^(§|Par[áa]grafo [úu]nico)/i.test(next))
    ) {
      if (ARTICLE.test(next)) pendingRubric = plain;
      else addPara(line, true);
      continue;
    }
    // Uppercase line with no label: continues the heading right above it, or is a minor heading.
    if (isUpper(plain) && plain.length < 160 && !STRUCTURAL.test(plain) && !/[;:]$/.test(plain)) {
      const prev = items.at(-1);
      if (prev && "h" in prev && prev.h < MINOR && !prev.n) {
        prev.n = plain;
        if (plainNotes.length) prev.a = [...(prev.a || []), ...plainNotes];
      } else if (prev && "h" in prev && prev.n && isUpper(prev.n)) {
        prev.n = `${prev.n} ${plain}`;
        if (plainNotes.length) prev.a = [...(prev.a || []), ...plainNotes];
      } else {
        pushHeading(MINOR, plain, "", plainNotes);
      }
      continue;
    }
    addPara(line);
  }

  for (const it of items) {
    if (it.k && it.p.length === 1 && /^Art\.\s*[\d.]+\S*\s*\.?$/.test(it.p[0].t)) {
      it.r = 1; // revoked: only the label is left
    }
  }
  return items.filter((it) => !it.k || it.p.length);
}

export function decode(buffer) {
  return new TextDecoder("latin1").decode(buffer);
}
