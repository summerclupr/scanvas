/**
 * Events you add yourself: club meetings, practices, standing commitments.
 *
 * Stored as a repeating RULE, not as a pile of instances. A weekly club
 * meeting is one record that expands into whatever window the calendar is
 * showing - so "every Thursday 7pm" stays true a year out without writing 52
 * rows to storage, and editing the series edits every occurrence.
 *
 * These are yours, so they're never interest-filtered and never dropped for
 * low confidence. They do NOT enter the Due list or the notification plan by
 * default: a recurring club meeting isn't something you owe, and treating it
 * like a pset would bury real deadlines. The `remind` flag opts one in.
 */

import { LANE_OF, type EventKind, type ScoredEvent } from '../core/types';
import { contentHash } from '../core/datetime';
import { dayKey } from './calendar';

export type Repeat = 'none' | 'daily' | 'weekly' | 'biweekly';

export interface CustomEvent {
  id: string;
  title: string;
  kind: EventKind;
  location?: string;
  /** YYYY-MM-DD of the first occurrence. */
  startDate: string;
  /** "HH:MM" 24h, or undefined for all-day. */
  time?: string;
  endTime?: string;
  repeat: Repeat;
  /** 0=Sun..6=Sat. Weekly/biweekly only; empty means the start date's day. */
  weekdays: number[];
  /** YYYY-MM-DD, inclusive. Undefined means it runs indefinitely. */
  until?: string;
  /** Opt in to reminders; off by default so standing meetings stay quiet. */
  remind: boolean;
  createdAt: string;
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: 'One time',
  daily: 'Every day',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
};

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse "YYYY-MM-DD" plus optional "HH:MM" into a local Date. */
function at(dateStr: string, time?: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  const t = time ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : null;
  if (t) d.setHours(Number(t[1]), Number(t[2]), 0, 0);
  else d.setHours(12, 0, 0, 0);
  return d;
}

/** Human summary for the series list: "Every week · Thu · 7:00 PM". */
export function describeCustom(ev: CustomEvent): string {
  const parts: string[] = [REPEAT_LABELS[ev.repeat]];
  if (ev.repeat === 'weekly' || ev.repeat === 'biweekly') {
    const days = ev.weekdays.length
      ? ev.weekdays
      : [at(ev.startDate)?.getDay() ?? 0];
    parts.push(days.sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(', '));
  }
  if (ev.time) {
    const d = at(ev.startDate, ev.time);
    if (d) {
      parts.push(
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      );
    }
  } else {
    parts.push('all day');
  }
  if (ev.until) parts.push(`until ${ev.until}`);
  return parts.join(' · ');
}

/**
 * Expand one series into ScoredEvents inside [from, to].
 *
 * Instance ids embed the occurrence date so each day is distinct and stable
 * across renders - the calendar keys off them, and a shared id would make
 * React collapse a weekly meeting into one row.
 */
export function expandCustom(
  ev: CustomEvent,
  from: Date,
  to: Date,
): ScoredEvent[] {
  const first = at(ev.startDate, ev.time);
  if (!first) return [];

  const untilDate = ev.until ? at(ev.until, '23:59') : null;
  const hardStop = untilDate && untilDate < to ? untilDate : to;
  if (first > hardStop) return [];

  const durationMs = (() => {
    if (!ev.time || !ev.endTime) return 0;
    const a = at(ev.startDate, ev.time);
    const b = at(ev.startDate, ev.endTime);
    if (!a || !b) return 0;
    const ms = b.getTime() - a.getTime();
    return ms > 0 ? ms : ms + 86400_000; // crosses midnight
  })();

  const starts: Date[] = [];

  if (ev.repeat === 'none') {
    starts.push(first);
  } else if (ev.repeat === 'daily') {
    for (let d = new Date(first); d <= hardStop; d.setDate(d.getDate() + 1)) {
      if (d >= from) starts.push(new Date(d));
    }
  } else {
    const stepWeeks = ev.repeat === 'biweekly' ? 2 : 1;
    const days = ev.weekdays.length ? [...ev.weekdays].sort() : [first.getDay()];
    // Walk week blocks from the week containing the first occurrence.
    const anchor = new Date(first);
    anchor.setDate(anchor.getDate() - anchor.getDay());
    for (
      let week = new Date(anchor);
      week <= hardStop;
      week.setDate(week.getDate() + stepWeeks * 7)
    ) {
      for (const wd of days) {
        const d = new Date(week);
        d.setDate(d.getDate() + wd);
        d.setHours(first.getHours(), first.getMinutes(), 0, 0);
        if (d < first || d > hardStop || d < from) continue;
        starts.push(new Date(d));
      }
    }
  }

  // Guard against a pathological rule filling memory.
  return starts.slice(0, 400).map((start) => ({
    id: `custom:${ev.id}:${dayKey(start)}`,
    source: 'manual' as const,
    sourceId: ev.id,
    kind: ev.kind,
    // Class meetings you enter by hand get the same treatment as Hydrant
    // ones: they belong to the schedule, not to the list of things you owe.
    // Everything else is a personal commitment, never interest-filtered.
    lane: LANE_OF[ev.kind] === 'obligation' ? ('obligation' as const) : ('opportunity' as const),
    title: ev.title,
    start: start.toISOString(),
    end: durationMs > 0 ? new Date(start.getTime() + durationMs).toISOString() : undefined,
    allDay: !ev.time,
    location: ev.location,
    organizer: undefined,
    people: [],
    topics: [],
    tags: ['added by you'],
    confidence: 1,
    firstSeenAt: ev.createdAt,
    updatedAt: ev.createdAt,
    score: 1,
    urgency: 0,
    reasons: [{ code: 'priority' as const, delta: 1, label: 'You added this' }],
  }));
}

export function expandAllCustom(
  events: CustomEvent[],
  from: Date,
  to: Date,
): ScoredEvent[] {
  return events.flatMap((ev) => expandCustom(ev, from, to));
}

export function newCustomEvent(partial: Partial<CustomEvent> = {}): CustomEvent {
  const now = new Date();
  return {
    id: contentHash(String(now.getTime()), partial.title ?? 'event'),
    title: '',
    kind: 'club_event',
    startDate: dayKey(now),
    time: '19:00',
    repeat: 'weekly',
    weekdays: [now.getDay()],
    remind: false,
    createdAt: now.toISOString(),
    ...partial,
  };
}
