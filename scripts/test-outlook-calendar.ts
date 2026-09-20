/**
 * Does what's on your Outlook calendar actually reach the Calendar tab?
 *
 * This covers the seam three separate bugs lived in: an Outlook entry that
 * isn't class-shaped normalizes to kind 'other', lands in the OPPORTUNITY
 * lane, and used to be interest-filtered off the calendar - invisible even
 * with "Suggestions on", because "Dentist" scores ~0 against your research
 * interests and the unsaved floor is 0.3. Your own calendar is schedule, not
 * suggestion.
 */

import { parseICS, expandInstances } from '../src/core/ics';
import { normalizeStructured } from '../src/core/normalize';
import { calendarEvents, isOwnCalendarEntry } from '../src/plan/calendar';
import { isProxiedHost } from '../src/connectors/canvas-transport';
import type { RawItem, ScoredEvent } from '../src/core/types';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? pass++ : fail++;
};

// --- a published calendar, as Outlook actually emits one -------------------

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:Summer Lu',
  'BEGIN:VEVENT',
  'UID:advisor@outlook',
  'SUMMARY:Advisor meeting — thesis check-in',
  'LOCATION:32-D463',
  'DTSTART:20260922T150000Z',
  'DTEND:20260922T153000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:dentist@outlook',
  'SUMMARY:Dentist',
  'DTSTART:20260923T190000Z',
  'DTEND:20260923T200000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:lecture@outlook',
  'SUMMARY:6.1010 Lecture',
  'DTSTART:20260922T140000Z',
  'DTEND:20260922T150000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:midterm@outlook',
  'SUMMARY:6.1210 Midterm Exam',
  'DTSTART:20260924T180000Z',
  'DTEND:20260924T200000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

/** Mirrors the connector's calendarKind(). */
function calendarKind(subject: string) {
  if (/\b(exam|midterm|final)\b/i.test(subject)) return 'exam' as const;
  if (/\bquiz\b/i.test(subject)) return 'quiz' as const;
  if (/\b(recitation|section)\b/i.test(subject)) return 'recitation' as const;
  if (/\blecture\b/i.test(subject)) return 'lecture' as const;
  if (/\boffice hours?\b/i.test(subject)) return 'office_hours' as const;
  return undefined;
}

const { calendarName, events } = parseICS(ICS);
check('calendar name parsed', calendarName === 'Summer Lu', calendarName ?? '');
check('all four entries parsed', events.length === 4, String(events.length));

const win = { s: new Date('2026-09-01'), e: new Date('2026-10-30') };
const scored: ScoredEvent[] = [];
for (const ev of events) {
  const inst = expandInstances(ev, win.s, win.e)[0];
  if (!inst) continue;
  const item = {
    source: 'outlook',
    sourceId: `event:${ev.uid}`,
    text: ev.summary,
    hints: {
      kind: calendarKind(ev.summary),
      title: ev.summary,
      start: inst.start.toISOString(),
      end: (inst.end ?? inst.start).toISOString(),
      allDay: ev.allDay,
      location: ev.location,
    },
    raw: {},
    fetchedAt: new Date().toISOString(),
  } as unknown as RawItem;
  const norm = normalizeStructured(item);
  if (norm) scored.push({ ...norm, score: 0 } as ScoredEvent);
}

check('all four normalized', scored.length === 4, String(scored.length));

const byTitle = (t: string) => scored.find((e) => e.title.startsWith(t))!;
check('personal meeting is kind=other', byTitle('Advisor').kind === 'other');
check('personal meeting is opportunity lane', byTitle('Advisor').lane === 'opportunity');
check('lecture still classified', byTitle('6.1010').kind === 'lecture');
check('midterm still an obligation', byTitle('6.1210').lane === 'obligation');

// --- the actual regression -------------------------------------------------

const savedNothing = new Set<string>();
const defaultView = calendarEvents(scored, savedNothing, {
  showClasses: true,
  showUnsaved: false,
});
check(
  'Outlook calendar shows in full by DEFAULT (saved-only)',
  defaultView.length === 4,
  `${defaultView.length}/4: ${defaultView.map((e) => e.title.slice(0, 18)).join(', ')}`,
);
check('unstarred "Dentist" is visible', defaultView.some((e) => e.title === 'Dentist'));
check(
  'unstarred advisor meeting is visible',
  defaultView.some((e) => e.title.startsWith('Advisor')),
);

const noClasses = calendarEvents(scored, savedNothing, {
  showClasses: false,
  showUnsaved: false,
});
check(
  'hiding classes still keeps your meetings',
  noClasses.some((e) => e.title === 'Dentist') &&
    !noClasses.some((e) => e.title.startsWith('6.1010')),
  `${noClasses.length} shown`,
);

// A mailing-list event from Outlook is NOT your calendar, and stays filtered.
const dormspam = {
  ...byTitle('Dentist'),
  id: 'spam-1',
  sourceId: 'message:AAMk_1',
  title: 'FREE PIZZA tonight',
  score: 0,
} as ScoredEvent;
const withSpam = calendarEvents([...scored, dormspam], savedNothing, {
  showClasses: true,
  showUnsaved: false,
});
check(
  'mailing-list event still filtered out',
  !withSpam.some((e) => e.title === 'FREE PIZZA tonight'),
);
check('isOwnCalendarEntry: event: prefix', isOwnCalendarEntry(byTitle('Dentist')));
check('isOwnCalendarEntry: message: prefix', !isOwnCalendarEntry(dormspam));
check(
  'isOwnCalendarEntry: other sources',
  !isOwnCalendarEntry({ source: 'mit', sourceId: 'event:x' }),
);

// --- the hosts a published calendar actually lives on ----------------------

for (const host of [
  'outlook.office.com',
  'outlook.office365.com',
  'outlook.live.com',
]) {
  check(
    `${host} is proxied on web`,
    isProxiedHost(`https://${host}/owa/calendar/abc/calendar.ics`),
  );
}
check(
  'unrelated hosts are not proxied',
  !isProxiedHost('https://evil.example.com/calendar.ics'),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
