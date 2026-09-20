/**
 * Multi-day work scheduling.
 *
 * The first Plan tab only ever showed things DUE today, which is the wrong
 * question: a pset worth 12% of your grade due Friday needs hours on Tuesday
 * and Wednesday, and a planner that stays silent until Friday morning has
 * failed at the one job it has.
 *
 * So work is allocated BACKWARD from each deadline across the days before it,
 * against a daily capacity. Four rules make the output trustworthy:
 *
 *   1. Plan AHEAD: work is scheduled to FINISH the day before it's due. A
 *      pset due tomorrow at 11:59pm therefore appears today, not tomorrow.
 *      The due day itself is only used when the thing is due today, or when
 *      nothing fits earlier and it's due late enough in the evening that
 *      same-day work is realistic. (The previous rule let anything due after
 *      6pm be worked on its due day - and since Canvas deadlines are almost
 *      all 11:59pm, "due tomorrow" work was never shown today.)
 *   2. Never exceed the day's capacity. If everything can't fit, the overflow
 *      is reported rather than silently dropped - "you are over by 6 hours"
 *      is actionable; a quietly truncated list is not.
 *   3. Work lands as close to that target as capacity allows, because plans
 *      made far in advance get ignored.
 *   4. Ticking a session off subtracts ITS hours - recorded when you ticked
 *      it - from what's left, and the ticked session stays visible (struck
 *      through) so you can untick it. Anything you don't tick simply isn't
 *      subtracted, so recomputing from "now" tomorrow rolls it forward. That
 *      is the whole rollover mechanism; there's no separate bookkeeping to
 *      get out of sync.
 */

import type { ScoredEvent } from '../core/types';
import { dayKey } from './calendar';
import { estimateHours, type PlanItem, type PlanWeights } from './priority';
import { buildPlan } from './priority';

/** How much work a student will actually do in a day, by preference. */
export interface Capacity {
  /** Hours of focused work per day. */
  hoursPerDay: number;
  /** Cap on distinct items per day - "don't stack too much on me". */
  maxItemsPerDay: number;
}

export const DEFAULT_CAPACITY: Capacity = { hoursPerDay: 4, maxItemsPerDay: 4 };

/** How many days from today an application closing beyond the horizon may occupy. */
export const APPLICATION_START_DAYS = 7;

export interface WorkSession {
  /** Stable per-day id, so completion can be tracked per session. */
  id: string;
  event: ScoredEvent;
  /** YYYY-MM-DD this session is scheduled for. */
  day: string;
  hours: number;
  /** True when this is the day the thing is actually due. */
  isDueDay: boolean;
  /** Whole days between this session's day and the due day. 0 = due that day. */
  daysBeforeDue: number;
  /** Already ticked off. Kept in the list so the tick is visible and reversible. */
  done: boolean;
  /** Ordering within the day, from the priority model. */
  priority: number;
  why: string[];
}

export interface DayPlan {
  day: string;
  date: Date;
  sessions: WorkSession[];
  /** Fixed commitments that day - classes, events. Not work, but they cost time. */
  commitments: ScoredEvent[];
  /** Coursework and applications actually DUE this day, whether or not any work is planned on it. */
  due: ScoredEvent[];
  plannedHours: number;
  capacityHours: number;
  /** True when we couldn't fit everything that wanted this day. */
  over: boolean;
}

export interface ScheduleResult {
  days: DayPlan[];
  /** Work that could not be placed anywhere before its deadline. */
  unplaced: { event: ScoredEvent; hours: number; reason: string }[];
}

const DONE_STATES = new Set(['submitted', 'graded', 'pending_review', 'excused']);
// 'missing' is deliberately NOT here: Canvas marks swept, never-submitted work
// as missing, and hiding it made overdue psets silently disappear from Due -
// the user saw 'Pset 4' with no trace of the overdue 2 and 3. Missing work is
// overdue work you can still often submit late; only GRADES treat it as a 0.

/** Session id is stable across recomputation so completion sticks. */
export function sessionId(eventId: string, day: string): string {
  return `${eventId}@${day}`;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Whole local days from `a` to `b` (both YYYY-MM-DD keys). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86400_000);
}

/**
 * Build a day-by-day plan over `horizonDays`.
 *
 * `completed` is the set of session ids already ticked off and
 * `completedHours` how long each was planned for when ticked. Their hours are
 * subtracted from what still needs scheduling, which is what makes an
 * unfinished session roll to tomorrow automatically on the next recompute.
 */
export function scheduleWork(
  events: ScoredEvent[],
  weights: PlanWeights,
  capacity: Capacity = DEFAULT_CAPACITY,
  completed: Set<string> = new Set(),
  now: Date = new Date(),
  horizonDays = 14,
  savedIds: Set<string> = new Set(),
  completedHours: Record<string, number> = {},
): ScheduleResult {
  const today = startOfLocalDay(now);

  // Day buckets for the horizon.
  const days: DayPlan[] = [];
  const byKey = new Map<string, DayPlan>();
  for (let i = 0; i < horizonDays; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const day: DayPlan = {
      day: dayKey(date),
      date,
      sessions: [],
      commitments: [],
      due: [],
      plannedHours: 0,
      // Today has fewer usable hours left than a full future day.
      capacityHours:
        i === 0
          ? Math.max(1, Math.min(capacity.hoursPerDay, (24 - now.getHours()) * 0.5))
          : capacity.hoursPerDay,
      over: false,
    };
    days.push(day);
    byKey.set(day.day, day);
  }
  const todayKey = days[0].day;
  const lastHorizonDay = days[days.length - 1].day;

  // Appointments: things at a set clock time, as opposed to flexible work.
  // Only what the student actually committed to counts - class meetings,
  // events they added themselves, and events they starred. The first version
  // put EVERY campus event here, so the day card listed parties the student
  // had never even seen, presented as if they were on their schedule.
  for (const ev of events) {
    const isClass = ['lecture', 'recitation', 'office_hours'].includes(ev.kind);
    const isMine = ev.source === 'manual';
    const isSaved = savedIds.has(ev.id);
    if (!isClass && !isMine && !isSaved) continue;
    if (isClass && ev.lane !== 'obligation') continue;
    const bucket = byKey.get(dayKey(new Date(ev.start)));
    if (bucket) bucket.commitments.push(ev);
  }
  for (const d of days) {
    d.commitments.sort((a, b) => a.start.localeCompare(b.start));
  }

  // Everything that needs working on, most urgent first. buildPlan already
  // drops class meetings, finished work, stale events, and PE attendance.
  const plan: PlanItem[] = buildPlan(events, weights, now).filter(
    (p) => p.lane !== 'event' && !DONE_STATES.has(p.event.submission?.state ?? ''),
  );

  const unplaced: ScheduleResult['unplaced'] = [];

  for (const item of plan) {
    const ev = item.event;
    const due = new Date(ev.start);
    const dueDayKey = dayKey(due);
    const total = estimateHours(ev);

    // Deadlines inside the horizon are listed on their day regardless of
    // where the work lands, so "due tomorrow" is visible on tomorrow's card
    // even though the work sits on today's.
    byKey.get(dueDayKey)?.due.push(ev);

    // Due beyond the horizon: not this fortnight's problem - for COURSEWORK.
    // Scheduling it anyway is how a check-in due Oct 22 ended up on today's
    // list; it enters the plan once its deadline comes within range. An
    // APPLICATION is different: one that closes in January should still be
    // started this week, so its work is placed forward from today and the
    // closing date is spelled out on the row.
    const farApplication = item.lane === 'application' && dueDayKey > lastHorizonDay;
    if (dueDayKey > lastHorizonDay && !farApplication) continue;

    const closes = farApplication
      ? [`closes ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`]
      : [];
    const session = (d: DayPlan, hours: number, done: boolean, extraWhy: string[] = []): WorkSession => ({
      id: sessionId(ev.id, d.day),
      event: ev,
      day: d.day,
      hours,
      isDueDay: d.day === dueDayKey,
      daysBeforeDue: Math.max(0, daysBetween(d.day, dueDayKey)),
      done,
      priority: item.priority,
      why: [...item.why, ...closes, ...extraWhy],
    });

    // Small things go entirely on one day; big ones get split.
    const chunk = total <= 2 ? total : Math.min(2.5, capacity.hoursPerDay);

    // What's already been ticked off for this event, on any day - including
    // days that have since passed, which is why the hours are recorded
    // rather than re-derived from a candidate list that no longer holds them.
    let doneHours = 0;
    const doneDays = new Set<string>();
    for (const id of completed) {
      if (!id.startsWith(`${ev.id}@`)) continue;
      doneDays.add(id.slice(ev.id.length + 1));
      doneHours += completedHours[id] ?? chunk;
    }
    // Ticked sessions stay on their day, struck through, so the tick is
    // visible and one tap from undone. Recomputing used to drop them, so
    // ticking a box made the row vanish and "done" was never shown.
    for (const d of days) {
      if (!doneDays.has(d.day)) continue;
      const hours = completedHours[sessionId(ev.id, d.day)] ?? chunk;
      d.sessions.push(session(d, hours, true));
      d.plannedHours += hours;
    }

    // Trivial check-ins (1-point sequences) are minutes, not sessions. Any
    // tick means it's done; otherwise one 0.5h slot as late as possible.
    const points = ev.submission?.pointsPossible;
    const trivial =
      (typeof points === 'number' && points <= 2) ||
      (typeof ev.gradeImpact === 'number' && ev.gradeImpact < 1);

    let remaining = trivial ? (doneDays.size ? 0 : 0.5) : Math.max(0, total - doneHours);
    if (remaining <= 0.25) continue;

    // Plan ahead: finish the day BEFORE it's due. A far-off application gets
    // the first week: start now, and the rest of the horizon stays free for
    // work that is actually due in it.
    let candidates = farApplication
      ? days.slice(0, APPLICATION_START_DAYS)
      : days.filter((d) => d.day < dueDayKey);
    const dueDay = byKey.get(dueDayKey);
    // Due today: today is all there is.
    if (candidates.length === 0 && dueDay) candidates = [dueDay];

    if (candidates.length === 0) {
      // Due before the horizon started, i.e. overdue - put it on today.
      const t = days[0];
      if (!doneDays.has(t.day)) {
        const hours = Math.min(remaining, t.capacityHours);
        t.sessions.push(session(t, hours, false, ['overdue']));
        t.plannedHours += hours;
      }
      continue;
    }

    if (trivial) {
      const d = candidates[candidates.length - 1];
      d.sessions.push(session(d, 0.5, false));
      d.plannedHours += 0.5;
      continue;
    }

    const place = (d: DayPlan, lastChance: boolean, extraWhy: string[] = []) => {
      if (doneDays.has(d.day)) return;
      if (d.sessions.length >= capacity.maxItemsPerDay) return;
      const free = d.capacityHours - d.plannedHours;
      if (free <= 0.25) return;
      // The chunk exists to spread big work across days. On the earliest
      // day there is nothing earlier to spread to, so take all that fits -
      // an 8h lab due tomorrow morning wants today's whole budget, not 2.5h
      // of it with the rest reported as unplaceable. And don't leave a
      // sub-hour crumb for another day: a 3h pset is one sitting.
      const want = lastChance || remaining - chunk < 0.75 ? remaining : chunk;
      const hours = Math.min(want, free);
      d.sessions.push(session(d, hours, false, extraWhy));
      d.plannedHours += hours;
      remaining -= hours;
    };

    if (item.lane === 'application') {
      // Applications run the other way: start now, finish early. "Work on
      // it the day before it closes" is how people miss rolling internships,
      // and the deadline day should read "submit", not "start".
      for (let i = 0; i < candidates.length && remaining > 0.01; i++) {
        place(candidates[i], i === candidates.length - 1);
      }
    } else {
      for (let i = candidates.length - 1; i >= 0 && remaining > 0.01; i--) {
        place(candidates[i], i === 0);
      }
    }

    // Overflow onto the due day itself, but only when it's due late enough
    // that same-day work is realistic and it isn't already the only candidate.
    const eveningDue = due.getHours() >= 18;
    if (remaining > 0.25 && eveningDue && dueDay && !candidates.includes(dueDay) && dueDay.day >= todayKey) {
      place(dueDay, true, ['finishes on the due day']);
    }

    if (remaining > 0.25) {
      unplaced.push({
        event: ev,
        hours: remaining,
        reason:
          candidates.length === 1 && candidates[0].day === dueDayKey
            ? 'due today and the day is already full'
            : `no room before ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      });
    }
  }

  for (const d of days) {
    // Open work first by priority; ticked-off sessions sink to the bottom.
    d.sessions.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.priority - a.priority;
    });
    d.due.sort((a, b) => a.start.localeCompare(b.start));
    d.over = d.plannedHours > d.capacityHours + 0.01;
  }

  return { days, unplaced };
}

/**
 * Spread the plan out: fewer items per day, more days used.
 *
 * This is what "you stacked too much on me" maps to - it lowers both the
 * hour budget and the item count, which pushes work earlier rather than
 * simply hiding it.
 */
export function relaxCapacity(c: Capacity): Capacity {
  return {
    hoursPerDay: Math.max(1.5, +(c.hoursPerDay - 1).toFixed(1)),
    maxItemsPerDay: Math.max(2, c.maxItemsPerDay - 1),
  };
}

/** The inverse, for "give me more per day, I want it done sooner". */
export function tightenCapacity(c: Capacity): Capacity {
  return {
    hoursPerDay: Math.min(12, +(c.hoursPerDay + 1).toFixed(1)),
    maxItemsPerDay: Math.min(10, c.maxItemsPerDay + 1),
  };
}
