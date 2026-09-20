/**
 * Curated research programs and fellowships.
 *
 * Research opportunities have no SimplifyJobs equivalent - REUs, institute
 * summer programs, and UROP funding cycles live on scattered department
 * pages. This is a hand-maintained starter set. Every entry is marked
 * `curated` and the UI labels them "curated" so they're never mistaken for a
 * live feed; URLs point at the real program pages, and deadlines here are the
 * programs' published ones for recent cycles - VERIFY on the linked page
 * before planning around one, since programs shift dates year to year. The
 * `deadlineMonthDay` form exists so the entries don't go stale annually: the
 * next occurrence of that month/day is computed at load.
 */

import type { CareerPosting } from './types';

interface CuratedEntry extends Omit<CareerPosting, 'deadline' | 'id' | 'source'> {
  key: string;
  /** "MM-DD" - resolved to the next future occurrence. */
  deadlineMonthDay?: string;
}

/** Next occurrence of MM-DD at 23:59 local, this year or next. */
function nextOccurrence(monthDay: string, now = new Date()): string {
  const [mm, dd] = monthDay.split('-').map(Number);
  const d = new Date(now.getFullYear(), mm - 1, dd, 23, 59, 0, 0);
  if (d.getTime() < now.getTime()) d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

const ENTRIES: CuratedEntry[] = [
  {
    key: 'mit-urop-direct',
    kind: 'research',
    company: 'MIT UROP Office',
    title: 'UROP Direct Funding — IAP/Spring cycle',
    locations: ['MIT campus'],
    deadlineMonthDay: '12-04',
    requirements: [
      'Enrolled MIT undergraduate',
      'Faculty supervisor and project description agreed before applying',
      'Proposal written with your direct supervisor',
    ],
    url: 'https://urop.mit.edu/',
    applyUrl: 'https://urop.mit.edu/apply',
    terms: ['IAP', 'Spring'],
    topics: ['research', 'urop'],
    schoolRestriction: 'MIT',
  },
  {
    key: 'mit-msrp',
    kind: 'research',
    company: 'MIT Summer Research Program',
    title: 'MSRP — paid summer research at MIT',
    locations: ['MIT campus'],
    deadlineMonthDay: '01-21',
    requirements: [
      'Sophomore standing or above, any US institution',
      'Interest in a research career; strong statement matters more than GPA',
      'Two recommendation letters',
    ],
    url: 'https://oge.mit.edu/graddiversity/msrp/',
    applyUrl: 'https://oge.mit.edu/graddiversity/msrp/apply/',
    terms: ['Summer'],
    topics: ['research'],
  },
  {
    key: 'nsf-reu',
    kind: 'research',
    company: 'NSF REU Sites',
    title: 'Research Experiences for Undergraduates (all sites)',
    locations: ['Nationwide'],
    // Sites set their own deadlines, mostly Jan-Feb; no single date exists.
    requirements: [
      'US citizen or permanent resident (most sites)',
      'Apply per-site; each lists its own focus areas',
      'Stipend + housing typically included',
    ],
    url: 'https://www.nsf.gov/crssprgm/reu/reu_search.jsp',
    terms: ['Summer'],
    topics: ['research'],
    citizenship: 'US citizen or permanent resident (most sites)',
  },
  {
    key: 'csail-msg',
    kind: 'research',
    company: 'CSAIL',
    title: 'CSAIL UROPs — rolling, contact PIs directly',
    locations: ['Stata Center'],
    requirements: [
      'Email the PI or a grad student with a specific reason you fit their work',
      'Attach resume; mention relevant coursework (6.1010/6.1210 level ok)',
      'Fall applications strongest in September, spring in December',
    ],
    url: 'https://www.csail.mit.edu/research',
    terms: ['Fall', 'IAP', 'Spring', 'Summer'],
    topics: ['machine learning', 'systems & networking', 'robotics', 'research', 'urop'],
    schoolRestriction: 'MIT',
  },
  {
    key: 'anthropic-fellows',
    kind: 'research',
    company: 'Anthropic',
    title: 'AI Safety Fellows Program',
    locations: ['Remote', 'San Francisco, CA'],
    requirements: [
      'Strong engineering background; research experience helpful but not required',
      'Full-time commitment for the fellowship term',
    ],
    url: 'https://www.anthropic.com/careers',
    terms: ['Summer'],
    topics: ['machine learning', 'artificial intelligence', 'policy & governance'],
  },
  {
    key: 'mit-sensetime',
    kind: 'internship',
    company: 'MIT Lincoln Laboratory',
    title: 'Summer Research Program — technical intern',
    locations: ['Lexington, MA'],
    deadlineMonthDay: '01-15',
    requirements: [
      'US citizenship required (defense laboratory)',
      'Rising sophomore or above in engineering, CS, math, or physics',
    ],
    url: 'https://www.ll.mit.edu/careers/student-opportunities',
    applyUrl: 'https://careers.ll.mit.edu/',
    terms: ['Summer'],
    topics: ['hardware', 'software engineering', 'research'],
    citizenship: 'US citizenship required',
  },
];

export function curatedPostings(now = new Date()): CareerPosting[] {
  return ENTRIES.map((e) => ({
    id: `curated:${e.key}`,
    source: 'curated',
    schoolRestriction: e.schoolRestriction,
    citizenship: e.citizenship,
    kind: e.kind,
    company: e.company,
    title: e.title,
    locations: e.locations,
    deadline: e.deadlineMonthDay ? nextOccurrence(e.deadlineMonthDay, now) : null,
    requirements: e.requirements,
    url: e.url,
    applyUrl: e.applyUrl,
    terms: e.terms,
    topics: e.topics,
  }));
}
