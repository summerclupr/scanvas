/** Does the local model drive the assistant correctly? Real Ollama calls. */
import { askAgent, groundReply, type AppSnapshot } from '../src/chat/agent';
import { DEFAULT_OLLAMA } from '../src/llm/ollama';

const snap: AppSnapshot = {
  courses: ['6.1210','8.01','18.02','18.C06'],
  interests: ['machine learning','computer vision'],
  follows: ['CSAIL'],
  planPreset: 'balanced',
  dailyHours: 4,
  maxItemsPerDay: 4,
  todaySessions: [
    { title:'Pset 5 — Dynamic Programming', hours:2.5, due:'in 4d' },
    { title:'8.01 Problem Set 2', hours:1.5, due:'in 2d' },
  ],
  todayCommitments: ['8.01 Lecture','18.C06 Lecture'],
  upcoming: [
    { title:'Pset 5', course:'6.1210', due:'in 4d', weight:'12.5% of grade' },
    { title:'Exam 1', course:'8.01', due:'in 9d', weight:'25% of grade' },
  ],
  notificationsScheduled: 12,
  demoSources: [],
  clubs: ['CSAIL'],
  muted: [],
  matchingEvents: [],
};

/** Same snapshot, but the user's message matched a synced Pokerbots event. */
const pokerSnap: AppSnapshot = {
  ...snap,
  matchingEvents: [
    { title: 'Pokerbots Meeting for Recruitment', host: 'Pokerbots', when: 'Thu, Sep 24, 7:00 PM', where: '32-123' },
  ],
};

const CASES: { say: string; expect: string; note: string; snap?: AppSnapshot; also?: (out: Awaited<ReturnType<typeof askAgent>>) => string }[] = [
  { say:'you stacked too much on me today',          expect:'spread_out_day',  note:'the headline ask' },
  { say:'I care more about internships than homework',expect:'set_plan_preset',note:'re-prioritise' },
  { say:'add quantum computing to my interests',      expect:'add_interest',   note:'change interests' },
  { say:"I'm not taking 18.02 anymore",               expect:'untrack_course', note:'drop a class' },
  { say:'show me my calendar',                        expect:'navigate',       note:'navigation' },
  { say:'make notifications quieter',                 expect:'set_notifications', note:'notif tuning' },
  { say:'follow Jane Street',                         expect:'follow_org',     note:'follow a company' },
  { say:"what's due soonest?",                        expect:'',               note:'consultation, NO action' },
  { say:'remove prayer nights from my interests',     expect:'mute_keyword',   note:'mute a theme', snap: snap, also: (out) => out.actions.filter(a=>a.kind==='mute_keyword').length >= 2 ? '' : 'expected several mute_keyword actions covering the theme' },
  { say:'stop recommending religious events',         expect:'mute_keyword',   note:'mute a theme, phrased differently' },
  { say:'show me upcoming events for the mit poker club', expect:'follow_club', note:'club events: follow + answer from data', snap: pokerSnap,
    also: (out) => /pokerbots/i.test(out.reply) ? '' : `reply should name the Pokerbots event, got "${out.reply}"` },
  { say:'any robotics club events coming up?',        expect:'search',         note:'nothing synced -> search' },
];

async function main(){
  let pass=0, fail=0;
  const g0=(r:string)=>groundReply(r, snap);
  const u=(l:string,ok:boolean,d='')=>{console.log(`${ok?'PASS':'FAIL'}  ${l}${d?`  (${d})`:''}`);ok?pass++:fail++;};
  console.log('--- grounding guard (deterministic) ---');
  u('strips an unsupported course deadline', g0('Your 18.C06 pset is due in 4 days.').corrected);
  u('keeps a supported one', !g0('Pset 5 for 6.1210 is due in 4 days.').corrected);
  u('ignores replies with no time claim', !g0('18.C06 is one of your classes.').corrected);
  u('handles several courses', g0('8.01 and 18.C06 are due tomorrow.').corrected);
  console.log('\n--- live model ---');
  for (const c of CASES) {
    const t0=Date.now();
    try {
      const out = await askAgent(DEFAULT_OLLAMA, [], c.snap ?? snap, c.say);
      const kinds = out.actions.map(a=>a.kind);
      const extra = c.also ? c.also(out) : '';
      const ok = (c.expect ? kinds.includes(c.expect as never) : kinds.length===0) && !extra;
      ok?pass++:fail++;
      console.log(`${ok?'PASS':'FAIL'}  ${(Date.now()-t0)/1000|0}s  "${c.say}"${extra ? `  [${extra}]` : ''}`);
      console.log(`        -> actions=[${kinds.join(',')||'none'}]  expected=${c.expect||'none'}`);
      console.log(`        -> "${out.reply.slice(0,90)}"`);
    } catch(e){ fail++; console.log(`FAIL  "${c.say}" -> ${(e as Error).message}`); }
  }
  // grounding: must not invent a deadline it wasn't given
  const g = await askAgent(DEFAULT_OLLAMA, [], snap, 'when is my 18.C06 pset due?');
  // The snapshot has NO 18.C06 deadline. Claiming one - even by borrowing
  // 6.1210's "in 4d" - is exactly the failure mode that matters.
  const invented =
    /\b(Oct|Sept|September|October|Nov)\s*\d|\d{1,2}\/\d{1,2}/.test(g.reply) ||
    /in \d+\s*d/i.test(g.reply);
  console.log(`${!invented?'PASS':'FAIL'}  grounding: refuses to invent an 18.C06 deadline`);
  console.log(`        -> "${g.reply.slice(0,120)}"`);
  invented?fail++:pass++;
  console.log(`\n${pass} passed, ${fail} failed`);
}
main().catch(e=>{console.error(e);process.exit(1);});
