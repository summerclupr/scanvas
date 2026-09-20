/**
 * Outlook / Microsoft Graph connector.
 *
 * Two very different streams:
 *   - /me/events    already structured. Deterministic, confidence 1.
 *   - /me/messages  prose. The subject line might say "Thursday at 4pm" and
 *                   nothing else. These carry no `start` hint, which is the
 *                   signal downstream that the LLM extractor must handle them.
 *
 * Mail is filtered to the lists that actually carry events before any of it
 * reaches the model — cheap, and it keeps inference off your personal mail.
 */

import type { RawItem } from '../core/types';
import {
  extractCourseCodes,
  extractPeople,
  htmlToText,
  nowISO,
  type Connector,
  type ConnectorCredentials,
  type SyncWindow,
} from './types';
import { EVENTS, MESSAGES, type GraphEvent, type GraphMessage } from '../fixtures/outlook';
import { expandInstances, parseICS } from '../core/ics';
import { NEEDS_PROXY, icsFetchUrl, isProxiedHost } from './canvas-transport';

/**
 * Turn a browser's opaque network failure into something actionable.
 *
 * In a browser a blocked cross-origin fetch rejects with nothing but "Failed
 * to fetch" - same message whether the proxy is down, the host isn't on its
 * allowlist, or the link is simply wrong. Those need different fixes, so say
 * which one this is.
 */
export function icsFetchHint(icsUrl: string, err: unknown): string {
  const detail = (err as Error)?.message ?? String(err);
  if (!NEEDS_PROXY) return `Could not reach the calendar feed: ${detail}`;
  if (!isProxiedHost(icsUrl)) {
    let host = icsUrl;
    try {
      host = new URL(icsUrl).host;
    } catch {
      /* keep the raw string */
    }
    return (
      `The browser blocked the calendar feed at "${host}", and that host is ` +
      `not one the local proxy forwards to. On the web build only published ` +
      `Outlook calendars (outlook.office.com / outlook.office365.com / ` +
      `outlook.live.com) can be read; the phone build has no such limit.`
    );
  }
  return (
    `Could not reach the calendar feed through the local proxy. Start it ` +
    `with \`npm run proxy\` and try again. (${detail})`
  );
}

/**
 * Senders/subjects worth reading for events. Everything else in the inbox is
 * ignored outright — we never send personal correspondence to the model.
 */
const EVENTY_SENDER_RE =
  /(announce|seminar|colloquium|digest|urop|careers|events|dormspam|no-?reply|list)@|@(csail|media|broadinstitute)\.mit\.edu/i;
const EVENTY_SUBJECT_RE =
  /\b(seminar|colloquium|talk|lecture|workshop|urop|research|fair|info session|deadline|apply|application|panel|audition|recruit|hiring|open house|mixer|social)\b/i;

export function looksEventy(m: GraphMessage): boolean {
  return (
    EVENTY_SENDER_RE.test(m.from.emailAddress.address) ||
    EVENTY_SUBJECT_RE.test(m.subject) ||
    /\[[a-z-]+\]/.test(m.subject) // mailing-list tag, e.g. [csail-announce]
  );
}

/**
 * Classify a calendar entry. Without this, class meetings synced from Outlook
 * fell through to 'other', which put them in the OPPORTUNITY lane - so the
 * app cheerfully interest-filtered your recitation and then penalized it for
 * conflicting with the pset it exists to help you with.
 */
function calendarKind(e: GraphEvent) {
  const hay = `${e.subject} ${e.bodyPreview ?? ''}`;
  if (/\b(exam|midterm|final)\b/i.test(hay)) return 'exam' as const;
  if (/\bquiz\b/i.test(hay)) return 'quiz' as const;
  if (/\b(recitation|section)\b/i.test(hay)) return 'recitation' as const;
  if (/\blecture\b/i.test(hay)) return 'lecture' as const;
  if (/\boffice hours?\b/i.test(hay)) return 'office_hours' as const;
  // A meeting a professor put on your calendar is not a "club event", but it
  // also isn't coursework. Leave it discretionary.
  return undefined;
}

function eventToRaw(e: GraphEvent): RawItem {
  const body = e.bodyPreview ?? '';
  return {
    source: 'outlook',
    sourceId: `event:${e.id}`,
    sourceUrl: e.webLink,
    text: `${e.subject}\n\n${body}`,
    hints: {
      kind: calendarKind(e),
      title: e.subject,
      description: body,
      start: new Date(e.start.dateTime).toISOString(),
      end: new Date(e.end.dateTime).toISOString(),
      allDay: e.isAllDay,
      location: e.location?.displayName || undefined,
      organizer: e.organizer?.emailAddress?.name,
      people: extractPeople(`${e.subject} ${body} ${e.organizer?.emailAddress?.name ?? ''}`),
      course: extractCourseCodes(e.subject).map((code) => ({ code }))[0],
    },
    raw: e,
    fetchedAt: nowISO(),
  };
}

/**
 * Classify a mailing-list message from its subject and sender.
 *
 * The model is perfectly capable of this, but it isn't consistent run to run -
 * a UROP posting came back as "urop" once and "other" the next sync, which
 * moved it between categories in the UI for no visible reason. Where a cheap
 * regex is reliable, it wins; the model still handles everything it misses.
 */
function messageKind(m: GraphMessage) {
  const subject = m.subject ?? '';
  const from = m.from.emailAddress.address;
  const hay = `${subject} ${m.bodyPreview ?? ''}`;

  if (/\burop\b|undergraduate research/i.test(hay) || /urop/i.test(from)) return 'urop' as const;
  if (/\b(colloquium|seminar|guest lecture|thesis defense)\b/i.test(hay)) return 'talk' as const;
  if (/\b(career fair|info session|recruiting|internship|hiring)\b/i.test(hay)) {
    return 'career' as const;
  }
  // Everything else is genuinely ambiguous - let the model decide.
  return undefined;
}

function messageToRaw(m: GraphMessage): RawItem {
  const body = htmlToText(m.body?.content) || m.bodyPreview;
  return {
    source: 'outlook',
    sourceId: `message:${m.id}`,
    sourceUrl: m.webLink,
    // No `start` hint on purpose: the extractor must find the date in prose,
    // and if it can't, the item is dropped rather than guessed.
    text: `Subject: ${m.subject}\nFrom: ${m.from.emailAddress.name} <${m.from.emailAddress.address}>\nReceived: ${m.receivedDateTime}\n\n${body}`,
    hints: {
      kind: messageKind(m),
      title: m.subject,
      description: body,
      organizer: m.from.emailAddress.name,
      people: extractPeople(`${m.subject} ${body}`),
    },
    raw: m,
    fetchedAt: nowISO(),
  };
}

function inWindow(iso: string, w: SyncWindow): boolean {
  return iso >= w.since && iso <= w.until;
}

// --- fixture implementation ------------------------------------------------

export const outlookFixture: Connector = {
  id: 'outlook',
  label: 'Outlook',
  isFixture: true,
  isConfigured: () => true,
  async fetch(_creds, window) {
    const items: RawItem[] = [];
    for (const e of EVENTS) {
      if (!inWindow(new Date(e.start.dateTime).toISOString(), window)) continue;
      items.push(eventToRaw(e));
    }
    // Mail is selected by *received* recency, not by event time — the event
    // time isn't known until the extractor runs.
    const mailSince = new Date(Date.now() - 14 * 86400_000).toISOString();
    for (const m of MESSAGES) {
      if (m.receivedDateTime < mailSince) continue;
      if (!looksEventy(m)) continue;
      items.push(messageToRaw(m));
    }
    return items;
  },
};

// --- live implementation ---------------------------------------------------

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new GraphError(res.status, path, res.statusText);
  return (await res.json()) as T;
}

/**
 * A Graph failure the UI can actually act on.
 *
 * Every one of these used to be swallowed by a `.catch(() => ({ value: [] }))`,
 * so an expired token - the normal end state of a Graph Explorer token, after
 * about an hour - produced an empty calendar and a *successful* sync. Settings
 * showed "live · 0 items" and there was nothing anywhere saying the connection
 * had died. Silence is the worst possible answer here: the one thing the user
 * needs to be told is "paste a fresh token".
 */
export class GraphError extends Error {
  constructor(
    readonly status: number,
    path: string,
    statusText = '',
  ) {
    super(
      status === 401
        ? 'Outlook token expired — paste a fresh one from Graph Explorer (they last about an hour).'
        : status === 403
          ? `Outlook denied ${path} (403) — the token is missing a permission. Re-consent in Graph Explorer and paste a new token.`
          : `Outlook ${path} → ${status} ${statusText}`.trim(),
    );
    this.name = 'GraphError';
  }
}

/**
 * The ICS path: fetch the published calendar, expand recurrences into the
 * sync window, and emit fully structured items. No mail - a published
 * calendar link can't grant that - so mailing-list extraction stays off in
 * this mode and the UI says so.
 */
async function fetchIcs(icsUrl: string, window: SyncWindow): Promise<RawItem[]> {
  // A published calendar is a LIVE feed - Outlook regenerates it in place,
  // the URL never changes. So a cached response is always the wrong answer
  // here: it's exactly the case where the user has just edited their
  // calendar and is waiting to see it.
  const res = await fetch(icsFetchUrl(icsUrl), { cache: 'no-store' }).catch(
    (err) => {
      throw new Error(icsFetchHint(icsUrl, err));
    },
  );
  if (!res.ok) throw new Error(`ICS feed -> ${res.status} ${res.statusText}`);
  const { events } = parseICS(await res.text());

  const winStart = new Date(window.since);
  const winEnd = new Date(window.until);
  const items: RawItem[] = [];

  for (const ev of events) {
    for (const inst of expandInstances(ev, winStart, winEnd)) {
      const pseudo: GraphEvent = {
        id: `${ev.uid}:${inst.start.getTime()}`,
        subject: ev.summary,
        bodyPreview: ev.description ?? '',
        start: { dateTime: inst.start.toISOString(), timeZone: 'UTC' },
        end: {
          dateTime: (inst.end ?? inst.start).toISOString(),
          timeZone: 'UTC',
        },
        isAllDay: ev.allDay,
        location: { displayName: ev.location ?? '' },
        organizer: { emailAddress: { name: '', address: '' } },
        webLink: 'https://outlook.office365.com/calendar',
      };
      items.push(eventToRaw(pseudo));
    }
  }
  return items;
}

export const outlookLive: Connector = {
  id: 'outlook',
  label: 'Outlook',
  isFixture: false,
  isConfigured: (creds) =>
    Boolean(creds.outlook?.accessToken || creds.outlook?.icsUrl),
  async fetch(creds, window) {
    const { accessToken, icsUrl } = creds.outlook!;
    if (!accessToken) return fetchIcs(icsUrl!, window);
    const token = accessToken;
    const items: RawItem[] = [];

    // Calendar failures are NOT swallowed: the calendar is the whole point of
    // connecting Outlook, so if it can't be read the sync must say so rather
    // than quietly reporting zero events.
    const cal = await graphGet<{ value: GraphEvent[] }>(
      token,
      `/me/calendarView?startDateTime=${window.since}&endDateTime=${window.until}&$top=100&$orderby=start/dateTime`,
    );
    for (const e of cal.value) items.push(eventToRaw(e));

    // Mail is different: Mail.Read is a separate consent that plenty of
    // accounts never grant, and a calendar that syncs without mailing-list
    // extraction is a perfectly good outcome. So a *permission* failure here
    // is tolerated - but a dead token still surfaces, via the calendar call
    // above and by rethrowing anything that isn't a 403/404.
    const mailSince = new Date(Date.now() - 14 * 86400_000).toISOString();
    const mail = await graphGet<{ value: GraphMessage[] }>(
      token,
      `/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${mailSince}&$top=100&$select=id,subject,bodyPreview,body,from,receivedDateTime,webLink`,
    ).catch((err) => {
      const status = err instanceof GraphError ? err.status : 0;
      if (status === 403 || status === 404) return { value: [] as GraphMessage[] };
      throw err;
    });
    for (const m of mail.value) {
      if (!looksEventy(m)) continue;
      items.push(messageToRaw(m));
    }

    return items;
  },
};
