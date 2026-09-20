/** Hydrant slot decoding + schedule expansion, against the LIVE catalogue. */
import { fetchHydrant, fetchHydrantCatalogue, classesTaughtBy, meetingsFor, scheduleItems, sectionOptions, decodeSlot, normalizeCourseCode, ambiguousKinds } from '../src/connectors/hydrant';

let pass=0, fail=0;
const check=(l:string,ok:boolean,d='')=>{console.log(`${ok?'PASS':'FAIL'}  ${l}${d?`  (${d})`:''}`); ok?pass++:fail++;};
const DAY=['Mon','Tue','Wed','Thu','Fri'];
const fmt=(m:number)=>`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;

async function main(){
  // decode unit checks against the verified encoding
  check('slot 10 = Mon 11:00', JSON.stringify(decodeSlot(10))===JSON.stringify({day:0,minutes:660}), fmt(decodeSlot(10).minutes));
  check('slot 44 = Tue 11:00', decodeSlot(44).day===1 && decodeSlot(44).minutes===660);
  check('slot 146 = Fri 11:00', decodeSlot(146).day===4 && decodeSlot(146).minutes===660);

  const { classes: cat, term } = await fetchHydrantCatalogue();
  check('catalogue loaded', cat.size > 2000, `${cat.size} classes`);
  check('catalogue names its term', Boolean(term?.label && /^(Fall|Spring|IAP|Summer) 20\d\d$/.test(term.label)), term?.label ?? 'none');
  check('classes carry instructors', (cat.get('6.1810')?.inCharge ?? '').length > 0, cat.get('6.1810')?.inCharge ?? 'none');
  check('descriptions are kept, trimmed', (cat.get('6.1810')?.description ?? '').length > 40 && (cat.get('6.1810')?.description ?? '').length <= 230);
  check('18.C06 lists Parrilo this term', classesTaughtBy(cat, {name:'Pablo Parrilo'}).some(c=>c.number==='18.C06'));
  check('Kaashoek found via listedAs', classesTaughtBy(cat, {name:'Frans Kaashoek', listedAs:'M. Kaashoek'}).some(c=>c.number==='6.1810'));
  void fetchHydrant;

  // the user's real courses
  for (const code of ['18.C06','8.01','6.1210','18.02']) {
    const cls = cat.get(code);
    if (!cls) { check(`${code} present`, false); continue; }
    const ms = meetingsFor(cls);
    const lec = ms.filter(m=>m.kind==='lecture');
    const rec = ms.filter(m=>m.kind==='recitation');
    console.log(`  ${code.padEnd(7)} ${lec.length} lecture mtgs, ${rec.length} recitation mtgs`);
    if (lec.length) {
      const m = lec[0];
      console.log(`      lecture: ${DAY[m.day]} ${fmt(m.startMinutes)}-${fmt(m.endMinutes)} ${m.room}`);
    }
  }
  // 18.C06 is MWF 11am in 45-230 per the raw feed
  const c06 = meetingsFor(cat.get('18.C06')!).filter(m=>m.kind==='lecture');
  check('18.C06 lecture is MWF', c06.map(m=>m.day).sort().join(',')==='0,2,4', c06.map(m=>DAY[m.day]).join(','));
  check('18.C06 lecture at 11:00', c06.every(m=>m.startMinutes===660));
  check('18.C06 lecture room 45-230', c06.every(m=>m.room==='45-230'));

  // expansion into the sync window
  const win = { since:new Date().toISOString(), until:new Date(Date.now()+14*864e5).toISOString() };
  const lectureOnly = scheduleItems(cat, ['18.C06'], win);
  check('lectures expand without a section choice', lectureOnly.length>0, `${lectureOnly.length} meetings/2wk`);
  check('no recitations until you pick one', !lectureOnly.some(i=>/Recitation/.test(i.hints.title??'')));

  const withRec = scheduleItems(cat, ['18.C06'], win, {'18.C06:recitation':1});
  const recs = withRec.filter(i=>/Recitation/.test(i.hints.title??''));
  check('chosen recitation appears', recs.length>0, `${recs.length} meetings`);
  check('only ONE recitation section', new Set(recs.map(i=>i.sourceId.split(':')[3])).size===1);
  check('items carry a real room', withRec.every(i=>Boolean(i.hints.location)));
  check('items carry course code', withRec.every(i=>i.hints.course?.code==='18.C06'));

  // Canvas appends term suffixes; Hydrant doesn't.
  check('term suffix normalized', normalizeCourseCode('15.A03_FA26')==='15.A03', normalizeCourseCode('15.A03_FA26'));
  check('plain code untouched', normalizeCourseCode('18.C06')==='18.C06');
  // Classes with no Hydrant entry must miss cleanly, not throw.
  check('unknown course yields nothing', scheduleItems(cat, ['PE.2027Q1.0616.3'], win).length===0);

  // --- multi-LECTURE classes (8.01 has eight lecture sections) ---
  const amb = ambiguousKinds(cat, '8.01');
  check('8.01 flagged as ambiguous lectures', amb.includes('lecture'), amb.join(','));
  const noPick = scheduleItems(cat, ['8.01'], win);
  check('no 8.01 lectures until a section is picked', noPick.length===0, `${noPick.length}`);

  // the user's actual section: MW 1:00-2:30, F 1:00
  const mine = scheduleItems(cat, ['8.01'], win, {'8.01:lecture':2});
  const byDay = new Map<string,string>();
  for (const i of mine) {
    const d = new Date(i.hints.start!); const e = new Date(i.hints.end!);
    byDay.set(DAY[(d.getDay()+6)%7], `${fmt(d.getHours()*60+d.getMinutes())}-${fmt(e.getHours()*60+e.getMinutes())}`);
  }
  console.log('  picked 8.01 section 2 ->', [...byDay].map(([k,v])=>`${k} ${v}`).join(', '));
  check('8.01 Mon 13:00-14:30', byDay.get('Mon')==='13:00-14:30', byDay.get('Mon'));
  check('8.01 Wed 13:00-14:30', byDay.get('Wed')==='13:00-14:30', byDay.get('Wed'));
  check('8.01 Fri starts 13:00', (byDay.get('Fri')??'').startsWith('13:00'), byDay.get('Fri'));
  check('only ONE 8.01 lecture section emitted', new Set(mine.map(i=>i.sourceId.split(':')[3])).size===1);

  const lecOpts = sectionOptions(cat, '8.01').filter(o=>o.kind==='lecture');
  check('8.01 lecture options offered', lecOpts.length===8, `${lecOpts.length}`);
  console.log('  option [2]:', lecOpts[2]?.label);
  // 18.C06 has ONE lecture -> no picker, still shown
  check('single-lecture class needs no pick', sectionOptions(cat,'18.C06').every(o=>o.kind!=='lecture'));

  const opts = sectionOptions(cat, '18.C06');
  check('section options listed for picking', opts.length>=4, `${opts.length}: ${opts[0]?.label}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
}
main().catch(e=>{console.error(e);process.exit(1);});
