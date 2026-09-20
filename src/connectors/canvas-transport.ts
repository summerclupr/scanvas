/**
 * How Canvas requests actually get sent.
 *
 * On a phone, straight to Canvas — React Native's fetch has no same-origin
 * policy, so a pasted token just works.
 *
 * In a browser it cannot work directly: Canvas sends no CORS headers, so the
 * browser blocks reading the response no matter what the token is. The web
 * build therefore routes through the little local proxy in
 * `scripts/canvas-proxy.ts` (`npm run proxy`), which forwards to Canvas,
 * Outlook published-calendar hosts and any *.mit.edu site.
 */

/** Override with EXPO_PUBLIC_CANVAS_PROXY if you moved the proxy. */
export const CANVAS_PROXY =
  process.env.EXPO_PUBLIC_CANVAS_PROXY ?? 'http://localhost:8788';

/**
 * Only a BROWSER needs the CORS proxy. Detected via `document` rather than
 * React Native's `Platform`, deliberately: importing react-native here made
 * this module unloadable from Node, which silently broke every headless
 * script the moment a connector started using it. React Native and Node both
 * lack `document`, and both can fetch cross-origin freely.
 */
export const NEEDS_PROXY = typeof document !== 'undefined';

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

/**
 * Turn a Canvas base URL and API path into the URL we should actually fetch.
 * `baseUrl` stays the real Canvas address everywhere else, so deep links and
 * the UI keep showing something meaningful.
 */
export function canvasUrl(baseUrl: string, path: string): string {
  if (!NEEDS_PROXY) return `${baseUrl}${path}`;
  return `${CANVAS_PROXY}/${hostOf(baseUrl)}${path}`;
}

/** Is the proxy running? Only meaningful on web. */
export async function proxyReachable(): Promise<boolean> {
  if (!NEEDS_PROXY) return true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${CANVAS_PROXY}/__health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** One fetch helper shared by the live connector and the connection check. */
export async function canvasFetch(
  baseUrl: string,
  token: string,
  path: string,
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(canvasUrl(baseUrl, path), {
      headers: { Authorization: `Bearer ${token.trim()}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}


/**
 * Hosts that serve data we need but send no CORS headers, so a browser
 * cannot read their responses at all. Phones fetch these directly.
 */
const PROXIED_HOSTS =
  /(^|\.)(outlook\.office365\.com|outlook\.office\.com|outlook\.live\.com|outlook\.com|mit\.edu)$/i;
/** calendar.mit.edu and api.openalex.org send CORS headers and are fetched directly. */
const DIRECT_HOSTS = /^(calendar\.mit\.edu|api\.openalex\.org)$/i;

/** Is this a host the local proxy will forward to? */
export function isProxiedHost(url: string): boolean {
  try {
    const host = new URL(url).host;
    return PROXIED_HOSTS.test(host) && !DIRECT_HOSTS.test(host);
  } catch {
    return false;
  }
}

/**
 * Where to actually fetch a cross-origin URL from. Same story as Canvas:
 * direct on the phone, via the local proxy in a browser.
 */
export function proxiedUrl(url: string): string {
  if (!NEEDS_PROXY) return url;
  try {
    const u = new URL(url);
    if (PROXIED_HOSTS.test(u.host) && !DIRECT_HOSTS.test(u.host)) {
      return `${CANVAS_PROXY}/${u.host}${u.pathname}${u.search}`;
    }
  } catch {
    // Malformed URL: let fetch fail with a real error message.
  }
  return url;
}

/** Back-compat alias - ICS feeds were the first users of this. */
export const icsFetchUrl = proxiedUrl;
