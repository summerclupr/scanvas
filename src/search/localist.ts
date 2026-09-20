/**
 * MIT's public directories, read from the Institute events calendar.
 *
 * calendar.mit.edu (Localist) publishes, alongside events, the list of
 * GROUPS that post to it - ~200 student organisations and offices with a
 * description and website - and the DEPARTMENTS, LABS and CENTERS (~100),
 * likewise with descriptions and links. Both are public JSON with CORS
 * headers, so they work in the browser without the proxy. Together they are
 * the closest thing MIT has to a machine-readable "clubs and labs" index.
 *
 * Honest limit: a club that never posts to the Institute calendar isn't in
 * the list. The ASA's full club roster lives behind Touchstone.
 */

import { wordStart } from '../connectors/hydrant';

export interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  /** The group's or lab's own website, when it gave one. */
  url?: string;
  /** Its page on calendar.mit.edu, which always exists. */
  calendarUrl: string;
  kind: 'group' | 'department';
  /** Localist's group type, e.g. "Student Group". */
  type?: string;
}

export interface Directory {
  groups: DirectoryEntry[];
  departments: DirectoryEntry[];
  fetchedAt: string | null;
}

export const DIRECTORY_TTL_MS = 7 * 24 * 3600_000;

const API = 'https://calendar.mit.edu/api/2';

interface LocalistEntry {
  id: number | string;
  name: string;
  description_text?: string | null;
  url?: string | null;
  localist_url?: string;
  filters?: Record<string, { name: string }[]>;
}

function toEntry(e: LocalistEntry, kind: DirectoryEntry['kind']): DirectoryEntry {
  const url = (e.url ?? '').trim();
  return {
    id: `${kind}:${e.id}`,
    name: e.name.trim(),
    description: (e.description_text ?? '').trim(),
    url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : undefined,
    calendarUrl: e.localist_url ?? `https://calendar.mit.edu/${kind}/${e.id}`,
    kind,
    type: e.filters?.group_types?.[0]?.name,
  };
}

async function fetchAll<T>(
  path: 'groups' | 'departments',
  timeoutMs: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 5; page++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API}/${path}?pp=100&page=${page}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`calendar.mit.edu/${path} -> ${res.status}`);
      const data = (await res.json()) as Record<string, unknown> & {
        page?: { current: number; total: number };
      };
      const rows = (data[path] as Record<string, T>[] | undefined) ?? [];
      const key = path === 'groups' ? 'group' : 'department';
      for (const row of rows) out.push(row[key]);
      if (!data.page || data.page.current >= data.page.total) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/** Both lists, fetched in parallel; one failing doesn't sink the other. */
export async function fetchDirectory(timeoutMs = 20_000): Promise<Directory> {
  const [groups, departments] = await Promise.allSettled([
    fetchAll<LocalistEntry>('groups', timeoutMs),
    fetchAll<LocalistEntry>('departments', timeoutMs),
  ]);
  if (groups.status === 'rejected' && departments.status === 'rejected') {
    throw new Error((groups.reason as Error)?.message ?? 'directory unreachable');
  }
  return {
    groups:
      groups.status === 'fulfilled'
        ? groups.value.map((g) => toEntry(g, 'group')).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    departments:
      departments.status === 'fulfilled'
        ? departments.value
            .map((d) => toEntry(d, 'department'))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Live event search
// ---------------------------------------------------------------------------

export interface CalendarHit {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
  organizer?: string;
  types: string[];
  url: string;
  description: string;
}

/**
 * Full-text search across the Institute calendar, months ahead - so a talk in
 * November is findable even though the sync window is three weeks.
 */
export async function searchCalendar(
  query: string,
  opts: { days?: number; limit?: number; timeoutMs?: number } = {},
): Promise<CalendarHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(
      `${API}/events/search?search=${encodeURIComponent(q)}&days=${opts.days ?? 90}&pp=${opts.limit ?? 15}`,
      { signal: controller.signal, cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`calendar.mit.edu search -> ${res.status}`);
    const data = (await res.json()) as {
      events?: {
        event: {
          id: number | string;
          title: string;
          description_text?: string | null;
          localist_url?: string;
          location_name?: string | null;
          room_number?: string | null;
          departments?: { name: string }[] | null;
          filters?: { event_types?: { name: string }[] };
          event_instances?: { event_instance: { start: string; end?: string | null; all_day?: boolean } }[];
        };
      }[];
    };
    const now = Date.now();
    const out: CalendarHit[] = [];
    // Localist's search is loose: "max tegmark" returns anything mentioning
    // a Max Planck Institute. Keep only hits where every word appears at a
    // word start somewhere in the title, organizer or description.
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    for (const { event: e } of data.events ?? []) {
      const inst = (e.event_instances ?? []).find(
        (i) => new Date(i.event_instance.start).getTime() >= now - 3600_000,
      )?.event_instance;
      if (!inst) continue;
      const hay = `${e.title} ${e.departments?.map((d) => d.name).join(' ') ?? ''} ${
        e.description_text ?? ''
      }`.toLowerCase();
      if (!words.every((w) => wordStart(w).test(hay))) continue;
      out.push({
        id: `calendar:${e.id}:${inst.start}`,
        title: e.title.trim(),
        start: inst.start,
        end: inst.end ?? undefined,
        allDay: Boolean(inst.all_day),
        location: [e.location_name, e.room_number].filter(Boolean).join(' ').trim() || undefined,
        organizer: e.departments?.[0]?.name?.trim(),
        types: (e.filters?.event_types ?? []).map((t) => t.name),
        url: e.localist_url ?? `https://calendar.mit.edu/event/${e.id}`,
        description: (e.description_text ?? '').trim().slice(0, 300),
      });
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  } finally {
    clearTimeout(timer);
  }
}
