/**
 * Minimal ICS (RFC 5545) parser and recurrence expander.
 *
 * Exists because MIT's Microsoft tenant requires admin approval for Graph
 * mail/calendar scopes, which kills every token-based route to Outlook data.
 * A published calendar ICS link needs no consent at all - it's just a URL -
 * so this is the path that actually works for students.
 *
 * Deliberately minimal: VEVENT only, WEEKLY/DAILY RRULEs (which is what class
 * schedules are), EXDATE honored, everything else ignored. A full RRULE
 * engine is a library-sized problem; this covers what a student calendar
 * actually contains and drops the rest rather than guessing.
 *
 * Timezone honesty: Outlook stamps local times with Windows timezone names
 * ("Eastern Standard Time") that we make no attempt to resolve. Local times
 * are interpreted in the DEVICE's timezone - correct for the overwhelming
 * case of a student whose phone and calendar live in the same place, wrong
 * for an event created in another timezone. UTC times ("...Z") are exact.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** ORGANIZER's CN parameter - on Engage's feed this is the club's name. */
  organizer?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  rrule?: string;
  exdates: Date[];
}

/** Unfold continuation lines: a line starting with space/tab joins the previous. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/** "DTSTART;TZID=...:20260921T130000" -> { name, params, value } */
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = left.split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse an ICS date/date-time. Returns the Date plus whether it was date-only.
 * "20260921" (all-day), "20260921T130000" (local -> device TZ),
 * "20260921T170000Z" (UTC).
 */
export function parseIcsDate(
  value: string,
  params: Record<string, string> = {},
): { date: Date; dateOnly: boolean } | null {
  const v = value.trim();
  const dateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(v);

  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;

  if (dateOnly || h === undefined) {
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), dateOnly: true };
  }
  if (z) {
    return {
      date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))),
      dateOnly: false,
    };
  }
  // Local time, interpreted in device TZ (see header comment).
  return {
    date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    dateOnly: false,
  };
}

export function parseICS(text: string): { calendarName?: string; events: IcsEvent[] } {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let calendarName: string | undefined;
  let cur: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === 'X-WR-CALNAME') calendarName = unescapeText(value);

    if (name === 'BEGIN' && value === 'VEVENT') {
      cur = { exdates: [] };
      continue;
    }
    if (name === 'END' && value === 'VEVENT') {
      if (cur?.summary && cur.start) {
        events.push({
          uid: cur.uid ?? `${cur.summary}:${cur.start.toISOString()}`,
          summary: cur.summary,
          description: cur.description,
          location: cur.location,
          organizer: cur.organizer,
          start: cur.start,
          end: cur.end,
          allDay: cur.allDay ?? false,
          rrule: cur.rrule,
          exdates: cur.exdates ?? [],
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    switch (name) {
      case 'UID':
        cur.uid = value;
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(value);
        break;
      case 'DESCRIPTION':
        cur.description = unescapeText(value).slice(0, 2000);
        break;
      case 'LOCATION':
        cur.location = unescapeText(value);
        break;
      case 'ORGANIZER': {
        // ORGANIZER;CN="Pokerbots":mailto:noreply@... - the name is the CN.
        const cn = params.CN?.replace(/^"|"$/g, '').trim();
        if (cn) cur.organizer = unescapeText(cn);
        break;
      }
      case 'DTSTART': {
        const d = parseIcsDate(value, params);
        if (d) {
          cur.start = d.date;
          cur.allDay = d.dateOnly;
        }
        break;
      }
      case 'DTEND': {
        const d = parseIcsDate(value, params);
        if (d) cur.end = d.date;
        break;
      }
      case 'RRULE':
        cur.rrule = value;
        break;
      case 'EXDATE': {
        // EXDATE can carry a comma-separated list.
        for (const part of value.split(',')) {
          const d = parseIcsDate(part, params);
          if (d) cur.exdates!.push(d.date);
        }
        break;
      }
    }
  }

  return { calendarName, events };
}

// ---------------------------------------------------------------------------
// Recurrence expansion
// ---------------------------------------------------------------------------

const ICS_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface Rule {
  freq: string;
  interval: number;
  byday: number[];
  until?: Date;
  count?: number;
}

function parseRRule(rrule: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of rrule.split(';')) {
    const eq = kv.indexOf('=');
    if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const freq = parts.FREQ?.toUpperCase();
  // MONTHLY/YEARLY class events are rare and the BYDAY=2TU forms are where
  // minimal parsers go to die. Skip the series rather than expand it wrong.
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return null;

  const byday = (parts.BYDAY ?? '')
    .split(',')
    .map((d) => ICS_DAY[d.trim().toUpperCase()])
    .filter((n) => n !== undefined);

  let until: Date | undefined;
  if (parts.UNTIL) until = parseIcsDate(parts.UNTIL)?.date;

  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    byday,
    until,
    count: parts.COUNT ? Number(parts.COUNT) : undefined,
  };
}

/**
 * Expand one event into concrete instances inside [windowStart, windowEnd].
 * Non-recurring events yield themselves (if in window). A recurring series
 * with an unsupported RRULE yields only its first instance.
 */
export function expandInstances(
  ev: IcsEvent,
  windowStart: Date,
  windowEnd: Date,
): { start: Date; end?: Date }[] {
  const durationMs = ev.end ? ev.end.getTime() - ev.start.getTime() : 0;
  const inWindow = (d: Date) => d >= windowStart && d <= windowEnd;
  const excluded = (d: Date) =>
    ev.exdates.some((x) => Math.abs(x.getTime() - d.getTime()) < 60_000);

  const instance = (start: Date) => ({
    start,
    end: durationMs > 0 ? new Date(start.getTime() + durationMs) : undefined,
  });

  if (!ev.rrule) {
    return inWindow(ev.start) && !excluded(ev.start) ? [instance(ev.start)] : [];
  }

  const rule = parseRRule(ev.rrule);
  if (!rule) {
    return inWindow(ev.start) && !excluded(ev.start) ? [instance(ev.start)] : [];
  }

  const out: { start: Date; end?: Date }[] = [];
  const hardStop = new Date(windowEnd.getTime() + 86400_000);
  let produced = 0; // counts every occurrence for COUNT, in or out of window

  if (rule.freq === 'DAILY') {
    for (
      let d = new Date(ev.start);
      d <= hardStop;
      d = new Date(d.getTime() + rule.interval * 86400_000)
    ) {
      if (rule.until && d > rule.until) break;
      if (rule.count !== undefined && produced >= rule.count) break;
      produced++;
      if (inWindow(d) && !excluded(d)) out.push(instance(d));
    }
    return out;
  }

  // WEEKLY: BYDAY lists the weekdays; absent BYDAY means the DTSTART weekday.
  const days = rule.byday.length ? rule.byday : [ev.start.getDay()];
  // Walk week by week from the week containing DTSTART.
  const weekAnchor = new Date(ev.start);
  weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay()); // back to Sunday

  for (
    let week = new Date(weekAnchor);
    week <= hardStop;
    week = new Date(week.getTime() + rule.interval * 7 * 86400_000)
  ) {
    for (const day of [...days].sort((a, b) => a - b)) {
      const d = new Date(week);
      d.setDate(d.getDate() + day);
      d.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
      if (d < ev.start) continue; // before the series began
      if (rule.until && d > rule.until) return out;
      if (rule.count !== undefined && produced >= rule.count) return out;
      produced++;
      if (inWindow(d) && !excluded(d)) out.push(instance(d));
    }
  }
  return out;
}
