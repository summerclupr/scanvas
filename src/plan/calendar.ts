/**
 * Calendar grid maths - pure, no UI, no dependencies.
 *
 * What lands on the calendar: all coursework due dates, your class schedule
 * (lectures, recitations, office hours - toggleable), anything you added
 * yourself, and only the campus events and internships you SAVED. An
 * unfiltered calendar of 4,000 internships and every campus event is
 * wallpaper; the saved ones are what you've committed to thinking about.
 */

import type { ScoredEvent } from '../core/types';
import { isAttendanceWork } from '../core/attendance';

export type Zoom = 'month' | 'week';

export interface CalendarDay {
  date: Date;
  /** YYYY-MM-DD in local time, used as a stable key. */
  key: string;
  inCurrentPeriod: boolean;
  isToday: boolean;
  isWeekend: boolean;
  items: ScoredEvent[];
}

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Local-time YYYY-MM-DD. Never use toISOString here - it shifts the day. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

export function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

export function addMonths(d: Date, n: number): Date {
  const out = startOfMonth(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

export function addWeeks(d: Date, n: number): Date {
  const out = startOfWeek(d);
  out.setDate(out.getDate() + n * 7);
  return out;
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function weekLabel(d: Date): string {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameM = sameMonth(start, end);
  const a = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const b = end.toLocaleDateString('en-US', {
    month: sameM ? undefined : 'short',
    day: 'numeric',
  });
  return `${a} – ${b}, ${end.getFullYear()}`;
}

/**
 * Which events belong on the calendar.
 *
 * `savedIds` are event ids the user starred in the For you feed; saved
 * internships arrive already converted to `application_deadline` events by
 * the store, so they're included by kind rather than by id.
 */
export function calendarEvents(
  events: ScoredEvent[],
  savedIds: Set<string>,
  opts: { showClasses?: boolean; showUnsaved?: boolean; unsavedFloor?: number } = {},
): ScoredEvent[] {
  const showClasses = opts.showClasses ?? true;
  // Saved-only is the default because an unfiltered calendar is wallpaper.
  // But that made well-matched events invisible until you happened to find
  // and star them in the feed - so this is opt-in, not absent.
  const showUnsaved = opts.showUnsaved ?? false;
  const unsavedFloor = opts.unsavedFloor ?? 0.3;
  return events.filter((ev) => {
    if (CLASS_KINDS.has(ev.kind)) {
      // Lectures, recitations and office hours ARE the weekly schedule, so
      // they belong here even though they're excluded from Due and Plan
      // (they're not things you owe). Toggleable, because on a heavy course
      // load they can crowd out the deadlines.
      return showClasses;
    }
    // PE attendance check-ins are points for showing up, not deadlines.
    if (isAttendanceWork(ev)) return false;
    if (ev.lane === 'obligation') return true;
    // Things you added yourself are yours; they never need saving.
    if (ev.source === 'manual') return true;
    if (isOwnCalendarEntry(ev)) return true;
    if (savedIds.has(ev.id)) return true;
    // Everything else - campus events, internships - only when you opt in.
    return showUnsaved && ev.score >= unsavedFloor;
  });
}

/**
 * An entry on a calendar the user connected — as opposed to something we
 * found out about and think they might like.
 *
 * This distinction is the whole reason the Calendar tab can be filtered at
 * all. "Advisor meeting", "Dentist" and "Lunch with Kim" arrive from Outlook
 * with no keyword the interest model can score, so they normalize to
 * kind 'other', land in the OPPORTUNITY lane, and got filtered out of the
 * calendar exactly like a dormspam event would - invisible even with
 * "Suggestions on", because a dentist appointment scores ~0 and the unsaved
 * floor is 0.3. But the user did not "opt in" to their own calendar; they
 * wrote it. It is schedule, not suggestion, and it is never filtered.
 *
 * Keyed on the sourceId prefix the Outlook connector assigns, which is what
 * separates a calendar entry (`event:`) from a mailing-list message
 * (`message:`) - the latter genuinely IS an opportunity and stays filtered.
 */
export function isOwnCalendarEntry(ev: { source: string; sourceId: string }): boolean {
  return ev.source === 'outlook' && ev.sourceId.startsWith('event:');
}

export const CLASS_KINDS = new Set(['lecture', 'recitation', 'office_hours']);

/** Bucket events by local day. */
export function bucketByDay(events: ScoredEvent[]): Map<string, ScoredEvent[]> {
  const map = new Map<string, ScoredEvent[]>();
  for (const ev of events) {
    const key = dayKey(new Date(ev.start));
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
  }
  return map;
}

/**
 * The 6x7 grid for a month, padded with neighbouring days so every row is a
 * full week. Always 42 cells, so the grid doesn't reflow between months.
 */
export function monthGrid(
  anchor: Date,
  byDay: Map<string, ScoredEvent[]>,
  now: Date = new Date(),
): CalendarDay[] {
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  const todayKey = dayKey(now);
  const out: CalendarDay[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const key = dayKey(date);
    out.push({
      date,
      key,
      inCurrentPeriod: sameMonth(date, first),
      isToday: key === todayKey,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      items: byDay.get(key) ?? [],
    });
  }
  return out;
}

/** The 7 days of the week containing `anchor`. */
export function weekGrid(
  anchor: Date,
  byDay: Map<string, ScoredEvent[]>,
  now: Date = new Date(),
): CalendarDay[] {
  const start = startOfWeek(anchor);
  const todayKey = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const key = dayKey(date);
    return {
      date,
      key,
      inCurrentPeriod: true,
      isToday: key === todayKey,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      items: byDay.get(key) ?? [],
    };
  });
}

/** Dot colour class for a day's densest item. */
export type DayTone = 'exam' | 'due' | 'application' | 'class' | 'event';

export function toneOf(ev: ScoredEvent): DayTone {
  if (ev.kind === 'exam' || ev.kind === 'quiz') return 'exam';
  if (ev.kind === 'application_deadline') return 'application';
  if (CLASS_KINDS.has(ev.kind)) return 'class';
  if (ev.lane === 'obligation') return 'due';
  return 'event';
}

/** Distinct tones present on a day, in severity order. */
export function dayTones(items: ScoredEvent[]): DayTone[] {
  const order: DayTone[] = ['exam', 'due', 'application', 'event', 'class'];
  const present = new Set(items.map(toneOf));
  return order.filter((t) => present.has(t));
}
