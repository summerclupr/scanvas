/**
 * MIT campus listings: talks, seminars, research events, club events.
 *
 * This replaced an "MIT ELx" connector that appeared under Accounts. There
 * was never an ELx account to connect - the Experiential Learning Exchange
 * (elx.mit.edu, where UROP postings now live) sits behind Touchstone login
 * and exposes no feed - so presenting it as an account was misleading. What
 * MIT *does* publish openly is read here, and nothing about it is optional
 * or credentialed. It is muted like any other source under "What synced".
 *
 * Two public feeds, each failing independently:
 *
 *   MIT Events Calendar   calendar.mit.edu is a Localist site with a public
 *                         JSON API that sends CORS headers, so it works in a
 *                         browser with no proxy. ~400 events a month across
 *                         every department: colloquia, seminars, thesis
 *                         defenses, career workshops, UROP mixers. Each event
 *                         carries a plain-text description and typed
 *                         categories, so classification is deterministic and
 *                         the interest matcher has real text to work with.
 *
 *   MIT Engage            The club-events platform's official iCal feed.
 *                         Titles, times, rooms - no descriptions, so ranking
 *                         works from the title alone. Sends no CORS headers;
 *                         browsers go through `npm run proxy`.
 *
 * Neither feed carries UROP *postings*. Those are login-gated, so the app
 * points at the realistic route instead: research-typed events here, funded
 * programs on the Careers tab, and faculty matched to interests under For you.
 */

import type { EventKind, RawItem } from '../core/types';
import {
  extractPeople,
  nowISO,
  type Connector,
  type FetchContext,
  type SyncWindow,
} from './types';
import { expandInstances, parseICS } from '../core/ics';
import { icsFetchUrl } from './canvas-transport';
import { icsFetchHint } from './outlook';
import { CALENDAR, ENGAGE, type CalendarListing } from '../fixtures/mit';

export const MIT_CALENDAR_API = 'https://calendar.mit.edu/api/2/events';
export const ENGAGE_ICS_URL = 'https://engage.mit.edu/ical/mit/ical_mit.ics';
/**
 * Engage's RSS is a different, richer cut of the same platform: club name and
 * type, topics, a real description, whether food is provided. It overlaps the
 * iCal only partly, so both are read and dedupe merges what each one knew.
 */
export const ENGAGE_RSS_URL = 'https://engage.mit.edu/rss_events';
/** A club's own Engage feed - the campus feed omits most club events. */
export const engageClubIcsUrl = (clubId: string) =>
  `https://engage.mit.edu/ical/mit/ical_club_${encodeURIComponent(clubId)}.ics`;

/** Localist pages at 100; six pages comfortably covers a three-week window. */
const MAX_CALENDAR_PAGES = 6;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const UROP_RE =
  /\b(urop|research opportunit|undergraduate research|lab openings?|join (?:a|our) lab|research mixer|research fair)\b/i;
const TALK_RE =
  /\b(seminar|colloquium|lecture|talk|panel|defense|symposium|distinguished speaker|keynote|fireside)\b/i;
const CAREER_RE =
  /\b(career|recruit\w*|internship|info session|employer|resume|hiring|networking)\b/i;

/** Event types that are never worth surfacing. */
const SKIP_TYPE_RE = /campus tours|institute holidays/i;

/**
 * The feed's own category wins over keyword guesses, with one exception:
 * anything that reads as a UROP event is 'urop' whatever it was filed under,
 * because "Networking for Undergraduate Research Opportunities" sits under
 * Career Development and a student who ranked research first should see it
 * as research. Keyword rules run on the TITLE only after that - a colloquium
 * whose blurb ends "networking reception to follow" is still a talk.
 * Untyped items (Engage carries no categories) fall back to title keywords.
 */
export function classify(title: string, description = '', types: string[] = []): EventKind | null {
  if (types.some((t) => SKIP_TYPE_RE.test(t))) return null;
  if (UROP_RE.test(`${title} ${description}`)) return 'urop';

  const has = (re: RegExp) => types.some((t) => re.test(t));
  if (has(/thesis defense/i)) return 'talk';
  if (has(/seminars|lectures/i)) return CAREER_RE.test(title) ? 'career' : 'talk';
  if (has(/career development/i)) return 'career';
  if (has(/workshops|fairs/i)) return CAREER_RE.test(title) ? 'career' : 'club_event';
  if (has(/meetings|gatherings/i)) return 'club_event';
  if (has(/athletics|recreation|performing arts|community event/i)) return 'social';
  if (has(/exhibits/i)) return 'other';

  if (TALK_RE.test(title)) return 'talk';
  if (CAREER_RE.test(title)) return 'career';
  return 'club_event';
}

function calendarToRaw(l: CalendarListing): RawItem | null {
  const kind = classify(l.title, l.description, l.types);
  if (!kind) return null;
  const location = [l.location, l.room].filter(Boolean).join(' ').trim() || undefined;
  // Topics feed the embedding text, which does not include the description,
  // so the categorical signal has to be carried here.
  const topics = [
    ...l.types,
    ...(l.themes ?? []),
    ...l.keywords,
    ...l.departments.map(shortDept),
    // Audience travels as a tag-like topic so the scorer can tell a
    // students' event from a faculty/staff/alumni one.
    ...(l.audience ?? []).map((a) => `audience:${a}`),
  ].map((s) => s.toLowerCase());
  return {
    source: 'mit',
    sourceId: `calendar:${l.id}:${l.start}`,
    sourceUrl: l.url,
    text: `${l.title}\n${l.group ?? ''}\nWhen: ${l.start}\nWhere: ${location ?? ''}\n\n${l.description}`,
    hints: {
      kind,
      title: l.title,
      description: l.description.slice(0, 800),
      start: l.start,
      end: l.end,
      allDay: l.allDay,
      location,
      organizer: l.group || l.departments[0],
      topics,
      people: extractPeople(`${l.title} ${l.description}`),
    },
    raw: l,
    fetchedAt: nowISO(),
  };
}

/** "Department of Physics" -> "physics"; "...(CSAIL)" -> "csail". Cheap topic tokens. */
function shortDept(name: string): string {
  const paren = /\(([A-Z+&]+)\)\s*$/.exec(name);
  if (paren) return paren[1];
  return name.replace(/^department of\s+/i, '').trim();
}

// ---------------------------------------------------------------------------
// MIT Events Calendar (Localist API v2)
// ---------------------------------------------------------------------------

interface LocalistEvent {
  id: number | string;
  title: string;
  description_text?: string | null;
  localist_url?: string;
  location_name?: string | null;
  room_number?: string | null;
  group_name?: string | null;
  status?: string;
  private?: boolean;
  keywords?: string[];
  tags?: string[];
  /** Top-level on MIT's instance; `filters.departments` is always empty there. */
  departments?: { id?: number | string; name: string }[] | null;
  filters?: {
    event_types?: { name: string }[];
    departments?: { name: string }[];
    event_events_by_interest?: { name: string }[];
    event_audience?: { name: string }[];
  };
  event_instances?: {
    event_instance: { start: string; end?: string | null; all_day?: boolean };
  }[];
}

interface LocalistPage {
  events?: { event: LocalistEvent }[];
  page?: { current: number; total: number };
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

/** One Localist event, possibly recurring, into one listing per instance. */
function fromLocalist(e: LocalistEvent, window: SyncWindow): CalendarListing[] {
  if (e.private || (e.status && e.status !== 'live')) return [];
  const types = (e.filters?.event_types ?? []).map((t) => t.name);
  const departments = [
    ...(e.departments ?? []),
    ...(e.filters?.departments ?? []),
  ]
    .map((t) => t?.name)
    .filter((n): n is string => Boolean(n));
  const out: CalendarListing[] = [];
  for (const inst of e.event_instances ?? []) {
    const start = inst.event_instance?.start;
    if (!start || start < window.since || start > window.until) continue;
    out.push({
      id: String(e.id),
      title: e.title.trim(),
      description: (e.description_text ?? '').trim(),
      url: e.localist_url ?? `https://calendar.mit.edu/event/${e.id}`,
      location: e.location_name ?? undefined,
      room: e.room_number ?? undefined,
      group: e.group_name ?? undefined,
      departments,
      types,
      themes: (e.filters?.event_events_by_interest ?? []).map((t) => t.name),
      audience: (e.filters?.event_audience ?? []).map((t) => t.name),
      keywords: [...(e.keywords ?? []), ...(e.tags ?? [])],
      start,
      end: inst.event_instance.end ?? undefined,
      allDay: Boolean(inst.event_instance.all_day),
    });
  }
  return out;
}

export async function fetchCalendar(window: SyncWindow, timeoutMs = 30_000): Promise<CalendarListing[]> {
  const listings: CalendarListing[] = [];
  for (let page = 1; page <= MAX_CALENDAR_PAGES; page++) {
    const url =
      `${MIT_CALENDAR_API}?start=${ymd(window.since)}&end=${ymd(window.until)}` +
      `&pp=100&page=${page}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`MIT Events Calendar -> ${res.status} ${res.statusText}`);
      const data = (await res.json()) as LocalistPage;
      for (const wrapper of data.events ?? []) {
        listings.push(...fromLocalist(wrapper.event, window));
      }
      if (!data.page || data.page.current >= data.page.total) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return listings;
}

// ---------------------------------------------------------------------------
// MIT Engage (iCal)
// ---------------------------------------------------------------------------

function engageToRaw(
  summary: string,
  start: Date,
  end: Date | undefined,
  location: string | undefined,
  url: string | undefined,
  uid: string,
  organizer: string | undefined,
): RawItem | null {
  const kind = classify(summary);
  if (!kind) return null;
  const cleanLocation =
    location && !/sign in to download/i.test(location) ? location : undefined;
  return {
    source: 'mit',
    sourceId: `engage:${uid}:${start.toISOString()}`,
    sourceUrl: url,
    text: `${summary}\nHosted by ${organizer ?? 'a student group'}\nWhen: ${start.toISOString()}\nWhere: ${cleanLocation ?? 'see listing'}`,
    hints: {
      kind,
      title: summary,
      start: start.toISOString(),
      end: end?.toISOString(),
      allDay: false,
      location: cleanLocation,
      // The feed names the club on every event (ORGANIZER's CN), which is
      // the only club identity Engage exposes - so it's what "follow" and
      // search key on.
      organizer,
      topics: ['club', 'student group', ...(organizer ? [organizer.toLowerCase()] : [])],
      people: extractPeople(summary),
    },
    raw: { summary, url, organizer },
    fetchedAt: nowISO(),
  };
}

/** One Engage RSS <item>, as the tags we read. */
function rssField(item: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(item);
  if (!m) return undefined;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x?[0-9a-f]+;/gi, (e) => {
      const code = e.startsWith('&#x') || e.startsWith('&#X') ? parseInt(e.slice(3, -1), 16) : parseInt(e.slice(2, -1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Multi-month "events" are ticket sales and merch, not things to attend. */
const MAX_EVENT_DAYS = 3;

export function parseEngageRss(xml: string, window: SyncWindow): RawItem[] {
  const items: RawItem[] = [];
  const from = new Date(window.since).getTime();
  const to = new Date(window.until).getTime();
  for (const item of xml.split(/<item>/i).slice(1)) {
    const title = rssField(item, 'title');
    const start = rssField(item, 'eventStartDateTime');
    if (!title || !start) continue;
    const startMs = new Date(start).getTime();
    if (!Number.isFinite(startMs) || startMs < from || startMs > to) continue;
    const end = rssField(item, 'eventEndDateTime');
    const endMs = end ? new Date(end).getTime() : NaN;
    if (Number.isFinite(endMs) && endMs - startMs > MAX_EVENT_DAYS * 86400_000) continue;
    if (rssField(item, 'privacyLevel') && rssField(item, 'privacyLevel') !== '0') continue;
    const group = rssField(item, 'group');
    const description = rssField(item, 'fullDescription') ?? rssField(item, 'description') ?? '';
    const topics = [
      'club',
      'student group',
      ...(group ? [group.toLowerCase()] : []),
      ...(rssField(item, 'eventTopics') ?? '').split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean),
      ...(rssField(item, 'groupType') ? [rssField(item, 'groupType')!.toLowerCase()] : []),
    ];
    if (rssField(item, 'foodProvided') === '1') topics.push('free food');
    const location = rssField(item, 'eventLocation');
    const cleanLocation = location && !/sign in to display|private location/i.test(location) ? location : undefined;
    const kind = classify(title, description);
    if (!kind) continue;
    const link = rssField(item, 'link') ?? rssField(item, 'eventLink');
    const uid = rssField(item, 'eventUid') ?? rssField(item, 'eventId') ?? `${title}:${start}`;
    items.push({
      source: 'mit',
      sourceId: `engage-rss:${uid}`,
      sourceUrl: link,
      text: `${title}\nHosted by ${group ?? 'a student group'}\nWhen: ${start}\nWhere: ${cleanLocation ?? 'see listing'}\n\n${description}`,
      hints: {
        kind,
        title,
        description: description.slice(0, 800) || undefined,
        start: new Date(startMs).toISOString(),
        end: Number.isFinite(endMs) ? new Date(endMs).toISOString() : undefined,
        allDay: rssField(item, 'allDayEvent') === '1',
        location: cleanLocation,
        organizer: group,
        topics,
        people: extractPeople(`${title} ${description}`),
      },
      raw: { title, group, link },
      fetchedAt: nowISO(),
    });
  }
  return items;
}

export async function fetchEngageRss(window: SyncWindow): Promise<RawItem[]> {
  const res = await fetch(icsFetchUrl(ENGAGE_RSS_URL), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Engage RSS -> ${res.status} ${res.statusText}`);
  return parseEngageRss(await res.text(), window);
}

export async function fetchEngage(window: SyncWindow): Promise<RawItem[]> {
  const res = await fetch(icsFetchUrl(ENGAGE_ICS_URL), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Engage iCal -> ${res.status} ${res.statusText}`);
  const { events } = parseICS(await res.text());
  const from = new Date(window.since);
  const to = new Date(window.until);
  const items: RawItem[] = [];
  for (const ev of events) {
    for (const inst of expandInstances(ev, from, to)) {
      const raw = engageToRaw(
        ev.summary,
        inst.start,
        inst.end,
        ev.location,
        ev.uid.startsWith('http') ? ev.uid : undefined,
        ev.uid,
        ev.organizer,
      );
      if (raw) items.push(raw);
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export const mitFixture: Connector = {
  id: 'mit',
  label: 'MIT campus',
  isFixture: true,
  isConfigured: () => true,
  async fetch(_creds, window) {
    const calendar = CALENDAR.filter((l) => l.start >= window.since && l.start <= window.until)
      .map(calendarToRaw)
      .filter((x): x is RawItem => x !== null);
    const engage = ENGAGE.filter((l) => l.start >= window.since && l.start <= window.until).map(
      (l): RawItem => ({
        source: 'mit',
        sourceId: `engage:${l.id}`,
        sourceUrl: l.url,
        text: `${l.title}\nHosted by ${l.organization}\nWhere: ${l.location}\n\n${l.description}`,
        hints: {
          kind: classify(l.title, `${l.description} ${l.categories.join(' ')}`) ?? 'club_event',
          title: l.title,
          description: l.description,
          start: l.start,
          end: l.end,
          allDay: false,
          location: l.location,
          organizer: l.organization,
          topics: [...l.categories, ...l.perks].map((s) => s.toLowerCase()),
          people: extractPeople(l.description),
        },
        raw: l,
        fetchedAt: nowISO(),
      }),
    );
    return [...calendar, ...engage];
  },
};

/**
 * Public feeds need nothing from the user, so this is configured by
 * definition. Failures are loud, not silent: a feed that cannot be reached
 * is reported per source in Settings and on the For you tab, and if BOTH
 * fail the source errors rather than returning an empty list that looks like
 * a quiet campus.
 */
export const mitLive: Connector = {
  id: 'mit',
  label: 'MIT campus',
  isFixture: false,
  isConfigured: () => true,
  async fetch(_creds, window, ctx?: FetchContext) {
    const [calendar, engage, rss] = await Promise.allSettled([
      fetchCalendar(window),
      fetchEngage(window),
      fetchEngageRss(window),
    ]);

    const items: RawItem[] = [];
    const failures: string[] = [];

    if (rss.status === 'fulfilled') {
      items.push(...rss.value);
    } else {
      // The RSS is an enrichment; losing it is worth a note, not a failure.
      ctx?.warn?.(`Engage RSS: ${(rss.reason as Error)?.message ?? String(rss.reason)}`);
    }

    if (calendar.status === 'fulfilled') {
      for (const l of calendar.value) {
        const raw = calendarToRaw(l);
        if (raw) items.push(raw);
      }
    } else {
      failures.push(
        `MIT Events Calendar: ${(calendar.reason as Error)?.message ?? String(calendar.reason)}`,
      );
    }

    if (engage.status === 'fulfilled') {
      items.push(...engage.value);
    } else {
      failures.push(`Engage club feed: ${icsFetchHint(ENGAGE_ICS_URL, engage.reason)}`);
    }

    if (failures.length === 2) throw new Error(failures.join(' / '));
    for (const f of failures) ctx?.warn?.(f);
    return items;
  },
};
