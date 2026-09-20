/** Filtering by year / school / classes / resume, against the live feed. */
import { fetchSimplify } from '../src/careers/simplify';
import { curatedPostings } from '../src/careers/curated';
import { rankPostings } from '../src/careers/rank';
import { standing, subjectsFromCourses } from '../src/careers/eligibility';
import { DEFAULT_PROFILE, type InterestProfile } from '../src/core/profile';

const base = (o: Partial<InterestProfile>): InterestProfile => ({
  ...DEFAULT_PROFILE, completedOnboarding: true,
  priorities: { ...DEFAULT_PROFILE.priorities, urop: 0.95, career: 0.8 },
  ...o,
});

async function main() {
  console.log('fetching live feed...');
  const live = await fetchSimplify();
  const all = [...curatedPostings(), ...live];
  console.log(`${all.length} postings\n`);

  let pass = 0, fail = 0;
  const check = (l: string, ok: boolean, d = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  (${d})` : ''}`); ok ? pass++ : fail++;
  };

  // --- YEAR ---
  const soph = base({ gradYear: 2029, degreeLevel: "Bachelor's" });
  const rSoph = rankPostings(all, soph);
  const phdOnly = rSoph.filter(p => (p.degrees??[]).length && (p.degrees??[]).every(d=>d==='PhD'));
  // Class of 2029 entered fall 2025, so in Sept 2026 they are a sophomore.
  check('standing from gradYear', standing(2029, new Date(2026,8,19)) === 'Sophomore', standing(2029, new Date(2026,8,19))!);
  check('PhD/MBA-only marked ineligible for BS', phdOnly.length>0 && phdOnly.every(p=>!p.eligible), `${phdOnly.length} such postings`);
  check('ineligible sorted below eligible',
    rSoph.findIndex(p=>!p.eligible) > rSoph.filter(p=>p.eligible).length - 1);

  const phd = base({ gradYear: 2029, degreeLevel: 'PhD' });
  const rPhd = rankPostings(all, phd);
  const samePhd = rPhd.filter(p=>phdOnly.some(q=>q.id===p.id));
  check('same postings ELIGIBLE for a PhD student', samePhd.every(p=>p.eligible));

  // grad-year cutoff
  const senior = base({ gradYear: 2026, degreeLevel: "Bachelor's" });
  const rSenior = rankPostings(all, senior);
  // Only postings whose EARLIEST term is after graduation are excluded - one
  // offering both Summer 2026 and Summer 2027 is still open to a 2026 grad.
  const allFuture = rSenior.filter(p => {
    const ys = p.terms.map(t=>Number(/\b(20\d{2})\b/.exec(t)?.[1])).filter(Number.isFinite);
    return ys.length>0 && Math.min(...ys) > 2026;
  });
  check('terms entirely after graduation excluded',
    allFuture.length>0 && allFuture.every(p=>!p.eligible), `${allFuture.length} such`);
  const mixed = rSenior.filter(p => {
    const ys = p.terms.map(t=>Number(/\b(20\d{2})\b/.exec(t)?.[1])).filter(Number.isFinite);
    return ys.length>1 && Math.min(...ys)<=2026 && Math.max(...ys)>2026;
  });
  check('postings with an in-range term stay eligible',
    mixed.length===0 || mixed.every(p=>p.eligible), `${mixed.length} mixed-term`);

  // --- SCHOOL ---
  const mit = base({ school: 'MIT' });
  const brown = base({ school: 'Brown University' });
  const uropMit = rankPostings(all, mit).find(p=>p.id==='curated:mit-urop-direct')!;
  const uropBrown = rankPostings(all, brown).find(p=>p.id==='curated:mit-urop-direct')!;
  check('MIT-only program eligible for MIT', uropMit.eligible);
  check('MIT-only program blocked for Brown', !uropBrown.eligible, uropBrown.ineligibleReason);
  const nearMit = rankPostings(all, mit).filter(p=>p.nearCampus);
  check('near-campus boost fires for MIT', nearMit.length>0, `${nearMit.length} Boston-area`);
  check('no near-campus for unknown school',
    rankPostings(all, base({school:'Nowhere Tech'})).every(p=>!p.nearCampus));

  // --- CLASSES ---
  check('MIT course numbers map to subjects',
    subjectsFromCourses(['6.1210','18.02','8.01']).includes('software engineering') &&
    subjectsFromCourses(['18.02']).includes('mathematics'),
    subjectsFromCourses(['6.1210','18.02','8.01']).join(', '));
  check('letter prefixes map too',
    subjectsFromCourses(['CS 101','MATH 21']).includes('software engineering'));
  const withCourses = rankPostings(all, base({ courses: ['6.1210','18.C06'] }));
  const courseReason = withCourses.filter(p=>p.reasons.some(r=>r.startsWith('Your coursework')));
  check('coursework produces ranking reasons', courseReason.length>0, `${courseReason.length} postings`);

  // --- RESUME ---
  const withResume = rankPostings(all, base({ resumeSkills: ['pytorch','verilog'] }));
  const resumeReason = withResume.filter(p=>p.reasons.some(r=>r.startsWith('Resume:')));
  check('resume skills produce reasons', resumeReason.length>0, `${resumeReason.length} postings`);
  const noResume = rankPostings(all, base({}));
  const sameId = resumeReason[0]?.id;
  if (sameId) {
    const a = withResume.find(p=>p.id===sameId)!, b = noResume.find(p=>p.id===sameId)!;
    check('resume match raises that posting score', a.score > b.score, `${b.score.toFixed(2)} -> ${a.score.toFixed(2)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e=>{console.error(e);process.exit(1);});
