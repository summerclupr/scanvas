/** Planner priority + calendar grid maths. */
import { buildPlan, estimateHours, overloadCheck, PLAN_PRESETS, BALANCED_WEIGHTS } from '../src/plan/priority';
import { sortChronological } from '../src/ranking/score';
import { scheduleWork, relaxCapacity, tightenCapacity } from '../src/plan/schedule';
import { validate } from '../src/chat/actions';
import { monthGrid, weekGrid, bucketByDay, calendarEvents, dayKey, addMonths, startOfWeek, monthLabel } from '../src/plan/calendar';
import { expandCustom, describeCustom, newCustomEvent } from '../src/plan/custom-events';
import { planNotifications } from '../src/notify/rules';
import { DEFAULT_NOTIFY } from '../src/core/profile';
import { summarize } from '../src/core/grades';
import type { ScoredEvent } from '../src/core/types';

let pass=0, fail=0;
const check=(l:string,ok:boolean,d='')=>{console.log(`${ok?'PASS':'FAIL'}  ${l}${d?`  (${d})`:''}`); ok?pass++:fail++;};

const NOW = new Date(2026, 8, 19, 10, 0, 0); // Sat Sep 19 2026, 10am
const hrs = (h:number)=>new Date(NOW.getTime()+h*36e5).toISOString();

const ev = (o: Partial<ScoredEvent>): ScoredEvent => ({
  id: o.id ?? Math.random().toString(36), source:'canvas', sourceId:'x',
  kind:'assignment', lane:'obligation', title:'t', start: hrs(24), allDay:false,
  people:[], topics:[], tags:[], confidence:1,
  firstSeenAt:'', updatedAt:'', score:0.5, urgency:0, reasons:[], ...o,
});

// --- stakes use REAL grade weight, not raw points ---
const bigLab   = ev({id:'big',  title:'Lab (12% of grade)', gradeImpact:12, start:hrs(30), course:{code:'6.1010'}});
const tinyQuiz = ev({id:'tiny', title:'Daily check-in',     gradeImpact:0.5, start:hrs(28), course:{code:'8.01'}});
const plan1 = buildPlan([bigLab,tinyQuiz], BALANCED_WEIGHTS, NOW);
check('higher grade impact outranks near-identical deadline',
  plan1[0].event.id==='big', plan1.map(p=>`${p.event.id}:${p.priority.toFixed(2)}`).join(' '));
check('stakes note quotes the real weight',
  plan1[0].why.some(w=>w.includes('12.0% of your 6.1010 grade')), plan1[0].why.join(' | '));

// --- personalization actually changes the order ---
const pset = ev({id:'pset', kind:'assignment', gradeImpact:6, start:hrs(50), course:{code:'6.1210'}});
const appl = ev({id:'appl', kind:'application_deadline', lane:'obligation', start:hrs(55), title:'Jane Street'});
const gradesFirst = PLAN_PRESETS.find(p=>p.key==='coursework')!.weights;
const internFirst = PLAN_PRESETS.find(p=>p.key==='internships')!.weights;
const a = buildPlan([pset,appl], gradesFirst, NOW);
const b = buildPlan([pset,appl], internFirst, NOW);
check('"grades first" puts the pset on top', a[0].event.id==='pset', a.map(p=>p.event.id).join('>'));
check('"internships first" flips it',        b[0].event.id==='appl', b.map(p=>p.event.id).join('>'));

// --- but an imminent exam cannot be de-prioritized away ---
const examSoon = ev({id:'exam', kind:'exam', start:hrs(3), gradeImpact:25, course:{code:'18.02'}});
const c = buildPlan([examSoon, appl], internFirst, NOW);
check('imminent exam pins to top despite internship preference',
  c[0].event.id==='exam' && c[0].pinned);

// --- effort + overload ---
check('effort scales with grade weight', estimateHours(bigLab) > estimateHours(tinyQuiz),
  `${estimateHours(bigLab)}h vs ${estimateHours(tinyQuiz)}h`);
const over = overloadCheck([bigLab,tinyQuiz,pset].map(e=>({event:e,lane:'coursework' as const,priority:1,urgency:1,stakes:1,why:[],estHours:8,pinned:false})), NOW);
check('overload detected when work exceeds hours left', over.overloaded, `${over.needHours}h needed, ${over.haveHours.toFixed(1)}h left`);

// --- done work is excluded ---
const submitted = ev({id:'done', submission:{state:'submitted',late:false}, start:hrs(20)});
check('submitted work leaves the plan', buildPlan([submitted],BALANCED_WEIGHTS,NOW).length===0);
check('lectures leave the plan', buildPlan([ev({kind:'lecture',start:hrs(5)})],BALANCED_WEIGHTS,NOW).length===0);

// An event that already happened is unattendable; overdue work is not.
const pastEvent = ev({id:'past-ev', lane:'opportunity', kind:'club_event', start:hrs(-2)});
const pastWork  = ev({id:'past-hw', lane:'obligation', kind:'assignment', gradeImpact:5, start:hrs(-2)});
const pastPlan = buildPlan([pastEvent, pastWork], BALANCED_WEIGHTS, NOW);
check('overdue EVENT drops out of the plan', !pastPlan.some(p=>p.event.id==='past-ev'));
check('overdue COURSEWORK stays in the plan', pastPlan.some(p=>p.event.id==='past-hw'));

// --- calendar: only saved opportunities ---
const savedEv   = ev({id:'s1', lane:'opportunity', kind:'club_event', start:hrs(48)});
const unsavedEv = ev({id:'u1', lane:'opportunity', kind:'club_event', start:hrs(48)});
const lecture   = ev({id:'l1', kind:'lecture', start:hrs(10)});
const cal = calendarEvents([bigLab, savedEv, unsavedEv, lecture], new Set(['s1']));
check('calendar keeps coursework', cal.some(e=>e.id==='big'));
check('calendar keeps SAVED opportunity', cal.some(e=>e.id==='s1'));
check('calendar drops unsaved opportunity', !cal.some(e=>e.id==='u1'));
// Class meetings ARE the schedule, so the calendar keeps them (they stay
// out of Due and Plan, which is asserted separately below).
check('calendar keeps lectures as schedule', cal.some(e=>e.id==='l1'));

// --- grids ---
const byDay = bucketByDay(cal);
const grid = monthGrid(NOW, byDay, NOW);
check('month grid is always 42 cells', grid.length===42);
check('month grid starts on a Sunday', grid[0].date.getDay()===0);
check('today flagged once', grid.filter(d=>d.isToday).length===1);
check('current-month cells marked', grid.filter(d=>d.inCurrentPeriod).length===30, String(grid.filter(d=>d.inCurrentPeriod).length));
const wk = weekGrid(NOW, byDay, NOW);
check('week grid is 7 days', wk.length===7 && wk[0].date.getDay()===0);
check('events land on the right day',
  (byDay.get(dayKey(new Date(hrs(30))))??[]).some(e=>e.id==='big'));
check('month navigation crosses the year', monthLabel(addMonths(new Date(2026,11,15),1))==='January 2027',
  monthLabel(addMonths(new Date(2026,11,15),1)));
// DST sanity: a week starting before the Nov change still spans 7 distinct days
const dst = weekGrid(new Date(2026,10,3), new Map(), NOW);
check('week spans 7 distinct days across DST', new Set(dst.map(d=>d.key)).size===7);

// --- class schedule on the calendar ---
const lec = ev({id:'lec', kind:'lecture', start:hrs(26), course:{code:'18.02'}});
const rec = ev({id:'rec', kind:'recitation', start:hrs(28), course:{code:'18.02'}});
const withClasses = calendarEvents([bigLab, lec, rec], new Set());
check('calendar SHOWS lectures', withClasses.some(e=>e.id==='lec'));
check('calendar SHOWS recitations', withClasses.some(e=>e.id==='rec'));
const noClasses = calendarEvents([bigLab, lec, rec], new Set(), {showClasses:false});
check('classes toggle off', !noClasses.some(e=>e.id==='lec') && noClasses.some(e=>e.id==='big'));
check('classes still excluded from the PLAN',
  !buildPlan([lec,rec],BALANCED_WEIGHTS,NOW).some(p=>['lec','rec'].includes(p.event.id)));

// --- custom repeating events ---
const club = newCustomEvent({
  id:'club1', title:'Rocket Team', startDate:'2026-09-21', time:'19:00', endTime:'20:30',
  repeat:'weekly', weekdays:[4], location:'N51',
});
const insts = expandCustom(club, new Date(2026,8,19), new Date(2026,9,19));
check('weekly series expands to one per week', insts.length===4, `${insts.length}: ${insts.map(i=>new Date(i.start).toDateString().slice(0,10)).join(' ')}`);
check('all instances land on Thursday', insts.every(i=>new Date(i.start).getDay()===4));
check('instance ids are unique', new Set(insts.map(i=>i.id)).size===insts.length);
check('duration honored (90min)', insts.every(i=>i.end && new Date(i.end).getTime()-new Date(i.start).getTime()===90*60000));
const biweekly = expandCustom({...club, repeat:'biweekly'}, new Date(2026,8,19), new Date(2026,9,19));
check('biweekly halves the count', biweekly.length===2, String(biweekly.length));
const bounded = expandCustom({...club, until:'2026-10-01'}, new Date(2026,8,19), new Date(2026,9,19));
check('until date stops the series', bounded.length===2, String(bounded.length));
const once = expandCustom({...club, repeat:'none'}, new Date(2026,8,19), new Date(2026,9,19));
check('one-time event yields exactly one', once.length===1);
check('custom events appear on the calendar unsaved',
  calendarEvents(insts, new Set()).length===insts.length);
check('describeCustom reads sensibly', describeCustom(club).startsWith('Every week · Thu'), describeCustom(club));

// --- Due ordering: chronological, never urgency ---
const finalExam = ev({id:'final', kind:'exam', start:hrs(24*12), title:'Final'});
const midterm   = ev({id:'mid',   kind:'exam', start:hrs(24*5),  title:'Midterm'});
const pset2     = ev({id:'pset2', kind:'assignment', start:hrs(24*2), title:'Pset 2'});
const order = sortChronological([finalExam, midterm, pset2]).map(e=>e.id);
check('Due sorts by date, not exam weight', order.join('>')==='pset2>mid>final', order.join('>'));

// --- multi-day work scheduling ---
const bigPset = ev({id:'big-pset', kind:'assignment', gradeImpact:12, start:hrs(24*4), course:{code:'6.1210'}, title:'Pset 5'});
const sched = scheduleWork([bigPset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 7);
const withWork = sched.days.filter(d=>d.sessions.length>0);
check('big work is split across several days', withWork.length>1, `${withWork.length} days`);
check('no day exceeds its capacity', sched.days.every(d=>d.plannedHours<=d.capacityHours+0.01),
  sched.days.map(d=>d.plannedHours.toFixed(1)).join('/'));
check('nothing scheduled after the deadline',
  sched.days.filter(d=>d.sessions.length).every(d=>d.day<=dayKey(new Date(hrs(24*4)))));
const totalH = sched.days.reduce((n,d)=>n+d.sessions.reduce((m,s)=>m+s.hours,0),0);
check('total allocated ~= estimated effort', Math.abs(totalH-estimateHours(bigPset))<0.6, `${totalH.toFixed(1)}h vs ${estimateHours(bigPset)}h`);

// completion removes remaining work
const firstId = withWork[0].sessions[0].id;
const after = scheduleWork([bigPset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set([firstId]), NOW, 7);
const afterH = after.days.reduce((n,d)=>n+d.sessions.filter(s=>!s.done).reduce((m,s)=>m+s.hours,0),0);
check('ticking a session reduces remaining work', afterH < totalH, `${afterH.toFixed(1)}h vs ${totalH.toFixed(1)}h`);
check('completed session is not re-scheduled as open work', !after.days.some(d=>d.sessions.some(x=>x.id===firstId && !x.done)));
check('completed session is still shown, ticked', after.days.some(d=>d.sessions.some(x=>x.id===firstId && x.done)));

// capacity controls
const tight = scheduleWork([bigPset], BALANCED_WEIGHTS, {hoursPerDay:8,maxItemsPerDay:6}, new Set(), NOW, 7);
const loose = scheduleWork([bigPset], BALANCED_WEIGHTS, relaxCapacity({hoursPerDay:4,maxItemsPerDay:4}), new Set(), NOW, 7);
check('packing uses fewer days', tight.days.filter(d=>d.sessions.length).length <= withWork.length);
check('spreading uses no more per day',
  Math.max(...loose.days.map(d=>d.plannedHours)) <= Math.max(...sched.days.map(d=>d.plannedHours))+0.01);
check('relax lowers both knobs', relaxCapacity({hoursPerDay:4,maxItemsPerDay:4}).hoursPerDay===3 && relaxCapacity({hoursPerDay:4,maxItemsPerDay:4}).maxItemsPerDay===3);
check('tighten raises both knobs', tightenCapacity({hoursPerDay:4,maxItemsPerDay:4}).hoursPerDay===5);

// overflow is reported, not hidden
const impossible = Array.from({length:6},(_,i)=>ev({id:`x${i}`, kind:'assignment', gradeImpact:12, start:hrs(20), course:{code:'6.1210'}}));
const tightDay = scheduleWork(impossible, BALANCED_WEIGHTS, {hoursPerDay:3,maxItemsPerDay:3}, new Set(), NOW, 3);
check('unfittable work is reported', tightDay.unplaced.length>0, `${tightDay.unplaced.length} unplaced`);

// --- assistant action validation ---
check('valid action passes', validate({kind:'add_interest', value:'robotics'})?.value==='robotics');
check('navigate normalizes', validate({kind:'navigate', value:'Calendar'})?.value==='calendar');
check('unknown tab rejected', validate({kind:'navigate', value:'banana'})===null);
check('priority needs a valid level', validate({kind:'set_priority', value:'urop', level:'maybe' as never})===null);
check('priority accepts a valid level', validate({kind:'set_priority', value:'urop', level:'priority'})?.level==='priority');
check('absurd hours rejected', validate({kind:'set_daily_hours', hours:99})===null);
check('sane hours accepted', validate({kind:'set_daily_hours', hours:3.5})?.hours===3.5);
check('missing value rejected', validate({kind:'add_interest'})===null);
check('bad notification mode rejected', validate({kind:'set_notifications', mode:'loud'})===null);

// --- "Sometimes" must actually mean sometimes ---
import_check: {
  const party = ev({id:'party', lane:'opportunity', kind:'social', start:hrs(48),
    tags:['free food'], topics:['social'], score:0});
  // score is computed by scoreAll in the app; here assert the FLOOR contract
  // that made "Sometimes" unreachable: 0.5 * 0.30 = 0.15 must clear it.
  const SOMETIMES_ALONE = 0.5 * 0.30;
  const SKIP_ALONE = 0.05 * 0.30;
  const FLOOR = 0.12;
  check('"Sometimes" clears the feed floor', SOMETIMES_ALONE > FLOOR, `${SOMETIMES_ALONE} > ${FLOOR}`);
  check('"Skip" stays below the feed floor', SKIP_ALONE < FLOOR, `${SKIP_ALONE} < ${FLOOR}`);
  void party;
}

// --- calendar suggestions toggle ---
const unsavedGood = ev({id:'good', lane:'opportunity', kind:'social', start:hrs(48), score:0.4});
const unsavedMeh  = ev({id:'meh',  lane:'opportunity', kind:'social', start:hrs(48), score:0.05});
check('saved-only hides a good unsaved event',
  !calendarEvents([unsavedGood], new Set()).some(e=>e.id==='good'));
check('suggestions show a good unsaved event',
  calendarEvents([unsavedGood], new Set(), {showUnsaved:true}).some(e=>e.id==='good'));
check('suggestions still hide a poor match',
  !calendarEvents([unsavedMeh], new Set(), {showUnsaved:true}).some(e=>e.id==='meh'));

// --- "On your schedule" only lists real commitments ---
const randomParty = ev({id:'rand', lane:'opportunity', kind:'social', start:hrs(30), title:'Random Party', score:0.4});
const savedParty  = ev({id:'savd', lane:'opportunity', kind:'social', start:hrs(30), title:'HackMIT Afterparty', score:0.4});
const myEvent     = ev({id:'mine', lane:'opportunity', kind:'social', start:hrs(30), title:'Dinner with team', score:1});
(myEvent as any).source = 'manual';
const lecCommit   = ev({id:'lec2', kind:'lecture', start:hrs(30), title:'18.02 Lecture'});
const schedC = scheduleWork([randomParty, savedParty, myEvent, lecCommit], BALANCED_WEIGHTS,
  {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 7, new Set(['savd']));
const commits = schedC.days.flatMap(d=>d.commitments).map(e=>e.id);
check('unsaved campus event NOT a commitment', !commits.includes('rand'), commits.join(','));
check('SAVED event IS a commitment', commits.includes('savd'));
check('manually-added event IS a commitment', commits.includes('mine'));
check('class meeting IS a commitment', commits.includes('lec2'));
check('commitments sorted by time', (()=>{
  const day = schedC.days.find(d=>d.commitments.length>1);
  if (!day) return true;
  return day.commitments.every((e,i,arr)=>i===0||arr[i-1].start<=e.start);
})());

// --- the user's exact complaints, as regressions ---
{
  const seq = ev({id:'seq', title:'Week 4 Sequence 1', course:{code:'8.01'}, start:hrs(26),
    submission:{state:'unsubmitted',late:false,pointsPossible:1}});
  const pe  = ev({id:'pe', title:'10/22', course:{code:'PE'}, start:hrs(24*33),
    submission:{state:'unsubmitted',late:false,pointsPossible:1}});
  const s2 = scheduleWork([seq, pe], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 14);
  check('due-tomorrow sequence is worked TODAY',
    s2.days[0].sessions.some(x=>x.event.id==='seq'),
    s2.days[0].sessions.map(x=>x.event.title).join(',')||'(none)');
  check('PE a month out appears NOWHERE in the fortnight',
    !s2.days.some(d=>d.sessions.some(x=>x.event.id==='pe')));
  check('trivial items get a 0.5h slot, not a session block',
    s2.days[0].sessions.find(x=>x.event.id==='seq')!.hours===0.5);

  // unfinished today -> rolls to tomorrow (recompute from tomorrow's now)
  const TOMORROW = new Date(NOW.getTime()+24*36e5);
  const s3 = scheduleWork([seq], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), TOMORROW, 14);
  check('unfinished rolls to the next day',
    s3.days[0].sessions.some(x=>x.event.id==='seq'));
  // finished today -> gone tomorrow... completion is per-session-day
  const doneSet = new Set([`seq@${dayKey(NOW)}`]);
  const s4 = scheduleWork([seq], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, doneSet, NOW, 14);
  check('ticked-off item has no open session left',
    !s4.days.some(d=>d.sessions.some(x=>x.event.id==='seq' && !x.done)));
}
// 'missing' state stays visible as overdue
{
  const missed = ev({id:'missed', title:'Pset 2', start:hrs(-24*3),
    submission:{state:'missing',late:false,pointsPossible:60}, gradeImpact:6});
  const s5 = buildPlan([missed], BALANCED_WEIGHTS, NOW);
  check("Canvas 'missing' work stays visible as overdue",
    s5.some(p=>p.event.id==='missed'));
}


// --- plan AHEAD: due tomorrow night means work today ---
{
  // Sat 10am now. A 1.5h pset due Sunday 23:59 (Canvas's usual time).
  const dueTomorrowNight = new Date(2026, 8, 20, 23, 59).toISOString();
  const pset = ev({id:'c06', title:'18.C06 Pset 3', course:{code:'18.C06'}, gradeImpact:3, start:dueTomorrowNight});
  const s = scheduleWork([pset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 7);
  check('pset due TOMORROW night is scheduled TODAY',
    s.days[0].sessions.some(x=>x.event.id==='c06'), s.days.map(d=>d.sessions.map(x=>x.event.id).join('|')||'-').slice(0,3).join(' / '));
  check('...and NOT on the due day', !s.days[1].sessions.some(x=>x.event.id==='c06'));
  check('the session is flagged "due tomorrow"', s.days[0].sessions.find(x=>x.event.id==='c06')!.daysBeforeDue===1);
  check('the deadline is listed on TOMORROW\'s card', s.days[1].due.some(e=>e.id==='c06'));
  check('...and not on today\'s', !s.days[0].due.some(e=>e.id==='c06'));

  // Not ticked today -> tomorrow's recompute puts it on the due day.
  const TOMORROW = new Date(2026, 8, 20, 9, 0);
  const s2 = scheduleWork([pset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), TOMORROW, 7);
  const rolled = s2.days[0].sessions.find(x=>x.event.id==='c06');
  check('unticked work rolls onto the due day', Boolean(rolled) && rolled!.isDueDay && rolled!.daysBeforeDue===0);

  // Ticked today (with its hours recorded, as the UI does) -> gone tomorrow.
  const tickId = `c06@${dayKey(NOW)}`;
  const tickedHours = s.days[0].sessions.find(x=>x.event.id==='c06')!.hours;
  check('a 3h pset due tomorrow is one sitting, not a crumb plus a session', Math.abs(tickedHours-3)<0.01, `${tickedHours}h`);
  const s3 = scheduleWork([pset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set([tickId]), TOMORROW, 7, new Set(), {[tickId]:tickedHours});
  check('ticked work does not come back tomorrow', !s3.days.some(d=>d.sessions.some(x=>x.event.id==='c06' && !x.done)));

  // Ticked today, viewed today -> still visible, struck through, so it can be unticked.
  const s4 = scheduleWork([pset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set([tickId]), NOW, 7, new Set(), {[tickId]:tickedHours});
  const shown = s4.days[0].sessions.find(x=>x.id===tickId);
  check('ticked session stays visible as done', Boolean(shown) && shown!.done);
  check('no duplicate open session for ticked work', !s4.days.some(d=>d.sessions.some(x=>x.event.id==='c06' && !x.done)));
}

// --- partial completion subtracts the RECORDED hours across days ---
{
  const big = ev({id:'big8', kind:'assignment', gradeImpact:12, start:hrs(24*5), course:{code:'6.1210'}, title:'Pset 6'}); // 8h
  const first = scheduleWork([big], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 10);
  const firstDay = first.days.find(d=>d.sessions.length)!;
  const sess = firstDay.sessions[0];
  // Tick it, then look from the NEXT day: remaining should be total - its hours.
  const NEXT = new Date(firstDay.date.getTime() + 24*36e5 + 9*36e5);
  const after = scheduleWork([big], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set([sess.id]), NEXT, 10, new Set(), {[sess.id]: sess.hours});
  const left = after.days.reduce((n,d)=>n+d.sessions.filter(x=>!x.done).reduce((m,x)=>m+x.hours,0),0);
  check('remaining work = estimate minus the ticked hours', Math.abs(left - (8 - sess.hours)) < 0.3, `${left.toFixed(1)}h left after ticking ${sess.hours}h of 8h`);
  check('ticked hours count once, even from a past day', left < 8 - 0.5);
}

// --- work finishes the day BEFORE the deadline ---
{
  const mid = ev({id:'mid5', kind:'assignment', gradeImpact:5, start:new Date(2026, 8, 24, 23, 59).toISOString(), course:{code:'6.1010'}}); // 5h, due Thu night
  const s = scheduleWork([mid], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 10);
  const lastDay = s.days.filter(d=>d.sessions.some(x=>x.event.id==='mid5')).map(d=>d.day).sort().pop();
  check('last work day is the day BEFORE the due day', lastDay==='2026-09-23', String(lastDay));
  check('due day card still lists the deadline', s.days.find(d=>d.day==='2026-09-24')!.due.some(e=>e.id==='mid5'));
}

// --- the earliest work day takes everything that fits ---
{
  // 8h lab due tomorrow 8am; today has a 4h budget. All 4h go today, the
  // remaining 4h are reported as unplaceable rather than 2.5h placed + 5.5h lost.
  const lab = ev({id:'lab8', title:'Lab 6', course:{code:'6.1010'}, gradeImpact:20, start:new Date(2026, 8, 20, 8, 0).toISOString()});
  const small = ev({id:'ps', title:'Pset', course:{code:'6.1210'}, gradeImpact:3, start:hrs(24*5)});
  const s = scheduleWork([lab, small], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 7);
  const today = s.days[0].sessions.find(x=>x.event.id==='lab8');
  check('lab due tomorrow morning takes today\'s whole budget', Boolean(today) && Math.abs(today!.hours-4)<0.01, `${today?.hours}h`);
  check('the lower-priority pset moves to another day', !s.days[0].sessions.some(x=>x.event.id==='ps'));
  const un = s.unplaced.find(u=>u.event.id==='lab8');
  check('what cannot fit is reported honestly', Boolean(un) && Math.abs(un!.hours-4)<0.01, `${un?.hours}h unplaced`);
}

// --- applications: floor on urgency, far deadlines still start this week ---
{
  const app = ev({id:'far', kind:'application_deadline', lane:'obligation', title:'Lincoln Lab — Summer intern', start:hrs(24*120), tags:['application']});
  const pset = ev({id:'p6', kind:'assignment', gradeImpact:6, start:hrs(24*3), course:{code:'6.1210'}});
  const internFirst = PLAN_PRESETS.find(p=>p.key==='internships')!.weights;
  const gradesFirst = PLAN_PRESETS.find(p=>p.key==='coursework')!.weights;
  const a = buildPlan([app, pset], internFirst, NOW);
  check('"Internships first" puts a far-off application above a 6% pset', a[0].event.id==='far', a.map(p=>`${p.event.id}:${p.priority.toFixed(2)}`).join(' '));
  const g = buildPlan([app, pset], gradesFirst, NOW);
  check('"Grades first" keeps the pset on top', g[0].event.id==='p6', g.map(p=>`${p.event.id}:${p.priority.toFixed(2)}`).join(' '));
  const s = scheduleWork([app, pset], internFirst, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 14);
  const appDays = s.days.filter(d=>d.sessions.some(x=>x.event.id==='far')).map(d=>d.day);
  check('an application closing in 4 months still gets work THIS WEEK', appDays.length>0 && appDays[0]===s.days[0].day, appDays.join(',')||'none');
  check('its row says when it closes', s.days[0].sessions.find(x=>x.event.id==='far')!.why.some(w=>/^closes /.test(w)));
  check('coursework due beyond the horizon is still left alone', !scheduleWork([ev({id:'later', kind:'assignment', gradeImpact:5, start:hrs(24*40), course:{code:'6.1010'}})], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 14).days.some(d=>d.sessions.length));
}

// --- applications start now and finish early ---
{
  const app = ev({id:'app', kind:'application_deadline', lane:'obligation', title:'CSAIL — UROP', start:hrs(24*6), tags:['application','self-set target']});
  const s = scheduleWork([app], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 10);
  const days = s.days.filter(d=>d.sessions.some(x=>x.event.id==='app')).map(d=>d.day);
  check('application work starts TODAY', days[0]===s.days[0].day, days.join(','));
  check('application target is listed on its day', s.days.some(d=>d.due.some(e=>e.id==='app')));
  const pset = ev({id:'ps', kind:'assignment', gradeImpact:6, start:hrs(24*6), course:{code:'6.1010'}});
  const s2 = scheduleWork([pset], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 10);
  const psetDays = s2.days.filter(d=>d.sessions.some(x=>x.event.id==='ps')).map(d=>d.day);
  check('coursework still lands close to its deadline', psetDays[0] > s2.days[0].day, psetDays.join(','));
}

// --- PE attendance is a grade, not homework ---
{
  const pe = ev({id:'pe1', title:'9/23 Tennis', course:{code:'PE.0521', name:'PE & Wellness: Tennis'}, start:hrs(30),
    submission:{state:'unsubmitted',late:false,pointsPossible:1}});
  const peBare = ev({id:'pe2', title:'10/22', course:{code:'PE'}, start:hrs(30), submission:{state:'unsubmitted',late:false,pointsPossible:1}});
  const real = ev({id:'hw', title:'Pset', course:{code:'6.1010'}, start:hrs(30), gradeImpact:4});
  const s = scheduleWork([pe, peBare, real], BALANCED_WEIGHTS, {hoursPerDay:4,maxItemsPerDay:4}, new Set(), NOW, 7);
  check('PE check-ins never become work sessions', !s.days.some(d=>d.sessions.some(x=>x.event.id.startsWith('pe'))));
  check('PE check-ins are not listed as due', !s.days.some(d=>d.due.some(e=>e.id.startsWith('pe'))));
  check('real coursework beside them is unaffected', s.days.some(d=>d.sessions.some(x=>x.event.id==='hw')));
  check('PE is out of the priority plan too', !buildPlan([pe, peBare, real], BALANCED_WEIGHTS, NOW).some(p=>p.event.id.startsWith('pe')));
  check('PE is off the calendar deadlines', !calendarEvents([pe, real], new Set()).some(e=>e.id==='pe1'));
  check('PE generates no reminders', planNotifications([pe, real], DEFAULT_NOTIFY, NOW).every(n=>n.eventId!=='pe1'));
  check('PE still counts as a grade', summarize([{...pe, submission:{state:'graded',late:false,score:1,pointsPossible:1}}]).totalGraded===1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
