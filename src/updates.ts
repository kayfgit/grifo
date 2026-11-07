// Law updates: the app ships with a snapshot of every law, and once a day (or on request) compares it with
// the manifest published at github.com/kayfgit/grifo-leis. Laws whose content hash changed are downloaded
// into app storage and used instead of the bundled copy. New laws in the manifest appear in the catalog.
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import type { CatalogEntry, LawData } from "./laws";
import type { KV } from "./storage";

// VITE_DATA_URL lets a dev build point at a local copy for testing.
export const DATA_URL: string =
  import.meta.env.VITE_DATA_URL || "https://raw.githubusercontent.com/kayfgit/grifo-leis/main/";

export interface Manifest {
  schema: number;
  generated: string;
  laws: CatalogEntry[];
}

/** Downloaded laws, by id, with the catalog entry (and hash) they were downloaded with. */
export type Downloaded = Record<string, CatalogEntry>;

/** Hash of the copy the app currently uses for each law: the download if any, else the bundled one. */
export function currentHashes(bundled: CatalogEntry[], downloaded: Downloaded): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>(bundled.map((b) => [b.id, b.hash]));
  for (const [id, e] of Object.entries(downloaded)) m.set(id, e.hash);
  return m;
}

/** Laws in the manifest whose content differs from what the app has (or that it does not have at all). */
export function lawsToDownload(manifest: Manifest, current: Map<string, string | undefined>): CatalogEntry[] {
  return manifest.laws.filter((l) => l.hash && current.get(l.id) !== l.hash);
}

/**
 * Drop downloads that a newer app version made obsolete (its bundled copy is as new or newer).
 * Returns the downloads to keep.
 */
export function pruneDownloads(bundled: CatalogEntry[], downloaded: Downloaded): Downloaded {
  const out: Downloaded = {};
  for (const [id, e] of Object.entries(downloaded)) {
    const b = bundled.find((x) => x.id === id);
    if (b && (b.hash === e.hash || (b.updated ?? "") >= (e.updated ?? ""))) continue;
    out[id] = e;
  }
  return out;
}

/** Catalog to show: bundled order and entries, updated or extended by downloaded ones. */
export function mergeCatalog(
  bundled: CatalogEntry[],
  downloaded: Downloaded,
  manifestOrder?: string[],
): CatalogEntry[] {
  const byId = new Map(bundled.map((b) => [b.id, b]));
  for (const [id, e] of Object.entries(downloaded)) byId.set(id, e);
  const order = manifestOrder ?? bundled.map((b) => b.id);
  const ids = [...order.filter((id) => byId.has(id)), ...[...byId.keys()].filter((id) => !order.includes(id))];
  return ids.map((id) => byId.get(id)!);
}

export function isLawData(x: unknown): x is LawData {
  const d = x as Partial<LawData>;
  return !!d && typeof d.title === "string" && Array.isArray(d.items) && d.items.length > 0;
}

/* ---------- storage and network ---------- */
const path = (id: string) => `leis/${id}.json`;

export function createUpdater(kv: KV, bundled: CatalogEntry[]) {
  let downloaded: Downloaded = {};
  let order: string[] | undefined;

  return {
    /** Load what was downloaded before and drop copies the bundled data has caught up with. */
    async init(): Promise<CatalogEntry[]> {
      try {
        const raw = await kv.get("lawUpdates");
        const saved = raw ? (JSON.parse(raw) as { downloaded: Downloaded; order?: string[] }) : null;
        downloaded = pruneDownloads(bundled, saved?.downloaded ?? {});
        order = saved?.order;
      } catch {
        downloaded = {};
      }
      return mergeCatalog(bundled, downloaded, order);
    },
    isDownloaded: (id: string) => id in downloaded,
    async read(id: string): Promise<LawData | null> {
      if (!(id in downloaded)) return null;
      try {
        const file = await Filesystem.readFile({ path: path(id), directory: Directory.Data, encoding: Encoding.UTF8 });
        const data: unknown = JSON.parse(String(file.data));
        return isLawData(data) ? data : null;
      } catch {
        return null;
      }
    },
    lastCheck: async (): Promise<string | null> => kv.get("lawUpdatesChecked"),
    /** Check the manifest and download what changed. Returns the laws that were updated or added. */
    async check(): Promise<{ updated: CatalogEntry[]; catalog: CatalogEntry[]; failed: string[] }> {
      const res = await fetch(`${DATA_URL}manifest.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = (await res.json()) as Manifest;
      if (manifest.schema !== 1 || !Array.isArray(manifest.laws)) throw new Error("manifest inválido");
      const todo = lawsToDownload(manifest, currentHashes(bundled, downloaded));
      const updated: CatalogEntry[] = [];
      const failed: string[] = [];
      for (const entry of todo) {
        try {
          const r = await fetch(`${DATA_URL}laws/${entry.id}.json?h=${entry.hash}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const text = await r.text();
          if (!isLawData(JSON.parse(text))) throw new Error("arquivo inválido");
          await Filesystem.writeFile({
            path: path(entry.id),
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            data: text,
            recursive: true,
          });
          const isBundledSame = bundled.find((b) => b.id === entry.id)?.hash === entry.hash;
          if (!isBundledSame) downloaded[entry.id] = entry;
          updated.push(entry);
        } catch {
          failed.push(entry.id);
        }
      }
      order = manifest.laws.map((l) => l.id);
      await kv.set("lawUpdates", JSON.stringify({ downloaded, order }));
      await kv.set("lawUpdatesChecked", new Date().toISOString());
      return { updated, catalog: mergeCatalog(bundled, downloaded, order), failed };
    },
  };
}
export type Updater = ReturnType<typeof createUpdater>;
