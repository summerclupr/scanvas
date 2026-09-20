/**
 * Local persistence. Everything lives on the device, in AsyncStorage.
 *
 * There is no server, no account, and no sync. That's a product decision, not
 * a shortcut: this app reads your email and your coursework, and the only honest
 * way to ship that is to never let the data leave the phone. The one network
 * call it makes is to an Ollama instance you run yourself.
 *
 * Embeddings are stored separately from events because they're an order of
 * magnitude larger and don't need to be read on every render.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the big caches go in a BROWSER.
 *
 * AsyncStorage on web is localStorage, which caps at ~5MB per site. The
 * embedding cache alone (600 vectors x 768 floats) is ~4.6MB as JSON and the
 * live internship list is ~1.5MB, so writes were failing with
 * "exceeded the quota" and every reload refetched 13MB of postings.
 * IndexedDB has no such cap in practice, so the large, regenerable caches
 * live there on web. Profile, events and sync bookkeeping stay in
 * localStorage: they're small, and the browser test harness reads them.
 * Native builds have a real key-value store and use AsyncStorage for all of it.
 */
const IDB_NAME = 'agenda';
const IDB_STORE = 'kv';
const hasIndexedDB = typeof indexedDB !== 'undefined';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const req = run(tx.objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

const BIG_KEYS = new Set<string>([
  'agenda:embeddings:v1',
  'agenda:careers:v1',
  'agenda:hydrant:v1',
  'agenda:directory:v1',
]);

async function readRaw(key: string): Promise<string | null> {
  if (hasIndexedDB && BIG_KEYS.has(key)) {
    const v = await idbRequest<unknown>('readonly', (s) => s.get(key));
    if (typeof v === 'string') return v;
    // First run after the move: pick up anything localStorage still holds.
    return AsyncStorage.getItem(key);
  }
  return AsyncStorage.getItem(key);
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (hasIndexedDB && BIG_KEYS.has(key)) {
    await idbRequest('readwrite', (s) => s.put(value, key));
    // Free the localStorage slot the old copy occupied.
    AsyncStorage.removeItem(key).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(key, value);
}

async function removeAll(keys: string[]): Promise<void> {
  await AsyncStorage.multiRemove(keys);
  if (hasIndexedDB) {
    await idbRequest('readwrite', (s) => s.clear()).catch(() => {});
  }
}

import { DEFAULT_PROFILE, type InterestProfile } from '../core/profile';
import { SOURCE_LABELS, type SourceId, type UnifiedEvent } from '../core/types';
import { DEFAULT_OLLAMA, type OllamaConfig } from '../llm/ollama';
import type { ScheduledRecord } from '../notify/schedule';

const KEYS = {
  profile: 'agenda:profile:v1',
  events: 'agenda:events:v1',
  embeddings: 'agenda:embeddings:v1',
  scheduled: 'agenda:scheduled:v1',
  ollama: 'agenda:ollama:v1',
  rationales: 'agenda:rationales:v1',
  careers: 'agenda:careers:v1',
  customEvents: 'agenda:custom:v1',
  hydrant: 'agenda:hydrant:v1',
  directory: 'agenda:directory:v1',
  clubLookup: 'agenda:clubs:v1',
  lastSync: 'agenda:lastSync:v1',
} as const;

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await readRaw(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or partially-written value: fall back rather than crash on boot.
    return fallback;
  }
}

/**
 * A failed write must not crash the app - but it must not be invisible
 * either. Swallowing these silently once cost hours: events stopped
 * persisting, the UI looked fine because state was in memory, and the data
 * only turned out to be missing after a reload.
 */
async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await writeRaw(key, JSON.stringify(value));
  } catch (err) {
    if (__DEV__) {
      console.error(`[storage] failed to write ${key}:`, (err as Error)?.message ?? err);
    }
  }
}

// --- source migrations -------------------------------------------------------

/**
 * Source ids that used to exist. 'elx' was the MIT Engage/ELx connector,
 * presented as an account that could never actually be linked; its public
 * feed lives on inside the 'mit' campus source. 'slack' was removed outright.
 */
const LEGACY_SOURCES: Record<string, SourceId | null> = { elx: 'mit', slack: null };

function migrateSourceId(id: unknown): SourceId | null {
  if (typeof id !== 'string') return null;
  const mapped = id in LEGACY_SOURCES ? LEGACY_SOURCES[id] : id;
  return mapped && mapped in SOURCE_LABELS ? (mapped as SourceId) : null;
}

/** Drop unknown ids and rename legacy ones, preserving order and uniqueness. */
export function migrateSources(list: unknown): SourceId[] {
  const out: SourceId[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = migrateSourceId(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// --- profile ---------------------------------------------------------------

export async function loadProfile(): Promise<InterestProfile> {
  const stored = await readJSON<Partial<InterestProfile>>(KEYS.profile, {});
  // Merge against defaults so a profile written by an older build still boots
  // after new preference fields are added.
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    priorities: { ...DEFAULT_PROFILE.priorities, ...(stored.priorities ?? {}) },
    keywords: { ...DEFAULT_PROFILE.keywords, ...(stored.keywords ?? {}) },
    notify: { ...DEFAULT_PROFILE.notify, ...(stored.notify ?? {}) },
    feedback: { ...DEFAULT_PROFILE.feedback, ...(stored.feedback ?? {}) },
    completedHours: { ...(stored.completedHours ?? {}) },
    enabledSources: migrateEnabledSources(stored),
    version: DEFAULT_PROFILE.version,
  };
}

/**
 * Sources added after a profile was written are switched on once, by
 * version, so a new source appears for existing users without overriding a
 * mute they set later.
 */
function migrateEnabledSources(stored: Partial<InterestProfile>): SourceId[] {
  const list = migrateSources(stored.enabledSources ?? DEFAULT_PROFILE.enabledSources);
  const version = stored.version ?? 1;
  if (version < 2 && !list.includes('clubs')) list.push('clubs');
  return list;
}

export const saveProfile = (p: InterestProfile) => writeJSON(KEYS.profile, p);

// --- events ----------------------------------------------------------------

export async function loadEvents(): Promise<UnifiedEvent[]> {
  const stored = await readJSON<UnifiedEvent[]>(KEYS.events, []);
  // Events synced under a retired source id are relabeled rather than shown
  // with an undefined source name; anything from a removed source is dropped.
  const out: UnifiedEvent[] = [];
  for (const ev of stored) {
    const source = migrateSourceId(ev.source);
    if (!source) continue;
    out.push(source === ev.source ? ev : { ...ev, source });
  }
  return out;
}

export function saveEvents(events: UnifiedEvent[]): Promise<void> {
  // `raw` is the original API payload - useful for debugging, far too big to
  // persist for every event on every sync.
  return writeJSON(
    KEYS.events,
    events.map(({ raw, ...rest }) => rest),
  );
}

// --- embeddings ------------------------------------------------------------

export async function loadEmbeddings(): Promise<Record<string, number[]>> {
  return readJSON<Record<string, number[]>>(KEYS.embeddings, {});
}

export function saveEmbeddings(vectors: Record<string, number[]>): Promise<void> {
  // 768 floats per vector. Keep the most recent slice so storage stays bounded
  // on a phone that's been running this for a semester.
  const entries = Object.entries(vectors).slice(-600);
  return writeJSON(KEYS.embeddings, Object.fromEntries(entries));
}

// --- rationales ------------------------------------------------------------

/**
 * Model-written "why you're seeing this" lines, keyed by event id.
 *
 * Kept separate from the events themselves because they're regenerated on a
 * different cadence: an event can re-sync unchanged while its rationale needs
 * rewriting after the user edits their interests.
 */
export async function loadRationales(): Promise<Record<string, string>> {
  return readJSON<Record<string, string>>(KEYS.rationales, {});
}

export const saveRationales = (r: Record<string, string>) =>
  writeJSON(KEYS.rationales, r);

// --- careers -----------------------------------------------------------------

export interface CareersCache {
  /** Live postings, kept between syncs so the tab opens instantly. */
  postings: import('../careers/types').CareerPosting[];
  /** When the live source was last fetched, for the TTL. */
  fetchedAt: string | null;
  /**
   * Postings the user saved, stored as full snapshots: a live posting can
   * disappear from the source while your application is still open.
   */
  saved: import('../careers/types').CareerPosting[];
}

const EMPTY_CAREERS: CareersCache = { postings: [], fetchedAt: null, saved: [] };

export async function loadCareers(): Promise<CareersCache> {
  return readJSON<CareersCache>(KEYS.careers, EMPTY_CAREERS);
}

export const saveCareers = (c: CareersCache) => writeJSON(KEYS.careers, c);

// --- user-added recurring events ---------------------------------------------

export async function loadCustomEvents(): Promise<
  import('../plan/custom-events').CustomEvent[]
> {
  return readJSON<import('../plan/custom-events').CustomEvent[]>(KEYS.customEvents, []);
}

export const saveCustomEvents = (
  e: import('../plan/custom-events').CustomEvent[],
) => writeJSON(KEYS.customEvents, e);

// --- class catalogue ---------------------------------------------------------

export interface HydrantCache {
  /** Serialized Map<code, HydrantClass>. */
  classes: Record<string, import('../connectors/hydrant').HydrantClass>;
  fetchedAt: string | null;
  /** The term the catalogue describes, for "teaching this term" labels. */
  term?: import('../connectors/hydrant').HydrantTerm | null;
}

export async function loadHydrant(): Promise<HydrantCache> {
  return readJSON<HydrantCache>(KEYS.hydrant, { classes: {}, fetchedAt: null, term: null });
}

export const saveHydrant = (c: HydrantCache) => writeJSON(KEYS.hydrant, c);

// --- followed clubs: Engage ids + websites, looked up once ---------------------

export async function loadClubLookup(): Promise<import('../connectors/clubs').ClubLookup> {
  return readJSON<import('../connectors/clubs').ClubLookup>(KEYS.clubLookup, {});
}

export const saveClubLookup = (c: import('../connectors/clubs').ClubLookup) =>
  writeJSON(KEYS.clubLookup, c);

// --- MIT groups & departments directory ---------------------------------------

export async function loadDirectory(): Promise<import('../search/localist').Directory> {
  return readJSON<import('../search/localist').Directory>(KEYS.directory, {
    groups: [],
    departments: [],
    fetchedAt: null,
  });
}

export const saveDirectory = (d: import('../search/localist').Directory) =>
  writeJSON(KEYS.directory, d);

// --- notification bookkeeping ---------------------------------------------

export async function loadScheduled(): Promise<ScheduledRecord[]> {
  return readJSON<ScheduledRecord[]>(KEYS.scheduled, []);
}

export const saveScheduled = (r: ScheduledRecord[]) => writeJSON(KEYS.scheduled, r);

// --- ollama config ---------------------------------------------------------

export async function loadOllama(): Promise<OllamaConfig> {
  const stored = await readJSON<Partial<OllamaConfig>>(KEYS.ollama, {});
  return { ...DEFAULT_OLLAMA, ...stored };
}

export const saveOllama = (c: OllamaConfig) => writeJSON(KEYS.ollama, c);

// --- misc ------------------------------------------------------------------

export async function loadLastSync(): Promise<string | null> {
  return readJSON<string | null>(KEYS.lastSync, null);
}

export const saveLastSync = (iso: string) => writeJSON(KEYS.lastSync, iso);

/** Wipe everything. Exposed in Settings, and the honest answer to "delete my data". */
export async function resetAll(): Promise<void> {
  await removeAll(Object.values(KEYS));
}
