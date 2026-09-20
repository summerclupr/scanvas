/**
 * Ranking.
 *
 * Two lanes, scored on completely different principles:
 *
 *   OBLIGATIONS are not ranked by interest at all. Your 6.1210 midterm scores
 *   1.0 whether or not you find algorithms interesting. They're ordered by
 *   urgency, which is a function of time remaining and how heavy the thing is.
 *
 *   OPPORTUNITIES are ranked by fit: the priority weight you set in
 *   onboarding, semantic match against your fields, named people and orgs you
 *   follow, keywords, and a penalty for anything that collides with work you
 *   actually have to do.
 *
 * Every contribution is recorded as a ScoreReason so the UI can show its work.
 * A filter you can't inspect is a filter you stop trusting.
 */

import type { ScoreReason, ScoredEvent, UnifiedEvent } from '../core/types';
import { hoursUntil } from '../core/datetime';
import { priorityWeightFor, type InterestProfile } from '../core/profile';
import { seriesKey } from '../careers/professors';
import {
  bestFieldMatch,
  embeddingText,
  similarityToScore,
  type EmbeddingCache,
} from './embed';

/** Weights on the opportunity score. Sum to 1 before penalties. */
const W = {
  priority: 0.3,
  field: 0.3,
  person: 0.2,
  keyword: 0.12,
  course: 0.08,
} as const;

/** How much a collision with real work knocks an opportunity down. */
const CONFLICT_PENALTY = 0.35;
const FOOD_BONUS = 0.05;

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Substring match both ways, so "Barzilay" matches "Regina Barzilay". */
function looseIncludes(haystack: string[], needle: string): boolean {
  const n = norm(needle);
  if (n.length < 3) return false;
  return haystack.some((h) => {
    const hn = norm(h);
    return hn.includes(n) || n.includes(hn);
  });
}

// ---------------------------------------------------------------------------
// Course tracking
// ---------------------------------------------------------------------------

/**
 * Is this event's course one the student is actually taking?
 *
 * Canvas keeps you enrolled in things you're listening to, dropped, or on a
 * staff roster for, and their deadlines are not your deadlines. Untracking a
 * course has to genuinely silence its psets and exams - onboarding promises
 * exactly that, and for a while it didn't happen: `profile.courses` was only
 * read for a small opportunity-scoring bonus, so deselecting a class changed
 * nothing about the Due tab or its notifications.
 *
 * Events with no course attached are always kept, and an empty course list
 * means "not configured yet", which keeps everything rather than hiding a
 * student's entire semester.
 */
export function isTrackedCourse(
  ev: Pick<UnifiedEvent, 'course'>,
  profile: InterestProfile,
): boolean {
  if (!ev.course) return true;
  if (profile.courses.length === 0) return true;
  return profile.courses.includes(ev.course.code);
}

/** Split events into what the student tracks and what they've silenced. */
export function partitionByCourse<T extends Pick<UnifiedEvent, 'course'>>(
  events: T[],
  profile: InterestProfile,
): { tracked: T[]; untracked: T[] } {
  const tracked: T[] = [];
  const untracked: T[] = [];
  for (const ev of events) {
    (isTrackedCourse(ev, profile) ? tracked : untracked).push(ev);
  }
  return { tracked, untracked };
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

/** Rough weight of the thing, used to start warning earlier for big items. */
function obligationWeight(ev: UnifiedEvent): number {
  switch (ev.kind) {
    case 'exam':
      return 1;
    case 'quiz':
    case 'project_milestone':
      return 0.8;
    case 'assignment':
      return 0.6;
    default:
      return 0.3;
  }
}

/**
 * Urgency 0..1. Rises as the deadline approaches, and rises faster for heavier
 * work, so a final a week out outranks a pset due in three days.
 */
export function urgencyOf(ev: UnifiedEvent, now: Date = new Date()): number {
  const h = hoursUntil(ev.start, now);
  const weight = obligationWeight(ev);
  if (h < 0) return 1; // overdue pins to the top
  // Horizon scales with weight: 14 days for an exam, ~4 for a small assignment.
  const horizonH = 72 + weight * 264;
  const closeness = Math.max(0, 1 - h / horizonH);
  return Math.min(1, 0.35 * weight + 0.65 * closeness);
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export interface ScoringContext {
  profile: InterestProfile;
  cache: EmbeddingCache;
  /** Obligations used for conflict detection. */
  obligations: UnifiedEvent[];
  now?: Date;
}

const GRAD_ONLY_RE = /\b(?:for|to|open to|welcome(?:s)?)\s+(?:all\s+)?(?:graduate|grad|phd|doctoral|postdoc\w*)\s+(?:students?|researchers?|fellows?)\b|\bgraduate students only\b|\bgrad students only\b/i;
const UNDERGRAD_RE = /\bundergrad/i;

/**
 * Why an event is aimed at someone other than this user, or null.
 *
 * Audience tags come in as `audience:<name>` topics from the MIT calendar.
 * An event tagged for Students (or the MIT community, or the public) is
 * fine; one tagged ONLY for faculty, staff or alumni is not. Grad-only is
 * read from the text, conservatively: it must say so, and not also say
 * undergraduates are welcome.
 */
export function audienceMismatch(ev: UnifiedEvent, profile: InterestProfile): string | null {
  const audience = ev.topics.filter((t) => t.startsWith('audience:')).map((t) => t.slice(9));
  if (audience.length) {
    const forStudents = audience.some((a) => /students|community|public/.test(a));
    if (!forStudents) return `Aimed at ${audience.join(', ')}`;
  }
  const undergrad = profile.degreeLevel === "Bachelor's" || profile.degreeLevel === "Associate's";
  if (undergrad) {
    const text = `${ev.title} ${ev.description ?? ''}`;
    if (GRAD_ONLY_RE.test(text) && !UNDERGRAD_RE.test(text)) return 'Aimed at graduate students';
  }
  return null;
}

/** Does this opportunity overlap an exam, or sit right before a deadline? */
function findConflicts(ev: UnifiedEvent, obligations: UnifiedEvent[]): string[] {
  const start = new Date(ev.start).getTime();
  const end = ev.end ? new Date(ev.end).getTime() : start + 3600_000;
  const hits: string[] = [];

  for (const ob of obligations) {
    const oStart = new Date(ob.start).getTime();
    if (ob.kind === 'exam' || ob.kind === 'quiz') {
      // Overlapping an exam, or the three hours before it, is disqualifying.
      const oEnd = ob.end ? new Date(ob.end).getTime() : oStart + 2 * 3600_000;
      if (start < oEnd && end > oStart - 3 * 3600_000) hits.push(ob.title);
    } else if (ob.kind === 'assignment' || ob.kind === 'project_milestone') {
      // A three-hour event ending an hour before a pset is due is a bad idea.
      if (oStart > start && oStart - end < 4 * 3600_000) hits.push(ob.title);
    }
  }
  return hits;
}

export function scoreOpportunity(ev: UnifiedEvent, ctx: ScoringContext): ScoredEvent {
  const { profile, cache, obligations } = ctx;
  const now = ctx.now ?? new Date();
  const reasons: ScoreReason[] = [];
  let score = 0;

  // 1. Priority bucket from onboarding.
  const pw = priorityWeightFor(profile, ev.kind);
  const pDelta = pw * W.priority;
  score += pDelta;
  reasons.push({
    code: 'priority',
    delta: pDelta,
    label: `You ranked this category ${Math.round(pw * 100)}%`,
  });

  // 2. Semantic field match.
  const fieldVecs = profile.fields
    .map((f) => ({ field: f, vec: cache.get(f, 'query')! }))
    .filter((f) => f.vec);
  const match = bestFieldMatch(cache.get(embeddingText(ev), 'document'), fieldVecs);
  if (match) {
    const fDelta = similarityToScore(match.similarity) * W.field;
    if (fDelta > 0.01) {
      score += fDelta;
      reasons.push({
        code: 'field_match',
        delta: fDelta,
        label: `Matches your interest in ${match.field}`,
      });
    }
  }

  // 3. A professor or org you explicitly follow.
  const haystack = [...ev.people, ev.organizer ?? '', ev.title, ev.description ?? ''];
  const person = profile.people.find((p) => looseIncludes(haystack, p));
  const org = profile.orgs.find((o) => looseIncludes(haystack, o));
  if (person || org) {
    score += W.person;
    reasons.push({
      code: 'person_match',
      delta: W.person,
      label: person ? `${person} is involved` : `Hosted by ${org}`,
    });
  }

  // 4. Explicit keywords.
  const text = norm(`${ev.title} ${ev.description ?? ''} ${ev.topics.join(' ')}`);
  const hit = profile.keywords.include.find((k) => k.length > 2 && text.includes(norm(k)));
  if (hit) {
    score += W.keyword;
    reasons.push({ code: 'keyword', delta: W.keyword, label: `Mentions "${hit}"` });
  }

  // 5. Relevant to a class you're actually taking.
  const course = profile.courses.find(
    (c) => ev.course?.code === c || text.includes(norm(c)),
  );
  if (course) {
    score += W.course;
    reasons.push({ code: 'course_match', delta: W.course, label: `Related to ${course}` });
  }

  // 6. Free food, if they admitted it matters.
  if (profile.freeFood && ev.tags.includes('free food')) {
    score += FOOD_BONUS;
    reasons.push({ code: 'free_food', delta: FOOD_BONUS, label: 'Free food' });
  }

  // 7. Aimed at someone else. The MIT calendar tags an audience; an event
  //    marked only for faculty, staff or alumni - or one whose text says it
  //    is for graduate students when the user is an undergraduate - is not a
  //    recommendation, whatever the topic match.
  const mismatch = audienceMismatch(ev, profile);
  if (mismatch && score > 0) {
    const penalty = Math.min(score, 0.3);
    score -= penalty;
    reasons.push({ code: 'audience', delta: -penalty, label: mismatch });
  }

  // 8. Hard exclusions zero the thing out entirely.
  const banned = profile.keywords.exclude.find((k) => k.length > 2 && text.includes(norm(k)));
  if (banned) {
    reasons.push({ code: 'excluded_keyword', delta: -score, label: `You muted "${banned}"` });
    score = 0;
  }

  // 9. Hosts and recurring series you said were not for you.
  const hostGone = ev.organizer && (profile.feedback.dismissedHosts ?? []).includes(ev.organizer);
  const seriesGone = (profile.feedback.dismissedSeries ?? []).includes(seriesKey(ev.title));
  if ((hostGone || seriesGone) && score > 0) {
    reasons.push({
      code: 'dismissed_host',
      delta: -score,
      label: hostGone ? `You hid ${ev.organizer}` : 'You hid this series',
    });
    score = 0;
  }

  // 10. Collisions with work you actually have to do.
  const conflictsWith = findConflicts(ev, obligations);
  if (conflictsWith.length > 0 && score > 0) {
    const penalty = Math.min(score, CONFLICT_PENALTY);
    score -= penalty;
    reasons.push({
      code: 'conflict',
      delta: -penalty,
      label: `Clashes with ${conflictsWith[0]}`,
    });
  }

  return {
    ...ev,
    score: Math.max(0, Math.min(1, score)),
    urgency: 0,
    reasons: reasons.filter((r) => Math.abs(r.delta) > 0.001),
    conflictsWith: conflictsWith.length ? conflictsWith : undefined,
  };
}

/**
 * Score everything. Obligations bypass interest filtering entirely - that's
 * the point of the two-lane split.
 */
export function scoreAll(events: UnifiedEvent[], ctx: ScoringContext): ScoredEvent[] {
  const now = ctx.now ?? new Date();
  const obligations = events.filter((e) => e.lane === 'obligation');

  return events.map((ev) => {
    if (ev.lane === 'obligation') {
      return {
        ...ev,
        score: 1,
        urgency: urgencyOf(ev, now),
        reasons: [
          {
            code: 'priority' as const,
            delta: 1,
            label: 'Required coursework, never filtered',
          },
        ],
      };
    }
    return scoreOpportunity(ev, { ...ctx, obligations, now });
  });
}

/**
 * Chronological ordering for the Due tab.
 *
 * Due answers "what do I owe and when", so it sorts by the clock, full stop.
 * It used to sort by `urgency`, which gives exams a weight-based head start -
 * and that head start could beat real proximity, putting a midterm five days
 * out ABOVE a pset due in two. Correct for a priority list, wrong for a
 * deadline list. Priority ordering lives on the Plan tab, where it belongs.
 */
export function sortChronological(events: ScoredEvent[]): ScoredEvent[] {
  return [...events].sort((a, b) => a.start.localeCompare(b.start));
}

/** Ordering for the "what's next" list: obligations by urgency, then fit. */
export function sortForAgenda(events: ScoredEvent[]): ScoredEvent[] {
  return [...events].sort((a, b) => {
    if (a.lane !== b.lane) return a.lane === 'obligation' ? -1 : 1;
    if (a.lane === 'obligation') {
      if (Math.abs(b.urgency - a.urgency) > 0.01) return b.urgency - a.urgency;
      return a.start.localeCompare(b.start);
    }
    if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
    return a.start.localeCompare(b.start);
  });
}

/**
 * Did anything the user actually said match - a field, a person or club they
 * follow, a keyword, a class - as opposed to the category weight alone?
 * The feed uses this to separate "for you" from "in case you're curious".
 */
export function hasInterestSignal(ev: ScoredEvent): boolean {
  return ev.reasons.some(
    (r) => r.delta > 0 && ['field_match', 'person_match', 'keyword', 'course_match'].includes(r.code),
  );
}

/** The discover feed: opportunities only, best fit first, above a floor. */
export function feedFor(events: ScoredEvent[], floor = 0.25): ScoredEvent[] {
  return events
    .filter((e) => e.lane === 'opportunity' && e.score >= floor)
    .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
}
