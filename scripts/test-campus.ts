/** MIT campus connector: classification, fixtures, and the source migration. */
import { classify, mitFixture, parseEngageRss } from '../src/connectors/mit';
import { datedBlocks } from '../src/connectors/clubs';
import { audienceMismatch } from '../src/ranking/score';
import { seriesKey } from '../src/careers/professors';
import { suggestFor } from '../src/plan/suggest';
import { DEFAULT_PROFILE } from '../src/core/profile';
import { defaultWindow } from '../src/connectors';
import { migrateSources } from '../src/state/storage';
import { isAttendanceCourse } from '../src/core/attendance';
import {
  parseInstructors, classesTaughtBy, classesFor, instructorIndex, searchClasses, searchInstructors, termLabel,
  collapseCrossListed, searchClassGroups, type HydrantClass,
} from '../src/connectors/hydrant';
import { searchProfessors, searchDirectory, departmentOf, tokenize, looksLikeName, personLookups, clubsFromEvents } from '../src/search';
import { parseIntent, requiredTokens, DEPARTMENTS } from '../src/search/intent';
import { parseEngageClubs } from '../src/search/engage';
import { parseICS } from '../src/core/ics';
import { validate } from '../src/chat/actions';
import type { ScoredEvent } from '../src/core/types';
import { PROFESSORS } from '../src/careers/professors';

let pass=0, fail=0;
const check=(l:string,ok:boolean,d='')=>{console.log(`${ok?'PASS':'FAIL'}  ${l}${d?`  (${d})`:''}`); ok?pass++:fail++;};

// --- classification: the feed's category beats keyword guesses ---
check('seminar with "networking reception" in the blurb is a talk',
  classify('MechE Colloquium: Fabrication-Integrated Design', 'Networking reception to follow. Career-relevant.', ['Conferences/Seminars/Lectures'])==='talk');
check('thesis defense is a talk', classify('Thesis Defense: Learned Indexes', '', ['Thesis defense'])==='talk');
check('career-typed event is career', classify('Resume Reviews', '', ['Career Development'])==='career');
check('UROP event filed under Career Development is research',
  classify('Networking for Undergraduate Research Opportunities', '', ['Career Development'])==='urop');
check('UROP mixer filed under Workshops/Fairs is research', classify('2026 Institute-wide UROP Mixer', '', ['Workshops/Fairs'])==='urop');
check('career fair under Workshops/Fairs is career', classify('Fall Career Fair', '', ['Workshops/Fairs'])==='career');
check('club meeting is a club event', classify('Anime Club Weekly Screening', '', ['Meetings/Gatherings'])==='club_event');
check('varsity game is social', classify("Men's Water Polo vs. Mercyhurst", '', ['Athletics/Recreation'])==='social');
check('exhibit is other', classify('Howe, Manning & Almy', '', ['Exhibits'])==='other');
check('campus tours are skipped', classify('Campus Tour', '', ['Campus Tours'])===null);
check('institute holidays are skipped', classify('Indigenous Peoples Day', '', ['Institute Holidays'])===null);
// Engage: title only, no categories
check('untyped seminar title is a talk', classify('Koch Institute Seminar: Engineering T cells')==='talk');
check('untyped club night is a club event', classify('Solar Electric Vehicle Team - New Member Night')==='club_event');
check('untyped research fair is research', classify('Undergraduate Research Opportunities Fair')==='urop');
check('untyped VC panel is a talk', classify('Sloan VC Panel: Breaking into Venture')==='talk');

// --- subject-listing instructors ---
{
  const one = (s: string) => parseInstructors(s)[0];
  check('"M. Kaashoek" parses', one('M. Kaashoek')?.last==='kaashoek' && one('M. Kaashoek')?.initials==='M');
  check('two instructors split on the comma', parseInstructors('R. Barzilay, J. Andreas').map(i=>i.last).join(',')==='barzilay,andreas');
  check('"H. R. Horvitz" keeps both initials', one('H. R. Horvitz')?.initials==='HR' && one('H. R. Horvitz')?.display==='H. R. Horvitz');
  check('"Fall: B. Aulet" drops the term prefix', one('Fall: B. Aulet')?.display==='B. Aulet');
  check('"Consult C. Mueller" drops Consult', one('Consult C. Mueller')?.last==='mueller');
  check('multi-word surname keeps the final token as key', one('R. de Neufville')?.last==='neufville' && one('R. de Neufville')?.display==='R. de Neufville');
  check('two people joined by a period both parse', parseInstructors('T. DeRoche. M. Vazquez Sanchez').length===2);
  check('empty is empty', parseInstructors(undefined).length===0 && parseInstructors('').length===0);
  check('termLabel f26', termLabel('f26')==='Fall 2026');
  check('termLabel s27', termLabel('s27')==='Spring 2027');

  const mk = (number: string, name: string, inCharge?: string, description?: string): [string, HydrantClass] =>
    [number, { number, name, inCharge, description, lectureSections: [], recitationSections: [], labSections: [], terms: ['FA'], level: 'U' }];
  const cat = new Map<string, HydrantClass>([
    mk('6.1810', 'Operating System Engineering', 'M. Kaashoek', 'Design and implementation of operating systems.'),
    mk('6.1400', 'Computability and Complexity Theory', 'R. Williams', 'Turing machines, P vs NP.'),
    mk('6.1220', 'Design and Analysis of Algorithms', 'V. Williams', 'Divide and conquer, dynamic programming, graph algorithms.'),
    mk('11.138', 'Crowd Sourced City', 'S. Williams', 'Civic data and participatory design.'),
    mk('18.C06', 'Linear Algebra and Optimization', 'P. Parrilo', 'Linear algebra with applications to optimization.'),
    mk('6.8611', 'Quantitative Methods for NLP', 'J. Andreas, Y. Kim', 'Natural language processing with neural networks.'),
  ]);
  check('Kaashoek matched via listedAs', classesTaughtBy(cat, {name:'Frans Kaashoek', listedAs:'M. Kaashoek'}).map(c=>c.number).join()==='6.1810');
  check('Kaashoek NOT matched by first name alone (F vs M)', classesTaughtBy(cat, {name:'Frans Kaashoek'}).length===0);
  check('Ryan Williams gets only his class', classesTaughtBy(cat, {name:'Ryan Williams'}).map(c=>c.number).join()==='6.1400');
  check('Virginia Vassilevska Williams gets only hers', classesTaughtBy(cat, {name:'Virginia Vassilevska Williams'}).map(c=>c.number).join()==='6.1220');
  check('Sarah Williams gets only hers', classesTaughtBy(cat, {name:'Sarah Williams'}).map(c=>c.number).join()==='11.138');
  check('Parrilo -> 18.C06', classesTaughtBy(cat, {name:'Pablo Parrilo'}).map(c=>c.number).join()==='18.C06');
  check('co-instructor found', classesTaughtBy(cat, {name:'Yoon Kim'}).map(c=>c.number).join()==='6.8611');
  const idx = instructorIndex(cat);
  check('index has one entry per instructor', idx.length===7, String(idx.length));
  check('index-based lookup agrees', classesFor(idx, {name:'Jacob Andreas'}).map(c=>c.number).join()==='6.8611');
  check('number prefix search', searchClasses(cat, '6.1').map(c=>c.number).join()==='6.1220,6.1400,6.1810');
  check('exact number ranks first', searchClasses(cat, '18.C06')[0]?.number==='18.C06');
  check('title word search', searchClasses(cat, 'algorithms')[0]?.number==='6.1220');
  check('instructor surname search finds the class', searchClasses(cat, 'parrilo')[0]?.number==='18.C06');
  check('description search works', searchClasses(cat, 'turing').map(c=>c.number).join()==='6.1400');
  check('instructor search by surname', searchInstructors(cat, 'williams').length===3);
  check('instructor search is case-insensitive', searchInstructors(cat, 'KAASHOEK')[0]?.display==='M. Kaashoek');
  check('full name search matches the printed initial + surname', searchInstructors(cat, 'frans kaashoek')[0]?.display==='M. Kaashoek');
  check('full name with matching initial ranks first', searchInstructors(cat, 'ryan williams')[0]?.display==='R. Williams');
  check('unknown surname yields nothing', searchInstructors(cat, 'max tegmark').length===0);
  check('multi-word class search requires every word', searchClasses(cat, 'operating turing').length===0 && searchClasses(cat, 'operating system').length===1);
  const xl = collapseCrossListed([
    ...cat.values(),
    mk('6.C06', 'Linear Algebra and Optimization', 'P. Parrilo', 'same class')[1],
  ]);
  const parrilo = xl.find(g=>g.primary.number==='18.C06');
  check('cross-listed numbers collapse into one line', Boolean(parrilo) && parrilo!.aliases.join()==='6.C06', JSON.stringify(parrilo?.aliases));
  check('distinct classes stay separate', xl.length===cat.size);
  check('"outing" does not match "routing" in a description',
    searchClasses(new Map([mk('6.5820','Computer Networks','H. Balakrishnan','Internet routing, router design.')]), 'outing').length===0);
  check('word-start match still finds "routing"',
    searchClasses(new Map([mk('6.5820','Computer Networks','H. Balakrishnan','Internet routing, router design.')]), 'routing').length===1);
  const sections = new Map([mk('7.340','Advanced Undergraduate Seminar','H. R. Horvitz','Seminars in biology.'), mk('7.341','Advanced Undergraduate Seminar','H. R. Horvitz','Seminars in biology.'), mk('7.342','Advanced Undergraduate Seminar','H. R. Horvitz','Seminars in biology.')]);
  const groups = searchClassGroups(sections, 'horvitz');
  check('sectioned seminar collapses to one result', groups.length===1 && groups[0].aliases.join()==='7.341,7.342', JSON.stringify(groups.map(g=>[g.primary.number,g.aliases])));
}

// --- search ranking ---
{
  check('tokenize keeps course-number-ish tokens', tokenize('18.C06 pset').join('|')==='18.c06|pset');
  check('every word must match: "max tegmark" finds Tegmark only', searchProfessors(PROFESSORS, 'max tegmark').map(p=>p.id).join()==='tegmark');
  check('"max" alone does not drag in unrelated people', !searchProfessors(PROFESSORS, 'max zeldovich').length);
  check('a name reads as a name', looksLikeName('max tegmark') && looksLikeName('tegmark') && looksLikeName("o'brien"));
  check('a course number does not', !looksLikeName('18.C06') && !looksLikeName('6.1810 kaashoek'));
  check('four words is not a name', !looksLikeName('a b c d'));
  check('person lookups point at MIT and public searches', personLookups('Max Tegmark').map(l=>l.label).join('|')==='MIT directory|MIT site search|Google Scholar ↗|LinkedIn ↗');
  check('professor search by surname', searchProfessors(PROFESSORS, 'demaine')[0]?.id==='demaine');
  check('professor search by lab', searchProfessors(PROFESSORS, 'PDOS').map(p=>p.id).sort().join()==='kaashoek,zeldovich');
  check('professor search by area', searchProfessors(PROFESSORS, 'quantum computing').length>=3);
  check('professor search by course taught', searchProfessors(PROFESSORS, '18.C06').map(p=>p.id).sort().join()==='moitra,parrilo');
  check('too-short query yields nothing', searchProfessors(PROFESSORS, 'a').length===0);
  const dir = [
    { id:'group:1', name:'MIT Outing Club', description:'Hiking, climbing, skiing.', calendarUrl:'x', kind:'group' as const },
    { id:'group:2', name:'Ballroom Dance Team', description:'Competitive ballroom.', calendarUrl:'x', kind:'group' as const },
    { id:'department:3', name:'Computer Science and Artificial Intelligence Laboratory (CSAIL)', description:'AI and systems research.', calendarUrl:'x', kind:'department' as const },
  ];
  check('directory name match', searchDirectory(dir, 'outing')[0]?.name==='MIT Outing Club');
  check('directory description match', searchDirectory(dir, 'climbing')[0]?.name==='MIT Outing Club');
  check('directory acronym match', searchDirectory(dir, 'csail')[0]?.kind==='department');
  check('department lookup 6.x', departmentOf('6.1810')==='EECS (Course 6)');
  check('department lookup 18.C06', departmentOf('18.C06')==='Mathematics (Course 18)');
  check('department lookup 21M', departmentOf('21M.301')==='Music & Theater Arts (21M)');
  check('department lookup MAS', departmentOf('MAS.863')==='Media Arts & Sciences (Media Lab)');
  check('unknown prefix undefined', departmentOf('ZZ.101')===undefined);
}

// --- query intent ---
{
  const k = (q: string) => parseIntent(q).kind;
  check('"max tegmark" is a name', k('max tegmark')==='name');
  check('"tegmark" is a name', k('tegmark')==='name');
  check('"m. tegmark" is a name', k('m. tegmark')==='name');
  check('three plain words read as a topic, not a name', k('automatic speech recognition')==='topic');
  check('"professors in the philosophy department" is a department', k('professors in the philosophy department')==='department');
  check('...mapped to Course 24', parseIntent('professors in the philosophy department').department?.prefixes.join()==='24');
  check('"eecs faculty" is a department', parseIntent('eecs faculty').department?.prefixes.join()==='6');
  check('"physics" alone is a department', k('physics')==='department');
  check('"professors doing research in automatic speech recognition systems" is a topic',
    k('professors doing research in automatic speech recognition systems')==='topic');
  check('...with the sentence stripped off', parseIntent('professors doing research in automatic speech recognition systems').subject==='automatic speech recognition systems');
  check('"who works on quantum error correction" is a topic', parseIntent('who works on quantum error correction').subject==='quantum error correction');
  check('"mit poker club" is general', k('mit poker club')==='general');
  check('...requiring only "poker"', requiredTokens('show me upcoming events for the mit poker club').join()==='poker');
  check('a course number is general', k('18.C06')==='general');
  check('filler-only queries fall back to all tokens', requiredTokens('the club').length>0);
  check('every department has a homepage to point at', DEPARTMENTS.every(d=>/^https:\/\/[a-z.-]+\.mit\.edu\/?$/.test(d.info.website)), DEPARTMENTS.filter(d=>!d.info.website).map(d=>d.info.name).join());
}

// --- clubs seen on Engage ---
{
  const ev = (o: Partial<ScoredEvent>): ScoredEvent => ({
    id: o.id ?? 'x', source: 'mit', sourceId: 'engage:1', kind: 'club_event', lane: 'opportunity', title: 't',
    start: new Date(Date.now()+864e5).toISOString(), allDay: false, people: [], topics: [], tags: [], confidence: 1,
    firstSeenAt: '', updatedAt: '', score: 0.5, urgency: 0, reasons: [], ...o,
  });
  const evs = [
    ev({ id: 'p1', title: 'Pokerbots Meeting for Recruitment', organizer: 'Pokerbots' }),
    ev({ id: 'o1', title: 'Day Hike', organizer: 'MIT Outing Club' }),
    ev({ id: 'c1', title: 'Talk', organizer: 'CSAIL', source: 'outlook' }),
  ];
  check('"mit poker club" finds Pokerbots via its events', clubsFromEvents(evs, 'mit poker club').map(c=>c.name).join()==='Pokerbots');
  check('"outing" finds the Outing Club', clubsFromEvents(evs, 'outing').map(c=>c.name).join()==='MIT Outing Club');
  check('non-campus sources are not clubs', clubsFromEvents(evs, 'csail').length===0);
}

// --- ICS ORGANIZER -> club name ---
{
  const ics = ['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:abc','SUMMARY:Pokerbots Meeting for Recruitment',
    'ORGANIZER;CN="Pokerbots":mailto:noreply@engage.mit.edu','DTSTART:20261001T230000Z','DTEND:20261002T000000Z','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const { events } = parseICS(ics);
  check('ORGANIZER CN becomes the organizer', events[0]?.organizer==='Pokerbots', events[0]?.organizer);
}

// --- Engage listing parser ---
{
  const html = `<ul class="list-group"><li class="list-group-item" style="padding: 20px 15px;">
    <fieldset><legend><span class="sr-only">Poker Club</span></legend>
    <div class="row" role="group" aria-label="Poker Club"><div><input id="cb_club_52825" type="checkbox" />
    <label for="cb_club_52825"><span class="visually-hidden">Select Poker Club's group. Select the group and click on the Join button at the bottom of the page to register for this group</span></label></div>
    <div><h4>Poker Club</h4><p>ASA Student Organization - Games and Puzzles</p>
    <a href="http://poker.mit.edu/">Website</a> <a href="javascript:;">Mission</a>
    <p>Contact: Michelle Xing , Alice Liu , Email group officers</p>
    <div>Mission The purpose of this club is to create a community with like interests and also create a better understanding in the game of poker. Membership Benefits Lifetime</div></div></div></fieldset></li>
    <li class="list-group-item"><div class="row" role="group" aria-label="Pokerbots"><input id="cb_club_52826" /><h4>Pokerbots</h4><p>ASA Student Organization - Academic</p></div></li></ul>`;
  const clubs = parseEngageClubs(html);
  check('two clubs parsed', clubs.length===2, String(clubs.length));
  check('name and id', clubs[0]?.name==='Poker Club' && clubs[0]?.id==='52825');
  check('website picked, javascript links ignored', clubs[0]?.website==='http://poker.mit.edu/');
  check('category parsed', clubs[0]?.category==='ASA Student Organization - Games and Puzzles', clubs[0]?.category);
  check('mission parsed, benefits trimmed', clubs[0]?.mission?.startsWith('The purpose of this club')===true && !/Membership/.test(clubs[0]?.mission ?? ''), clubs[0]?.mission);
  check('officers parsed', clubs[0]?.officers.join('|')==='Michelle Xing|Alice Liu', clubs[0]?.officers.join('|'));
  check('engage deep link', clubs[1]?.engageUrl.includes('search=Pokerbots')===true);
  check('garbage html yields nothing', parseEngageClubs('<html></html>').length===0);
}

// --- new assistant actions validate ---
{
  check('mute_keyword needs a value', validate({kind:'mute_keyword'})===null && validate({kind:'mute_keyword', value:'prayer'})?.value==='prayer');
  check('follow_club accepted', validate({kind:'follow_club', value:'Pokerbots'})?.kind==='follow_club');
  check('search accepted', validate({kind:'search', value:'poker'})?.value==='poker');
  check('dismiss_event accepted', validate({kind:'dismiss_event', value:'Prayer Night'})?.kind==='dismiss_event');
  check('unknown kinds rejected', validate({kind:'delete_everything' as never, value:'x'})===null);
}

// --- Engage RSS ---
{
  const soon = new Date(Date.now()+3*864e5); const iso = soon.toISOString().replace(/\.\d{3}Z$/, '.0000000-04:00');
  const xml = `<rss><channel><item><eventId>1</eventId><eventUid>u1</eventUid><group>Poker Club</group><groupType>ASA Student Organization</groupType>
    <title>Fall Tournament</title><fullDescription>Buy-in free. &#xD;&#xA;Prizes!</fullDescription><eventStartDateTime>${iso}</eventStartDateTime>
    <eventEndDateTime>${new Date(soon.getTime()+2*36e5).toISOString()}</eventEndDateTime><eventLocation>26-100</eventLocation><link>https://engage.mit.edu/MPC/rsvp?id=1</link>
    <foodProvided>1</foodProvided><eventTopics>Fun</eventTopics><privacyLevel>0</privacyLevel><allDayEvent>0</allDayEvent></item>
    <item><eventId>2</eventId><group>The Tech</group><title>Ads 2026</title><eventStartDateTime>${iso}</eventStartDateTime><eventEndDateTime>${new Date(soon.getTime()+400*864e5).toISOString()}</eventEndDateTime><privacyLevel>0</privacyLevel></item>
    </channel></rss>`;
  const win = { since: new Date().toISOString(), until: new Date(Date.now()+21*864e5).toISOString() };
  const items = parseEngageRss(xml, win);
  check('RSS: one real event parsed, year-long "ticket sale" dropped', items.length===1, String(items.length));
  check('RSS: club is the organizer', items[0]?.hints.organizer==='Poker Club');
  check('RSS: free food flagged from foodProvided', items[0]?.hints.topics?.includes('free food')===true);
  check('RSS: description decoded', /Buy-in free\. Prizes!/.test(items[0]?.hints.description ?? ''), items[0]?.hints.description);
  check('RSS: structured (has a start)', Boolean(items[0]?.hints.start));
}

// --- club website blocks ---
{
  const text = ['MIT Poker Club', 'Welcome to MIT Poker Club! We provide a fun learning environment.', '',
    'Events', 'Fall Tournament', 'Monday, September 22 at 7:00 PM in 26-100. Free entry, prizes for the top 8.', '',
    'Officers', 'Michelle Xing, President'].join('\n');
  const blocks = datedBlocks(text);
  check('only the dated block survives', blocks.length===1 && /Fall Tournament/.test(blocks[0]), JSON.stringify(blocks));
  check('undated pages yield nothing', datedBlocks('Welcome to the club. We meet often.').length===0);
}

// --- audience ---
{
  const base = { id:'x', source:'mit' as const, sourceId:'s', kind:'talk' as const, lane:'opportunity' as const, title:'t', start:new Date().toISOString(), allDay:false, people:[], tags:[], confidence:1, firstSeenAt:'', updatedAt:'' };
  const undergrad = { ...DEFAULT_PROFILE, degreeLevel: "Bachelor's" as const };
  check('faculty-only event is flagged', audienceMismatch({ ...base, topics:['audience:faculty','audience:staff'] }, undergrad)==='Aimed at faculty, staff');
  check('students event is fine', audienceMismatch({ ...base, topics:['audience:students','audience:mit community'] }, undergrad)===null);
  check('untagged event is fine', audienceMismatch({ ...base, topics:[] }, undergrad)===null);
  check('"for graduate students" text flagged for an undergrad', audienceMismatch({ ...base, topics:[], description:'Open to graduate students in the department.' }, undergrad)==='Aimed at graduate students');
  check('...but not when undergrads are welcome too', audienceMismatch({ ...base, topics:[], description:'Open to graduate students and undergraduates.' }, undergrad)===null);
  check('...and not for a PhD student', audienceMismatch({ ...base, topics:[], description:'Open to graduate students.' }, { ...DEFAULT_PROFILE, degreeLevel:'PhD' })===null);
}

// --- series keys ---
{
  check('weekly meetings share a key', seriesKey('International Christian Fellowship')===seriesKey('International Christian Fellowship (Week 3)'));
  check('dates stripped', seriesKey('Poker Night 9/22')===seriesKey('Poker Night 10/6'));
  check('different events differ', seriesKey('Anime Club Screening')!==seriesKey('Ballroom Lessons'));
}

// --- preset suggestions ---
{
  const day0 = new Date(); day0.setHours(0,0,0,0);
  const days = [0,1,2].map(i => { const d=new Date(day0); d.setDate(d.getDate()+i); return { day: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, date:d, sessions:[], commitments:[], due:[], plannedHours:0, capacityHours:4, over:false }; });
  const at = (i:number,h:number)=>{ const d=new Date(day0); d.setDate(d.getDate()+i); d.setHours(h); return d.toISOString(); };
  const ev = (o: any) => ({ id:o.id, source:'mit', sourceId:'s', kind:o.kind??'club_event', lane:'opportunity', title:o.title??'t', start:o.start, allDay:false, people:[], topics:[], tags:[], confidence:1, firstSeenAt:'', updatedAt:'', score:o.score, urgency:0, reasons:o.reasons??[] });
  const matched = ev({ id:'m', title:'Robotics Build Night', start:at(0,19), score:0.6, reasons:[{code:'field_match',delta:0.2,label:''}] });
  const catOnly = ev({ id:'c', title:'Anime Screening', start:at(0,20), score:0.35 });
  const weak = ev({ id:'w', title:'Bake sale', start:at(1,12), score:0.15 });
  const post = (o:any) => ({ id:o.id, source:'simplify', kind:'internship', company:o.company, title:o.title??'Intern', locations:[], deadline:null, requirements:[], url:'u', terms:[], topics:[], score:o.score??0.4, reasons:[], followed:o.followed??false, eligible:o.eligible??true, nearCampus:false });
  const postings = [post({id:'p1',company:'Citadel',followed:true}), post({id:'p2',company:'Acme',score:0.5}), post({id:'p3',company:'NoFit',score:0.1}), post({id:'p4',company:'PhDCo',eligible:false,followed:true})];
  const social = suggestFor(days as any, 'social', [matched,catOnly,weak] as any, postings as any);
  check('social preset offers matched AND category-only events', (social.get(days[0].day)??[]).filter(s=>s.kind==='event').length===2);
  check('social preset offers no applications', ![...social.values()].flat().some(s=>s.kind==='apply'));
  check('weak events are not offered', !(social.get(days[1].day)??[]).some(s=>s.kind==='event'));
  const intern = suggestFor(days as any, 'internships', [matched,catOnly] as any, postings as any);
  const applies = [...intern.values()].flat().filter(s=>s.kind==='apply') as any[];
  check('internships preset adds application prompts', applies.length===2, String(applies.length));
  check('followed company comes first', applies[0]?.posting.company==='Citadel');
  check('ineligible postings are never suggested', !applies.some(a=>a.posting.company==='PhDCo'));
  check('internships preset: only a matched event, not the category-only one', (intern.get(days[0].day)??[]).filter(s=>s.kind==='event').map((s:any)=>s.event.id).join()==='m');
  const grades = suggestFor(days as any, 'coursework', [matched] as any, postings as any);
  check('grades-first suggests nothing', [...grades.values()].flat().length===0);
  const balanced = suggestFor(days as any, 'balanced', [matched,catOnly] as any, postings as any);
  check('balanced: one matched event, followed applications only', (balanced.get(days[0].day)??[]).length===2 && !(balanced.get(days[2].day)??[]).some(s=>s.kind==='apply'));
}

// --- fixture connector produces structured items of every kind ---
(async () => {
  const items = await mitFixture.fetch({}, defaultWindow(21, 0));
  check('fixture yields items', items.length >= 10, String(items.length));
  check('every fixture item is structured (has a start)', items.every(i=>Boolean(i.hints.start)));
  const kinds = new Set(items.map(i=>i.hints.kind));
  check('fixtures cover talks', kinds.has('talk'));
  check('fixtures cover research', kinds.has('urop'));
  check('fixtures cover career', kinds.has('career'));
  check('fixtures cover club events', kinds.has('club_event'));
  check('fixture ids are unique', new Set(items.map(i=>i.sourceId)).size===items.length);
  check('all items carry the mit source', items.every(i=>i.source==='mit'));

  // --- migration of stored source ids ---
  check('elx migrates to mit', migrateSources(['canvas','outlook','elx']).join(',')==='canvas,outlook,mit');
  check('slack is dropped', !migrateSources(['canvas','slack']).includes('slack' as never));
  check('unknown ids are dropped', migrateSources(['canvas','banana']).join(',')==='canvas');
  check('duplicates collapse', migrateSources(['elx','mit']).join(',')==='mit');
  check('garbage yields an empty list', migrateSources('nope').length===0);

  // --- attendance courses ---
  check('PE.0521 is attendance', isAttendanceCourse({code:'PE.0521'}));
  check('bare PE is attendance', isAttendanceCourse({code:'PE'}));
  check('PE_FA26 is attendance', isAttendanceCourse({code:'PE_FA26'}));
  check('"PE & Wellness" by name is attendance', isAttendanceCourse({code:'XYZ', name:'PE & Wellness: Tennis'}));
  check('6.1010 is not', !isAttendanceCourse({code:'6.1010'}));
  check('PEP-something is not (needs a separator)', !isAttendanceCourse({code:'PEP101'}));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
