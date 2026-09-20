/**
 * Connector contract.
 *
 * Every connector does exactly one job: pull from its source and emit
 * `RawItem`s. It does NOT classify, score, or dedupe — that happens once,
 * centrally, so all sources get identical treatment.
 *
 * Each connector ships two implementations behind the same interface:
 *   - a `live` one written against the real API shape
 *   - a `fixture` one replaying recorded payloads of that same shape
 * so swapping in a real token changes one line, not the pipeline.
 */

import type { RawItem, SourceId } from '../core/types';

export interface ConnectorCredentials {
  canvas?: { baseUrl: string; token: string };
  /**
   * Either a Graph access token (full: calendar + mail) or a published
   * calendar ICS URL (calendar only - the no-admin-approval path).
   */
  outlook?: { accessToken?: string; icsUrl?: string };
}

/**
 * Passed to `fetch` so a connector that aggregates several feeds can report
 * a partial failure without throwing the whole source away. The MIT campus
 * connector reads two feeds; in a browser without the proxy one of them
 * fails, and "here are 400 events, and by the way Engage was unreachable" is
 * far more useful than either an error or silent omission.
 */
export interface FetchContext {
  warn?: (message: string) => void;
}

export interface SyncWindow {
  /** Only return items occurring/received at or after this ISO instant. */
  since: string;
  /** ...and at or before this one. */
  until: string;
}

export interface Connector {
  id: SourceId;
  label: string;
  /** True when this instance is replaying fixtures rather than hitting the API. */
  isFixture: boolean;
  /** Can this connector run right now? (credentials present, etc.) */
  isConfigured(creds: ConnectorCredentials): boolean;
  fetch(creds: ConnectorCredentials, window: SyncWindow, ctx?: FetchContext): Promise<RawItem[]>;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Strip HTML to readable text — Canvas and Outlook bodies are full of it. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pull an MIT course number out of arbitrary text.
 * Matches 6.1010, 18.06, 7.012, 2.007, 21M.301, HST.121, and 18.C06.
 *
 * That last form is why the second group allows a LEADING letter: the
 * original pattern required a digit right after the dot, so every
 * letter-prefixed subject number (18.C06, 6.C35, 1.A01) silently failed to
 * match - in course detection here and in the assistant's grounding check.
 */
const COURSE_RE = /\b(\d{1,2}[A-Z]?|HST|STS|CMS|ESD|WGS)\.([A-Z]?[0-9]{2,4}[A-Z]?)\b/g;

export function extractCourseCodes(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(COURSE_RE)) out.add(`${m[1]}.${m[2]}`);
  return [...out];
}

/** Professor-ish name detector: "Prof. Regina Barzilay", "Professor Karger". */
const PROF_RE =
  /\b(?:Prof(?:essor)?\.?|Dr\.?|PI)\s+([A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+){0,2})/g;

export function extractPeople(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PROF_RE)) out.add(m[1].trim());
  return [...out];
}
