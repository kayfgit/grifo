// "Estudos" screen: flashcard review of highlights and the study schedule (cronograma).
import { LAWS, lawMeta, TABS, type LawData } from "./laws";
import { COLORS, isColor, type Color, type LawMarks } from "./marks";
import { agenda, markRead, parseDay, segmentsOf, unitsOf, type Plan, type Segment, type Unit } from "./plan";
import {
  buildQueue,
  cardsFromMarks,
  dayNumber,
  emptySrs,
  grade,
  previewIntervals,
  type Card,
  type Grade,
  type SrsData,
} from "./review";
import type { KV } from "./storage";
import { artLabel, esc } from "./text";

export interface StudyContext {
  kv: KV;
  fetchLaw(id: string): Promise<LawData>;
  allMarks(): Promise<Record<string, LawMarks>>;
  openArticle(lawId: string, key: string): void;
  toast(msg: string): void;
}

interface StudyPrefs {
  colors: Color[];
  newPerDay: number;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const GRADE_LABELS: Record<Grade, string> = { 0: "Errei", 1: "Difícil", 2: "Bom", 3: "Fácil" };

const fmtDays = (n: number) =>
  n <= 0 ? "agora" : n === 1 ? "1 dia" : n < 30 ? `${n} dias` : `${Math.round(n / 30)} meses`;
const dateOf = (day: number) =>
  new Date(day * 86_400_000).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
const segLabel = (s: Segment) =>
  `${lawMeta(s.lawId).short} · ${s.count === 1 ? artLabel(s.fromKey) : `${artLabel(s.fromKey)} a ${artLabel(s.toKey).replace(/^(ADCT )?Art\. /, "")}`}`;

export function initStudy(ctx: StudyContext) {
  const view = $("#study");
  const body = $("#studyBody");
  let srs: SrsData = emptySrs();
  let plan: Plan | null = null;
  let prefs: StudyPrefs = { colors: Object.keys(COLORS) as Color[], newPerDay: 20 };
  let screen: "home" | "review" | "form" = "home";
  let queue: Card[] = [];
  let current: Card | null = null;
  let revealed = false;
  let sessionStats = { done: 0, missed: 0 };

  const load = async <T>(key: string, fallback: T): Promise<T> => {
    try {
      const raw = await ctx.kv.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key: string, v: unknown) => void ctx.kv.set(key, JSON.stringify(v));
  const ready = (async () => {
    srs = await load("srs", emptySrs());
    plan = await load<Plan | null>("plan", null);
    prefs = { ...prefs, ...(await load<Partial<StudyPrefs>>("studyPrefs", {})) };
    prefs.colors = prefs.colors.filter(isColor);
  })();

  async function allCards(): Promise<Card[]> {
    const marks = await ctx.allMarks();
    const colors = new Set(prefs.colors);
    const cards: Card[] = [];
    // Catalog order, so the CF comes before the special laws.
    for (const { id } of LAWS) {
      const m = marks[id];
      if (m) cards.push(...cardsFromMarks(id, await ctx.fetchLaw(id), m, colors));
    }
    return cards;
  }

  async function updateBadge(): Promise<void> {
    await ready;
    const q = buildQueue(await allCards(), srs, dayNumber(), prefs.newPerDay);
    const badge = $("#studyBadge");
    badge.textContent = q.length > 99 ? "99+" : String(q.length);
    badge.hidden = q.length === 0;
  }

  /* ---------- home ---------- */
  async function renderHome(): Promise<void> {
    screen = "home";
    await ready;
    body.innerHTML = `<p class="loading">Carregando…</p>`;
    const today = dayNumber();
    const cards = await allCards();
    const q = buildQueue(cards, srs, today, prefs.newPerDay);
    const dueCount = q.filter((c) => srs.cards[c.id]).length;
    const newCount = q.length - dueCount;
    const review = `<section class="st-card">
      <p class="eyebrow">Revisão</p>
      <h2>${q.length ? `${q.length} ${q.length === 1 ? "cartão" : "cartões"} para hoje` : cards.length ? "Revisão do dia em dia" : "Ainda não há cartões"}</h2>
      <p class="muted">${
        cards.length
          ? `${dueCount} para revisar e ${newCount} novos. Cada parágrafo grifado vira um cartão com os trechos grifados escondidos.`
          : "Grife trechos da lei com o pincel. Cada parágrafo grifado vira um cartão para revisar, com o grifo escondido."
      }</p>
      ${q.length ? `<button class="btn primary" data-act="start-review">Revisar agora</button>` : ""}
      <div class="st-row"><span>Cartões das cores</span><div class="st-colors">${(Object.keys(COLORS) as Color[])
        .map(
          (c) =>
            `<button class="dk sw sw-${c}" data-color="${c}" aria-pressed="${prefs.colors.includes(c)}" aria-label="Cartões dos grifos em ${COLORS[c]}"></button>`,
        )
        .join("")}</div></div>
      <div class="st-row"><span>Cartões novos por dia</span><div class="stepper"><button data-act="new-down" aria-label="Menos">−</button><output>${prefs.newPerDay}</output><button data-act="new-up" aria-label="Mais">+</button></div></div>
    </section>`;
    body.innerHTML = review + (await renderPlanCard(today));
  }

  async function renderPlanCard(today: number): Promise<string> {
    if (!plan) {
      return `<section class="st-card"><p class="eyebrow">Cronograma</p><h2>Monte seu cronograma</h2>
        <p class="muted">Escolha as leis, a data da prova e os dias em que você estuda. O Grifo divide a leitura em sessões do mesmo tamanho e reserva os últimos dias para revisão. Se você faltar um dia, o resto se redistribui.</p>
        <button class="btn primary" data-act="new-plan">Criar cronograma</button></section>`;
    }
    const units = await planUnits(plan);
    const a = agenda(plan, units, today);
    const examDay = parseDay(plan.examDate);
    const daysToExam = examDay - today;
    const pct = a.total ? Math.round(((a.total - a.remaining) / a.total) * 100) : 0;
    let todayHtml: string;
    if (a.remaining === 0) {
      todayHtml = `<p class="st-done">Leitura completa. ${daysToExam > 0 ? "Agora é revisar os grifos até a prova." : ""}</p>`;
    } else if (a.noTime) {
      todayHtml = `<p class="st-warn">Não sobram dias de estudo antes da prova para ler os ${a.remaining} artigos restantes. Ajuste a data ou os dias de estudo.</p>`;
    } else if (a.finishedToday) {
      todayHtml = `<p class="st-done">Leitura de hoje concluída.</p>`;
    } else if (!a.todayIsStudyDay) {
      todayHtml = `<p class="muted">Hoje (${WEEKDAY_NAMES[new Date(today * 86_400_000).getUTCDay()]}) não é dia de estudo no seu plano.</p>`;
    } else {
      todayHtml =
        `<ul class="st-segs">${segmentsOf(a.today)
          .map(
            (s) =>
              `<li><span>${esc(segLabel(s))}<small>${s.count} ${s.count === 1 ? "artigo" : "artigos"}</small></span><button class="btn" data-read="${s.lawId}|${s.fromKey}">Ler</button></li>`,
          )
          .join("")}</ul>` + `<button class="btn primary" data-act="finish-today">Concluí a leitura de hoje</button>`;
    }
    const upcoming = a.upcoming
      .slice(0, 5)
      .map(
        (s) =>
          `<li><b>${esc(dateOf(s.day))}</b><span>${
            segmentsOf(s.units)
              .map((g) => esc(segLabel(g)))
              .join(" · ") || "—"
          }</span></li>`,
      )
      .join("");
    return `<section class="st-card">
      <p class="eyebrow">Cronograma · ${esc(plan.name || "Meu plano")}</p>
      <h2>${daysToExam > 0 ? `Prova em ${daysToExam} ${daysToExam === 1 ? "dia" : "dias"}` : daysToExam === 0 ? "A prova é hoje" : "A data da prova passou"}</h2>
      <div class="st-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="muted">${a.total - a.remaining} de ${a.total} artigos lidos (${pct}%). ${a.readingDaysLeft} ${a.readingDaysLeft === 1 ? "dia" : "dias"} de leitura e ${a.reviewDays} de revisão pela frente.</p>
      <h3>Hoje</h3>${todayHtml}
      ${upcoming ? `<h3>Próximos dias</h3><ul class="st-next">${upcoming}</ul>` : ""}
      <div class="btns"><button class="btn" data-act="edit-plan">Editar</button><button class="btn" data-act="delete-plan">Apagar</button></div>
    </section>`;
  }

  const unitsCache = new Map<string, Unit[]>();
  async function planUnits(p: Plan): Promise<Unit[]> {
    const out: Unit[] = [];
    for (const id of p.lawIds) {
      if (!unitsCache.has(id)) unitsCache.set(id, unitsOf(id, await ctx.fetchLaw(id)));
      out.push(...unitsCache.get(id)!);
    }
    return out;
  }

  /* ---------- plan form ---------- */
  function renderForm(): void {
    screen = "form";
    const p = plan;
    const minDate = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE");
    const chosen = new Set(p?.lawIds ?? ["cf"]);
    const weekdays = new Set(p?.weekdays ?? [1, 2, 3, 4, 5]);
    body.innerHTML = `<form class="st-card st-form" id="planForm">
      <p class="eyebrow">${p ? "Editar cronograma" : "Novo cronograma"}</p>
      <label>Concurso<input id="pfName" maxlength="60" placeholder="Ex.: TJ-SP Escrevente" value="${esc(p?.name ?? "")}"></label>
      <label>Data da prova<input id="pfDate" type="date" min="${minDate}" required value="${esc(p?.examDate ?? "")}"></label>
      <fieldset><legend>Dias de estudo</legend><div class="st-week">${WEEKDAYS.map(
        (d, i) =>
          `<button type="button" data-wd="${i}" aria-pressed="${weekdays.has(i)}" aria-label="${WEEKDAY_NAMES[i]}">${d}</button>`,
      ).join("")}</div></fieldset>
      <fieldset><legend>Leis</legend>${TABS.map((t) => {
        const ls = LAWS.filter((l) => l.tab === t);
        return `<div class="st-tab"><p class="pk-group">${esc(t)}${ls.length > 1 ? ` <button type="button" class="linkish" data-all="${esc(t)}">marcar todas</button>` : ""}</p>${ls
          .map(
            (l) =>
              `<label class="st-law"><input type="checkbox" value="${l.id}"${chosen.has(l.id) ? " checked" : ""}><b>${esc(l.short)}</b><span>${esc(l.name)}</span></label>`,
          )
          .join("")}</div>`;
      }).join("")}</fieldset>
      <p class="muted small">${p ? "Os artigos que você já marcou como lidos continuam lidos." : ""}</p>
      <div class="btns"><button type="button" class="btn" data-act="cancel-form">Cancelar</button><button type="submit" class="btn primary">${p ? "Salvar" : "Criar cronograma"}</button></div>
    </form>`;
  }

  async function submitForm(): Promise<void> {
    const name = $<HTMLInputElement>("#pfName").value.trim();
    const examDate = $<HTMLInputElement>("#pfDate").value;
    const weekdays = [...body.querySelectorAll<HTMLElement>("[data-wd][aria-pressed=true]")].map((b) => +b.dataset.wd!);
    const lawIds = [...body.querySelectorAll<HTMLInputElement>(".st-law input:checked")].map((i) => i.value);
    if (!examDate) return ctx.toast("Escolha a data da prova.");
    if (parseDay(examDate) <= dayNumber()) return ctx.toast("A data da prova precisa ser depois de hoje.");
    if (!weekdays.length) return ctx.toast("Escolha ao menos um dia de estudo.");
    if (!lawIds.length) return ctx.toast("Escolha ao menos uma lei.");
    plan = {
      name,
      examDate,
      weekdays,
      lawIds,
      done: plan?.done ?? [],
      finishedDay: plan?.finishedDay,
      createdAt: plan?.createdAt ?? new Date().toISOString(),
    };
    save("plan", plan);
    await renderHome();
  }

  /* ---------- review session ---------- */
  async function startReview(): Promise<void> {
    queue = buildQueue(await allCards(), srs, dayNumber(), prefs.newPerDay);
    sessionStats = { done: 0, missed: 0 };
    screen = "review";
    nextCard();
  }
  function nextCard(): void {
    current = queue.shift() ?? null;
    revealed = false;
    renderCard();
  }
  function clozeHtml(card: Card, show: boolean): string {
    let html = "";
    let at = 0;
    for (const [s, e] of card.hide) {
      html += esc(card.text.slice(at, s));
      const word = esc(card.text.slice(s, e));
      html += show
        ? `<mark class="m-y st-ans">${word}</mark>`
        : `<span class="st-blank" aria-label="trecho escondido">${word}</span>`;
      at = e;
    }
    return html + esc(card.text.slice(at));
  }
  function renderCard(): void {
    if (!current) {
      body.innerHTML = `<section class="st-card st-end"><p class="eyebrow">Revisão</p><h2>Revisão concluída</h2>
        <p class="muted">${sessionStats.done} ${sessionStats.done === 1 ? "cartão revisado" : "cartões revisados"}${sessionStats.missed ? `, ${sessionStats.missed} para rever com mais atenção` : ""}. Os próximos voltam no dia certo.</p>
        <button class="btn primary" data-act="home">Voltar</button></section>`;
      void updateBadge();
      return;
    }
    const c = current;
    const iv = previewIntervals(srs.cards[c.id], dayNumber());
    body.innerHTML = `<section class="st-card st-review">
      <p class="st-meta"><span>${esc(lawMeta(c.lawId).short)} · ${esc(artLabel(c.k))}</span><span>${queue.length} ${queue.length === 1 ? "restante" : "restantes"}</span></p>
      ${c.context ? `<p class="st-context">${esc(c.context)}</p>` : ""}
      <p class="st-text">${clozeHtml(c, revealed)}</p>
      ${
        revealed
          ? `<div class="st-grades">${([0, 1, 2, 3] as Grade[])
              .map(
                (g) =>
                  `<button class="btn g${g}" data-grade="${g}"><b>${GRADE_LABELS[g]}</b><small>${g === 0 ? "rever hoje" : fmtDays(iv[g])}</small></button>`,
              )
              .join("")}</div>`
          : `<button class="btn primary st-show" data-act="reveal">Mostrar resposta</button>`
      }
      <button class="linkish" data-read="${c.lawId}|${c.k}">Abrir no texto da lei</button>
    </section>`;
  }
  function gradeCurrent(g: Grade): void {
    if (!current) return;
    srs = grade(srs, current, g, dayNumber());
    save("srs", srs);
    sessionStats.done++;
    if (g === 0) {
      sessionStats.missed++;
      queue.push(current);
    }
    nextCard();
  }

  /* ---------- events ---------- */
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const read = t.closest<HTMLElement>("[data-read]");
    if (read) {
      const [lawId, key] = read.dataset.read!.split("|");
      close();
      ctx.openArticle(lawId, key);
      return;
    }
    const color = t.closest<HTMLElement>("[data-color]");
    if (color) {
      const c = color.dataset.color as Color;
      prefs.colors = prefs.colors.includes(c) ? prefs.colors.filter((x) => x !== c) : [...prefs.colors, c];
      save("studyPrefs", prefs);
      void renderHome();
      void updateBadge();
      return;
    }
    const wd = t.closest<HTMLElement>("[data-wd]");
    if (wd) {
      wd.setAttribute("aria-pressed", String(wd.getAttribute("aria-pressed") !== "true"));
      return;
    }
    const all = t.closest<HTMLElement>("[data-all]");
    if (all) {
      const boxes = [...all.closest(".st-tab")!.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
      const on = !boxes.every((b) => b.checked);
      boxes.forEach((b) => (b.checked = on));
      return;
    }
    const g = t.closest<HTMLElement>("[data-grade]");
    if (g) return gradeCurrent(+g.dataset.grade! as Grade);
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "start-review") void startReview();
    else if (act === "reveal") {
      revealed = true;
      renderCard();
    } else if (act === "home") void renderHome();
    else if (act === "new-plan" || act === "edit-plan") renderForm();
    else if (act === "cancel-form") void renderHome();
    else if (act === "new-down" || act === "new-up") {
      prefs.newPerDay = Math.min(100, Math.max(0, prefs.newPerDay + (act === "new-up" ? 5 : -5)));
      save("studyPrefs", prefs);
      void renderHome();
      void updateBadge();
    } else if (act === "finish-today") void finishToday();
    else if (act === "delete-plan") {
      const b = t.closest<HTMLButtonElement>("button")!;
      if (b.dataset.confirm) {
        plan = null;
        void ctx.kv.set("plan", "null");
        void renderHome();
      } else {
        b.dataset.confirm = "1";
        b.textContent = "Toque de novo para apagar";
      }
    }
  });
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitForm();
  });
  async function finishToday(): Promise<void> {
    if (!plan) return;
    const today = dayNumber();
    const a = agenda(plan, await planUnits(plan), today);
    plan = markRead(
      plan,
      a.today.map((u) => u.id),
      today,
      true,
    );
    save("plan", plan);
    ctx.toast("Leitura de hoje marcada como concluída.");
    await renderHome();
  }

  function open(): void {
    view.hidden = false;
    document.body.classList.add("study-open");
    void renderHome();
  }
  function close(): boolean {
    if (view.hidden) return false;
    view.hidden = true;
    document.body.classList.remove("study-open");
    void updateBadge();
    return true;
  }
  /** Back button: from a card or the form go to the study home; from the home, close. */
  function back(): boolean {
    if (view.hidden) return false;
    if (screen !== "home") {
      void renderHome();
      return true;
    }
    return close();
  }
  $("#btnStudy").addEventListener("click", open);
  $("#studyClose").addEventListener("click", () => back());
  setTimeout(() => void updateBadge(), 1500);

  return { open, close, back, updateBadge };
}
