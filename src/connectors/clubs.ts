/**
 * Clubs you follow, as a source.
 *
 * The campus-wide Engage feed carries a fraction of what clubs actually run:
 * the Poker Club's own feed and website exist, but nothing they post reaches
 * the Institute calendar. So following a club makes the app read the club:
 *
 *   1. its Engage feed  - /ical/mit/ical_club_<id>.ics, structured, no auth
 *   2. its website      - fetched, stripped to text, cut into blocks that
 *                         mention a date or time, and handed to the local
 *                         model exactly like a mailing-list email. "Tournament
 *                         Monday 7pm in 26-100" becomes an event; "Welcome to
 *                         the club!" is dropped as not_event.
 *
 * The Engage id and website come from Engage's directory (see
 * ../search/engage) and are remembered so the lookup happens once per club.
 *
 * What this cannot do, said plainly: read Instagram (login wall, no public
 * API), dormspam you haven't connected (connect Outlook for that), or a
 * website that draws its events from a private database at load time.
 */

import type { RawItem } from '../core/types';
import { htmlToText, nowISO, type Connector, type FetchContext, type SyncWindow } from './types';
import { expandInstances, parseICS } from '../core/ics';
import { proxiedUrl } from './canvas-transport';
import { engageClubIcsUrl, classify } from './mit';
import { searchEngageClubs } from '../search/engage';

export interface ClubRecord {
  name: string;
  engageId?: string;
  website?: string;
  /** When the directory was consulted; a miss is remembered too, briefly. */
  lookedUpAt: string;
}

/** Keyed by lower-cased followed name. */
export type ClubLookup = Record<string, ClubRecord>;

const LOOKUP_TTL_MS = 14 * 24 * 3600_000;
/** Blocks of site text that mention a date or a time are worth the model's time. */
const DATED_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\btonight\b|\btomorrow\b/i;
const MAX_BLOCKS_PER_SITE = 8;
const MAX_SITE_CHARS = 60_000;

/** Find (or refresh) a club's Engage id and website through the directory. */
export async function lookupClub(name: string, cache: ClubLookup): Promise<ClubRecord> {
  const key = name.toLowerCase().trim();
  const hit = cache[key];
  if (hit && Date.now() - new Date(hit.lookedUpAt).getTime() < LOOKUP_TTL_MS) return hit;
  // Engage lists "Outing Club", people say "MIT Outing Club": search the
  // stripped form, and fall back to the name as typed.
  const norm = (x: string) => x.toLowerCase().replace(/^mit\s+/, '').replace(/\s+/g, ' ').trim();
  const stripped = name.replace(/^mit\s+/i, '').trim();
  let clubs = await searchEngageClubs(stripped);
  if (!clubs.length && stripped !== name) clubs = await searchEngageClubs(name);
  const best =
    clubs.find((c) => norm(c.name) === norm(name)) ??
    clubs.find((c) => norm(c.name).includes(norm(name)) || norm(name).includes(norm(c.name))) ??
    clubs[0];
  return {
    name,
    engageId: best?.id,
    website: best?.website,
    lookedUpAt: nowISO(),
  };
}

/** Cut page text into blocks the extractor can read one at a time. */
export function datedBlocks(text: string, limit = MAX_BLOCKS_PER_SITE): string[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) blocks.push(cur.join('\n'));
    cur = [];
  };
  for (const line of lines) {
    cur.push(line);
    // A block is a heading plus the lines under it, ~600 chars at most.
    if (cur.join('\n').length > 600 || /^[A-Z][^.!?]{0,60}$/.test(line) && cur.length > 1 && cur.slice(0, -1).join(' ').length > 120) {
      const head = cur.pop()!;
      flush();
      cur = [head];
    }
  }
  flush();
  return blocks.filter((b) => DATED_RE.test(b) && b.length >= 30).slice(0, limit);
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxiedUrl(url), { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`${new URL(url).host} -> ${res.status}`);
    return (await res.text()).slice(0, MAX_SITE_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

async function clubFeedItems(rec: ClubRecord, window: SyncWindow): Promise<RawItem[]> {
  if (!rec.engageId) return [];
  const { events } = parseICS(await fetchText(engageClubIcsUrl(rec.engageId)));
  const from = new Date(window.since);
  const to = new Date(window.until);
  const out: RawItem[] = [];
  for (const ev of events) {
    for (const inst of expandInstances(ev, from, to)) {
      const kind = classify(ev.summary, ev.description ?? '');
      if (!kind) continue;
      const location = ev.location && !/sign in to download/i.test(ev.location) ? ev.location : undefined;
      out.push({
        source: 'clubs',
        sourceId: `club:${rec.engageId}:${ev.uid}:${inst.start.toISOString()}`,
        sourceUrl: /Event Details:\s*(https?:\S+)/.exec(ev.description ?? '')?.[1],
        text: `${ev.summary}\nHosted by ${rec.name}\n${ev.description ?? ''}`,
        hints: {
          kind,
          title: ev.summary,
          description: ev.description?.replace(/\n---[\s\S]*$/, '').trim() || undefined,
          start: inst.start.toISOString(),
          end: inst.end?.toISOString(),
          allDay: ev.allDay,
          location,
          organizer: ev.organizer ?? rec.name,
          topics: ['club', 'student group', rec.name.toLowerCase()],
          people: [],
        },
        raw: { uid: ev.uid },
        fetchedAt: nowISO(),
      });
    }
  }
  return out;
}

async function clubSiteItems(rec: ClubRecord): Promise<RawItem[]> {
  if (!rec.website) return [];
  const html = await fetchText(rec.website);
  const text = htmlToText(html);
  return datedBlocks(text).map((block, i) => ({
    source: 'clubs',
    sourceId: `site:${rec.name.toLowerCase()}:${i}:${block.slice(0, 40)}`,
    sourceUrl: rec.website,
    // No start hint: this is prose, and the model decides whether it is an
    // event and when - never this connector.
    text: `From ${rec.name}'s website (${rec.website}):\n${block}`,
    hints: {
      kind: 'club_event',
      organizer: rec.name,
      topics: ['club', 'student group', rec.name.toLowerCase()],
      people: [],
    },
    raw: { website: rec.website, block },
    fetchedAt: nowISO(),
  }));
}

/**
 * Build the connector for this sync. `remember` receives refreshed lookups so
 * the store can persist them; the connector itself stays stateless.
 */
export function clubsConnector(
  names: string[],
  cache: ClubLookup,
  remember?: (records: ClubRecord[]) => void,
): Connector {
  return {
    id: 'clubs',
    label: 'Clubs you follow',
    isFixture: false,
    isConfigured: () => names.length > 0,
    async fetch(_creds, window, ctx?: FetchContext) {
      const records = await Promise.all(
        names.map((n) => lookupClub(n, cache).catch(() => ({ name: n, lookedUpAt: nowISO() } as ClubRecord))),
      );
      remember?.(records);
      const items: RawItem[] = [];
      const misses: string[] = [];
      for (const rec of records) {
        if (!rec.engageId && !rec.website) {
          misses.push(rec.name);
          continue;
        }
        const [feed, site] = await Promise.allSettled([clubFeedItems(rec, window), clubSiteItems(rec)]);
        if (feed.status === 'fulfilled') items.push(...feed.value);
        else ctx?.warn?.(`${rec.name}: Engage feed unreachable (${(feed.reason as Error)?.message ?? 'error'})`);
        if (site.status === 'fulfilled') items.push(...site.value);
        else ctx?.warn?.(`${rec.name}: website unreachable (${(site.reason as Error)?.message ?? 'error'})`);
      }
      if (misses.length) ctx?.warn?.(`Not in Engage's directory: ${misses.join(', ')}`);
      return items;
    },
  };
}
