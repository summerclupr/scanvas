/**
 * MIT's club directory, from Engage.
 *
 * Engage (CampusGroups) lists all ~514 recognised student groups on a public
 * page, and that page takes a search parameter. It has no JSON API, so this
 * parses the listing - the one place the app reads HTML. It's confined to
 * search results, labelled as such, and if the markup changes the parser
 * returns nothing and the card falls back to a link to the same page, so
 * the failure mode is "click through", never a wrong answer.
 *
 * Each entry carries what the listing shows: name, ASA category, website,
 * mission statement, and the officers' names (no emails are exposed).
 */

import { proxiedUrl } from '../connectors/canvas-transport';

export interface EngageClub {
  id: string;
  name: string;
  /** "ASA Student Organization - Games and Puzzles" */
  category?: string;
  website?: string;
  mission?: string;
  officers: string[];
  /** The Engage listing filtered to this club. */
  engageUrl: string;
}

export function engageSearchUrl(query: string): string {
  return `https://engage.mit.edu/club_signup?search=${encodeURIComponent(query.trim())}`;
}

function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseEngageClubs(html: string): EngageClub[] {
  const out: EngageClub[] = [];
  const chunks = html.split(/<li class="list-group-item"/i).slice(1);
  for (const chunk of chunks) {
    const name = /role="group"\s+aria-label="([^"]+)"/i.exec(chunk)?.[1]?.trim();
    if (!name) continue;
    const id = /cb_club_(\d+)/.exec(chunk)?.[1] ?? name;
    const website = [...chunk.matchAll(/href="(https?:\/\/[^"]+)"/gi)]
      .map((m) => m[1])
      .find((u) => !/engage\.mit\.edu|campusgroups\.com/i.test(u));
    const t = text(chunk);
    // The flattened text reads "...register for this group Poker Club ASA
    // Student Organization - Games and Puzzles Website Mission Contact: ...
    // Email group officers Mission The purpose of this club ...". The name
    // appears several times (accessibility labels first), so the category is
    // read after the LAST mention that is followed by a category-shaped
    // phrase, and the mission after the LAST "Mission".
    let category: string | undefined;
    for (let at = t.indexOf(`${name} `); at >= 0; at = t.indexOf(`${name} `, at + 1)) {
      const after = t.slice(at + name.length + 1);
      const cand = /^(.*?)(?:\s+Website|\s+Mission|\s+Contact:|$)/.exec(after)?.[1]?.trim();
      if (cand && cand.length < 90 && !/^('s|group)\b/i.test(cand)) category = cand;
    }
    const missionAt = t.lastIndexOf('Mission ');
    const mission =
      missionAt >= 0
        ? /^(.+?)(?:\s+Membership Benefits|\s+Dues|$)/.exec(t.slice(missionAt + 'Mission '.length))?.[1]?.trim()
        : undefined;
    const officersRaw = /Contact:\s+(.+?)\s*,?\s*Email group officers/.exec(t)?.[1];
    const officers = officersRaw
      ? officersRaw.split(/\s*,\s*/).map((o) => o.trim()).filter((o) => o && o.length < 60)
      : [];
    out.push({
      id,
      name,
      category,
      website,
      mission: mission && mission.length > 3 ? mission.slice(0, 400) : undefined,
      officers,
      engageUrl: engageSearchUrl(name),
    });
  }
  return out;
}

/** Search Engage's public club listing. Browsers go through the local proxy. */
export async function searchEngageClubs(query: string, timeoutMs = 15_000): Promise<EngageClub[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxiedUrl(engageSearchUrl(q)), {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`engage.mit.edu -> ${res.status}`);
    return parseEngageClubs(await res.text()).slice(0, 8);
  } finally {
    clearTimeout(timer);
  }
}
