import { DEFAULT_OLLAMA } from '../src/llm/ollama';
import { EmbeddingCache, cosine } from '../src/ranking/embed';

async function main() {

const fields = ['machine learning', 'computer vision', 'robotics'];
const events = [
  ['RELATED', 'CSAIL Colloquium: Foundation Models for Robot Manipulation. machine learning, robotics'],
  ['RELATED', 'UROP: computer vision for cell microscopy. computer vision, deep learning'],
  ['RELATED', 'MIT ML Club paper reading: Mamba-3. machine learning'],
  ['RELATED', 'Neurotech@MIT Intro to BCI Workshop. neuroscience, signal processing'],
  ['MAYBE  ', 'Solar Electric Vehicle Team New Member Night. engineering, vehicles'],
  ['MAYBE  ', 'Undergraduate Research Opportunities Fair. research, urop'],
  ['UNREL  ', 'Ballroom Dance Team Beginner Lessons. dance, social'],
  ['UNREL  ', 'MIT Outing Club White Mountains Day Hike. outdoors, hiking'],
  ['UNREL  ', 'Sloan VC Panel: Breaking into Venture. entrepreneurship, venture capital'],
  ['UNREL  ', 'Koch Institute Seminar: Engineering T cells for solid tumors. immunology, cancer'],
];

const cache = new EmbeddingCache();
await cache.warm(DEFAULT_OLLAMA, fields, 'query');
await cache.warm(DEFAULT_OLLAMA, events.map(e => e[1]), 'document');

console.log('\nBest-field cosine per event (prefixed):\n');
const rows: [string,string,number][] = [];
for (const [cls, text] of events) {
  let best = -1, bf = '';
  for (const f of fields) {
    const c = cosine(cache.get(text,'document')!, cache.get(f,'query')!);
    if (c > best) { best = c; bf = f; }
  }
  rows.push([cls, text.slice(0,50), best]);
  console.log(`  ${cls}  ${best.toFixed(3)}  ${bf.padEnd(18)} ${text.slice(0,48)}`);
}
const rel = rows.filter(r=>r[0].startsWith('RELATED')).map(r=>r[2]);
const unrel = rows.filter(r=>r[0].startsWith('UNREL')).map(r=>r[2]);
console.log(`\n  RELATED  min=${Math.min(...rel).toFixed(3)} max=${Math.max(...rel).toFixed(3)}`);
console.log(`  UNRELATED min=${Math.min(...unrel).toFixed(3)} max=${Math.max(...unrel).toFixed(3)}`);
console.log(`\n  suggested floor ~ ${((Math.max(...unrel)+Math.min(...rel))/2).toFixed(2)}, ceil ~ ${Math.max(...rel).toFixed(2)}\n`);
}
main();
