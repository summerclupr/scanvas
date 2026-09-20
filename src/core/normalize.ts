/**
 * RawItem -> UnifiedEvent.
 *
 * The split here is the whole performance story of a sync:
 *
 *   structured items (Canvas assignments, Outlook calendar, MIT calendar
 *   listings with a real datetime) go straight through. No model, no latency,
 *   confidence 1.
 *
 *   unstructured items (mailing-list email prose) are the only ones that pay
 *   for local inference.
 *
 * On the fixture set that's roughly 10 structured vs 9 unstructured, and the
 * 10 are ready before the model has finished warming up.
 */

import { contentHash } from './datetime';
import { LANE_OF, type EventKind, type RawItem, type UnifiedEvent } from './types';
import type { ExtractOutcome } from '../llm/extract';

/** Does this item already have everything we need without asking the model? */
export function isStructured(item: RawItem): boolean {
  return Boolean(item.hints.start);
}

export function partition(items: RawItem[]): {
  structured: RawItem[];
  unstructured: RawItem[];
} {
  const structured: RawItem[] = [];
  const unstructured: RawItem[] = [];
  for (const item of items) (isStructured(item) ? structured : unstructured).push(item);
  return { structured, unstructured };
}

const FOOD_RE = /\b(free food|pizza|snacks?|refreshments|lunch provided|dinner provided|boba|catered)\b/i;

function normalizeTopics(topics: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const t of topics) {
    if (!t) continue;
    const clean = t.toLowerCase().trim().replace(/\s+/g, ' ');
    if (clean.length > 1 && clean.length < 48) seen.add(clean);
  }
  return [...seen];
}

function buildEvent(
  item: RawItem,
  fields: {
    kind: EventKind;
    title: string;
    start: string;
    end?: string;
    allDay: boolean;
    description?: string;
    location?: string;
    organizer?: string;
    people: string[];
    topics: string[];
    confidence: number;
  },
): UnifiedEvent {
  const now = new Date().toISOString();
  const tags: string[] = [];
  if (FOOD_RE.test(`${fields.title} ${fields.description ?? ''} ${fields.topics.join(' ')}`)) {
    tags.push('free food');
  }

  return {
    // Keyed on source identity, not content, so re-syncs update in place
    // rather than duplicating when a title gets edited upstream.
    id: contentHash(item.source, item.sourceId),
    source: item.source,
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    kind: fields.kind,
    lane: LANE_OF[fields.kind],
    title: fields.title.trim(),
    description: fields.description?.trim() || undefined,
    start: fields.start,
    end: fields.end,
    allDay: fields.allDay,
    location: fields.location?.trim() || undefined,
    organizer: fields.organizer?.trim() || undefined,
    people: [...new Set(fields.people.map((p) => p.trim()).filter(Boolean))],
    topics: normalizeTopics(fields.topics),
    tags,
    course: item.hints.course,
    submission: item.submission,
    gradeImpact: item.gradeImpact,
    gradeGroup: item.gradeGroup,
    confidence: fields.confidence,
    raw: item.raw,
    firstSeenAt: now,
    updatedAt: now,
  };
}

/** Structured path: trust the connector's hints completely. */
export function normalizeStructured(item: RawItem): UnifiedEvent | null {
  const { hints } = item;
  if (!hints.start) return null;
  return buildEvent(item, {
    kind: hints.kind ?? 'other',
    title: hints.title ?? item.text.split('\n')[0].slice(0, 120),
    start: hints.start,
    end: hints.end,
    allDay: hints.allDay ?? false,
    description: hints.description,
    location: hints.location,
    organizer: hints.organizer,
    people: hints.people ?? [],
    topics: hints.topics ?? [],
    confidence: 1,
  });
}

/** Unstructured path: the model supplied the shape, hints fill the gaps. */
export function normalizeExtracted(
  item: RawItem,
  outcome: ExtractOutcome | undefined,
): UnifiedEvent | null {
  if (!outcome?.ok) return null;
  const { result, start, end, allDay } = outcome;
  const topics = [...(result.topics ?? []), ...(item.hints.topics ?? [])];
  if (result.has_food) topics.push('free food');

  return buildEvent(item, {
    // A connector that already knew the kind (calendar categories) beats a guess.
    kind: item.hints.kind ?? result.kind ?? 'other',
    title: result.title || item.hints.title || item.text.split('\n')[0].slice(0, 120),
    start,
    end,
    allDay,
    description: item.hints.description ?? result.title,
    location: result.location ?? item.hints.location,
    organizer: result.organizer ?? item.hints.organizer,
    people: [...(result.people ?? []), ...(item.hints.people ?? [])],
    topics,
    confidence: result.confidence,
  });
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'with',
  'mit', 'event', 'talk', 'meeting', 'seminar',
]);

function titleKey(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Which source do we believe when two records describe the same thing? */
const SOURCE_TRUST: Record<string, number> = {
  canvas: 4,
  outlook: 3,
  mit: 2,
  clubs: 2,
  manual: 5,
};

/**
 * The same talk routinely arrives as a department email AND a calendar listing.
 * Collapse near-identical titles that start within 90 minutes of each other,
 * keeping the most trustworthy record and unioning what each one knew.
 */
export function dedupe(events: UnifiedEvent[]): UnifiedEvent[] {
  const kept: UnifiedEvent[] = [];
  const keys = new Map<string, Set<string>>();

  for (const ev of [...events].sort(
    (a, b) => (SOURCE_TRUST[b.source] ?? 0) - (SOURCE_TRUST[a.source] ?? 0),
  )) {
    const key = titleKey(ev.title);
    const evStart = new Date(ev.start).getTime();

    const match = kept.find((k) => {
      const gapMin = Math.abs(new Date(k.start).getTime() - evStart) / 60_000;
      if (gapMin > 90) return false;
      return jaccard(keys.get(k.id)!, key) >= 0.6;
    });

    if (match) {
      // Merge: the winner keeps its identity, gains the loser's detail.
      match.people = [...new Set([...match.people, ...ev.people])];
      match.topics = [...new Set([...match.topics, ...ev.topics])];
      match.tags = [...new Set([...match.tags, ...ev.tags])];
      match.location ??= ev.location;
      match.organizer ??= ev.organizer;
      match.description ??= ev.description;
      match.end ??= ev.end;
      continue;
    }

    keys.set(ev.id, key);
    kept.push(ev);
  }

  return kept.sort((a, b) => a.start.localeCompare(b.start));
}
