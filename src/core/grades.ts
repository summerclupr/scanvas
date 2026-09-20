/**
 * Grade aggregation.
 *
 * Pure functions over UnifiedEvents that carry a `submission`. The one rule
 * everything here follows: **only graded work counts.** Something you turned
 * in an hour ago and that nobody has looked at yet is not a zero, and a
 * grades screen that averages it in as one is actively harmful — it tells a
 * student they're failing a class they aren't.
 *
 * Canvas also reports a swept-up missing assignment as score 0, and that one
 * *is* a real zero. The two cases are distinguished by `state`, not by score.
 */

import type { SubmissionInfo, UnifiedEvent } from './types';

export interface GradedItem {
  id: string;
  title: string;
  courseCode: string;
  score: number;
  pointsPossible: number;
  /** 0..1 */
  fraction: number;
  gradedAt?: string;
  submittedAt?: string;
  late: boolean;
  missing: boolean;
  sourceUrl?: string;
}

export interface PendingItem {
  id: string;
  title: string;
  courseCode: string;
  submittedAt?: string;
  pointsPossible?: number;
  late: boolean;
  sourceUrl?: string;
}

export interface CourseGrades {
  courseCode: string;
  graded: GradedItem[];
  pending: PendingItem[];
  earned: number;
  possible: number;
  /** 0..1, or null when nothing is graded yet. */
  average: number | null;
  /** Count of zeros from work never turned in. */
  missingCount: number;
}

export interface GradeSummary {
  courses: CourseGrades[];
  /** Points-weighted average across every graded item, or null. */
  overall: number | null;
  totalGraded: number;
  totalPending: number;
}

/** Does this submission represent a real, final grade we can average? */
export function isGraded(sub: SubmissionInfo | undefined): boolean {
  if (!sub) return false;
  if (sub.state === 'excused') return false; // excused work is not a zero
  if (typeof sub.score !== 'number') return false;
  if (!sub.pointsPossible) return false;
  return sub.state === 'graded' || sub.state === 'missing';
}

/** Turned in, but no grade back yet. */
export function isPending(sub: SubmissionInfo | undefined): boolean {
  if (!sub) return false;
  return (
    (sub.state === 'submitted' || sub.state === 'pending_review') &&
    typeof sub.score !== 'number'
  );
}

export function summarize(events: UnifiedEvent[]): GradeSummary {
  const byCourse = new Map<string, CourseGrades>();

  const bucket = (code: string): CourseGrades => {
    let c = byCourse.get(code);
    if (!c) {
      c = {
        courseCode: code,
        graded: [],
        pending: [],
        earned: 0,
        possible: 0,
        average: null,
        missingCount: 0,
      };
      byCourse.set(code, c);
    }
    return c;
  };

  for (const ev of events) {
    const sub = ev.submission;
    if (!sub) continue;
    const code = ev.course?.code ?? 'Other';

    if (isGraded(sub)) {
      const c = bucket(code);
      const possible = sub.pointsPossible!;
      const score = sub.score!;
      c.graded.push({
        id: ev.id,
        title: ev.title,
        courseCode: code,
        score,
        pointsPossible: possible,
        fraction: possible > 0 ? score / possible : 0,
        gradedAt: sub.gradedAt,
        submittedAt: sub.submittedAt,
        late: sub.late,
        missing: sub.state === 'missing',
        sourceUrl: ev.sourceUrl,
      });
      c.earned += score;
      c.possible += possible;
      if (sub.state === 'missing') c.missingCount++;
    } else if (isPending(sub)) {
      const c = bucket(code);
      c.pending.push({
        id: ev.id,
        title: ev.title,
        courseCode: code,
        submittedAt: sub.submittedAt,
        pointsPossible: sub.pointsPossible,
        late: sub.late,
        sourceUrl: ev.sourceUrl,
      });
    }
  }

  const courses = [...byCourse.values()]
    .map((c) => ({
      ...c,
      average: c.possible > 0 ? c.earned / c.possible : null,
      // Most recently graded first; that's what you opened the tab to see.
      graded: c.graded.sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? '')),
      pending: c.pending.sort((a, b) =>
        (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''),
      ),
    }))
    .filter((c) => c.graded.length > 0 || c.pending.length > 0)
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  const earned = courses.reduce((n, c) => n + c.earned, 0);
  const possible = courses.reduce((n, c) => n + c.possible, 0);

  return {
    courses,
    overall: possible > 0 ? earned / possible : null,
    totalGraded: courses.reduce((n, c) => n + c.graded.length, 0),
    totalPending: courses.reduce((n, c) => n + c.pending.length, 0),
  };
}

/**
 * Percentage as a whole number. Deliberately NOT converted to a letter:
 * MIT cutoffs vary by class and are often curved, so inventing "B+" from a
 * raw percentage would be a confident guess about something we can't know.
 */
export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Colour band for a fraction, matching the app's tone vocabulary. */
export function toneFor(fraction: number): 'good' | 'warn' | 'danger' {
  if (fraction >= 0.85) return 'good';
  if (fraction >= 0.7) return 'warn';
  return 'danger';
}
