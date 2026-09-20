/**
 * Career postings: internships, research programs, new-grad roles.
 *
 * A separate model from UnifiedEvent on purpose. A calendar event happens at
 * a time; a posting is an open application with (maybe) a deadline, a set of
 * requirements, and two links that matter - the posting itself and where you
 * apply. Forcing one into the other loses exactly the fields students care
 * about. The bridge between the two worlds is explicit: SAVING a posting that
 * has a deadline creates a deadline event, which then flows into Due and the
 * notification plan like any other obligation.
 */

export type PostingKind = 'internship' | 'research' | 'newgrad';

export interface CareerPosting {
  /** Stable id, unique across sources. */
  id: string;
  source: 'simplify' | 'curated';
  kind: PostingKind;

  company: string;
  title: string;
  locations: string[];

  /**
   * ISO date the application closes, or null for rolling admissions. Never
   * invented: SimplifyJobs data carries no deadlines, so live internships are
   * "rolling" unless the curated entry knows better.
   */
  deadline: string | null;
  postedAt?: string;

  /**
   * What they're looking for. ONLY ever populated from the source material -
   * an LLM-invented requirements list presented as the company's own words
   * would be fabrication, which this app has already been burned by once.
   */
  requirements: string[];

  /** The posting / program page. */
  url: string;
  /** Where you actually apply, when it differs from `url`. */
  applyUrl?: string;

  /** Season/term tags ("Summer 2026") and topic tags ("machine learning"). */
  terms: string[];
  topics: string[];

  sponsorship?: string;
  degrees?: string[];
  /** Curated programs only: restricted to one school's students. */
  schoolRestriction?: string;
  /** Curated programs only, e.g. "US citizenship required". */
  citizenship?: string;
  /** When the user saved it; anchors the self-set target for rolling postings. */
  savedAt?: string;
}

/** Category → the interest fields it satisfies, for ranking. */
export const CATEGORY_TOPICS: Record<string, string[]> = {
  'AI/ML/Data': ['machine learning', 'data science', 'artificial intelligence'],
  'Data Science, AI & Machine Learning': ['machine learning', 'data science'],
  Software: ['software engineering', 'systems & networking'],
  'Software Engineering': ['software engineering'],
  Hardware: ['hardware', 'electrical engineering', 'mechanical design'],
  'Hardware Engineering': ['hardware', 'electrical engineering'],
  Product: ['product management', 'design & hci'],
  'Product Management': ['product management'],
  Quant: ['quantitative finance', 'mathematics', 'economics'],
};

/** Chips offered in the follow picker; typing anything else also works. */
export const FOLLOW_SUGGESTIONS = [
  // labs & programs
  'CSAIL',
  'Media Lab',
  'Broad Institute',
  'Lincoln Laboratory',
  'McGovern Institute',
  'MIT UROP',
  // companies
  'Anthropic',
  'Google',
  'Apple',
  'NVIDIA',
  'Jane Street',
  'SpaceX',
  'Boston Dynamics',
  'Pfizer',
  'Goldman Sachs',
];
