/**
 * Live internships from the SimplifyJobs community repository.
 *
 * This is real data with no auth: a public JSON file maintained by thousands
 * of contributors tracking actual open internship applications, served from
 * raw.githubusercontent.com with CORS enabled - so it works identically in
 * the browser and on the phone with zero setup.
 *
 * Two costs shape the code:
 *   - The file is ~13MB covering several years. We keep only active+visible
 *     postings and map them down to our model (~1-2% of the bytes), and we
 *     cache with a TTL rather than refetching per sync - postings change on
 *     the scale of days, not minutes.
 *   - It carries no application deadlines (most tech internships are rolling)
 *     and no requirements text. Those fields stay empty rather than invented;
 *     the card links to the real posting for the details.
 */

import type { CareerPosting } from './types';
import { CATEGORY_TOPICS } from './types';

const LISTINGS_URL =
  'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json';

export const SIMPLIFY_TTL_MS = 12 * 3600_000;

interface SimplifyListing {
  id: string;
  active: boolean;
  is_visible: boolean;
  company_name: string;
  title: string;
  category?: string | null;
  locations?: string[];
  terms?: string[];
  url: string;
  company_url?: string;
  date_posted?: number;
  date_updated?: number;
  sponsorship?: string;
  degrees?: string[];
}

function toPosting(l: SimplifyListing): CareerPosting {
  return {
    id: `simplify:${l.id}`,
    source: 'simplify',
    kind: 'internship',
    company: l.company_name,
    title: l.title,
    locations: (l.locations ?? []).slice(0, 4),
    deadline: null, // rolling; the source has no deadline data
    postedAt: l.date_posted ? new Date(l.date_posted * 1000).toISOString() : undefined,
    requirements: [], // none in the source; never fabricate
    url: l.url,
    applyUrl: l.url,
    terms: l.terms ?? [],
    topics: CATEGORY_TOPICS[l.category ?? ''] ?? [],
    sponsorship:
      l.sponsorship && l.sponsorship !== 'Other' ? l.sponsorship : undefined,
    degrees: l.degrees,
  };
}

export async function fetchSimplify(timeoutMs = 45_000): Promise<CareerPosting[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(LISTINGS_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`listings fetch -> ${res.status}`);
    const data = (await res.json()) as SimplifyListing[];
    return data
      .filter((l) => l.active && l.is_visible && l.company_name && l.url)
      .map(toPosting)
      .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  } finally {
    clearTimeout(timer);
  }
}
