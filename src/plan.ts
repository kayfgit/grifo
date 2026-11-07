// Study schedule (cronograma): spread the reading of the chosen laws over the study days until the exam,
// in sessions of similar reading time, keeping the last days for review. Recomputed every day from what is
// left, so missed days spread over the days that remain.
import { isHeading, type Article, type LawData } from "./laws";

export interface Plan {
  name: string;
  examDate: string; // YYYY-MM-DD
  weekdays: number[]; // 0 = domingo … 6 = sábado
  lawIds: string[];
  /** Units already read, as "lawId|articleKey". */
  done: string[];
  /** Day number on which today's session was finished, if any. */
  finishedDay?: number;
  createdAt: string;
}

export interface Unit {
  id: string; // lawId|articleKey
  lawId: string;
  k: string;
  weight: number; // characters of text, a proxy for reading time
}

export interface Segment {
  lawId: string;
  fromKey: string;
  toKey: string;
  count: number;
}

/** Articles of a law, in order, weighted by length. Revoked articles are skipped. */
export function unitsOf(lawId: string, law: LawData): Unit[] {
  const out: Unit[] = [];
  for (const it of law.items) {
    if (isHeading(it)) continue;
    const art = it as Article;
    if (art.r || art.k.includes("intro") || art.k === "preambulo") continue;
    out.push({ id: `${lawId}|${art.k}`, lawId, k: art.k, weight: art.p.reduce((n, p) => n + p.t.length, 0) });
  }
  return out;
}

const DAY_MS = 86_400_000;
export const parseDay = (iso: string): number => Math.floor(Date.parse(iso + "T00:00:00Z") / DAY_MS);
const weekdayOf = (day: number): number => new Date(day * DAY_MS).getUTCDay();

/** Study days from `from` (inclusive) to the day before the exam, on the chosen weekdays. */
export function studyDays(from: number, examDay: number, weekdays: number[]): number[] {
  const days: number[] = [];
  for (let d = from; d < examDay; d++) if (weekdays.includes(weekdayOf(d))) days.push(d);
  return days;
}

/** How many of the last study days to keep for general review: about 15%, at least 1 when there is room. */
export const reviewDayCount = (n: number): number => (n >= 4 ? Math.max(1, Math.round(n * 0.15)) : 0);

/**
 * Split units into `n` contiguous sessions of similar weight. Each day takes its fair share of what is
 * left (at least one article), so work starts today and any slack ends up at the end.
 */
export function splitSessions(units: Unit[], n: number): Unit[][] {
  if (n <= 0) return units.length ? [units] : [];
  const sessions: Unit[][] = [];
  let idx = 0;
  let left = units.reduce((s, u) => s + u.weight, 0);
  for (let d = 0; d < n; d++) {
    const target = left / (n - d);
    const session: Unit[] = [];
    let w = 0;
    while (idx < units.length && (session.length === 0 || w + units[idx].weight / 2 <= target)) {
      session.push(units[idx]);
      w += units[idx].weight;
      idx++;
    }
    left -= w;
    sessions.push(session);
  }
  return sessions;
}

/** Group a session's units into runs per law: "CF/88 arts. 5º a 17". */
export function segmentsOf(units: Unit[]): Segment[] {
  const segs: Segment[] = [];
  for (const u of units) {
    const last = segs[segs.length - 1];
    if (last && last.lawId === u.lawId) {
      last.toKey = u.k;
      last.count++;
    } else segs.push({ lawId: u.lawId, fromKey: u.k, toKey: u.k, count: 1 });
  }
  return segs;
}

export interface Agenda {
  /** Today's reading, empty if today is not a study day, it is finished, or everything is read. */
  today: Unit[];
  todayIsStudyDay: boolean;
  finishedToday: boolean;
  /** Next sessions after today, with their day numbers. */
  upcoming: { day: number; units: Unit[] }[];
  readingDaysLeft: number;
  reviewDays: number;
  remaining: number;
  total: number;
  /** True when the exam is too close to fit the remaining reading. */
  noTime: boolean;
}

export function agenda(plan: Plan, units: Unit[], today: number): Agenda {
  const done = new Set(plan.done);
  const remainingUnits = units.filter((u) => !done.has(u.id));
  const examDay = parseDay(plan.examDate);
  const finishedToday = plan.finishedDay === today;
  const todayIsStudyDay = plan.weekdays.includes(weekdayOf(today)) && today < examDay;
  const all = studyDays(today, examDay, plan.weekdays);
  const review = reviewDayCount(all.length);
  const reading = all.slice(0, all.length - review).filter((d) => !(finishedToday && d === today));
  const sessions = splitSessions(remainingUnits, reading.length);
  const schedule = reading.map((day, i) => ({ day, units: sessions[i] ?? [] }));
  const first = schedule[0];
  const today_ = first && first.day === today ? first.units : [];
  return {
    today: today_,
    todayIsStudyDay,
    finishedToday,
    upcoming: schedule.filter((s) => s.day !== today).slice(0, 7),
    readingDaysLeft: reading.length,
    reviewDays: review,
    remaining: remainingUnits.length,
    total: units.length,
    noTime: remainingUnits.length > 0 && reading.length === 0,
  };
}

/** Mark units as read (and today's session as finished when they are today's units). */
export function markRead(plan: Plan, ids: string[], today: number, finishesToday: boolean): Plan {
  const done = new Set(plan.done);
  ids.forEach((id) => done.add(id));
  return { ...plan, done: [...done], finishedDay: finishesToday ? today : plan.finishedDay };
}
