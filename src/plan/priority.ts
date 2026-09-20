/**
 * The day planner.
 *
 * Answers one question: of everything competing for today, what should I
 * actually do first? Three inputs, multiplied rather than added so a zero in
 * any of them genuinely sinks the item:
 *
 *   URGENCY  how little time is left, relative to how long it takes
 *   STAKES   what it costs to do badly - for coursework this is the REAL
 *            number from Canvas group weights (share of final grade), not
 *            raw points; for an application it's the irreversibility of
 *            missing a one-shot deadline
 *   WEIGHT   what the student said matters, e.g. internships over homework
 *
 * The personalization is the point. "Internships over homework" is a real
 * choice a junior in recruiting season makes, and the planner should respect
 * it rather than quietly always ranking the pset first. What it will NOT do
 * is let a preference hide something: a 2-hour-away exam stays on top no
 * matter how the sliders are set, because that is a decision no reasonable
 * student is actually making.
 */

import type { ScoredEvent } from '../core/types';
import { hoursUntil } from '../core/datetime';
import { isAttendanceWork } from '../core/attendance';

export type PlanLane = 'coursework' | 'application' | 'event';

/** How the student weighs the three lanes against each other. 0..1 each. */
export interface PlanWeights {
  coursework: number;
  application: number;
  event: number;
}

export const BALANCED_WEIGHTS: PlanWeights = {
  coursework: 0.7,
  application: 0.6,
  event: 0.35,
};

export const PLAN_PRESETS: {
  key: string;
  label: string;
  blurb: string;
  weights: PlanWeights;
}[] = [
  {
    key: 'coursework',
    label: 'Grades first',
    blurb: 'Psets and exams outrank everything',
    // 0.3, not 0.4: with applications floored at 0.4 urgency, 0.4 let a
    // far-off internship edge out a 6%-of-grade pset due in three days.
    weights: { coursework: 0.95, application: 0.3, event: 0.25 },
  },
  {
    key: 'balanced',
    label: 'Balanced',
    blurb: 'Whatever is most urgent and highest-stakes',
    weights: BALANCED_WEIGHTS,
  },
  {
    key: 'internships',
    label: 'Internships first',
    blurb: 'Applications outrank homework',
    weights: { coursework: 0.5, application: 0.95, event: 0.35 },
  },
  {
    key: 'social',
    label: 'Get me out of my room',
    blurb: 'Events matter as much as work',
    weights: { coursework: 0.7, application: 0.6, event: 0.8 },
  },
];

export interface PlanItem {
  event: ScoredEvent;
  lane: PlanLane;
  /** 0..1 final ordering score. */
  priority: number;
  urgency: number;
  stakes: number;
  /** Human-readable explanation, shown on the row. */
  why: string[];
  /** Estimated hours of work, used for the overload check. */
  estHours: number;
  /** True when nothing can outrank this - it's imminent and unmissable. */
  pinned: boolean;
}

/** Applications are at least this urgent while open - see buildPlan. */
export const APPLICATION_URGENCY_FLOOR = 0.4;

export function laneOf(ev: ScoredEvent): PlanLane {
  if (ev.kind === 'application_deadline') return 'application';
  if (ev.lane === 'obligation') return 'coursework';
  return 'event';
}

/**
 * Rough time cost, for the "can this day actually fit" check. Canvas has no
 * effort field, so this is derived from kind and grade weight - deliberately
 * coarse, and labeled as an estimate wherever it's shown.
 */
export function estimateHours(ev: ScoredEvent): number {
  switch (ev.kind) {
    case 'exam':
      return 3;
    case 'quiz':
      return 1.5;
    case 'assignment':
    case 'project_milestone': {
      const impact = ev.gradeImpact ?? 0;
      if (impact >= 10) return 8;
      if (impact >= 5) return 5;
      if (impact >= 2) return 3;
      return 1.5;
    }
    case 'application_deadline':
      return 2;
    default: {
      const start = new Date(ev.start).getTime();
      const end = ev.end ? new Date(ev.end).getTime() : start + 3600_000;
      return Math.max(0.5, (end - start) / 3600_000);
    }
  }
}

/** 0..1, rising as the remaining time shrinks against the work required. */
function urgencyOf(ev: ScoredEvent, estHours: number, now: Date): number {
  const h = hoursUntil(ev.start, now);
  if (h < 0) return 1; // overdue
  // "Slack" is how many multiples of the work time you have left.
  const slack = h / Math.max(1, estHours);
  if (slack <= 1) return 1; // no room at all
  if (slack >= 40) return 0.05;
  return Math.min(1, 1.15 / Math.log2(slack + 1));
}

/**
 * 0..1 cost of doing this badly.
 *
 * Coursework uses the real share of the final grade when Canvas publishes
 * weights. When it doesn't, we fall back to kind rather than inventing a
 * number, and the UI says the weight is unknown.
 */
function stakesOf(ev: ScoredEvent, lane: PlanLane): { value: number; note?: string } {
  if (lane === 'coursework') {
    if (typeof ev.gradeImpact === 'number') {
      // 20% of a final grade is about as high-stakes as one item gets.
      return {
        value: Math.min(1, ev.gradeImpact / 20),
        note: `${ev.gradeImpact.toFixed(1)}% of your ${ev.course?.code ?? 'course'} grade`,
      };
    }
    const byKind: Partial<Record<string, number>> = {
      exam: 0.9,
      quiz: 0.6,
      project_milestone: 0.6,
      assignment: 0.4,
    };
    return { value: byKind[ev.kind] ?? 0.3, note: 'weight not published by the course' };
  }
  if (lane === 'application') {
    // One-shot and irreversible; missing it costs the whole opportunity.
    return { value: 0.85, note: 'one-shot deadline' };
  }
  return { value: Math.max(0.2, ev.score), note: `${Math.round(ev.score * 100)}% match` };
}

/** Imminent and unmissable - outranks any preference setting. */
function isPinned(ev: ScoredEvent, now: Date): boolean {
  const h = hoursUntil(ev.start, now);
  if (h < 0 || h > 24) return false;
  return ev.kind === 'exam' || ev.kind === 'quiz' || (ev.gradeImpact ?? 0) >= 5;
}

export function buildPlan(
  events: ScoredEvent[],
  weights: PlanWeights,
  now: Date = new Date(),
): PlanItem[] {
  const DONE = new Set(['submitted', 'graded', 'pending_review', 'excused']);
// 'missing' is deliberately NOT here: Canvas marks swept, never-submitted work
// as missing, and hiding it made overdue psets silently disappear from Due -
// the user saw 'Pset 4' with no trace of the overdue 2 and 3. Missing work is
// overdue work you can still often submit late; only GRADES treat it as a 0.
  const ROUTINE = new Set(['lecture', 'recitation', 'office_hours']);

  const items = events
    .filter((ev) => !DONE.has(ev.submission?.state ?? ''))
    .filter((ev) => !ROUTINE.has(ev.kind))
    // PE attendance points are grades, not homework - see core/attendance.
    .filter((ev) => !isAttendanceWork(ev))
    // Overdue coursework still matters - late submission is usually possible
    // and the grade hit is real. An event that already happened is just
    // noise: you cannot retroactively attend a club meeting, and one ranked
    // first in "Today" pushes actual work off the top of the screen.
    .filter((ev) => {
      const h = hoursUntil(ev.start, now);
      if (h >= 0) return true;
      return laneOf(ev) !== 'event' && h > -24 * 14;
    })
    .map((ev) => {
      const lane = laneOf(ev);
      const estHours = estimateHours(ev);
      // An open application is never "not urgent": rolling postings fill as
      // they go, so the earlier it's in, the better the odds. Without this
      // floor a posting ten days out scored 0.05 urgency and no preset could
      // lift it above coursework - "Internships first" changed nothing.
      const urgency =
        lane === 'application'
          ? Math.max(APPLICATION_URGENCY_FLOOR, urgencyOf(ev, estHours, now))
          : urgencyOf(ev, estHours, now);
      const { value: stakes, note } = stakesOf(ev, lane);
      const pinned = isPinned(ev, now);

      const why: string[] = [];
      if (note) why.push(note);
      const h = hoursUntil(ev.start, now);
      if (h < 0) why.push('overdue');
      else if (h < 48) why.push(`${Math.max(1, Math.round(h))}h left`);

      // Lane preference needs real leverage. A linear 0.35..1 multiplier
      // was too compressed to matter: "grades first" still lost a 6%-of-grade
      // pset to an application, because the application's intrinsic stakes
      // (0.85, one-shot) outweighed a 1.6x preference gap. Raising the weight
      // to a power widens the spread to ~3.7x between the extreme presets,
      // which is enough for the setting to actually express a choice without
      // letting it dominate urgency.
      const laneMultiplier = 2 * Math.pow(weights[lane], 1.5);
      const priority = pinned
        ? 1
        : Math.min(1, urgency * stakes * laneMultiplier);

      return { event: ev, lane, priority, urgency, stakes, why, estHours, pinned };
    });

  return items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (Math.abs(b.priority - a.priority) > 0.001) return b.priority - a.priority;
    return a.event.start.localeCompare(b.event.start);
  });
}

/** Items due inside the next `hours`, with a total time estimate. */
export function planWindow(
  plan: PlanItem[],
  hours: number,
  now: Date = new Date(),
): { items: PlanItem[]; estHours: number } {
  const items = plan.filter((p) => {
    const h = hoursUntil(p.event.start, now);
    return h < hours;
  });
  return {
    items,
    estHours: items.reduce((n, p) => n + p.estHours, 0),
  };
}

/**
 * Is today physically possible? Compares estimated work against the hours
 * actually left before the day's last deadline, so the warning is about
 * real time, not a vibe.
 */
export function overloadCheck(
  todayItems: PlanItem[],
  now: Date = new Date(),
): { overloaded: boolean; needHours: number; haveHours: number } {
  const needHours = todayItems.reduce((n, p) => n + p.estHours, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 0, 0);
  // Assume no work after 2am and none of the hours already gone.
  const haveHours = Math.max(0, (endOfDay.getTime() - now.getTime()) / 3600_000);
  return { overloaded: needHours > haveHours, needHours, haveHours };
}
