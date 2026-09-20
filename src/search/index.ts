/**
 * Search across everything the app knows about MIT - pure matching only.
 *
 * The For you search bar fans a query out to five kinds of thing:
 *
 *   professors   the curated faculty set, plus every instructor listed in
 *                this term's subject listing (live, via Hydrant)
 *   courses      the subject listing: number, title, instructor, description
 *   clubs        groups that post to the Institute calendar
 *   labs         departments, labs and centers from the same calendar
 *   events       what's synced already, plus a live calendar search
 *
 * Network fetching lives in ./localist and ../connectors/hydrant; this module
 * only ranks. Ranking is deliberately simple - token overlap with a bonus for
 * name/title hits - because every source here is small enough to scan.
 */

import type { Professor } from '../careers/professors';
import { wordStart } from '../connectors/hydrant';
import type { ScoredEvent } from '../core/types';
import type { DirectoryEntry } from './localist';

export { requiredTokens as tokenize } from './intent';
import { requiredTokens } from './intent';

/**
 * 0 for no match; otherwise a score where name hits outrank body hits.
 *
 * Every word must match somewhere. With OR semantics "max tegmark" returned
 * 19 results - all of them "max" hitting "maximum" in some description - and
 * none of them Tegmark. A multi-word query is one thing being looked for.
 */
function score(fields: { name: string; body: string }, q: string, words: string[]): number {
  const name = fields.name.toLowerCase();
  const body = fields.body.toLowerCase();
  // Word-start matching, so "outing" finds the Outing Club and not "routing".
  const starts = (hay: string, needle: string) => wordStart(needle).test(hay);
  let s = 0;
  if (name === q) s += 100;
  else if (starts(name, q)) s += 50;
  else if (starts(body, q)) s += 20;
  for (const w of words) {
    if (starts(name, w)) s += 10;
    else if (starts(body, w)) s += 3;
    else return 0;
  }
  return s;
}

export { looksLikeName, parseIntent, matchDepartment, type Intent, type DepartmentInfo } from './intent';

/** Where to look a person up when we have nothing on them. All real MIT/public searches. */
export function personLookups(name: string): { label: string; url: string }[] {
  const q = encodeURIComponent(name.trim());
  return [
    { label: 'MIT directory', url: `https://web.mit.edu/people/?q=${q}` },
    { label: 'MIT site search', url: `https://web.mit.edu/search/?q=${q}` },
    { label: 'Google Scholar ↗', url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`${name.trim()} MIT`)}` },
    { label: 'LinkedIn ↗', url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${name.trim()} MIT`)}` },
  ];
}

export function searchProfessors(professors: Professor[], query: string, limit = 8): Professor[] {
  const words = requiredTokens(query);
  const q = words.join(' ');
  if (q.length < 2) return [];
  return professors
    .map((p) => ({
      p,
      s: score(
        {
          name: p.name,
          body: [p.department, p.lab ?? '', p.areas.join(' '), p.blurb, (p.teaches ?? []).join(' ')].join(' '),
        },
        q,
        words,
      ),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

export function searchDirectory(entries: DirectoryEntry[], query: string, limit = 8): DirectoryEntry[] {
  const words = requiredTokens(query);
  const q = words.join(' ');
  if (q.length < 2) return [];
  return entries
    .map((e) => ({ e, s: score({ name: e.name, body: e.description }, q, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}

export function searchEvents(events: ScoredEvent[], query: string, limit = 10): ScoredEvent[] {
  const words = requiredTokens(query);
  const q = words.join(' ');
  if (q.length < 2) return [];
  return events
    .map((e) => ({
      e,
      s: score(
        {
          name: e.title,
          body: [e.organizer ?? '', e.description ?? '', e.topics.join(' '), e.people.join(' ')].join(' '),
        },
        q,
        words,
      ),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.start.localeCompare(b.e.start))
    .slice(0, limit)
    .map((x) => x.e);
}

export interface SeenClub {
  name: string;
  /** Upcoming synced events by this club, soonest first. */
  events: ScoredEvent[];
}

/**
 * Clubs and groups that appear as the host of a synced campus event. Engage
 * names the organizing club on every event it publishes, so this is a live,
 * if partial, club directory: whoever has something coming up.
 */
export function clubsFromEvents(events: ScoredEvent[], query: string, limit = 6): SeenClub[] {
  const words = requiredTokens(query);
  if (words.length === 0) return [];
  const byName = new Map<string, ScoredEvent[]>();
  for (const e of events) {
    if (e.source !== 'mit' || !e.organizer) continue;
    const list = byName.get(e.organizer) ?? [];
    list.push(e);
    byName.set(e.organizer, list);
  }
  const starts = (hay: string, needle: string) => wordStart(needle).test(hay.toLowerCase());
  return [...byName.entries()]
    .filter(([name]) => words.every((w) => starts(name, w)))
    .map(([name, evs]) => ({ name, events: evs.sort((a, b) => a.start.localeCompare(b.start)) }))
    .sort((a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * MIT department for a course number prefix, so an instructor found only in
 * the subject listing still gets a department line. Systematic, so this is
 * a lookup rather than a guess.
 */
const DEPARTMENTS: Record<string, string> = {
  '1': 'Civil & Environmental Engineering (Course 1)',
  '2': 'Mechanical Engineering (Course 2)',
  '3': 'Materials Science & Engineering (Course 3)',
  '4': 'Architecture (Course 4)',
  '5': 'Chemistry (Course 5)',
  '6': 'EECS (Course 6)',
  '7': 'Biology (Course 7)',
  '8': 'Physics (Course 8)',
  '9': 'Brain & Cognitive Sciences (Course 9)',
  '10': 'Chemical Engineering (Course 10)',
  '11': 'Urban Studies & Planning (Course 11)',
  '12': 'Earth, Atmospheric & Planetary Sciences (Course 12)',
  '14': 'Economics (Course 14)',
  '15': 'Sloan (Course 15)',
  '16': 'Aeronautics & Astronautics (Course 16)',
  '17': 'Political Science (Course 17)',
  '18': 'Mathematics (Course 18)',
  '20': 'Biological Engineering (Course 20)',
  '21': 'Humanities (Course 21)',
  '21A': 'Anthropology (21A)',
  '21G': 'Global Languages (21G)',
  '21H': 'History (21H)',
  '21L': 'Literature (21L)',
  '21M': 'Music & Theater Arts (21M)',
  '21W': 'Writing (21W)',
  '22': 'Nuclear Science & Engineering (Course 22)',
  '24': 'Linguistics & Philosophy (Course 24)',
  CMS: 'Comparative Media Studies',
  HST: 'Health Sciences & Technology',
  IDS: 'Institute for Data, Systems, and Society',
  MAS: 'Media Arts & Sciences (Media Lab)',
  STS: 'Science, Technology & Society',
  WGS: "Women's & Gender Studies",
  CC: 'Concourse',
  ES: 'Experimental Study Group',
  SP: 'Special Programs',
  SWE: 'Engineering (SWE)',
};

export function departmentOf(courseNumber: string): string | undefined {
  const prefix = courseNumber.split('.')[0].toUpperCase();
  return DEPARTMENTS[prefix] ?? DEPARTMENTS[prefix.replace(/[A-Z]$/, '')];
}

/** The departments implied by a set of course numbers, most common first. */
export function departmentsFor(courseNumbers: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of courseNumbers) {
    const d = departmentOf(n);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}
