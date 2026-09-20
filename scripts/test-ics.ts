/** Parser + expansion checks against synthetic Outlook-shaped ICS. */
import { parseICS, expandInstances } from '../src/core/ics';

const ICS = [
  'BEGIN:VCALENDAR',
  'X-WR-CALNAME:Calendar',
  'BEGIN:VEVENT',
  'UID:single-1',
  'SUMMARY:Advising meeting',
  'LOCATION:4-110',
  'DTSTART;TZID=Eastern Standard Time:20260922T140000',
  'DTEND;TZID=Eastern Standard Time:20260922T143000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:recur-1',
  'SUMMARY:18.C06 Lecture',
  'LOCATION:26-100',
  'DTSTART;TZID=Eastern Standard Time:20260908T110000',
  'DTEND;TZID=Eastern Standard Time:20260908T120000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261210T000000',
  'EXDATE;TZID=Eastern Standard Time:20260923T110000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday-1',
  'SUMMARY:Student holiday',
  'DTSTART;VALUE=DATE:20260925',
  'DTEND;VALUE=DATE:20260926',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:folded-1',
  'SUMMARY:A very long title that got folded across',
  '  two lines by the exporter',
  'DTSTART:20260924T170000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const { calendarName, events } = parseICS(ICS);
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? pass++ : fail++;
};

check('calendar name', calendarName === 'Calendar');
check('event count', events.length === 4, String(events.length));
check('folded summary joined',
  events.find(e=>e.uid==='folded-1')?.summary === 'A very long title that got folded across two lines by the exporter');
check('all-day flag', events.find(e=>e.uid==='allday-1')?.allDay === true);
check('UTC time exact',
  events.find(e=>e.uid==='folded-1')?.start.toISOString() === '2026-09-24T17:00:00.000Z');

const win = { s: new Date(2026,8,20), e: new Date(2026,9,4) }; // Sep 20 - Oct 4
const lecture = events.find(e=>e.uid==='recur-1')!;
const inst = expandInstances(lecture, win.s, win.e);
const days = inst.map(i=>i.start.toDateString());
// Six MWF slots fall in the window; EXDATE removes Wed Sep 23 -> five.
check('weekly MWF expansion count', inst.length === 5, `${inst.length}: ${days.join(' | ')}`);
check('EXDATE removed Sep 23', !days.some(d=>/Sep 23/.test(d)));
check('duration preserved',
  inst.every(i => i.end && i.end.getTime()-i.start.getTime() === 3600_000));
const single = events.find(e=>e.uid==='single-1')!;
check('single event in window', expandInstances(single, win.s, win.e).length === 1);
check('single event outside window', expandInstances(single, new Date(2026,10,1), new Date(2026,10,10)).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
