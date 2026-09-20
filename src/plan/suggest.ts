/**
 * What the plan presets actually add to a day.
 *
 * The presets used to reorder the same coursework and change nothing else,
 * which made "Get me out of my room" a label. Now each preset decides what
 * gets SUGGESTED onto a day card beside the work you owe:
 *
 *   social ("Get me out of my room")   up to three well-matched events that
 *                                      day - club, social, talks - that you
 *                                      haven't saved or hidden
 *   internships ("Internships first")  application prompts: eligible postings
 *                                      you follow or that match, spread over
 *                                      the coming week, plus one event a day
 *                                      if it's a strong match
 *   balanced                           one event a day when the match is
 *                                      strong; an application prompt on a
 *                                      couple of days if a followed company
 *                                      has something open
 *   coursework ("Grades first")        nothing - the plan is your work
 *
 * Saving a suggested event makes it a commitment; saving a posting turns it
 * into planned application work with a target date. Suggestions are never
 * counted against the day's hour budget: they're offers, not obligations.
 */

import type { ScoredEvent } from '../core/types';
import type { RankedPosting } from '../careers/rank';
import { dayKey } from './calendar';
import type { DayPlan } from './schedule';
import { hasInterestSignal } from '../ranking/score';

export type Suggestion =
  | { kind: 'event'; event: ScoredEvent; why: string }
  | { kind: 'apply'; posting: RankedPosting; why: string };

export interface SuggestionRules {
  eventsPerDay: number;
  /** Minimum score for an event to be offered. */
  eventFloor: number;
  /** Require a field/person/keyword/class match, not just the category weight. */
  eventNeedsSignal: boolean;
  applicationsPerDay: number;
  /** How many of the next days get application prompts. */
  applicationDays: number;
  /** Only postings you follow, or any eligible match? */
  applicationsFollowedOnly: boolean;
}

export const RULES_BY_PRESET: Record<string, SuggestionRules> = {
  social: {
    eventsPerDay: 3,
    eventFloor: 0.3,
    eventNeedsSignal: false,
    applicationsPerDay: 0,
    applicationDays: 0,
    applicationsFollowedOnly: true,
  },
  internships: {
    eventsPerDay: 1,
    eventFloor: 0.5,
    eventNeedsSignal: true,
    applicationsPerDay: 2,
    applicationDays: 7,
    applicationsFollowedOnly: false,
  },
  balanced: {
    eventsPerDay: 1,
    eventFloor: 0.45,
    eventNeedsSignal: true,
    applicationsPerDay: 1,
    applicationDays: 2,
    applicationsFollowedOnly: true,
  },
  coursework: {
    eventsPerDay: 0,
    eventFloor: 1,
    eventNeedsSignal: true,
    applicationsPerDay: 0,
    applicationDays: 0,
    applicationsFollowedOnly: true,
  },
};

export function rulesFor(preset: string): SuggestionRules {
  return RULES_BY_PRESET[preset] ?? RULES_BY_PRESET.balanced;
}

/**
 * Suggestions per day key. `events` are scored opportunities (saved, hidden
 * and dismissed already excluded by the caller), `postings` the ranked
 * career list (saved ones excluded by the caller).
 */
export function suggestFor(
  days: DayPlan[],
  preset: string,
  events: ScoredEvent[],
  postings: RankedPosting[],
): Map<string, Suggestion[]> {
  const rules = rulesFor(preset);
  const out = new Map<string, Suggestion[]>();
  for (const d of days) out.set(d.day, []);

  // --- events: the best on each day ---------------------------------------
  if (rules.eventsPerDay > 0) {
    const byDay = new Map<string, ScoredEvent[]>();
    for (const e of events) {
      if (e.lane !== 'opportunity') continue;
      if (e.score < rules.eventFloor) continue;
      if (rules.eventNeedsSignal && !hasInterestSignal(e)) continue;
      const key = dayKey(new Date(e.start));
      if (!out.has(key)) continue;
      byDay.set(key, [...(byDay.get(key) ?? []), e]);
    }
    for (const [key, list] of byDay) {
      const picks = list
        .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))
        .slice(0, rules.eventsPerDay);
      out.get(key)!.push(
        ...picks.map((event) => ({
          kind: 'event' as const,
          event,
          why: hasInterestSignal(event)
            ? `${Math.round(event.score * 100)}% match`
            : `${Math.round(event.score * 100)}% · a category you rank`,
        })),
      );
    }
  }

  // --- applications: spread the best postings over the coming days --------
  if (rules.applicationsPerDay > 0 && rules.applicationDays > 0) {
    const pool = postings
      .filter((p) => p.eligible)
      .filter((p) => (rules.applicationsFollowedOnly ? p.followed : p.followed || p.score >= 0.3))
      .sort((a, b) => Number(b.followed) - Number(a.followed) || b.score - a.score);
    let i = 0;
    for (const d of days.slice(0, rules.applicationDays)) {
      const slot = out.get(d.day)!;
      for (let n = 0; n < rules.applicationsPerDay && i < pool.length; n++, i++) {
        const posting = pool[i];
        slot.push({
          kind: 'apply',
          posting,
          why: posting.followed
            ? `You follow ${posting.company}`
            : posting.reasons[0] ?? `${Math.round(posting.score * 100)}% match`,
        });
      }
    }
  }

  return out;
}
