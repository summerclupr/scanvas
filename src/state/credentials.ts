/**
 * Connector credentials.
 *
 * A Canvas access token reads your grades, your submissions, and your whole
 * enrollment history. It goes in the device keychain (expo-secure-store), not
 * in AsyncStorage next to the UI preferences.
 *
 * Web has no keychain, so it falls back to localStorage and the UI says so.
 * That path is for local development only.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { ConnectorCredentials } from '../connectors/types';
import { icsFetchUrl } from '../connectors/canvas-transport';
import { icsFetchHint } from '../connectors/outlook';
import { parseICS } from '../core/ics';
import {
  CANVAS_PROXY,
  NEEDS_PROXY,
  canvasFetch,
  proxyReachable,
} from '../connectors/canvas-transport';

const KEY = 'agenda.credentials.v1';

/** True when secrets are in the OS keychain rather than plain storage. */
export const SECURE_STORAGE_AVAILABLE = Platform.OS !== 'web';

async function readRaw(): Promise<string | null> {
  try {
    if (SECURE_STORAGE_AVAILABLE) return await SecureStore.getItemAsync(KEY);
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  if (SECURE_STORAGE_AVAILABLE) {
    await SecureStore.setItemAsync(KEY, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
    return;
  }
  await AsyncStorage.setItem(KEY, value);
}

export async function loadCredentials(): Promise<ConnectorCredentials> {
  const raw = await readRaw();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ConnectorCredentials & { elx?: unknown; slack?: unknown };
    // Retired connectors: the flags they stored are meaningless now.
    delete parsed.elx;
    delete parsed.slack;
    return parsed;
  } catch {
    return {};
  }
}

export async function saveCredentials(creds: ConnectorCredentials): Promise<void> {
  try {
    await writeRaw(JSON.stringify(creds));
  } catch (err) {
    if (__DEV__) console.error('[credentials] write failed:', err);
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    if (SECURE_STORAGE_AVAILABLE) await SecureStore.deleteItemAsync(KEY);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing stored, or the keychain is unavailable. Either way, it's gone.
  }
}

/** Normalize whatever the user pasted into a usable base URL. */
export function normalizeCanvasUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Strip a trailing slash and anything after the host - people paste the
  // URL of the page they were on, not the API root.
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

export interface CanvasCheck {
  ok: boolean;
  /** The authenticated user's display name, when the token works. */
  name?: string;
  courses?: { code: string; name: string }[];
  error?: string;
}

/**
 * Verify a Canvas token before trusting it, and report back who it belongs to
 * and which courses it can see. Showing the real name and real course list is
 * the proof that this is live data rather than a fixture.
 */
export async function checkCanvas(
  baseUrl: string,
  token: string,
): Promise<CanvasCheck> {
  const root = normalizeCanvasUrl(baseUrl);
  if (!root) return { ok: false, error: 'Enter your Canvas address' };
  if (!token.trim()) return { ok: false, error: 'Enter an access token' };

  // On web the request has to go through the local proxy; say so precisely
  // rather than surfacing an opaque "Failed to fetch".
  if (NEEDS_PROXY && !(await proxyReachable())) {
    return {
      ok: false,
      error:
        `Browsers can't call Canvas directly (it sends no CORS headers). ` +
        `Start the helper with: npm run proxy  — expected at ${CANVAS_PROXY}.`,
    };
  }

  const get = (path: string) => canvasFetch(root, token, path, 15_000);

  try {
    const me = await get('/api/v1/users/self');
    if (me.status === 401) {
      return { ok: false, error: 'Token rejected (401). Generate a new one.' };
    }
    if (!me.ok) return { ok: false, error: `Canvas returned ${me.status}` };
    const user = (await me.json()) as { name?: string; short_name?: string };

    const res = await get('/api/v1/courses?enrollment_state=active&per_page=50');
    const courses = res.ok
      ? ((await res.json()) as { course_code: string; name: string }[]).map((c) => ({
          code: c.course_code,
          name: c.name,
        }))
      : [];

    return { ok: true, name: user.name ?? user.short_name, courses };
  } catch (err) {
    const msg = (err as Error).message;
    return {
      ok: false,
      error: NEEDS_PROXY
        ? `${msg}. Is the proxy still running? (npm run proxy)`
        : msg,
    };
  }
}


// ---------------------------------------------------------------------------
// Outlook (Microsoft Graph)
// ---------------------------------------------------------------------------

export interface OutlookCheck {
  ok: boolean;
  name?: string;
  email?: string;
  /** Scopes the token actually carries - mail/calendar may be missing. */
  canReadMail?: boolean;
  canReadCalendar?: boolean;
  error?: string;
}

/**
 * Verify a Graph access token. Graph sends CORS headers, so this works from
 * the browser directly - no proxy involved.
 *
 * Tokens from Graph Explorer expire after roughly an hour; that's a property
 * of the token, not something the app can extend. The UI states it.
 */
export async function checkOutlook(accessToken: string): Promise<OutlookCheck> {
  const token = accessToken.trim();
  if (!token) return { ok: false, error: 'Paste a Microsoft Graph access token' };

  const get = async (path: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const me = await get('/me');
    if (me.status === 401) {
      return { ok: false, error: 'Token rejected (401). Graph Explorer tokens expire after ~1 hour - copy a fresh one.' };
    }
    if (!me.ok) return { ok: false, error: `Graph returned ${me.status}` };
    const user = (await me.json()) as { displayName?: string; mail?: string; userPrincipalName?: string };

    // Probe the two permissions the connector needs. $top=1 keeps it cheap.
    const [mail, cal] = await Promise.all([
      get('/me/messages?$top=1&$select=id'),
      get('/me/calendarView?startDateTime=2020-01-01T00:00:00Z&endDateTime=2020-01-02T00:00:00Z&$top=1'),
    ]);

    return {
      ok: true,
      name: user.displayName,
      email: user.mail ?? user.userPrincipalName,
      canReadMail: mail.ok,
      canReadCalendar: cal.ok,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Outlook via published-calendar ICS (the no-admin-approval path)
// ---------------------------------------------------------------------------

export interface IcsCheck {
  ok: boolean;
  calendarName?: string;
  eventCount?: number;
  error?: string;
}

export async function checkIcs(icsUrl: string): Promise<IcsCheck> {
  const url = icsUrl.trim();
  if (!url) return { ok: false, error: 'Paste the ICS link' };
  if (!/^https?:\/\//i.test(url) || !/\.ics(\?|$)/i.test(url)) {
    return {
      ok: false,
      error: 'That does not look like an ICS link - it should end in .ics. Copy the ICS one, not the HTML one.',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(icsFetchUrl(url), {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `Feed returned ${res.status}` };
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/.test(text)) {
      return { ok: false, error: 'The URL responded, but not with a calendar.' };
    }
    const { calendarName, events } = parseICS(text);
    return { ok: true, calendarName, eventCount: events.length };
  } catch (err) {
    // "Failed to fetch" on its own tells the user nothing about which of the
    // three possible causes they're looking at.
    return { ok: false, error: icsFetchHint(url, err) };
  }
}
