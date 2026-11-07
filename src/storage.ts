// Per-law highlights and notes, kept in a key-value store (Capacitor Preferences on the phone).
import { emptyMarks, type LawMarks } from "./marks";

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface Backup {
  app: "grifo";
  v: 1;
  exportedAt: string;
  laws: Record<string, LawMarks>;
}

const LAW_PREFIX = "law:";

export function isLawMarks(x: unknown): x is LawMarks {
  if (!x || typeof x !== "object") return false;
  const m = x as Partial<LawMarks>;
  return Array.isArray(m.hl) && m.hl.every((s) => typeof s === "string") && !!m.notes && typeof m.notes === "object";
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um backup do Grifo.");
  }
  const b = data as Partial<Backup>;
  if (!b || b.app !== "grifo" || !b.laws || typeof b.laws !== "object") {
    throw new Error("O arquivo não é um backup do Grifo.");
  }
  for (const [id, marks] of Object.entries(b.laws)) {
    if (!isLawMarks(marks)) throw new Error(`O backup está corrompido (${id}).`);
  }
  return b as Backup;
}

export function createStore(kv: KV) {
  let chain: Promise<unknown> = Promise.resolve();
  // One write at a time, in order, so a slow write never lands after a newer one.
  const queue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  return {
    async load(lawId: string): Promise<LawMarks> {
      await chain;
      const raw = await kv.get(LAW_PREFIX + lawId);
      if (!raw) return emptyMarks();
      try {
        const parsed: unknown = JSON.parse(raw);
        return isLawMarks(parsed) ? { v: 1, hl: parsed.hl, notes: parsed.notes } : emptyMarks();
      } catch {
        return emptyMarks();
      }
    },
    save(lawId: string, data: LawMarks): Promise<void> {
      return queue(() => kv.set(LAW_PREFIX + lawId, JSON.stringify(data)));
    },
    async exportAll(now = new Date()): Promise<Backup> {
      await chain;
      const laws: Record<string, LawMarks> = {};
      for (const key of await kv.keys()) {
        if (!key.startsWith(LAW_PREFIX)) continue;
        const marks = await this.load(key.slice(LAW_PREFIX.length));
        if (marks.hl.length || Object.keys(marks.notes).length) laws[key.slice(LAW_PREFIX.length)] = marks;
      }
      return { app: "grifo", v: 1, exportedAt: now.toISOString(), laws };
    },
    /** Replace the marks of every law in the backup. Laws not in the backup are left alone. */
    async importAll(backup: Backup): Promise<number> {
      const entries = Object.entries(backup.laws);
      for (const [id, marks] of entries) await this.save(id, { v: 1, hl: marks.hl, notes: marks.notes });
      return entries.length;
    },
  };
}
export type Store = ReturnType<typeof createStore>;

/** In-memory KV, used in tests and in the browser when Preferences is missing. */
export function memoryKV(seed: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(seed));
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    keys: async () => [...m.keys()],
  };
}
