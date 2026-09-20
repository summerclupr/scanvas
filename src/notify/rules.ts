/**
 * Notification planning - pure functions, no Expo imports.
 *
 * Given scored events and the user's preferences, produce the exact list of
 * notifications that should be scheduled. Keeping this free of side effects
 * means the interesting behavior (quiet hours, dedup, the score floor) is
 * directly testable, and the Expo layer becomes a dumb executor.
 *
 * The governing rule: obligations always notify, opportunities almost never
 * do. An app that pings you about a dance class you ranked 20% is an app you
 * mute, and then you miss the pset reminder too.
 */

import type { ScoredEvent } from '../core/types';
import type { NotificationPrefs } from '../core/profile';
import { contentHash } from '../core/datetime';
import { isAttendanceWork } from '../core/attendance';

/** Submission states that mean the work is handed in - stop reminding. */
const DONE_STATES = new Set([
  'submitted',
  'graded',
  'pending_review',
  'excused',
  'missing',
]);

export interface PlannedNotification {
  /** Stable id so re-planning updates in place instead of duplicating. */
  id: string;
  eventId: string;
  fireAt: Date;
  title: string;
  body: string;
  /** Hours before the event this was meant to fire, for display/debugging. */
  leadHours: number;
  category: 'exam' | 'assignment' | 'opportunity' | 'digest';
}

/**
 * Is this instant inside quiet hours? Handles the normal overnight case where
 * the window wraps past midnight (e.g. 1am-8am).
 */
export function inQuietHours(d: Date, [startH, endH]: [number, number]): boolean {
  const h = d.getHours() + d.getMinutes() / 60;
  if (startH === endH) return false;
  return startH < endH ? h >= startH && h < endH : h >= startH || h < endH;
}

/**
 * Move a fire time out of quiet hours by pushing it to the moment they end.
 *
 * Pushing forward rather than back is deliberate: a 3am reminder for a 9am
 * deadline should become 8am, not 11pm the night before, when you're asleep
 * either way but 8am is actionable.
 */
export function shiftOutOfQuietHours(d: Date, quiet: [number, number]): Date {
  if (!inQuietHours(d, quiet)) return d;
  const out = new Date(d);
  const [, endH] = quiet;
  out.setHours(endH, 0, 0, 0);
  if (out.getTime() < d.getTime()) out.setDate(out.getDate() + 1);
  return out;
}

/**
 * Scale the reminder ladder by what the work is actually worth.
 *
 * Against a real Canvas account this is the difference between a usable app
 * and an unusable one: a full ladder on every item produced 207 pending
 * notifications, mostly for one-point online sequences and attendance
 * check-ins. iOS only holds 60, so the genuinely important reminders were
 * being crowded out by busywork.
 *
 * Points are the best available proxy for stakes. Anything ungraded or
 * unknown keeps the full ladder rather than being quietly suppressed.
 */
const TRIVIAL_POINTS = 2;
const MINOR_POINTS = 20;

function leadHoursFor(ev: ScoredEvent, prefs: NotificationPrefs): number[] {
  switch (ev.kind) {
    case 'exam':
    case 'quiz':
      // Exams get the full ladder regardless of how Canvas weights them.
      return prefs.examLeadHours;

    case 'assignment':
    case 'project_milestone': {
      const points = ev.submission?.pointsPossible;
      const ladder = prefs.assignmentLeadHours;
      if (typeof points !== 'number') return ladder;

      // A 1-point completion check does not deserve four pushes. It still
      // appears on the Due tab and in the morning digest.
      if (points <= TRIVIAL_POINTS) return [];
      // Small graded work gets one nudge, at the shortest lead set.
      if (points < MINOR_POINTS) {
        return ladder.length ? [Math.min(...ladder)] : [];
      }
      return ladder;
    }

    default:
      return prefs.opportunityLeadHours;
  }
}

function copyFor(
  ev: ScoredEvent,
  leadHours: number,
): { title: string; body: string } {
  const when =
    leadHours >= 24
      ? `in ${Math.round(leadHours / 24)} day${leadHours >= 48 ? 's' : ''}`
      : `in ${leadHours} hour${leadHours === 1 ? '' : 's'}`;

  switch (ev.kind) {
    case 'exam':
    case 'quiz': {
      const where = ev.location ? ` - ${ev.location}` : '';
      return {
        title: `${ev.course?.code ?? ''} ${ev.kind === 'exam' ? 'exam' : 'quiz'} ${when}`.trim(),
        body: `${ev.title}${where}`,
      };
    }
    case 'assignment':
    case 'project_milestone':
      return {
        title: `Due ${when}: ${ev.course?.code ?? ev.title}`,
        body: ev.course?.code ? ev.title : 'Assignment deadline',
      };
    default: {
      const where = ev.location ? ` at ${ev.location}` : '';
      return {
        title: `${ev.title} ${when}`,
        body: ev.rationale ?? `${ev.organizer ?? 'Event'}${where}`,
      };
    }
  }
}

/**
 * Plan every notification for a set of scored events.
 *
 * Opportunities must clear `opportunityScoreFloor` to generate anything at
 * all, and anything scheduled to fire in the past is dropped rather than
 * fired immediately.
 */
export function planNotifications(
  events: ScoredEvent[],
  prefs: NotificationPrefs,
  now: Date = new Date(),
): PlannedNotification[] {
  if (!prefs.enabled) return [];

  const planned: PlannedNotification[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    const isObligation = ev.lane === 'obligation';

    // Lectures, recitations and office hours are obligations for scheduling
    // purposes but nobody wants a push for every single one.
    if (isObligation && ['lecture', 'recitation', 'office_hours'].includes(ev.kind)) {
      continue;
    }
    // Nothing is more annoying than "due in 2 hours" for a pset you submitted
    // yesterday.
    if (DONE_STATES.has(ev.submission?.state ?? '')) continue;
    // PE attendance check-ins are graded by showing up; nothing to remind about.
    if (isAttendanceWork(ev)) continue;
    if (!isObligation && ev.score < prefs.opportunityScoreFloor) continue;

    const eventStart = new Date(ev.start);
    if (eventStart.getTime() <= now.getTime()) continue;

    for (const lead of leadHoursFor(ev, prefs)) {
      const raw = new Date(eventStart.getTime() - lead * 3600_000);
      if (raw.getTime() <= now.getTime()) continue;

      const fireAt = shiftOutOfQuietHours(raw, prefs.quietHours);
      // Shifting can push a reminder past the event itself.
      if (fireAt.getTime() >= eventStart.getTime()) continue;

      // Two leads can collapse onto the same minute after shifting.
      const slot = `${ev.id}:${Math.floor(fireAt.getTime() / 60_000)}`;
      if (seen.has(slot)) continue;
      seen.add(slot);

      const { title, body } = copyFor(ev, lead);
      planned.push({
        id: contentHash(ev.id, String(lead), String(fireAt.getTime())),
        eventId: ev.id,
        fireAt,
        title,
        body,
        leadHours: lead,
        category:
          ev.kind === 'exam' || ev.kind === 'quiz'
            ? 'exam'
            : isObligation
              ? 'assignment'
              : 'opportunity',
      });
    }
  }

  return planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/**
 * The morning digest: one notification summarizing today instead of a dozen.
 * Returns null when there's nothing worth waking up for.
 */
export function planDigest(
  events: ScoredEvent[],
  prefs: NotificationPrefs,
  now: Date = new Date(),
): PlannedNotification | null {
  if (!prefs.enabled || prefs.dailyDigestHour === null) return null;

  const fireAt = new Date(now);
  fireAt.setHours(prefs.dailyDigestHour, 0, 0, 0);
  if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 1);

  const dayEnd = new Date(fireAt);
  dayEnd.setHours(23, 59, 59, 999);

  const today = events.filter((e) => {
    const t = new Date(e.start).getTime();
    return t >= fireAt.getTime() && t <= dayEnd.getTime();
  });

  const due = today.filter(
    (e) =>
      e.lane === 'obligation' &&
      !DONE_STATES.has(e.submission?.state ?? '') &&
      !isAttendanceWork(e) &&
      !['lecture', 'recitation', 'office_hours'].includes(e.kind),
  );
  const picks = today.filter(
    (e) => e.lane === 'opportunity' && e.score >= prefs.opportunityScoreFloor,
  );
  if (due.length === 0 && picks.length === 0) return null;

  const parts: string[] = [];
  if (due.length) {
    // Two psets for the same class read as "6.1010, 6.1010" if you just map
    // the course code, so fall back to titles once a code repeats.
    const codes = due.map((d) => d.course?.code ?? d.title);
    const labels = new Set(codes).size === codes.length ? codes : due.map((d) => d.title);
    parts.push(`${due.length} due: ${labels.join(', ')}`);
  }
  if (picks.length) parts.push(`${picks.length} worth going to`);

  return {
    id: contentHash('digest', String(fireAt.getTime())),
    eventId: 'digest',
    fireAt,
    title: 'Today',
    body: parts.join(' - '),
    leadHours: 0,
    category: 'digest',
  };
}
