/**
 * What a search is asking for.
 *
 *   name         "max tegmark", "tegmark", "m. tegmark", "regina barzilay"
 *   department   "professors in the philosophy department", "eecs faculty"
 *   topic        "professors doing research in automatic speech recognition",
 *                "who works on quantum error correction"
 *   general      anything else - a club, a course number, a keyword
 *
 * Filler words ("professors", "doing research in", "mit", "club") are
 * stripped before matching so "mit poker club" still finds a group called
 * Pokerbots, and so the topic handed to OpenAlex is the topic, not the
 * sentence around it.
 */

export type IntentKind = 'name' | 'department' | 'topic' | 'general';

export interface Intent {
  kind: IntentKind;
  /** The thing being asked about, with filler removed. */
  subject: string;
  /** Tokens that must match, filler removed. Falls back to all tokens. */
  required: string[];
  department?: DepartmentInfo;
}

export interface DepartmentInfo {
  /** Display name, e.g. "Linguistics & Philosophy (Course 24)". */
  name: string;
  /** Course-number prefixes whose instructors belong to it. */
  prefixes: string[];
  /** Name as it appears in calendar.mit.edu's departments directory. */
  directoryName?: string;
  /** The department's own homepage. Checked to resolve by `npm run verify:profs`. */
  website: string;
}

const STOPWORDS = new Set([
  'mit', 'the', 'of', 'and', 'a', 'an', 'in', 'at', 'for', 'on', 'to', 'with', 'about', 'from',
  'club', 'team', 'group', 'society', 'association', 'org', 'organization',
  'professor', 'professors', 'prof', 'profs', 'faculty', 'instructor', 'instructors', 'people', 'person',
  'department', 'dept', 'departments',
  'research', 'researcher', 'researchers', 'researching', 'doing', 'do', 'does', 'did',
  'work', 'works', 'working', 'study', 'studying', 'studies',
  'who', 'what', 'which', 'is', 'are', 'me', 'show', 'find', 'search', 'look', 'up', 'list',
  'upcoming', 'events', 'event', 'any', 'some', 'all', 'lab', 'labs', 'system', 'systems',
]);

export function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.&+'’-]+/i)
    .map((w) => w.replace(/^[.'’-]+|[.'’-]+$/g, ''))
    .filter((w) => w.length >= 2);
}

/** Tokens minus filler; every one of these must match. */
export function requiredTokens(query: string): string[] {
  const all = tokens(query);
  const kept = all.filter((w) => !STOPWORDS.has(w));
  return kept.length ? kept : all;
}

export const DEPARTMENTS: { aliases: RegExp; info: DepartmentInfo }[] = [
  { aliases: /\b(philosophy|linguistics|course 24)\b/i, info: { name: 'Linguistics & Philosophy (Course 24)', website: 'https://philosophy.mit.edu/', prefixes: ['24'], directoryName: 'Department of Linguistics and Philosophy' } },
  { aliases: /\b(eecs|electrical engineering|computer science|cs|course 6)\b/i, info: { name: 'Electrical Engineering & Computer Science (Course 6)', website: 'https://www.eecs.mit.edu/', prefixes: ['6'], directoryName: 'Department of Electrical Engineering and Computer Science' } },
  { aliases: /\bcsail\b/i, info: { name: 'CSAIL', website: 'https://www.csail.mit.edu/', prefixes: ['6'], directoryName: 'Computer Science and Artificial Intelligence Laboratory (CSAIL)' } },
  { aliases: /\b(math|maths|mathematics|course 18)\b/i, info: { name: 'Mathematics (Course 18)', website: 'https://math.mit.edu/', prefixes: ['18'], directoryName: 'Department of Mathematics' } },
  { aliases: /\b(physics|course 8)\b/i, info: { name: 'Physics (Course 8)', website: 'https://physics.mit.edu/', prefixes: ['8'], directoryName: 'Department of Physics' } },
  { aliases: /\b(econ|economics|course 14)\b/i, info: { name: 'Economics (Course 14)', website: 'https://economics.mit.edu/', prefixes: ['14'], directoryName: 'Department of Economics' } },
  { aliases: /\b(sloan|business|management|finance|course 15)\b/i, info: { name: 'Sloan School of Management (Course 15)', website: 'https://mitsloan.mit.edu/', prefixes: ['15'] } },
  { aliases: /\b(meche|mechanical( engineering)?|course 2)\b/i, info: { name: 'Mechanical Engineering (Course 2)', website: 'https://meche.mit.edu/', prefixes: ['2'], directoryName: 'Department of Mechanical Engineering' } },
  { aliases: /\b(aero|aeroastro|aeronautics|astronautics|aerospace|course 16)\b/i, info: { name: 'Aeronautics & Astronautics (Course 16)', website: 'https://aeroastro.mit.edu/', prefixes: ['16'], directoryName: 'Aeronautics and Astronautics' } },
  { aliases: /\b(biology|bio|course 7)\b/i, info: { name: 'Biology (Course 7)', website: 'https://biology.mit.edu/', prefixes: ['7'], directoryName: 'Biology' } },
  { aliases: /\b(chemistry|chem|course 5)\b/i, info: { name: 'Chemistry (Course 5)', website: 'https://chemistry.mit.edu/', prefixes: ['5'], directoryName: 'Department of Chemistry' } },
  { aliases: /\b(cheme|chemical engineering|course 10)\b/i, info: { name: 'Chemical Engineering (Course 10)', website: 'https://cheme.mit.edu/', prefixes: ['10'], directoryName: 'Department of Chemical Engineering' } },
  { aliases: /\b(bcs|brain|cognitive|neuroscience|course 9)\b/i, info: { name: 'Brain & Cognitive Sciences (Course 9)', website: 'https://bcs.mit.edu/', prefixes: ['9'], directoryName: 'Department of Brain and Cognitive Sciences (BCS)' } },
  { aliases: /\b(cee|civil|environmental engineering|course 1)\b/i, info: { name: 'Civil & Environmental Engineering (Course 1)', website: 'https://cee.mit.edu/', prefixes: ['1'], directoryName: 'Civil and Environmental Engineering' } },
  { aliases: /\b(dmse|materials( science)?|course 3)\b/i, info: { name: 'Materials Science & Engineering (Course 3)', website: 'https://dmse.mit.edu/', prefixes: ['3'], directoryName: 'Department of Materials Science and Engineering (DMSE)' } },
  { aliases: /\b(architecture|course 4)\b/i, info: { name: 'Architecture (Course 4)', website: 'https://architecture.mit.edu/', prefixes: ['4'], directoryName: 'Department of Architecture' } },
  { aliases: /\b(dusp|urban( studies| planning)?|course 11)\b/i, info: { name: 'Urban Studies & Planning (Course 11)', website: 'https://dusp.mit.edu/', prefixes: ['11'], directoryName: 'Department of Urban Studies & Planning' } },
  { aliases: /\b(eaps|earth|planetary|atmospheric|course 12)\b/i, info: { name: 'Earth, Atmospheric & Planetary Sciences (Course 12)', website: 'https://eaps.mit.edu/', prefixes: ['12'], directoryName: 'Department of Earth, Atmospheric and Planetary Sciences' } },
  { aliases: /\b(political science|poli ?sci|politics|course 17)\b/i, info: { name: 'Political Science (Course 17)', website: 'https://polisci.mit.edu/', prefixes: ['17'], directoryName: 'Department of Political Science' } },
  { aliases: /\b(biological engineering|bioengineering|course 20)\b/i, info: { name: 'Biological Engineering (Course 20)', website: 'https://be.mit.edu/', prefixes: ['20'], directoryName: 'Biological Engineering' } },
  { aliases: /\b(nuclear|nse|course 22)\b/i, info: { name: 'Nuclear Science & Engineering (Course 22)', website: 'https://nse.mit.edu/', prefixes: ['22'], directoryName: 'Department of Nuclear Science and Engineering' } },
  { aliases: /\b(media lab|media arts|mas)\b/i, info: { name: 'Media Arts & Sciences (Media Lab)', website: 'https://www.media.mit.edu/', prefixes: ['MAS'], directoryName: 'Media Lab' } },
  { aliases: /\bhistory\b/i, info: { name: 'History (21H)', website: 'https://history.mit.edu/', prefixes: ['21H'], directoryName: 'History' } },
  { aliases: /\b(music|theater|theatre)\b/i, info: { name: 'Music & Theater Arts (21M)', website: 'https://mta.mit.edu/', prefixes: ['21M'] } },
  { aliases: /\bliterature\b/i, info: { name: 'Literature (21L)', website: 'https://lit.mit.edu/', prefixes: ['21L'], directoryName: 'Lit@MIT, Literature Section at MIT' } },
  { aliases: /\b(writing|cms|comparative media)\b/i, info: { name: 'Comparative Media Studies / Writing (CMS, 21W)', website: 'https://cmsw.mit.edu/', prefixes: ['CMS', '21W'], directoryName: 'Comparative Media Studies/Writing' } },
  { aliases: /\banthropology\b/i, info: { name: 'Anthropology (21A)', website: 'https://anthropology.mit.edu/', prefixes: ['21A'], directoryName: 'Anthropology' } },
  { aliases: /\b(global languages|languages)\b/i, info: { name: 'Global Languages (21G)', website: 'https://languages.mit.edu/', prefixes: ['21G'], directoryName: 'Global Languages' } },
  { aliases: /\b(idss|ids|data systems)\b/i, info: { name: 'Institute for Data, Systems, and Society', website: 'https://idss.mit.edu/', prefixes: ['IDS'], directoryName: 'Institute for Data, Systems, and Society (IDSS)' } },
  { aliases: /\b(hst|health sciences)\b/i, info: { name: 'Health Sciences & Technology (HST)', website: 'https://hst.mit.edu/', prefixes: ['HST'] } },
  { aliases: /\b(sts|science technology (and )?society)\b/i, info: { name: 'Science, Technology & Society (STS)', website: 'https://sts-program.mit.edu/', prefixes: ['STS'] } },
  { aliases: /\b(wgs|gender studies)\b/i, info: { name: "Women's & Gender Studies (WGS)", website: 'https://wgs.mit.edu/', prefixes: ['WGS'] } },
];

export function matchDepartment(text: string): DepartmentInfo | undefined {
  return DEPARTMENTS.find((d) => d.aliases.test(text))?.info;
}

/** "professors in the philosophy department" -> "philosophy". */
const DEPARTMENT_RE =
  /^(?:(?:professors?|profs?|faculty|people|instructors?|teachers?)\s+(?:in|at|from|of)\s+(?:the\s+)?)?(.+?)(?:\s+(?:department|dept|faculty|professors?|profs))?$/i;

/** "professors doing research in X", "who works on X", "research on X". */
const TOPIC_RE =
  /^(?:(?:professors?|profs?|faculty|people|researchers?|labs?|anyone|who|someone)\s+)?(?:(?:that|who)\s+)?(?:(?:is|are|does|do|doing)\s+)?(?:(?:research(?:ing|es)?|work(?:ing|s)?|stud(?:y|ies|ying)|focus(?:ing|es)?|specializ(?:e|es|ing))\s+(?:in|on|about|at)\s+|research\s+(?:in|on|about)\s+)(.+)$/i;

const NAME_WORD = /^[a-z][a-z'’\-]*\.?$/i;

export function looksLikeName(query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length === 0 || words.length > 3) return false;
  if (!words.every((w) => NAME_WORD.test(w) && (w.length >= 2 || /^[a-z]\.$/i.test(w)))) return false;
  // "professors in physics" is not a name; nor is a lone department word.
  if (words.some((w) => STOPWORDS.has(w.toLowerCase().replace(/\.$/, '')))) return false;
  // Three plain words ("automatic speech recognition") are a subject, not a
  // person, unless one of them is an initial ("regina t. barzilay"). Three-
  // word names without an initial still get an author lookup - see the tab.
  if (words.length === 3 && !words.some((w) => /^[a-z]\.?$/i.test(w))) return false;
  return true;
}

export function parseIntent(query: string): Intent {
  const q = query.trim().replace(/\s+/g, ' ');
  const required = requiredTokens(q);

  const topic = TOPIC_RE.exec(q);
  if (topic) {
    const subject = topic[1].trim().replace(/[?.!]+$/, '');
    return { kind: 'topic', subject, required: requiredTokens(subject) };
  }

  const deptPhrase = DEPARTMENT_RE.exec(q)?.[1] ?? q;
  const mentionsFaculty = /\b(professors?|profs?|faculty|instructors?|department|dept)\b/i.test(q);
  const department = matchDepartment(deptPhrase);
  if (department && (mentionsFaculty || deptPhrase.trim().split(/\s+/).length <= 2)) {
    return { kind: 'department', subject: deptPhrase.trim(), required, department };
  }

  if (looksLikeName(q)) return { kind: 'name', subject: q, required };

  // Three or more meaningful words that aren't a name read as a subject
  // area ("automatic speech recognition systems"); two do when the query
  // mentions professors or faculty ("quantum computing professors").
  if (!/\d/.test(q) && (required.length >= 3 || (required.length >= 2 && mentionsFaculty))) {
    return { kind: 'topic', subject: required.join(' '), required };
  }
  return { kind: 'general', subject: q, required };
}
