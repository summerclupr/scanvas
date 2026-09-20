/**
 * Relative-date resolution.
 *
 * Language models are bad at calendar arithmetic - ask one for an ISO
 * timestamp from "this Thursday at 4pm" and it will confidently return a
 * Thursday in the wrong week. So the extractor is never allowed to do the
 * math. It returns a *structured* reference ("weekday=thursday, which=this,
 * time=16:00") and this module resolves it against the real clock.
 *
 * Everything here is pure and deterministic, so it's directly testable.
 */

export type WhenKind = 'absolute' | 'weekday' | 'offset_days' | 'unknown';

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** The structured date reference the extractor is constrained to produce. */
export interface WhenRef {
  kind: WhenKind;
  /** YYYY-MM-DD, when kind === 'absolute'. */
  date?: string;
  /** when kind === 'weekday'. */
  weekday?: Weekday;
  /** 'this' = the coming one; 'next' = the one after that. */
  which?: 'this' | 'next';
  /** when kind === 'offset_days'. 0 = today, 1 = tomorrow. */
  offset_days?: number;
  /** HH:MM, 24-hour. Absent means the time is unknown. */
  time?: string;
  end_time?: string;
  all_day?: boolean;
}

export interface ResolvedWhen {
  start: Date;
  end?: Date;
  allDay: boolean;
}

/**
 * Parse a clock time from what models actually emit.
 *
 * The prompt asks for "HH:MM" and models still return "17:00:00", "4:00 PM",
 * and full ISO strings. Being strict here silently dropped real events, so
 * this accepts the common shapes and rejects only genuine nonsense.
 */
function parseHM(hm: string | undefined): { h: number; m: number } | null {
  if (!hm) return null;
  let s = hm.trim();

  // A full ISO timestamp: keep the time half.
  const iso = /^\d{4}-\d{2}-\d{2}[T ](\d{1,2}:\d{1,2})/.exec(s);
  if (iso) s = iso[1];

  // Minutes are \d{1,2}, not \d{2}: models emit "19:0:0" and "8:5" often
  // enough that being strict here silently dropped real events.
  const m = /^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(am|pm)?/i.exec(s);
  if (!m) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;

  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/** Pull a weekday out of free text, e.g. "Thursday", "thu", "next Friday". */
function parseWeekday(s: string | undefined): Weekday | null {
  if (!s) return null;
  const m = /(mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)/i.exec(s);
  if (!m) return null;
  const stem = m[1].toLowerCase();
  const table: [string, Weekday][] = [
    ['mon', 'monday'],
    ['tue', 'tuesday'],
    ['wed', 'wednesday'],
    ['thu', 'thursday'],
    ['fri', 'friday'],
    ['sat', 'saturday'],
    ['sun', 'sunday'],
  ];
  return table.find(([p]) => stem.startsWith(p))?.[1] ?? null;
}

function atTime(day: Date, hm: { h: number; m: number } | null): Date {
  const d = new Date(day);
  if (hm) d.setHours(hm.h, hm.m, 0, 0);
  else d.setHours(12, 0, 0, 0); // unknown time -> midday, and allDay is set
  return d;
}

/**
 * Resolve a WhenRef against `now`. Returns null when the reference carries no
 * usable date - callers drop the item rather than invent a time.
 */
export function resolveWhen(ref: WhenRef, now: Date = new Date()): ResolvedWhen | null {
  const startHM = parseHM(ref.time);
  const endHM = parseHM(ref.end_time);
  let day: Date | null = null;

  // A model that picks "absolute" but writes a day name in `date` meant
  // "weekday". Reinterpret rather than discard a real event.
  let kind = ref.kind;
  if (kind === 'absolute' && ref.date && !/^\d{4}-\d{2}-\d{2}/.test(ref.date.trim())) {
    if (parseWeekday(ref.date)) kind = 'weekday';
  }

  switch (kind) {
    case 'absolute': {
      if (!ref.date) return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ref.date.trim());
      if (!m) return null;
      day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (Number.isNaN(day.getTime())) return null;
      break;
    }

    case 'offset_days': {
      const off = ref.offset_days;
      if (typeof off !== 'number' || !Number.isFinite(off)) return null;
      day = new Date(now);
      day.setDate(day.getDate() + Math.trunc(off));
      break;
    }

    case 'weekday': {
      // Models routinely put the day name in `date` instead of `weekday`
      // ("date": "Thursday"), so accept it from either field.
      const weekday =
        (ref.weekday && ref.weekday in WEEKDAY_INDEX ? ref.weekday : null) ??
        parseWeekday(ref.weekday) ??
        parseWeekday(ref.date);
      if (!weekday) return null;
      const target = WEEKDAY_INDEX[weekday];
      day = new Date(now);
      let delta = (target - now.getDay() + 7) % 7;

      if (delta === 0) {
        // Today is the named day. Only count it if the stated time hasn't
        // passed; otherwise "Thursday" means the Thursday a week out.
        const candidate = atTime(now, startHM);
        if (candidate.getTime() <= now.getTime()) delta = 7;
      }
      if (ref.which === 'next') delta += 7;
      day.setDate(day.getDate() + delta);
      break;
    }

    default:
      return null;
  }

  const allDay = Boolean(ref.all_day) || !startHM;
  const start = atTime(day, startHM);
  let end: Date | undefined;
  if (endHM) {
    end = atTime(day, endHM);
    // A range like 7pm to 1am crosses midnight.
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  }
  return { start, end, allDay };
}

// --- formatting helpers used across the UI ---------------------------------

export function hoursUntil(iso: string, now: Date = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 3_600_000;
}

/** "in 3h", "in 2d", "tomorrow", "overdue by 5h". */
export function relativeLabel(iso: string, now: Date = new Date()): string {
  const h = hoursUntil(iso, now);
  if (h < 0) {
    const a = Math.abs(h);
    if (a < 24) return `overdue by ${Math.round(a)}h`;
    return `overdue by ${Math.round(a / 24)}d`;
  }
  if (h < 1) return `in ${Math.max(1, Math.round(h * 60))}m`;
  if (h < 24) return `in ${Math.round(h)}h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'tomorrow';
  if (d < 7) return `in ${d}d`;
  return `in ${Math.round(d / 7)}w`;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Stable, dependency-free 32-bit content hash (FNV-1a) for event ids. */
export function contentHash(...parts: (string | undefined)[]): string {
  let h = 0x811c9dc5;
  const s = parts.filter(Boolean).join(' ');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
