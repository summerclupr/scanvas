/**
 * Ranking and filtering for career postings.
 *
 * Deliberately deterministic - no LLM, no embeddings. With 4,000+ live
 * postings, per-item inference would make the tab minutes-slow, and unlike
 * campus events the metadata here is already structured (category, company,
 * terms). Keyword overlap plus explicit follows covers it.
 */

import type { InterestProfile } from '../core/profile';
import type { CareerPosting } from './types';
import {
  checkSchool,
  checkYear,
  expandSkills,
  isNearCampus,
  subjectsFromCourses,
} from './eligibility';

export interface RankedPosting extends CareerPosting {
  score: number;
  /** Why it ranked - same show-your-work contract as the events feed. */
  reasons: string[];
  followed: boolean;
  /**
   * False when year or school rules it out. Ineligible postings are marked
   * and pushed down, NOT deleted - the eligibility data is imperfect and
   * silently hiding a job someone could have gotten is the worse error.
   */
  eligible: boolean;
  ineligibleReason?: string;
  nearCampus: boolean;
}

const norm = (s: string) => s.toLowerCase().trim();

function followMatch(posting: CareerPosting, follows: string[]): string | null {
  const company = norm(posting.company);
  const title = norm(posting.title);
  for (const f of follows) {
    const n = norm(f);
    if (n.length < 2) continue;
    if (company.includes(n) || n.includes(company) || title.includes(n)) return f;
  }
  return null;
}

export function rankPostings(
  postings: CareerPosting[],
  profile: InterestProfile,
  now = new Date(),
): RankedPosting[] {
  const follows = profile.careerFollows ?? [];
  const fields = profile.fields.map(norm);
  const courseSubjects = subjectsFromCourses(profile.courses ?? []);
  const resumeSkills = expandSkills(profile.resumeSkills ?? []);
  const year = { gradYear: profile.gradYear, level: profile.degreeLevel };

  const ranked = postings.map((p) => {
    const reasons: string[] = [];
    let score = 0;

    const follow = followMatch(p, follows);
    if (follow) {
      score += 0.5;
      reasons.push(`You follow ${follow}`);
    }

    // Interest fields vs the posting's topics/title.
    const hay = norm(`${p.title} ${p.topics.join(' ')}`);
    const hits = fields.filter(
      (f) => f.length > 2 && (hay.includes(f) || p.topics.some((t) => norm(t) === f)),
    );
    if (hits.length) {
      score += Math.min(0.3, hits.length * 0.15);
      reasons.push(`Matches ${hits.slice(0, 2).join(', ')}`);
    }

    // Coursework you've actually taken.
    const courseHits = courseSubjects.filter(
      (subj) => hay.includes(norm(subj)) || p.topics.some((t) => norm(t) === norm(subj)),
    );
    if (courseHits.length) {
      score += Math.min(0.2, courseHits.length * 0.1);
      reasons.push(`Your coursework (${courseHits.slice(0, 2).join(', ')})`);
    }

    // Skills the local model pulled out of your resume.
    const skillHits = resumeSkills.filter(
      (sk) => sk.length > 2 && (hay.includes(sk) || p.topics.some((t) => norm(t) === sk)),
    );
    if (skillHits.length) {
      score += Math.min(0.25, skillHits.length * 0.12);
      reasons.push(`Resume: ${skillHits.slice(0, 3).join(', ')}`);
    }

    // Research weight comes from the UROP priority, internships from career.
    const pw =
      p.kind === 'research' ? profile.priorities.urop : profile.priorities.career;
    score += pw * 0.2;

    // Near your campus - a nudge, never a filter.
    const nearCampus = isNearCampus(p, profile.school ?? '');
    if (nearCampus) {
      score += 0.08;
      reasons.push('Near your campus');
    }

    // Eligibility last, so the reasons above still explain the ranking.
    const yearVerdict = checkYear(p, year);
    const schoolVerdict = checkSchool(p, profile.school ?? '');
    const eligible = yearVerdict.eligible && schoolVerdict.eligible;
    const ineligibleReason = yearVerdict.reason ?? schoolVerdict.reason;
    if (!eligible) score = Math.min(score, 0.05);

    // A real deadline coming up beats "rolling" at equal interest.
    if (p.deadline) {
      const days = (new Date(p.deadline).getTime() - now.getTime()) / 86400_000;
      if (days >= 0 && days < 45) {
        score += 0.1;
        reasons.push(`Deadline in ${Math.max(1, Math.round(days))}d`);
      }
    }

    return {
      ...p,
      score,
      reasons,
      followed: Boolean(follow),
      eligible,
      ineligibleReason,
      nearCampus,
    };
  });

  return ranked.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.followed !== b.followed) return a.followed ? -1 : 1;
    if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
    // Same score: sooner deadline first, then most recently posted.
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline !== b.deadline) return a.deadline ? -1 : 1;
    return (b.postedAt ?? '').localeCompare(a.postedAt ?? '');
  });
}
