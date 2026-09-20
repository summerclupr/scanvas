/**
 * Sync orchestration: connectors -> normalize -> extract -> dedupe -> score.
 *
 * Structured items are emitted as soon as the connectors return, before any
 * inference starts, so the agenda populates immediately and the slow
 * LLM-extracted opportunities stream in behind it. `onPartial` is what the UI
 * hangs off to get that behavior.
 */

import type { RawItem, UnifiedEvent, SourceId } from '../core/types';
import { dedupe, normalizeExtracted, normalizeStructured, partition } from '../core/normalize';
import { extractMany, type DropReason } from '../llm/extract';
import type { OllamaConfig } from '../llm/ollama';
import type { Connector, ConnectorCredentials, SyncWindow } from './types';

import { canvasFixture, canvasLive } from './canvas';
import { outlookFixture, outlookLive } from './outlook';
import { mitFixture, mitLive } from './mit';
import { hydrantConnector } from './hydrant';
import { clubsConnector, type ClubLookup, type ClubRecord } from './clubs';

export * from './types';
export { canvasFixture, canvasLive, outlookFixture, outlookLive, mitFixture, mitLive };
export { classify as classifyCampusEvent } from './mit';
export * from './hydrant';

/** Recorded payloads. Used for any source with no credentials supplied. */
export const CONNECTORS: Record<SourceId, Connector | null> = {
  canvas: canvasFixture,
  // Built per-sync from the student's courses, so there's no static entry.
  schedule: null,
  outlook: outlookFixture,
  mit: mitFixture,
  // Built per-sync from the clubs the student follows.
  clubs: null,
  manual: null,
};

export const LIVE_CONNECTORS: Record<SourceId, Connector | null> = {
  canvas: canvasLive,
  schedule: null,
  outlook: outlookLive,
  mit: mitLive,
  clubs: null,
  manual: null,
};

/**
 * Pick live or fixture per source, based on whether credentials exist.
 *
 * Per-source rather than all-or-nothing: a student can connect Canvas in two
 * minutes with a personal access token, while Outlook needs either a
 * published calendar link or an OAuth app. Real coursework alongside sample
 * events beats waiting.
 */
export function buildRegistry(
  creds: ConnectorCredentials,
): Record<SourceId, Connector | null> {
  const out = {} as Record<SourceId, Connector | null>;
  for (const id of Object.keys(CONNECTORS) as SourceId[]) {
    const live = LIVE_CONNECTORS[id];
    out[id] = live?.isConfigured(creds) ? live : CONNECTORS[id];
  }
  return out;
}

/** Which sources are showing real data, for the UI to state plainly. */
export function sourceModes(
  creds: ConnectorCredentials,
): Record<SourceId, 'live' | 'demo'> {
  const out = {} as Record<SourceId, 'live' | 'demo'>;
  for (const id of Object.keys(CONNECTORS) as SourceId[]) {
    // Sources built per sync from the profile (class schedule, followed
    // clubs) and the user's own entries have no fixture at all: they are
    // always the real thing.
    if (!CONNECTORS[id] && !LIVE_CONNECTORS[id]) {
      out[id] = 'live';
      continue;
    }
    out[id] = LIVE_CONNECTORS[id]?.isConfigured(creds) ? 'live' : 'demo';
  }
  return out;
}

export function defaultWindow(daysAhead = 21, daysBehind = 2): SyncWindow {
  return {
    since: new Date(Date.now() - daysBehind * 86400_000).toISOString(),
    until: new Date(Date.now() + daysAhead * 86400_000).toISOString(),
  };
}

export interface SyncProgress {
  phase: 'fetching' | 'structured' | 'extracting' | 'done';
  /** Items the model has processed, out of how many need it. */
  extracted?: number;
  extractTotal?: number;
  message: string;
}

export interface SyncResult {
  events: UnifiedEvent[];
  /**
   * Per-source item counts, any error that sank the source, and any warning
   * about a partial fetch (one of several feeds unreachable).
   */
  sources: { id: SourceId; fetched: number; error?: string; warning?: string }[];
  /**
   * How many unstructured items the model looked at, how many survived, and
   * why the rest didn't. The breakdown matters: 'not_event' is the system
   * working, 'no_date' in bulk means the prompt regressed.
   */
  inferred: { attempted: number; kept: number; drops: Partial<Record<DropReason, number>> };
  durationMs: number;
}

export interface SyncOptions {
  creds?: ConnectorCredentials;
  /** Courses + chosen sections, for the Hydrant class-schedule source. */
  schedule?: { courses: string[]; sections: Record<string, number> };
  /** Clubs the student follows, for the per-club Engage feeds and websites. */
  clubs?: { names: string[]; lookup: ClubLookup; remember?: (records: ClubRecord[]) => void };
  window?: SyncWindow;
  sources?: SourceId[];
  /** Omit to skip inference entirely and sync structured sources only. */
  ollama?: OllamaConfig;
  onProgress?: (p: SyncProgress) => void;
  /** Fires once with structured events, before inference begins. */
  onPartial?: (events: UnifiedEvent[]) => void;
  registry?: Record<SourceId, Connector | null>;
}

export async function sync(opts: SyncOptions = {}): Promise<SyncResult> {
  const started = Date.now();
  const creds = opts.creds ?? {};
  const window = opts.window ?? defaultWindow();
  const registry = { ...(opts.registry ?? CONNECTORS) };
  // Copied, not aliased: `opts.sources` is usually `profile.enabledSources`,
  // and the `push` below was mutating the caller's profile array in place -
  // so 'schedule' leaked into the saved profile on the first sync.
  const wanted = [...(opts.sources ?? (['canvas', 'outlook', 'mit', 'clubs'] as SourceId[]))];

  // The class schedule is derived from the student's own course list, so the
  // connector is constructed per sync rather than registered statically.
  if (opts.schedule && opts.schedule.courses.length > 0) {
    registry.schedule = hydrantConnector(
      opts.schedule.courses,
      opts.schedule.sections,
    );
    if (!wanted.includes('schedule')) wanted.push('schedule');
  }
  if (opts.clubs && opts.clubs.names.length > 0 && wanted.includes('clubs')) {
    registry.clubs = clubsConnector(opts.clubs.names, opts.clubs.lookup, opts.clubs.remember);
  }
  const report = opts.onProgress ?? (() => {});

  report({ phase: 'fetching', message: 'Reading your accounts...' });

  // --- fetch every source in parallel; one failure never sinks the rest ----
  const fetched = await Promise.all(
    wanted.map(async (id) => {
      const connector = registry[id];
      if (!connector || !connector.isConfigured(creds)) {
        return { id, items: [] as RawItem[], error: connector ? 'not configured' : undefined };
      }
      const warnings: string[] = [];
      try {
        const items = await connector.fetch(creds, window, {
          warn: (m) => warnings.push(m),
        });
        return { id, items, warning: warnings.join(' / ') || undefined };
      } catch (err) {
        return { id, items: [] as RawItem[], error: (err as Error).message };
      }
    }),
  );

  const allItems = fetched.flatMap((f) => f.items);
  const { structured, unstructured } = partition(allItems);

  // --- structured items are ready now -------------------------------------
  const events: UnifiedEvent[] = [];
  for (const item of structured) {
    const ev = normalizeStructured(item);
    if (ev) events.push(ev);
  }
  report({
    phase: 'structured',
    message: `${events.length} items with known dates`,
  });
  opts.onPartial?.(dedupe(events));

  // --- everything else needs the local model ------------------------------
  let kept = 0;
  const drops: Partial<Record<DropReason, number>> = {};
  if (opts.ollama && unstructured.length > 0) {
    report({
      phase: 'extracting',
      extracted: 0,
      extractTotal: unstructured.length,
      message: `Reading ${unstructured.length} messages locally...`,
    });

    const extractions = await extractMany(opts.ollama, unstructured, {
      onProgress: (done, total) =>
        report({
          phase: 'extracting',
          extracted: done,
          extractTotal: total,
          message: `Reading ${total} messages locally... ${done}/${total}`,
        }),
    });

    for (const item of unstructured) {
      const outcome = extractions.get(`${item.source}:${item.sourceId}`);
      if (outcome && !outcome.ok) {
        drops[outcome.reason] = (drops[outcome.reason] ?? 0) + 1;
      }
      const ev = normalizeExtracted(item, outcome);
      if (ev) {
        events.push(ev);
        kept++;
      }
    }
  }

  const deduped = dedupe(events);
  report({ phase: 'done', message: `${deduped.length} events` });

  return {
    events: deduped,
    sources: fetched.map((f) => ({
      id: f.id,
      fetched: f.items.length,
      error: f.error,
      warning: f.warning,
    })),
    inferred: { attempted: unstructured.length, kept, drops },
    durationMs: Date.now() - started,
  };
}
