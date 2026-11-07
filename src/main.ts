import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "./styles.css";
import "./picker.css";
import "./study.css";

import {
  applyCatalog,
  BUNDLED_CATALOG,
  isHeading,
  LAWS,
  lawMeta,
  lawsInTab,
  TABS,
  type Article,
  type Heading,
  type LawData,
} from "./laws";
import { createUpdater } from "./updates";
import { applyRange, COLORS, decodeMarks, encodeMarks, snapEnd, snapStart, type Color, type Range } from "./marks";
import { artLabel, articleKeyFromInput, esc, fold, kindOf, LABEL_RE, nice, type ParaKind } from "./text";
import { createStore, parseBackup, type Backup } from "./storage";
import { initStudy } from "./study";
import { appVersion, onAppPause, onBackButton, preferencesKV, setSystemBars, shareBackup } from "./platform";

/* ================= small helpers ================= */
const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document): T => el.querySelector(s) as T;
const local = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem("grifo:" + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem("grifo:" + k, JSON.stringify(v));
    } catch {
      /* storage full or blocked: conveniences only */
    }
  },
};
let toastTimer = 0;
function toast(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2600);
}

/* ================= state ================= */
type Mode = "read" | "paint" | "erase";
type Theme = "system" | "light" | "dark";
interface ParaState {
  k: string;
  i: number;
  t: string;
  kind: ParaKind;
  f?: string;
}
interface Prefs {
  fs: number;
  notes: boolean;
  rev: boolean;
  theme: Theme;
}
const store = createStore(preferencesKV);
const updater = createUpdater(preferencesKV, BUNDLED_CATALOG);
const S = {
  lawId: "" as string,
  law: null as LawData | null,
  cache: new Map<string, LawData>(),
  paras: [] as ParaState[],
  txEls: [] as HTMLElement[],
  marks: new Map<number, Range[]>(),
  notes: {} as Record<string, string>,
  loadedMarks: false,
  mode: "read" as Mode,
  color: "y" as Color,
  panelTab: "toc" as "toc" | "search" | "marks",
  prefs: { fs: 18, notes: false, rev: true, theme: "system", ...local.get<Partial<Prefs>>("prefs", {}) } as Prefs,
  headPath: {} as Record<string, Heading[]>,
  where: "",
};
const reader = $("#reader");

/* ================= scrolling ================= */
let userScrolled = false;
for (const ev of ["wheel", "touchstart", "keydown"])
  window.addEventListener(ev, () => (userScrolled = true), { passive: true });
/** Scroll so el sits under the header; re-aim for a few frames and after web fonts load, unless the reader moved. */
function scrollToEl(el: HTMLElement, block: "start" | "center" = "start", refont = true): void {
  userScrolled = false;
  if (refont && document.fonts && document.fonts.status !== "loaded") {
    void document.fonts.ready.then(() => {
      if (!userScrolled && el.isConnected) scrollToEl(el, block, false);
    });
  }
  let n = 0;
  let last: number | null = null;
  const step = () => {
    const header = $(".top").getBoundingClientRect().bottom + 12;
    const r = el.getBoundingClientRect();
    const y = block === "center" ? r.top - (window.innerHeight - r.height) / 2 : r.top - header;
    window.scrollTo(0, Math.max(0, window.scrollY + y));
    const top = Math.round(el.getBoundingClientRect().top);
    if (top !== last && n++ < 8) {
      last = top;
      requestAnimationFrame(step);
    }
  };
  step();
}

/* ================= tabs ================= */
function renderTabs(): void {
  const cur = lawMeta(S.lawId);
  const tabs = $("#tabs");
  tabs.innerHTML = TABS.map(
    (t) => `<button class="tab" role="tab" data-tab="${t}" aria-selected="${cur.tab === t}">${t}</button>`,
  ).join("");
  const sel = tabs.querySelector<HTMLElement>("[aria-selected=true]");
  if (sel && tabs.scrollWidth > tabs.clientWidth)
    tabs.scrollLeft = sel.offsetLeft - tabs.clientWidth / 2 + sel.offsetWidth / 2;
  const chips = $("#chips");
  const inTab = lawsInTab(cur.tab);
  chips.hidden = inTab.length < 2;
  if (inTab.length >= 2) {
    chips.innerHTML =
      `<button class="chip all" data-picker="${esc(cur.tab)}"><b>Todas</b><span>${inTab.length} leis</span></button>` +
      inTab
        .map(
          (l) =>
            `<button class="chip" role="tab" data-law="${l.id}" aria-selected="${l.id === S.lawId}"><b>${esc(l.short)}</b><span>${esc(l.name)}</span></button>`,
        )
        .join("");
    const on = chips.querySelector<HTMLElement>("[aria-selected=true]");
    if (on) chips.scrollLeft = on.offsetLeft - chips.clientWidth / 2 + on.offsetWidth / 2;
  }
}
$("#tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
  if (!b) return;
  const t = b.dataset.tab!;
  const first = lawsInTab(t)[0].id;
  const last = local.get<string>("last:" + t, first);
  void openLaw(LAWS.some((l) => l.id === last && l.tab === t) ? last : first);
});
$("#chips").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const pick = target.closest<HTMLElement>("[data-picker]");
  if (pick) {
    openPicker(pick.dataset.picker!);
    return;
  }
  const b = target.closest<HTMLElement>("[data-law]");
  if (b) void openLaw(b.dataset.law!);
});

/* ================= law picker ================= */
const picker = $("#picker");
function openPicker(tab: string | null): void {
  picker.hidden = false;
  const q = $<HTMLInputElement>("#pickerQ");
  q.value = "";
  q.dataset.tab = tab ?? "";
  renderPicker();
  setTimeout(() => q.focus(), 50);
}
function closePicker(): boolean {
  if (picker.hidden) return false;
  picker.hidden = true;
  return true;
}
function renderPicker(): void {
  const q = $<HTMLInputElement>("#pickerQ");
  const needle = fold(q.value.trim()).replace(/[.\s]/g, "");
  const tab = q.dataset.tab || "";
  const list = LAWS.filter((l) => {
    if (!needle) return !tab || l.tab === tab;
    return fold(`${l.short} ${l.name} ${l.tab}`).replace(/[.\s]/g, "").includes(needle);
  });
  const groups = new Map<string, typeof LAWS>();
  for (const l of list) groups.set(l.tab, [...(groups.get(l.tab) ?? []), l]);
  $("#pickerList").innerHTML = list.length
    ? [...groups.entries()]
        .map(
          ([t, ls]) =>
            `<p class="pk-group">${esc(t)}</p>` +
            ls
              .map(
                (l) =>
                  `<button class="pk-item${l.id === S.lawId ? " on" : ""}" data-law="${l.id}"><b>${esc(l.short)}</b><span>${esc(l.name)}</span></button>`,
              )
              .join(""),
        )
        .join("")
    : `<p class="empty">Nenhuma lei encontrada para “${esc(q.value)}”.</p>`;
}
$("#pickerQ").addEventListener("input", renderPicker);
$("#pickerList").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-law]");
  if (!b) return;
  closePicker();
  void openLaw(b.dataset.law!);
});
picker.addEventListener("click", (e) => {
  if (e.target === picker || (e.target as HTMLElement).closest("#pickerClose")) closePicker();
});
$("#crumbLaw").addEventListener("click", () => openPicker(null));

/* ================= loading & rendering a law ================= */
async function fetchLaw(id: string): Promise<LawData> {
  const hit = S.cache.get(id);
  if (hit) return hit;
  // A law downloaded by the update check replaces the copy bundled with the app.
  const downloaded = await updater.read(id);
  if (downloaded) {
    S.cache.set(id, downloaded);
    return downloaded;
  }
  const res = await fetch(`data/${id}.json`);
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as LawData;
  S.cache.set(id, data);
  return data;
}

async function openLaw(id: string, targetKey?: string): Promise<void> {
  if (S.lawId && S.law) saveAnchor();
  flushSave();
  S.lawId = id;
  S.law = null;
  S.loadedMarks = false;
  const meta = lawMeta(id);
  local.set("last:" + meta.tab, id);
  local.set("lastLaw", id);
  renderTabs();
  $("#crumbLaw").textContent = `${meta.short} · ${meta.name}`;
  $("#crumbWhere").innerHTML = "&nbsp;";
  reader.innerHTML = `<p class="loading">Abrindo ${esc(meta.name)}…</p>`;
  try {
    const law = await fetchLaw(id);
    if (S.lawId !== id) return;
    S.law = law;
    renderLaw();
    setHash(targetKey);
    if (targetKey) jumpTo(targetKey);
    else {
      const anchor = local.get<string | null>("anchor:" + id, null);
      const el = anchor ? document.getElementById("a-" + anchor) : null;
      if (el) scrollToEl(el);
      else window.scrollTo(0, 0);
    }
    void loadMarks(id);
  } catch {
    reader.innerHTML = `<p class="loading">Não foi possível abrir este texto. Toque na aba de novo.</p>`;
  }
}

const NOTE_ICON = `<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>`;

function renderLaw(): void {
  const law = S.law!;
  const meta = lawMeta(S.lawId);
  S.paras = [];
  S.marks = new Map();
  S.notes = {};
  const out: string[] = [];
  out.push(`<header class="law-head"><p class="eyebrow">${esc(meta.name)}</p><h1>${esc(law.title)}</h1>
    <p class="meta">Texto compilado do Planalto (planalto.gov.br), baixado em ${new Date(law.fetched + "T12:00").toLocaleDateString("pt-BR")}. Trechos revogados já foram retirados.</p></header>`);
  if (!local.get("coachDone", false)) {
    out.push(`<div class="coach" id="coach"><div><b>Como grifar</b><ol>
      <li>Escolha uma cor no pincel, lá embaixo.</li>
      <li>Arraste o dedo sobre o texto. O grifo pula para a palavra inteira.</li>
      <li>Toque na mão para voltar a rolar. Com o pincel ativo, role com dois dedos.</li>
      <li>Para anotar, toque no lápis ao lado do artigo.</li></ol>
      <p class="demo-line" style="margin:8px 0 0"><b style="color:var(--ruby)">Art. 5º</b> <mark class="m-y" style="mix-blend-mode:var(--hl-blend);border-radius:3px">Todos são iguais perante a lei</mark>, sem distinção de qualquer natureza…</p></div>
      <button id="coachOk">Entendi</button></div>`);
  }
  let g = 0;
  let curH = "";
  for (const it of law.items) {
    if (isHeading(it)) {
      curH = it.id;
      const name = it.n || "";
      out.push(
        `<h2 class="hd lv${it.h}" id="${it.id}"><span class="hl">${esc(it.l)}</span>${name ? `<span class="hn${name === name.toUpperCase() ? " caps" : ""}">${esc(name)}</span>` : ""}${it.a ? `<span class="ha">(${esc(it.a.join("; "))})</span>` : ""}</h2>`,
      );
      continue;
    }
    const art = it as Article;
    const paras = art.p
      .map((p, i) => {
        const kind: ParaKind = p.r ? "rub" : kindOf(p.t, i, art.k);
        S.paras[g] = { k: art.k, i, t: p.t, kind };
        const html = `<p class="pa ${kind}"><span class="tx" data-g="${g}">${renderTx(p.t, [], kind)}</span>${p.n ? `<span class="nt">(${esc(p.n.join(") ("))})</span>` : ""}</p>`;
        g++;
        return html;
      })
      .join("");
    out.push(
      `<article class="art${art.r ? " rev" : ""}" id="a-${art.k}" data-k="${art.k}" data-h="${curH}">${art.rb ? `<p class="rb">${esc(art.rb)}</p>` : ""}<div class="body">${paras}</div><button class="note-btn" data-note="${art.k}" aria-label="Anotar ${esc(artLabel(art.k))}">${NOTE_ICON}</button></article>`,
    );
  }
  reader.innerHTML = out.join("");
  S.txEls = Array.from(reader.querySelectorAll<HTMLElement>(".tx"));
  $("#coachOk")?.addEventListener("click", () => {
    local.set("coachDone", true);
    $("#coach").remove();
  });
  buildHeadPaths();
  S.where = "";
  updateWhere();
  renderPanel();
}

function renderTx(text: string, marks: Range[], kind: ParaKind): string {
  const lm = kind && kind !== "rub" ? text.match(LABEL_RE) : null;
  const L = lm ? lm[0].length : 0;
  if (!marks.length && !L) return esc(text);
  const cuts = new Set([0, text.length, L]);
  for (const [s, e] of marks) {
    cuts.add(s);
    cuts.add(e);
  }
  const pts = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);
  let html = "";
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j];
    const b = pts[j + 1];
    if (a === b) continue;
    let h = esc(text.slice(a, b));
    if (a < L) h = `<b class="lbl">${h}</b>`;
    const m = marks.find(([s, e]) => s <= a && b <= e);
    if (m) h = `<mark class="m-${m[2]}">${h}</mark>`;
    html += h;
  }
  return html;
}
function repaint(g: number): void {
  const el = S.txEls[g];
  if (el) el.innerHTML = renderTx(S.paras[g].t, S.marks.get(g) ?? [], S.paras[g].kind);
}

/* ================= marks persistence ================= */
async function loadMarks(id: string): Promise<void> {
  const data = await store.load(id);
  if (S.lawId !== id) return;
  S.marks = decodeMarks(data, S.paras);
  for (const g of S.marks.keys()) repaint(g);
  S.notes = { ...data.notes };
  for (const k of Object.keys(S.notes)) renderNote(k);
  S.loadedMarks = true;
  if (S.panelTab === "marks") renderPanel();
}
let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  const id = S.lawId;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    if (S.lawId === id && S.loadedMarks) void store.save(id, encodeMarks(S.marks, S.paras, S.notes));
  }, 600);
}
function flushSave(): void {
  if (saveTimer && S.lawId && S.loadedMarks) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    void store.save(S.lawId, encodeMarks(S.marks, S.paras, S.notes));
  }
}
const onHide = () => {
  flushSave();
  saveAnchor();
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") onHide();
});
onAppPause(onHide);

/* ================= painting ================= */
interface Pos {
  g: number;
  o: number;
}
interface Stroke {
  start: Pos;
  end: Pos;
  x: number;
  y: number;
  id: number;
  snap: Map<number, Range[]>;
  touched: Set<number>;
}
let stroke: Stroke | null = null;
let pan: { y: number } | null = null;
const touches = new Map<number, number>();

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};
type DomRange = globalThis.Range;
function txOffset(tx: HTMLElement, node: Node, off: number): number | null {
  const r = document.createRange();
  r.setStart(tx, 0);
  try {
    r.setEnd(node, off);
  } catch {
    return null;
  }
  return r.toString().length;
}
function posFromPoint(x: number, y: number): Pos | null {
  const d = document as CaretDoc;
  let node: Node;
  let off: number;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (!p) return null;
    node = p.offsetNode;
    off = p.offset;
  } else if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y) as unknown as DomRange | null;
    if (!r) return null;
    node = r.startContainer;
    off = r.startOffset;
  } else return null;
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
  const tx = el?.closest<HTMLElement>(".tx");
  if (!tx || !reader.contains(tx)) return null;
  const o = txOffset(tx, node, off);
  return o == null ? null : { g: +tx.dataset.g!, o };
}
/** Apply a stroke from a to b on top of the snapshot taken when it started. color "" erases. */
function setStroke(st: Pick<Stroke, "snap" | "touched">, a: Pos, b: Pos, color: Color | ""): void {
  if (a.g > b.g || (a.g === b.g && a.o > b.o)) [a, b] = [b, a];
  const now = new Set<number>();
  for (let g = a.g; g <= b.g; g++) {
    const t = S.paras[g].t;
    if (!st.snap.has(g)) st.snap.set(g, S.marks.get(g) ?? []);
    const s = snapStart(t, g === a.g ? a.o : 0);
    const e = snapEnd(t, g === b.g ? b.o : t.length);
    const next = applyRange(st.snap.get(g)!, s, e, color || null);
    if (next.length) S.marks.set(g, next);
    else S.marks.delete(g);
    repaint(g);
    now.add(g);
  }
  for (const g of st.touched) {
    if (now.has(g)) continue;
    const o = st.snap.get(g)!;
    if (o.length) S.marks.set(g, o);
    else S.marks.delete(g);
    repaint(g);
  }
  st.touched = now;
}
function cancelStroke(): void {
  if (!stroke) return;
  for (const g of stroke.touched) {
    const o = stroke.snap.get(g)!;
    if (o.length) S.marks.set(g, o);
    else S.marks.delete(g);
    repaint(g);
  }
  stroke = null;
}
let raf = 0;
function tick(): void {
  raf = 0;
  if (!stroke) return;
  const pos = posFromPoint(stroke.x, stroke.y);
  if (pos) stroke.end = pos;
  setStroke(stroke, stroke.start, stroke.end, S.mode === "erase" ? "" : S.color);
  // Auto-scroll when painting near the top or bottom edge.
  const topEdge = 150;
  const botEdge = window.innerHeight - 110;
  let dy = 0;
  if (stroke.y < topEdge) dy = -Math.min(18, (topEdge - stroke.y) / 4);
  else if (stroke.y > botEdge) dy = Math.min(18, (stroke.y - botEdge) / 4);
  if (dy) {
    window.scrollBy(0, dy);
    raf = requestAnimationFrame(tick);
  }
}
const avgY = () => {
  let s = 0;
  for (const y of touches.values()) s += y;
  return s / touches.size;
};
reader.addEventListener("pointerdown", (e) => {
  if (S.mode === "read" || !S.law) return;
  if ((e.target as HTMLElement).closest(".note, .note-btn, a, .coach")) return;
  if (e.pointerType === "touch") {
    touches.set(e.pointerId, e.clientY);
    if (touches.size === 2) {
      cancelStroke();
      pan = { y: avgY() };
      return;
    }
  }
  if (!S.loadedMarks) return;
  const pos = posFromPoint(e.clientX, e.clientY);
  if (!pos) return;
  e.preventDefault();
  try {
    reader.setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone */
  }
  stroke = { start: pos, end: pos, x: e.clientX, y: e.clientY, snap: new Map(), touched: new Set(), id: e.pointerId };
  tick();
});
reader.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" && touches.has(e.pointerId)) {
    touches.set(e.pointerId, e.clientY);
    if (pan && touches.size >= 2) {
      const y = avgY();
      window.scrollBy(0, pan.y - y);
      pan.y = y;
      return;
    }
  }
  if (!stroke || e.pointerId !== stroke.id) return;
  stroke.x = e.clientX;
  stroke.y = e.clientY;
  if (!raf) raf = requestAnimationFrame(tick);
});
function endPointer(e: PointerEvent): void {
  touches.delete(e.pointerId);
  if (touches.size < 2) pan = null;
  if (stroke && e.pointerId === stroke.id) {
    if (e.type === "pointercancel") cancelStroke();
    else {
      stroke = null;
      scheduleSave();
      if (S.panelTab === "marks" && panelOpen()) renderPanel();
    }
  }
}
reader.addEventListener("pointerup", endPointer);
reader.addEventListener("pointercancel", endPointer);

/* selection -> highlight, for long-press selection or a mouse */
const selpop = $("#selpop");
let selTimer = 0;
function selectionTargets(): { start: Pos; end: Pos; rect: DOMRect } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const txOf = (n: Node) => (n.nodeType === 3 ? n.parentElement : (n as HTMLElement))?.closest<HTMLElement>(".tx");
  const a = txOf(r.startContainer);
  const b = txOf(r.endContainer);
  if (!a || !b || !reader.contains(a) || !reader.contains(b)) return null;
  const oa = txOffset(a, r.startContainer, r.startOffset);
  const ob = txOffset(b, r.endContainer, r.endOffset);
  if (oa == null || ob == null) return null;
  return { start: { g: +a.dataset.g!, o: oa }, end: { g: +b.dataset.g!, o: ob }, rect: r.getBoundingClientRect() };
}
document.addEventListener("selectionchange", () => {
  if (S.mode !== "read") return;
  clearTimeout(selTimer);
  selTimer = window.setTimeout(() => {
    const t = selectionTargets();
    if (!t || !S.loadedMarks) {
      selpop.hidden = true;
      return;
    }
    selpop.hidden = false;
    const w = selpop.offsetWidth;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const top = window.scrollY + (coarse ? t.rect.bottom + 14 : t.rect.top - selpop.offsetHeight - 8);
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, t.rect.left + t.rect.width / 2 - w / 2));
    selpop.style.top = Math.max(window.scrollY + 8, top) + "px";
    selpop.style.left = left + "px";
  }, 180);
});
selpop.addEventListener("pointerdown", (e) => e.preventDefault());
selpop.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
  if (!b) return;
  const t = selectionTargets();
  if (!t) return;
  setStroke({ snap: new Map(), touched: new Set() }, t.start, t.end, (b.dataset.c || "") as Color | "");
  window.getSelection()?.removeAllRanges();
  selpop.hidden = true;
  scheduleSave();
});

/* ================= dock / modes ================= */
const TIPS: Record<Exclude<Mode, "read">, string> = {
  paint: "Arraste sobre o texto para grifar. Role com dois dedos.",
  erase: "Arraste sobre um grifo para apagar.",
};
const SWATCH: Record<Color, string> = { y: "#ffe047", g: "#7ddc74", p: "#ff8cc0", b: "#7cc8ff", o: "#ffad4d" };
let tipTimer = 0;
function setMode(mode: Mode, color?: Color): void {
  S.mode = mode;
  if (color) S.color = color;
  document.body.classList.toggle("painting", mode !== "read");
  for (const b of document.querySelectorAll<HTMLElement>("#dock .dk")) {
    const on = b.dataset.mode === mode && (mode !== "paint" || b.dataset.c === S.color);
    b.setAttribute("aria-pressed", String(on));
  }
  if (mode === "paint") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><path d='M3 23l3-1 13-13-2-2L4 20z' fill='${SWATCH[S.color]}' stroke='#222' stroke-width='1.2'/><path d='M17 7l2-2 2 2-2 2z' fill='#444'/></svg>`;
    reader.style.setProperty("--brush-cursor", `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 23, crosshair`);
  } else if (mode === "erase") reader.style.setProperty("--brush-cursor", "cell");
  selpop.hidden = true;
  const tip = $("#dockTip");
  const seen = local.get("tip:" + mode, 0);
  if (mode !== "read" && seen < 2) {
    tip.textContent = TIPS[mode];
    tip.hidden = false;
    local.set("tip:" + mode, seen + 1);
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => (tip.hidden = true), 2800);
  } else tip.hidden = true;
}
$("#dock").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".dk");
  if (!b) return;
  const mode = b.dataset.mode as Mode;
  const c = b.dataset.c as Color | undefined;
  if (mode === "paint" && S.mode === "paint" && S.color === c) setMode("read");
  else setMode(mode, c);
});

/* ================= notes ================= */
function renderNote(k: string, editing = false): void {
  const art = document.getElementById("a-" + k);
  if (!art) return;
  let box = art.querySelector<HTMLElement>(".note");
  const text = S.notes[k] || "";
  if (!text && !editing) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.className = "note";
    box.dataset.k = k;
    art.appendChild(box);
  }
  if (editing) {
    box.innerHTML = `<span class="nh">Anotação · ${esc(artLabel(k))}</span><textarea aria-label="Anotação do ${esc(artLabel(k))}" placeholder="Escreva sua anotação…"></textarea><div class="nact"><button data-act="del">Apagar</button><button data-act="ok">Pronto</button></div>`;
    const ta = box.querySelector("textarea")!;
    ta.value = text;
    ta.focus();
    ta.addEventListener("input", () => {
      if (ta.value.trim()) S.notes[k] = ta.value;
      else delete S.notes[k];
      scheduleSave();
    });
  } else {
    box.innerHTML = `<span class="nh">Anotação</span>${esc(text)}`;
  }
}
function closeOpenNote(): boolean {
  const ta = reader.querySelector<HTMLTextAreaElement>(".note textarea");
  if (!ta) return false;
  renderNote(ta.closest<HTMLElement>(".note")!.dataset.k!, false);
  return true;
}
reader.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const nb = target.closest<HTMLElement>("[data-note]");
  if (nb) {
    if (S.loadedMarks) renderNote(nb.dataset.note!, true);
    return;
  }
  const act = target.closest<HTMLElement>(".note [data-act]");
  if (act) {
    const k = act.closest<HTMLElement>(".note")!.dataset.k!;
    if (act.dataset.act === "del") {
      delete S.notes[k];
      scheduleSave();
    }
    renderNote(k, false);
    if (S.panelTab === "marks" && panelOpen()) renderPanel();
    return;
  }
  const box = target.closest<HTMLElement>(".note");
  if (box && !box.querySelector("textarea") && S.mode === "read") renderNote(box.dataset.k!, true);
});

/* ================= breadcrumb ================= */
function buildHeadPaths(): void {
  const stack: Heading[] = [];
  S.headPath = {};
  for (const it of S.law!.items) {
    if (!isHeading(it)) continue;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.h >= it.h || top.h === 7 || /PRE[ÂA]MBULO/i.test(top.l)) stack.pop();
      else break;
    }
    stack.push(it);
    S.headPath[it.id] = stack.slice();
  }
}
function showWhere(id: string): void {
  const path = S.headPath[id] ?? [];
  const last = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const s = last ? `${parent ? nice(parent.l) + " · " : ""}${nice(last.l)}${last.n ? " — " + nice(last.n) : ""}` : "";
  $("#crumbWhere").textContent = s || " ";
  document.querySelectorAll(".toc a.on").forEach((a) => a.classList.remove("on"));
  document.querySelector(`.toc a[href="#${id}"]`)?.classList.add("on");
}
function updateWhere(): void {
  const el = document.elementFromPoint(Math.min(window.innerWidth / 2, 520), Math.min(window.innerHeight * 0.4, 240));
  const hd = el?.closest<HTMLElement>(".hd, .art");
  if (!hd) return;
  const id = hd.classList.contains("hd") ? hd.id : hd.dataset.h;
  if (id && id !== S.where) {
    S.where = id;
    showWhere(id);
  }
}
let whereRaf = 0;
let anchorTimer = 0;
window.addEventListener(
  "scroll",
  () => {
    if (!whereRaf)
      whereRaf = requestAnimationFrame(() => {
        whereRaf = 0;
        updateWhere();
      });
    clearTimeout(anchorTimer);
    anchorTimer = window.setTimeout(saveAnchor, 400);
  },
  { passive: true },
);
function saveAnchor(): void {
  if (!S.lawId || !S.law) return;
  const el = document.elementFromPoint(Math.min(window.innerWidth / 2, 500), Math.min(window.innerHeight / 2, 220));
  const art = el?.closest<HTMLElement>(".art");
  if (art) local.set("anchor:" + S.lawId, art.dataset.k);
}

/* ================= side panel ================= */
const panel = $("#panel");
const wide = matchMedia("(min-width: 1100px)");
const panelOpen = () => wide.matches || panel.classList.contains("open");
function openPanel(tab?: typeof S.panelTab): void {
  if (tab) S.panelTab = tab;
  if (!wide.matches) {
    panel.classList.add("open");
    $("#scrim").hidden = false;
  }
  renderPanel();
  if (tab === "search") setTimeout(() => $<HTMLInputElement>("#q")?.focus(), 60);
}
function closePanel(): boolean {
  if (!panel.classList.contains("open")) return false;
  panel.classList.remove("open");
  $("#scrim").hidden = true;
  return true;
}
$("#btnPanel").addEventListener("click", () => (panel.classList.contains("open") ? closePanel() : openPanel("toc")));
$("#btnSearch").addEventListener("click", () => openPanel("search"));
$("#btnMarks").addEventListener("click", () => openPanel("marks"));
$("#btnClose").addEventListener("click", () => closePanel());
$("#scrim").addEventListener("click", () => closePanel());
panel.querySelector(".panel-tabs")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pt]");
  if (b) {
    S.panelTab = b.dataset.pt as typeof S.panelTab;
    renderPanel();
  }
});

let lastQuery = "";
let markFilter: Color | "" = "";
function renderPanel(): void {
  panel
    .querySelectorAll<HTMLElement>(".ptab")
    .forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pt === S.panelTab)));
  const body = $("#panelBody");
  if (!S.law) {
    body.innerHTML = `<p class="empty">Carregando…</p>`;
    return;
  }
  if (S.panelTab === "toc") {
    const heads = S.law.items.filter(isHeading);
    body.innerHTML = `<label class="field"><svg class="i" viewBox="0 0 24 24"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/></svg><input id="goto" inputmode="text" enterkeyhint="go" placeholder="Ir para o artigo (ex.: 5, 1.228, 121-A)" autocomplete="off"></label>
      ${S.lawId === "cf" ? `<p class="hint">Para o ADCT, digite “adct 10”.</p>` : ""}
      <nav class="toc">${heads
        .map(
          (h) =>
            `<a class="lv${h.h}${h.id === S.where ? " on" : ""}" href="#${h.id}" style="padding-left:${10 + Math.min(h.h, 6) * 10}px"><span class="tl">${esc(nice(h.l))}</span>${h.n ? `<span class="tn">${esc(nice(h.n))}</span>` : ""}</a>`,
        )
        .join("")}</nav>`;
    $<HTMLInputElement>("#goto").addEventListener("keydown", (e) => {
      if (e.key === "Enter") gotoArticle((e.target as HTMLInputElement).value);
    });
    return;
  }
  if (S.panelTab === "search") {
    body.innerHTML = `<label class="field"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input id="q" type="search" enterkeyhint="search" placeholder="Buscar em ${esc(lawMeta(S.lawId).short)}" value="${esc(lastQuery)}" autocomplete="off"></label><div id="results"></div>`;
    const q = $<HTMLInputElement>("#q");
    let t = 0;
    q.addEventListener("input", () => {
      clearTimeout(t);
      t = window.setTimeout(() => runSearch(q.value), 220);
    });
    runSearch(lastQuery);
    return;
  }
  const groups = new Map<string, { first: number; items: { c: Color; text: string }[] }>();
  for (const [g, list] of S.marks) {
    const p = S.paras[g];
    for (const [s, e, c] of list) {
      if (markFilter && c !== markFilter) continue;
      if (!groups.has(p.k)) groups.set(p.k, { first: g, items: [] });
      groups.get(p.k)!.items.push({ c, text: p.t.slice(s, e) });
    }
  }
  if (!markFilter)
    for (const k of Object.keys(S.notes)) {
      if (!groups.has(k)) groups.set(k, { first: S.paras.findIndex((p) => p.k === k), items: [] });
    }
  const ordered = [...groups.entries()].sort((a, b) => a[1].first - b[1].first);
  const filters = `<div class="mfilter">${(["", ...Object.keys(COLORS)] as (Color | "")[])
    .map(
      (c) =>
        `<button class="dk ${c ? "sw sw-" + c : ""}" data-f="${c}" aria-pressed="${markFilter === c}" aria-label="${c ? "Só " + COLORS[c] : "Todas as cores"}" style="width:34px;height:34px">${c ? "" : "<b style='font-size:11px'>todas</b>"}</button>`,
    )
    .join("")}</div>`;
  body.innerHTML =
    `<p class="store-state"><i></i>Salvo neste aparelho. Faça backup em Leitura › Backup.</p>${filters}` +
    (ordered.length
      ? ordered
          .map(
            ([k, grp]) =>
              `<button class="res" data-jump="${k}"><span class="rk">${esc(artLabel(k))}</span>${grp.items.map((m) => `<span class="rt"><mark class="m-${m.c}" style="mix-blend-mode:var(--hl-blend)">${esc(m.text)}</mark></span>`).join("")}${S.notes[k] && !markFilter ? `<span class="rt" style="font-family:var(--sans);font-size:12.5px;background:var(--note);color:var(--note-ink);padding:4px 8px;border-radius:6px;margin-top:4px">✎ ${esc(S.notes[k].slice(0, 160))}</span>` : ""}</button>`,
          )
          .join("")
      : `<p class="empty">${S.loadedMarks ? "Nada grifado nem anotado nesta lei ainda. Escolha uma cor no pincel e arraste sobre o texto." : "Carregando seus grifos…"}</p>`);
}
$("#panelBody").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const f = target.closest<HTMLElement>("[data-f]");
  if (f) {
    markFilter = (f.dataset.f || "") as Color | "";
    renderPanel();
    return;
  }
  const j = target.closest<HTMLElement>("[data-jump]");
  if (j) {
    e.preventDefault();
    jumpTo(j.dataset.jump!, j.dataset.g != null ? +j.dataset.g : null);
    if (!wide.matches) closePanel();
    return;
  }
  const a = target.closest<HTMLAnchorElement>(".toc a");
  if (a) {
    e.preventDefault();
    const el = document.getElementById(a.getAttribute("href")!.slice(1));
    if (el) scrollToEl(el);
    if (!wide.matches) closePanel();
  }
});
function runSearch(q: string): void {
  lastQuery = q;
  const box = $("#results");
  if (!box) return;
  const needle = fold(q.trim());
  if (needle.length < 2) {
    box.innerHTML = `<p class="empty">Digite ao menos duas letras. A busca ignora acentos.</p>`;
    return;
  }
  const hits: { g: number; at: number }[] = [];
  for (let g = 0; g < S.paras.length && hits.length < 120; g++) {
    const p = S.paras[g];
    const f = p.f ?? (p.f = fold(p.t));
    const at = f.indexOf(needle);
    if (at >= 0) hits.push({ g, at });
  }
  if (!hits.length) {
    box.innerHTML = `<p class="empty">Nada encontrado para “${esc(q)}”.</p>`;
    return;
  }
  box.innerHTML =
    `<p class="hint">${hits.length >= 120 ? "Mostrando os 120 primeiros resultados" : hits.length + (hits.length === 1 ? " resultado" : " resultados")}</p>` +
    hits
      .map(({ g, at }) => {
        const t = S.paras[g].t;
        const a = Math.max(0, at - 60);
        const b = Math.min(t.length, at + needle.length + 90);
        const snippet =
          (a > 0 ? "…" : "") +
          esc(t.slice(a, at)) +
          "<em>" +
          esc(t.slice(at, at + needle.length)) +
          "</em>" +
          esc(t.slice(at + needle.length, b)) +
          (b < t.length ? "…" : "");
        return `<button class="res" data-jump="${S.paras[g].k}" data-g="${g}"><span class="rk">${esc(artLabel(S.paras[g].k))}</span><span class="rt">${snippet}</span></button>`;
      })
      .join("");
}
function gotoArticle(v: string): void {
  const key = articleKeyFromInput(v);
  if (!key) {
    toast("Digite só o número do artigo, como 5 ou 121-A.");
    return;
  }
  if (!document.getElementById("a-" + key)) {
    toast(`${artLabel(key)} não existe nesta lei (ou foi revogado).`);
    return;
  }
  jumpTo(key);
  if (!wide.matches) closePanel();
}
function jumpTo(k: string, g: number | null = null): void {
  const el = document.getElementById("a-" + k);
  if (!el) return;
  const target = g != null && S.txEls[g] ? S.txEls[g] : el;
  scrollToEl(target, g != null ? "center" : "start");
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1700);
  setHash(k);
}

/* ================= settings ================= */
const settings = $("#settings");
function applyPrefs(): void {
  document.documentElement.style.setProperty("--text-size", S.prefs.fs + "px");
  $("#fsOut").textContent = String(S.prefs.fs);
  document.body.classList.toggle("show-notes", S.prefs.notes);
  document.body.classList.toggle("hide-rev", !S.prefs.rev);
  $("#swNotes").setAttribute("aria-checked", String(S.prefs.notes));
  $("#swRev").setAttribute("aria-checked", String(S.prefs.rev));
  if (S.prefs.theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", S.prefs.theme);
  document
    .querySelectorAll<HTMLElement>("[data-theme-opt]")
    .forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeOpt === S.prefs.theme)));
  setSystemBars(S.prefs.theme);
  local.set("prefs", S.prefs);
}
function closeSettings(): boolean {
  if (settings.hidden) return false;
  settings.hidden = true;
  $("#btnSettings").setAttribute("aria-pressed", "false");
  return true;
}
$("#btnSettings").addEventListener("click", (e) => {
  settings.hidden = !settings.hidden;
  $("#btnSettings").setAttribute("aria-pressed", String(!settings.hidden));
  e.stopPropagation();
});
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (!settings.hidden && !settings.contains(t) && !t.closest("#btnSettings") && !t.closest("#confirm"))
    closeSettings();
});
$("#fsDown").addEventListener("click", () => {
  S.prefs.fs = Math.max(14, S.prefs.fs - 1);
  applyPrefs();
});
$("#fsUp").addEventListener("click", () => {
  S.prefs.fs = Math.min(26, S.prefs.fs + 1);
  applyPrefs();
});
$("#swNotes").addEventListener("click", () => {
  S.prefs.notes = !S.prefs.notes;
  applyPrefs();
});
$("#swRev").addEventListener("click", () => {
  S.prefs.rev = !S.prefs.rev;
  applyPrefs();
});
$("#theme").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-theme-opt]");
  if (!b) return;
  S.prefs.theme = b.dataset.themeOpt as Theme;
  applyPrefs();
});

/* ================= backup ================= */
$("#btnExport").addEventListener("click", async () => {
  flushSave();
  try {
    const backup = await store.exportAll();
    const n = Object.keys(backup.laws).length;
    if (!n) {
      toast("Ainda não há grifos nem anotações para exportar.");
      return;
    }
    const day = new Date().toLocaleDateString("sv-SE"); // local YYYY-MM-DD
    await shareBackup(JSON.stringify(backup), `grifo-backup-${day}.json`);
  } catch (err) {
    if (!String(err).toLowerCase().includes("cancel")) toast("Não foi possível exportar o backup.");
  }
});
let pendingBackup: Backup | null = null;
$("#btnImport").addEventListener("click", () => $<HTMLInputElement>("#importFile").click());
$<HTMLInputElement>("#importFile").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    pendingBackup = parseBackup(await file.text());
  } catch (err) {
    toast((err as Error).message);
    return;
  }
  const names = Object.keys(pendingBackup.laws).map((id) => lawMeta(id).short);
  const when = new Date(pendingBackup.exportedAt).toLocaleDateString("pt-BR");
  $("#confirmText").textContent =
    `Backup de ${when} com grifos de: ${names.join(", ")}. Os grifos e anotações dessas leis neste aparelho serão substituídos pelos do backup.`;
  $("#confirm").hidden = false;
});
function closeConfirm(): boolean {
  if ($("#confirm").hidden) return false;
  $("#confirm").hidden = true;
  pendingBackup = null;
  return true;
}
$("#confirmNo").addEventListener("click", () => closeConfirm());
$("#confirmYes").addEventListener("click", async () => {
  const backup = pendingBackup;
  closeConfirm();
  if (!backup) return;
  flushSave();
  const n = await store.importAll(backup);
  toast(`Backup importado: ${n} ${n === 1 ? "lei" : "leis"}.`);
  if (S.law) {
    for (const g of S.marks.keys()) {
      S.marks.delete(g);
      repaint(g);
    }
    reader.querySelectorAll(".note").forEach((n) => n.remove());
    void loadMarks(S.lawId);
  }
});

/* ================= hash routing ================= */
function setHash(k?: string): void {
  const h = "#" + S.lawId + (k ? "--" + k : "");
  if (location.hash !== h) {
    try {
      history.replaceState(null, "", h);
    } catch {
      /* ignore */
    }
  }
}
function routeFromHash(): { lawId: string; k?: string } | null {
  const [lawId, k] = location.hash.slice(1).split("--");
  return LAWS.some((l) => l.id === lawId) ? { lawId, k } : null;
}
window.addEventListener("hashchange", () => {
  const r = routeFromHash();
  if (!r) return;
  if (r.lawId !== S.lawId) void openLaw(r.lawId, r.k);
  else if (r.k) jumpTo(r.k);
});
wide.addEventListener("change", () => {
  closePanel();
  renderPanel();
});

/* ================= Android back button ================= */
const study = initStudy({
  kv: preferencesKV,
  fetchLaw,
  allMarks: async () => {
    flushSave();
    return (await store.exportAll()).laws;
  },
  openArticle: (lawId, key) => {
    if (lawId === S.lawId && S.law) jumpTo(key);
    else void openLaw(lawId, key);
  },
  toast,
});

onBackButton(() => {
  if (study.back()) return true;
  if (closePicker()) return true;
  if (closeConfirm()) return true;
  if (closeSettings()) return true;
  if (closePanel()) return true;
  if (closeOpenNote()) return true;
  if (!selpop.hidden) {
    selpop.hidden = true;
    window.getSelection()?.removeAllRanges();
    return true;
  }
  if (S.mode !== "read") {
    setMode("read");
    return true;
  }
  return false;
});

/* ================= law updates ================= */
let checking = false;
async function renderLawsStatus(): Promise<void> {
  const last = await updater.lastCheck();
  $("#lawsStatus").textContent = last
    ? `Última verificação: ${new Date(last).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`
    : "As leis ainda não foram verificadas.";
}
async function checkLaws(manual: boolean): Promise<void> {
  if (checking) return;
  checking = true;
  const btn = $<HTMLButtonElement>("#btnCheckLaws");
  btn.disabled = true;
  btn.textContent = "Verificando…";
  try {
    const r = await updater.check();
    applyCatalog(r.catalog);
    r.updated.forEach((u) => S.cache.delete(u.id));
    renderTabs();
    if (r.updated.some((u) => u.id === S.lawId)) {
      saveAnchor();
      flushSave();
      void openLaw(S.lawId);
    }
    if (r.updated.length) {
      const names = r.updated.map((u) => u.short);
      toast(
        `${names.length === 1 ? "Lei atualizada" : `${names.length} leis atualizadas`}: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}`,
      );
    } else if (manual)
      toast(r.failed.length ? "Algumas leis não baixaram. Tente de novo mais tarde." : "Suas leis estão em dia.");
  } catch {
    if (manual) toast("Não foi possível verificar agora. Confira a internet e tente de novo.");
  } finally {
    checking = false;
    btn.disabled = false;
    btn.textContent = "Verificar atualizações";
    void renderLawsStatus();
  }
}
$("#btnCheckLaws").addEventListener("click", () => void checkLaws(true));

/* ================= boot ================= */
applyPrefs();
setMode("read");
void appVersion().then((v) => {
  if (v) $("#appVersion").textContent = `Grifo ${v}`;
});
void (async () => {
  applyCatalog(await updater.init());
  const r0 = routeFromHash();
  await openLaw(r0 ? r0.lawId : local.get("lastLaw", "cf"), r0?.k);
  void renderLawsStatus();
  // Check once a day, in the background, when online.
  const last = await updater.lastCheck();
  if (navigator.onLine && (!last || Date.now() - Date.parse(last) > 20 * 3600_000)) void checkLaws(false);
})();
