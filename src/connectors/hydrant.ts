/**
 * Class schedule from Hydrant.
 *
 * MIT's registrar doesn't put lecture and recitation hours in Canvas, and a
 * student's personal calendar usually doesn't have them either. Hydrant
 * (hydrant.mit.edu) publishes the real thing as a public JSON: meeting times
 * and rooms for all ~2,300 classes, no auth.
 *
 * The slot encoding was reverse-engineered and then VERIFIED against every
 * section in the file - 2,727 sections, zero mismatches - by cross-checking
 * the numeric slots against the human-readable `*RawSections` strings:
 *
 *     slot = dayIndex * 34 + (hour - 6) * 2
 *
 * i.e. 30-minute slots, 34 per day, day 0 = Monday, each day starting at
 * 06:00. Duration is the second element of each [slot, length] pair.
 *
 * Honest limits:
 *   - Hydrant lists ALL sections of a class. It cannot know which recitation
 *     YOU are in, so every section is returned and the UI asks you to pick.
 *   - Term dates aren't in the feed, so weekly meetings are generated across
 *     the sync window rather than the real semester boundaries.
 */

import type { RawItem } from '../core/types';
import { nowISO, type Connector, type SyncWindow } from './types';
import { proxiedUrl } from './canvas-transport';

export const HYDRANT_URL = 'https://hydrant.mit.edu/latest.json';

/** 30-minute slots, 34 per day, Monday = 0, day begins at 06:00. */
export const SLOTS_PER_DAY = 34;
export const DAY_START_HOUR = 6;

export interface HydrantSection {
  /** [slot, lengthInSlots][] */
  slots: [number, number][];
  room: string;
}

export interface HydrantClass {
  number: string;
  name: string;
  lectureSections: HydrantSection[];
  recitationSections: HydrantSection[];
  labSections: HydrantSection[];
  /** Instructor(s) as the subject listing prints them: "M. Kaashoek", "R. Barzilay, J. Andreas". */
  inCharge?: string;
  /** First ~220 characters of the catalogue description. Enough to recognise a class. */
  description?: string;
  /** Terms offered, e.g. ["FA"], ["FA", "SP"]. */
  terms?: string[];
  /** "U" undergraduate or "G" graduate. */
  level?: string;
}

/** Which term the catalogue describes - Hydrant's `termInfo.urlName`, e.g. "f26". */
export interface HydrantTerm {
  urlName: string;
  /** "Fall 2026". */
  label: string;
}

export function termLabel(urlName: string): string {
  const m = /^([fsim])(\d{2})$/i.exec(urlName.trim());
  if (!m) return urlName;
  const season = { f: 'Fall', s: 'Spring', i: 'IAP', m: 'Summer' }[m[1].toLowerCase() as 'f' | 's' | 'i' | 'm'];
  return `${season} 20${m[2]}`;
}

/**
 * Canvas course codes carry term suffixes that Hydrant doesn't use
 * ("15.A03_FA26" vs "15.A03"), and some Canvas entries aren't real catalogue
 * classes at all (PE sections, advising seminars). Normalize what we can and
 * let the rest miss cleanly - a class with no Hydrant entry simply has no
 * schedule, which is the honest outcome.
 */
export function normalizeCourseCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[_-](FA|SP|IAP|SU)\d{2,4}$/i, '')
    .replace(/\s+/g, '');
}

/** Decode a slot index into weekday (0=Mon) and minutes-from-midnight. */
export function decodeSlot(slot: number): { day: number; minutes: number } {
  const day = Math.floor(slot / SLOTS_PER_DAY);
  const rem = slot % SLOTS_PER_DAY;
  return { day, minutes: DAY_START_HOUR * 60 + rem * 30 };
}

type RawSection = [[number, number][], string];

function toSections(raw: unknown): HydrantSection[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawSection[])
    .filter((s) => Array.isArray(s) && Array.isArray(s[0]))
    .map((s) => ({ slots: s[0], room: typeof s[1] === 'string' ? s[1] : '' }));
}

/** Full descriptions total ~1MB across the catalogue; this keeps the cache small. */
const DESCRIPTION_CHARS = 220;

/** Reshape Hydrant's raw JSON. Exported so tests can run it on a recorded payload. */
export function parseHydrant(data: {
  classes?: Record<string, Record<string, unknown>>;
  termInfo?: { urlName?: string };
}): { classes: Map<string, HydrantClass>; term: HydrantTerm | null } {
  const classes = new Map<string, HydrantClass>();
  for (const [number, c] of Object.entries(data.classes ?? {})) {
    const description = typeof c.description === 'string' ? c.description.trim() : '';
    classes.set(number, {
      number,
      name: typeof c.name === 'string' ? c.name : number,
      lectureSections: toSections(c.lectureSections),
      recitationSections: toSections(c.recitationSections),
      labSections: toSections(c.labSections),
      inCharge: typeof c.inCharge === 'string' && c.inCharge.trim() ? c.inCharge.trim() : undefined,
      description: description
        ? description.length > DESCRIPTION_CHARS
          ? `${description.slice(0, DESCRIPTION_CHARS).replace(/\s+\S*$/, '')}…`
          : description
        : undefined,
      terms: Array.isArray(c.terms) ? (c.terms as string[]).filter((t) => typeof t === 'string') : undefined,
      level: typeof c.level === 'string' ? c.level : undefined,
    });
  }
  const urlName = data.termInfo?.urlName;
  const term = typeof urlName === 'string' && urlName ? { urlName, label: termLabel(urlName) } : null;
  return { classes, term };
}

/** Fetch the Hydrant catalogue with the term it describes. */
export async function fetchHydrantCatalogue(
  timeoutMs = 45_000,
): Promise<{ classes: Map<string, HydrantClass>; term: HydrantTerm | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // hydrant.mit.edu sends no CORS headers, so the web build goes through
    // the local proxy; the phone fetches it directly.
    const res = await fetch(proxiedUrl(HYDRANT_URL), { signal: controller.signal });
    if (!res.ok) throw new Error(`Hydrant -> ${res.status} ${res.statusText}`);
    return parseHydrant(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch and reshape the Hydrant catalogue (classes only). */
export async function fetchHydrant(
  timeoutMs = 45_000,
): Promise<Map<string, HydrantClass>> {
  return (await fetchHydrantCatalogue(timeoutMs)).classes;
}

// ---------------------------------------------------------------------------
// Instructors and search
// ---------------------------------------------------------------------------

export interface Instructor {
  /** As printed, minus term prefixes: "M. Kaashoek", "R. de Neufville". */
  display: string;
  /** "M", "HR" - first-name initials without punctuation. */
  initials: string;
  /** Lower-cased final surname token: "kaashoek", "neufville". */
  last: string;
}

/**
 * Parse the subject listing's `inCharge` string. Shapes seen in the live
 * catalogue: "I. Last" (2,167), "I. I. Last" (64), "Fall: I. Last" / "Spring:
 * I. Last" on full-year subjects, "Consult I. Last", multi-word surnames
 * ("R. de Neufville", "M. Vazquez Sanchez"), and a handful of "III" suffixes.
 */
export function parseInstructors(inCharge: string | undefined): Instructor[] {
  if (!inCharge) return [];
  const out: Instructor[] = [];
  for (let part of inCharge.split(/,\s*/)) {
    part = part
      .replace(/^(?:Fall|Spring|IAP|Summer):\s*/i, '')
      .replace(/^Consult\s+/i, '')
      .replace(/\s+(?:III|II|IV|Jr\.?|Sr\.?)$/, '')
      .trim();
    // "T. DeRoche. M. Vazquez Sanchez" - two people joined with a period.
    // Only a period after a SURNAME (two or more lowercase letters) splits,
    // so "H. R. Horvitz" stays one person.
    const pieces = part.replace(/([a-z]{2,})\.\s+(?=[A-Z]\.\s)/g, '$1|').split('|');
    for (const piece of pieces) {
      // Initials always carry a period in the listing ("M. Kaashoek",
      // "H. R. Horvitz"). Requiring it keeps a greedy match from eating the
      // surname's first letter.
      const m = /^((?:[A-Z]\.\s*)+)([A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*)*)$/.exec(
        piece.trim(),
      );
      if (!m) continue;
      const initials = m[1].replace(/[^A-Z]/g, '');
      const surname = m[2].trim();
      const tokens = surname.split(/\s+/);
      out.push({
        display: `${initials.split('').join('. ')}. ${surname}`,
        initials,
        last: tokens[tokens.length - 1].toLowerCase(),
      });
    }
  }
  return out;
}

export interface InstructorListing extends Instructor {
  classes: HydrantClass[];
}

/** Every instructor in the catalogue, with the classes they're listed for. */
export function instructorIndex(catalogue: Map<string, HydrantClass>): InstructorListing[] {
  const byDisplay = new Map<string, InstructorListing>();
  for (const cls of catalogue.values()) {
    for (const ins of parseInstructors(cls.inCharge)) {
      let entry = byDisplay.get(ins.display);
      if (!entry) {
        entry = { ...ins, classes: [] };
        byDisplay.set(ins.display, entry);
      }
      if (!entry.classes.some((c) => c.number === cls.number)) entry.classes.push(cls);
    }
  }
  for (const e of byDisplay.values()) e.classes.sort((a, b) => a.number.localeCompare(b.number));
  return [...byDisplay.values()];
}

/**
 * Which catalogue classes list this person as instructor.
 *
 * The listing prints initials, not first names, so "Frans Kaashoek" appears
 * as "M. Kaashoek" (his legal first name). Matching is therefore by surname
 * plus first initial, with an explicit `listedAs` override for the cases
 * where the printed initial differs from the name people know. A surname
 * alone is never enough: three different Williamses teach this term.
 */
export function classesTaughtBy(
  catalogue: Map<string, HydrantClass>,
  person: { name: string; listedAs?: string },
): HydrantClass[] {
  const target = parseInstructors(person.listedAs ?? '')[0] ?? nameToInstructor(person.name);
  if (!target) return [];
  const out: HydrantClass[] = [];
  for (const cls of catalogue.values()) {
    const hit = parseInstructors(cls.inCharge).some(
      (ins) => ins.last === target.last && ins.initials[0] === target.initials[0],
    );
    if (hit) out.push(cls);
  }
  return out.sort((a, b) => a.number.localeCompare(b.number));
}

/** How a person would be printed in the listing: `listedAs` if given, else first initial + surname. */
export function personAsInstructor(person: { name: string; listedAs?: string }): Instructor | null {
  return parseInstructors(person.listedAs ?? '')[0] ?? nameToInstructor(person.name);
}

/** Same as classesTaughtBy, against a prebuilt index - cheap enough to run per card. */
export function classesFor(
  index: InstructorListing[],
  person: { name: string; listedAs?: string },
): HydrantClass[] {
  const target = personAsInstructor(person);
  if (!target) return [];
  const seen = new Set<string>();
  const out: HydrantClass[] = [];
  for (const ins of index) {
    if (ins.last !== target.last || ins.initials[0] !== target.initials[0]) continue;
    for (const c of ins.classes) {
      if (seen.has(c.number)) continue;
      seen.add(c.number);
      out.push(c);
    }
  }
  return out.sort((a, b) => a.number.localeCompare(b.number));
}

function nameToInstructor(name: string): Instructor | null {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1].toLowerCase();
  const initials = tokens[0][0]?.toUpperCase() ?? '';
  return { display: `${initials}. ${tokens[tokens.length - 1]}`, initials, last };
}

/**
 * Collapse cross-listed numbers. 18.C06 and 6.C06 are one class with two
 * numbers; the listing repeats the title and instructor for each. Grouping
 * on identical title + instructor is how the registrar's own pages read.
 */
export function collapseCrossListed(
  classes: HydrantClass[],
): { primary: HydrantClass; aliases: string[] }[] {
  const groups = new Map<string, { primary: HydrantClass; aliases: string[] }>();
  for (const c of classes) {
    const key = `${c.name.toLowerCase()}|${(c.inCharge ?? '').toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.aliases.push(c.number);
    else groups.set(key, { primary: c, aliases: [] });
  }
  return [...groups.values()];
}

/** Prefer hydrant.mit.edu for the class page; the registrar's catalogue as the fallback link. */
export function classUrl(number: string): string {
  return `https://hydrant.mit.edu/#/class/${encodeURIComponent(number)}`;
}

export function catalogUrl(number: string): string {
  return `https://student.mit.edu/catalog/search.cgi?search=${encodeURIComponent(number)}`;
}

/**
 * Search the catalogue. A query that looks like a course number ("6.18",
 * "18.C06") matches on the number; words match name, instructor and the
 * description. Scored so exact number and title hits float up.
 */
export function searchClasses(
  catalogue: Map<string, HydrantClass>,
  query: string,
  limit = 12,
): HydrantClass[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  const looksLikeNumber = /^[a-z0-9]{1,3}\.?[a-z0-9]*$/i.test(q) && /\d/.test(q);
  // Word-start matching: "outing" must not hit "routing" in a description.
  const starts = (hay: string, needle: string) => wordStart(needle).test(hay);
  const scored: { cls: HydrantClass; score: number }[] = [];
  for (const cls of catalogue.values()) {
    const number = cls.number.toLowerCase();
    const name = cls.name.toLowerCase();
    const who = (cls.inCharge ?? '').toLowerCase();
    const desc = (cls.description ?? '').toLowerCase();
    let score = 0;
    if (looksLikeNumber) {
      if (number === q) score += 100;
      else if (number.startsWith(q)) score += 60;
    }
    if (name === q) score += 80;
    else if (starts(name, q)) score += 40;
    // Every word has to land somewhere, or "max tegmark" matches every
    // description containing "maximum".
    let allWords = true;
    for (const w of words) {
      let hit = false;
      if (starts(name, w)) { score += 12; hit = true; }
      if (starts(who, w)) { score += 15; hit = true; }
      if (starts(desc, w)) { score += 4; hit = true; }
      if (!hit && !(looksLikeNumber && number.startsWith(w))) allWords = false;
    }
    if (score > 0 && allWords) scored.push({ cls, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.cls.number.localeCompare(b.cls.number))
    .slice(0, limit)
    .map((s) => s.cls);
}

/** A regex matching `needle` at the start of a word. */
export function wordStart(needle: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}

/**
 * Search results for display: cross-listed and sectioned duplicates (7.340
 * through 7.349 are one seminar) collapse onto a single card that lists the
 * other numbers. Searches a wider slice first so the collapse doesn't starve
 * the result count.
 */
export function searchClassGroups(
  catalogue: Map<string, HydrantClass>,
  query: string,
  limit = 12,
): { primary: HydrantClass; aliases: string[] }[] {
  return collapseCrossListed(searchClasses(catalogue, query, limit * 4)).slice(0, limit);
}

/**
 * Instructors whose printed name matches the query.
 *
 * The listing prints "M. Tegmark", never "Max Tegmark", so a full name is
 * read as surname (last word) plus a first initial: surname must match,
 * and a matching initial ranks first rather than being required - the
 * printed initial is sometimes a legal first name nobody uses.
 */
export function searchInstructors(
  catalogue: Map<string, HydrantClass>,
  query: string,
  limit = 8,
): InstructorListing[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const surname = words[words.length - 1].replace(/[^a-z'’\-]/g, '');
  const initial = words.length > 1 ? words[0][0] : null;
  if (surname.length < 3) return [];
  return instructorIndex(catalogue)
    .filter((i) => i.last === surname || i.last.startsWith(surname))
    .sort((a, b) => {
      const ai = initial && a.initials[0]?.toLowerCase() === initial ? 1 : 0;
      const bi = initial && b.initials[0]?.toLowerCase() === initial ? 1 : 0;
      return bi - ai || b.classes.length - a.classes.length;
    })
    .slice(0, limit);
}

export type MeetingKind = 'lecture' | 'recitation' | 'lab';

export interface Meeting {
  course: string;
  courseName: string;
  kind: MeetingKind;
  /** Which section of that kind, 0-based - "Recitation 2". */
  sectionIndex: number;
  /** 0 = Monday. */
  day: number;
  startMinutes: number;
  endMinutes: number;
  room: string;
}

/** Flatten one class into its weekly meetings. */
export function meetingsFor(cls: HydrantClass): Meeting[] {
  const out: Meeting[] = [];
  const groups: [MeetingKind, HydrantSection[]][] = [
    ['lecture', cls.lectureSections],
    ['recitation', cls.recitationSections],
    ['lab', cls.labSections],
  ];
  for (const [kind, sections] of groups) {
    sections.forEach((section, sectionIndex) => {
      for (const [slot, length] of section.slots) {
        const { day, minutes } = decodeSlot(slot);
        out.push({
          course: cls.number,
          courseName: cls.name,
          kind,
          sectionIndex,
          day,
          startMinutes: minutes,
          endMinutes: minutes + length * 30,
          room: section.room,
        });
      }
    });
  }
  return out;
}

const KIND_MAP: Record<MeetingKind, 'lecture' | 'recitation' | 'office_hours'> = {
  lecture: 'lecture',
  recitation: 'recitation',
  // Hydrant's "lab" is a scheduled session, closest to a recitation for us.
  lab: 'recitation',
};

/** Expand a weekly meeting into dated occurrences inside the window. */
function occurrences(m: Meeting, window: SyncWindow): RawItem[] {
  const from = new Date(window.since);
  const to = new Date(window.until);
  const items: RawItem[] = [];

  // Walk from the first day of the window to the last, emitting matches.
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= to) {
    // JS getDay(): 0=Sun. Hydrant: 0=Mon.
    const hydrantDay = (cursor.getDay() + 6) % 7;
    if (hydrantDay === m.day) {
      const start = new Date(cursor);
      start.setHours(0, m.startMinutes, 0, 0);
      const end = new Date(cursor);
      end.setHours(0, m.endMinutes, 0, 0);
      if (start >= from && start <= to) {
        const label =
          m.kind === 'lecture'
            ? `${m.course} Lecture`
            : `${m.course} ${m.kind === 'lab' ? 'Lab' : 'Recitation'}${
                m.sectionIndex > 0 ? ` ${m.sectionIndex + 1}` : ''
              }`;
        items.push({
          source: 'schedule',
          sourceId: `hydrant:${m.course}:${m.kind}:${m.sectionIndex}:${start.toISOString()}`,
          sourceUrl: `https://hydrant.mit.edu/#/class/${m.course}`,
          text: `${label}\n${m.courseName}\n${m.room}`,
          hints: {
            kind: KIND_MAP[m.kind],
            title: label,
            description: m.courseName,
            start: start.toISOString(),
            end: end.toISOString(),
            allDay: false,
            location: m.room || undefined,
            course: { code: m.course, name: m.courseName },
            people: [],
          },
          raw: m,
          fetchedAt: nowISO(),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return items;
}

/**
 * Build schedule items for the given courses.
 *
 * `sectionChoice` maps "course:kind" to the section index the student is
 * actually in.
 *
 * Ambiguity is what drives the requirement, not the kind. Large intro classes
 * run MULTIPLE LECTURE sections - 8.01 has eight, and 134 of the catalogue's
 * 2,273 classes have more than one - so a class with several lecture times
 * needs a pick exactly like a recitation does. A class with a single section
 * of a kind needs no choice and is emitted directly.
 *
 * Emitting every section would put four overlapping 8.01 lectures on the same
 * afternoon, which is worse than showing nothing.
 */
export function scheduleItems(
  catalogue: Map<string, HydrantClass>,
  courses: string[],
  window: SyncWindow,
  sectionChoice: Record<string, number> = {},
): RawItem[] {
  const items: RawItem[] = [];
  for (const code of courses) {
    const cls = catalogue.get(code) ?? catalogue.get(normalizeCourseCode(code));
    if (!cls) continue;

    const counts: Record<MeetingKind, number> = {
      lecture: cls.lectureSections.length,
      recitation: cls.recitationSections.length,
      lab: cls.labSections.length,
    };

    for (const m of meetingsFor(cls)) {
      if (counts[m.kind] > 1) {
        // Ambiguous: only the chosen section is real for this student.
        const chosen =
          sectionChoice[`${code}:${m.kind}`] ??
          sectionChoice[`${normalizeCourseCode(code)}:${m.kind}`];
        if (chosen === undefined || chosen !== m.sectionIndex) continue;
      }
      items.push(...occurrences(m, window));
    }
  }
  return items;
}

/** Kinds of this class that have more than one section, so need a choice. */
export function ambiguousKinds(
  catalogue: Map<string, HydrantClass>,
  code: string,
): MeetingKind[] {
  const cls = catalogue.get(code) ?? catalogue.get(normalizeCourseCode(code));
  if (!cls) return [];
  const out: MeetingKind[] = [];
  if (cls.lectureSections.length > 1) out.push('lecture');
  if (cls.recitationSections.length > 1) out.push('recitation');
  if (cls.labSections.length > 1) out.push('lab');
  return out;
}

/** What sections a student could pick from, for the Settings UI. */
export function sectionOptions(
  catalogue: Map<string, HydrantClass>,
  code: string,
): { kind: MeetingKind; index: number; label: string }[] {
  const cls = catalogue.get(code) ?? catalogue.get(normalizeCourseCode(code));
  if (!cls) return [];
  const out: { kind: MeetingKind; index: number; label: string }[] = [];
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`;
  };

  for (const [kind, sections] of [
    ['lecture', cls.lectureSections],
    ['recitation', cls.recitationSections],
    ['lab', cls.labSections],
  ] as [MeetingKind, HydrantSection[]][]) {
    // A single section needs no picker.
    if (sections.length <= 1) continue;
    sections.forEach((section, index) => {
      const times = section.slots.map(([slot]) => {
        const { day, minutes } = decodeSlot(slot);
        return `${DAY_NAMES[day] ?? '?'} ${fmt(minutes)}`;
      });
      out.push({
        kind,
        index,
        label: `${times.join(', ')}${section.room ? ` · ${section.room}` : ''}`,
      });
    });
  }
  return out;
}

/** Connector shape, so the sync pipeline can treat it like any other source. */
export function hydrantConnector(
  courses: string[],
  sectionChoice: Record<string, number>,
): Connector {
  return {
    id: 'schedule',
    label: 'Class schedule',
    isFixture: false,
    isConfigured: () => courses.length > 0,
    async fetch(_creds, window) {
      const catalogue = await fetchHydrant();
      return scheduleItems(catalogue, courses, window, sectionChoice);
    },
  };
}
