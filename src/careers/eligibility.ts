/**
 * Eligibility and fit: year, school, coursework, resume skills.
 *
 * What each signal is actually worth, stated plainly because the four are
 * very different in quality:
 *
 *   YEAR      Strong. The feed carries a real `degrees` array on ~88% of
 *             postings, so "PhD only" and "MBA only" can be filtered out
 *             for an undergrad with confidence. Term vs graduation year
 *             catches the other common mismatch (a 2029 grad being shown
 *             New Grad 2026 roles).
 *
 *   CLASSES   Decent. MIT course numbers are systematic (6.x = EECS,
 *             18.x = math), so enrolled courses map deterministically to
 *             subjects, which match posting categories and titles.
 *
 *   RESUME    Decent, but only after expansion. Raw skills match almost
 *             nothing - "pytorch" appears in 0 of 4,394 live titles - so
 *             skills are widened into the domains that do appear. See
 *             SKILL_DOMAINS below.
 *
 *   SCHOOL    Weak, and the UI says so. The live feed has NO per-school
 *             eligibility field - the overwhelming majority of internships
 *             accept any school, so there is nothing real to filter on.
 *             It is used only where it genuinely applies: curated programs
 *             that ARE school-restricted (MIT UROP), and a proximity boost
 *             for postings near your campus.
 */

import type { CareerPosting } from './types';

// ---------------------------------------------------------------------------
// Year
// ---------------------------------------------------------------------------

export type DegreeLevel = "Associate's" | "Bachelor's" | "Master's" | 'PhD' | 'MBA';

export interface YearProfile {
  /** Expected graduation year, e.g. 2029. */
  gradYear: number | null;
  /** What you're enrolled in now. */
  level: DegreeLevel;
}

/** Undergrad standing from graduation year, for display. */
export function standing(gradYear: number | null, now = new Date()): string | null {
  if (!gradYear) return null;
  // Academic year rolls in August.
  const acadYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  const yearsLeft = gradYear - acadYear;
  switch (yearsLeft) {
    case 0:
      return 'Senior';
    case 1:
      return 'Junior';
    case 2:
      return 'Sophomore';
    case 3:
      return 'First-year';
    default:
      return yearsLeft < 0 ? 'Graduated' : `${yearsLeft} years out`;
  }
}

const GRAD_ONLY = /\b(phd|doctoral|postdoc)\b/i;
const MBA_ONLY = /\bmba\b/i;

export interface EligibilityVerdict {
  eligible: boolean;
  /** Why not, when it isn't. Shown on the card rather than hidden. */
  reason?: string;
}

/**
 * Can someone at this level apply? Conservative in the right direction:
 * only excludes when the source is explicit, never on a guess.
 */
export function checkYear(
  posting: CareerPosting,
  year: YearProfile,
): EligibilityVerdict {
  const degrees = posting.degrees ?? [];
  const title = posting.title;

  if (degrees.length > 0 && !degrees.includes(year.level)) {
    // Bachelor's students are commonly welcome at Master's-tagged postings,
    // but PhD/MBA-only is a genuine wall.
    const gradOnly = degrees.every((d) => d === 'PhD' || d === 'MBA');
    if (gradOnly) {
      return { eligible: false, reason: `${degrees.join('/')} only` };
    }
  }
  if (year.level === "Bachelor's" && GRAD_ONLY.test(title)) {
    return { eligible: false, reason: 'PhD role' };
  }
  if (year.level !== 'MBA' && MBA_ONLY.test(title)) {
    return { eligible: false, reason: 'MBA role' };
  }

  // Term vs graduation: a Summer 2027 internship needs you still enrolled.
  if (year.gradYear) {
    const termYears = posting.terms
      .map((t) => Number(/\b(20\d{2})\b/.exec(t)?.[1]))
      .filter((n) => Number.isFinite(n));
    if (termYears.length > 0 && Math.min(...termYears) > year.gradYear) {
      return {
        eligible: false,
        reason: `starts after you graduate (${year.gradYear})`,
      };
    }
  }
  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Coursework
// ---------------------------------------------------------------------------

/** MIT's course numbers are systematic, so the prefix is the subject. */
const MIT_COURSE_SUBJECTS: Record<string, string[]> = {
  '1': ['civil engineering', 'environmental engineering'],
  '2': ['mechanical design', 'robotics', 'controls'],
  '3': ['materials science'],
  '4': ['architecture', 'design & hci'],
  '5': ['chemistry'],
  '6': ['software engineering', 'machine learning', 'systems & networking', 'hardware'],
  '7': ['biology', 'computational biology'],
  '8': ['physics'],
  '9': ['neuroscience'],
  '10': ['chemical engineering'],
  '11': ['urban studies', 'policy & governance'],
  '12': ['earth science', 'climate'],
  '14': ['economics', 'quantitative finance'],
  '15': ['management', 'quantitative finance', 'product management'],
  '16': ['aero/astro'],
  '17': ['policy & governance'],
  '18': ['mathematics', 'quantitative finance', 'machine learning'],
  '20': ['synthetic biology', 'medical devices'],
  '21': ['humanities'],
  '22': ['nuclear engineering'],
  '24': ['linguistics', 'philosophy'],
};

/** Non-MIT schools use letter prefixes; cover the common ones. */
const ALPHA_COURSE_SUBJECTS: Record<string, string[]> = {
  CS: ['software engineering', 'machine learning'],
  EE: ['hardware', 'electrical engineering'],
  ECE: ['hardware', 'electrical engineering'],
  MATH: ['mathematics'],
  STAT: ['data science', 'mathematics'],
  PHYS: ['physics'],
  CHEM: ['chemistry'],
  BIO: ['biology'],
  BIOL: ['biology'],
  ME: ['mechanical design'],
  AE: ['aero/astro'],
  ECON: ['economics'],
  FIN: ['quantitative finance'],
  HST: ['medical devices', 'biology'],
};

/** Subjects implied by a set of course codes. */
export function subjectsFromCourses(courses: string[]): string[] {
  const out = new Set<string>();
  for (const code of courses) {
    const trimmed = code.trim().toUpperCase();
    const numeric = /^(\d{1,2})[A-Z]?\./.exec(trimmed);
    if (numeric) {
      for (const s of MIT_COURSE_SUBJECTS[numeric[1]] ?? []) out.add(s);
      continue;
    }
    const alpha = /^([A-Z]+)/.exec(trimmed);
    if (alpha) for (const s of ALPHA_COURSE_SUBJECTS[alpha[1]] ?? []) out.add(s);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Resume skills -> domains
// ---------------------------------------------------------------------------

/**
 * Concrete skills essentially never appear in posting titles - measured
 * against the live feed, "pytorch" and "verilog" appear in ZERO of 4,394
 * titles, because the feed carries titles and categories and nothing else.
 * Matching raw skills against them finds nothing.
 *
 * So skills are expanded into the domains that DO appear ("pytorch" ->
 * "machine learning", which matches the AI/ML/Data category and titles like
 * "AI Engineer Intern"). Unmapped skills still match literally, for the
 * handful of titles that do name a technology.
 */
const SKILL_DOMAINS: Record<string, string[]> = {
  pytorch: ['machine learning'],
  tensorflow: ['machine learning'],
  keras: ['machine learning'],
  'scikit-learn': ['machine learning', 'data science'],
  sklearn: ['machine learning', 'data science'],
  huggingface: ['machine learning'],
  transformers: ['machine learning'],
  nlp: ['machine learning'],
  'computer vision': ['machine learning'],
  opencv: ['machine learning'],
  cuda: ['machine learning', 'hardware'],
  pandas: ['data science'],
  numpy: ['data science'],
  sql: ['data science', 'software engineering'],
  spark: ['data science'],
  tableau: ['data science'],
  r: ['data science'],
  python: ['software engineering', 'data science'],
  java: ['software engineering'],
  'c++': ['software engineering', 'hardware'],
  c: ['software engineering', 'hardware'],
  golang: ['software engineering'],
  go: ['software engineering'],
  rust: ['software engineering'],
  typescript: ['software engineering'],
  javascript: ['software engineering'],
  react: ['software engineering'],
  'react native': ['software engineering'],
  node: ['software engineering'],
  django: ['software engineering'],
  kubernetes: ['systems & networking'],
  docker: ['systems & networking'],
  aws: ['systems & networking'],
  linux: ['systems & networking'],
  distributed: ['systems & networking'],
  verilog: ['hardware'],
  vhdl: ['hardware'],
  fpga: ['hardware'],
  'pcb design': ['hardware'],
  altium: ['hardware'],
  kicad: ['hardware'],
  embedded: ['hardware'],
  arduino: ['hardware'],
  'circuit design': ['hardware'],
  cad: ['mechanical design'],
  solidworks: ['mechanical design'],
  fusion: ['mechanical design'],
  ansys: ['mechanical design'],
  matlab: ['mechanical design', 'data science'],
  ros: ['robotics'],
  'control systems': ['robotics'],
  simulink: ['robotics'],
  'cell culture': ['biology'],
  pcr: ['biology'],
  crispr: ['synthetic biology'],
  'western blot': ['biology'],
  bioinformatics: ['computational biology'],
  'monte carlo': ['quantitative finance'],
  'time series': ['quantitative finance', 'data science'],
  stochastic: ['quantitative finance'],
  figma: ['design & hci'],
  'user research': ['design & hci', 'product management'],
};

/** Skills plus the domains they imply, for matching against postings. */
export function expandSkills(skills: string[]): string[] {
  const out = new Set<string>();
  for (const raw of skills) {
    const s = raw.toLowerCase().trim();
    out.add(s);
    for (const d of SKILL_DOMAINS[s] ?? []) out.add(d);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// School
// ---------------------------------------------------------------------------

/**
 * Curated programs can be school-restricted; live feed postings never are,
 * because the source carries no such field.
 */
export function checkSchool(
  posting: CareerPosting,
  school: string,
): EligibilityVerdict {
  if (!posting.schoolRestriction) return { eligible: true };
  if (!school) return { eligible: true }; // unknown school: don't hide things
  const want = posting.schoolRestriction.toLowerCase();
  const have = school.toLowerCase();
  if (have.includes(want) || want.includes(have)) return { eligible: true };
  return { eligible: false, reason: `${posting.schoolRestriction} students only` };
}

/** Rough campus regions, for a "near you" nudge - not a filter. */
const CAMPUS_REGIONS: { match: RegExp; near: RegExp }[] = [
  { match: /\bmit\b|massachusetts institute|harvard|boston|tufts|northeastern/i,
    near: /boston|cambridge, ma|\bma\b|massachusetts/i },
  { match: /stanford|berkeley|caltech|ucla|usc|ucsd/i,
    near: /san francisco|palo alto|mountain view|sunnyvale|\bca\b|california|seattle/i },
  { match: /columbia|nyu|cornell|princeton|yale/i,
    near: /new york|nyc|\bny\b|jersey|stamford/i },
];

export function isNearCampus(posting: CareerPosting, school: string): boolean {
  if (!school || posting.locations.length === 0) return false;
  const region = CAMPUS_REGIONS.find((r) => r.match.test(school));
  if (!region) return false;
  return posting.locations.some((l) => region.near.test(l));
}
