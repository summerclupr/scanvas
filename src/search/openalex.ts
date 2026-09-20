/**
 * MIT researchers, from OpenAlex.
 *
 * The checked faculty set is 61 people and the subject listing only names
 * whoever teaches this term, so "max tegmark" found nobody even though he is
 * plainly at MIT. OpenAlex (openalex.org) is a public, CORS-enabled index of
 * scholarly publications with an author record per person, their current
 * institution, and the research TOPICS their papers fall under. Filtered to
 * MIT it answers both questions this tab gets asked:
 *
 *   "who is <name>"                 -> authors?search=<name>&filter=MIT
 *   "who works on <topic> at MIT"   -> topics?search=<topic>, then
 *                                       authors?filter=MIT,topics.id=<T>
 *
 * Honest limits, stated on every card: it indexes anyone who publishes, so
 * postdocs and students appear alongside professors; "at MIT" means the
 * last institution on their papers; and it carries no email or homepage, so
 * cards link to the OpenAlex/ORCID record and to MIT's own lookups rather
 * than guessing.
 */

export const MIT_OPENALEX_ID = 'I63966007';
const API = 'https://api.openalex.org';

export interface Researcher {
  id: string;
  name: string;
  works: number;
  citations: number;
  hIndex?: number;
  /** Research topics, most prominent first. */
  topics: string[];
  orcid?: string;
  openalexUrl: string;
  /** Years their MIT-affiliated papers span, most recent first. */
  mitYears: number[];
}

interface OpenAlexAuthor {
  id: string;
  display_name: string;
  works_count: number;
  cited_by_count: number;
  orcid?: string | null;
  summary_stats?: { h_index?: number };
  topics?: { display_name: string }[];
  affiliations?: { institution: { id: string }; years: number[] }[];
}

function toResearcher(a: OpenAlexAuthor): Researcher {
  const mit = a.affiliations?.find((x) => x.institution.id.endsWith(MIT_OPENALEX_ID));
  return {
    id: a.id,
    name: a.display_name,
    works: a.works_count,
    citations: a.cited_by_count,
    hIndex: a.summary_stats?.h_index,
    topics: (a.topics ?? []).map((t) => t.display_name).slice(0, 6),
    orcid: a.orcid ?? undefined,
    openalexUrl: a.id,
    mitYears: [...(mit?.years ?? [])].sort((x, y) => y - x),
  };
}

async function getJSON<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`openalex.org -> ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const AUTHOR_FIELDS =
  'id,display_name,works_count,cited_by_count,orcid,summary_stats,topics,affiliations';

/**
 * People at MIT by name. A full name is read as first name(s) + surname and
 * results are kept only when the surname matches and, if an initial or first
 * name was given, the first letter agrees - OpenAlex's own search is fuzzy
 * enough to return "M. Williams" for "r. williams". Near-empty stub records
 * (one or two papers) are dropped when a real record exists.
 */
export async function searchMitAuthors(name: string, limit = 5): Promise<Researcher[]> {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words[words.length - 1].length < 3) return [];
  const surname = words[words.length - 1].toLowerCase().replace(/[^a-z'’\-]/g, '');
  const initial = words.length > 1 ? words[0][0].toLowerCase() : null;
  const data = await getJSON<{ results: OpenAlexAuthor[] }>(
    `${API}/authors?search=${encodeURIComponent(name.trim())}` +
      `&filter=last_known_institutions.id:${MIT_OPENALEX_ID}&per-page=10&select=${AUTHOR_FIELDS}`,
  );
  const matches = data.results.map(toResearcher).filter((r) => {
    const tokens = r.name.toLowerCase().split(/\s+/);
    const last = tokens[tokens.length - 1].replace(/[^a-z'’\-]/g, '');
    if (last !== surname) return false;
    return !initial || tokens[0][0] === initial;
  });
  const solid = matches.filter((r) => r.works >= 3);
  return (solid.length ? solid : matches).sort((a, b) => b.works - a.works).slice(0, limit);
}

export interface Topic {
  id: string;
  name: string;
  works: number;
}

/** OpenAlex's closest topic for a phrase ("automatic speech recognition" -> "Speech Recognition and Synthesis"). */
export async function findTopic(phrase: string): Promise<Topic | null> {
  const q = phrase.trim();
  if (q.length < 3) return null;
  const data = await getJSON<{ results: { id: string; display_name: string; works_count: number }[] }>(
    `${API}/topics?search=${encodeURIComponent(q)}&per-page=3`,
  );
  const t = data.results[0];
  return t ? { id: t.id.replace(/^https:\/\/openalex\.org\//, ''), name: t.display_name, works: t.works_count } : null;
}

/** MIT-affiliated authors publishing in a topic, most prolific first. */
export async function researchersInTopic(topicId: string, limit = 8): Promise<Researcher[]> {
  const data = await getJSON<{ results: OpenAlexAuthor[] }>(
    `${API}/authors?filter=last_known_institutions.id:${MIT_OPENALEX_ID},topics.id:${topicId}` +
      `&sort=works_count:desc&per-page=${limit}&select=${AUTHOR_FIELDS}`,
  );
  return data.results.map(toResearcher);
}

/** "Who at MIT works on X": the matched topic and the people. */
export async function searchMitResearchers(
  phrase: string,
  limit = 8,
): Promise<{ topic: Topic | null; researchers: Researcher[] }> {
  const topic = await findTopic(phrase);
  if (!topic) return { topic: null, researchers: [] };
  return { topic, researchers: await researchersInTopic(topic.id, limit) };
}
