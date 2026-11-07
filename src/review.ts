// Flashcards from highlights, scheduled with a simplified SM-2 spaced-repetition algorithm.
import { isHeading, type Article, type LawData } from "./laws";
import { decodeMarks, type Color, type LawMarks } from "./marks";

/** Grades: 0 = errei, 1 = difícil, 2 = bom, 3 = fácil. */
export type Grade = 0 | 1 | 2 | 3;

export interface CardState {
  due: number; // day number (see dayNumber)
  ivl: number; // interval in days
  ease: number;
  reps: number;
  lapses: number;
}

export interface Card {
  /** lawId|articleKey|paragraphIndex: one card per highlighted paragraph. */
  id: string;
  lawId: string;
  k: string;
  i: number;
  text: string;
  /** Highlighted ranges to hide, in order. */
  hide: [number, number][];
  /** The article's caput, shown above incisos and parágrafos for context. */
  context?: string;
}

export interface SrsData {
  cards: Record<string, CardState>;
  /** How many new cards were introduced on `day`. */
  newToday: { day: number; count: number };
}
export const emptySrs = (): SrsData => ({ cards: {}, newToday: { day: 0, count: 0 } });

/** Local calendar day as an integer, so "due today" follows the phone's clock. */
export function dayNumber(d = new Date()): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

export function schedule(prev: CardState | undefined, grade: Grade, today: number): CardState {
  const s: CardState = prev ? { ...prev } : { due: today, ivl: 0, ease: 2.5, reps: 0, lapses: 0 };
  if (grade === 0) {
    s.reps = 0;
    s.lapses += 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.ivl = 0;
    s.due = today; // comes back in this session
    return s;
  }
  if (grade === 1) {
    s.ivl = Math.max(1, Math.round(s.ivl * 1.2));
    s.ease = Math.max(1.3, s.ease - 0.15);
  } else if (grade === 2) {
    s.ivl = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.ivl * s.ease);
  } else {
    s.ivl = s.reps === 0 ? 4 : Math.round(Math.max(s.ivl, 1) * s.ease * 1.3);
    s.ease += 0.15;
  }
  s.reps += 1;
  s.due = today + s.ivl;
  return s;
}

/** Build one card per paragraph that has highlights (optionally only some colors). */
export function cardsFromMarks(lawId: string, law: LawData, marks: LawMarks, colors?: Set<Color>): Card[] {
  const paras: { k: string; i: number; t: string; caput: string }[] = [];
  for (const it of law.items) {
    if (isHeading(it)) continue;
    const art = it as Article;
    art.p.forEach((p, i) => paras.push({ k: art.k, i, t: p.t, caput: art.p[0].t }));
  }
  const byPara = decodeMarks(marks, paras);
  const cards: Card[] = [];
  for (const [g, ranges] of [...byPara.entries()].sort((a, b) => a[0] - b[0])) {
    const hide = ranges.filter(([, , c]) => !colors || colors.has(c)).map(([s, e]) => [s, e] as [number, number]);
    if (!hide.length) continue;
    const p = paras[g];
    cards.push({
      id: `${lawId}|${p.k}|${p.i}`,
      lawId,
      k: p.k,
      i: p.i,
      text: p.t,
      hide,
      context: p.i > 0 && p.caput !== p.t ? p.caput : undefined,
    });
  }
  return cards;
}

/** Today's queue: cards due (oldest first), then new cards up to the daily limit. */
export function buildQueue(cards: Card[], srs: SrsData, today: number, newPerDay: number): Card[] {
  const due = cards
    .filter((c) => srs.cards[c.id] && srs.cards[c.id].due <= today)
    .sort((a, b) => srs.cards[a.id].due - srs.cards[b.id].due);
  const introduced = srs.newToday.day === today ? srs.newToday.count : 0;
  const fresh = cards.filter((c) => !srs.cards[c.id]).slice(0, Math.max(0, newPerDay - introduced));
  return [...due, ...fresh];
}

/** Apply a grade: updates the card's schedule and the daily new-card count. */
export function grade(srs: SrsData, card: Card, g: Grade, today: number): SrsData {
  const isNew = !srs.cards[card.id];
  const newToday = srs.newToday.day === today ? { ...srs.newToday } : { day: today, count: 0 };
  if (isNew) newToday.count += 1;
  return { cards: { ...srs.cards, [card.id]: schedule(srs.cards[card.id], g, today) }, newToday };
}

/** Days until the next review for each grade, for the button labels. */
export function previewIntervals(prev: CardState | undefined, today: number): Record<Grade, number> {
  return {
    0: 0,
    1: schedule(prev, 1, today).ivl,
    2: schedule(prev, 2, today).ivl,
    3: schedule(prev, 3, today).ivl,
  };
}
