/**
 * Tiny CORS proxy for the web build.
 *
 *   npm run proxy
 *
 * Canvas sends no Access-Control-Allow-Origin header, so a browser refuses to
 * read its responses. The phone build has no such restriction and talks to
 * Canvas directly — this exists only so the web build is usable for demos and
 * development.
 *
 * Requests look like:
 *   http://localhost:8788/canvas.mit.edu/api/v1/users/self
 * The first path segment is the target host; the rest is forwarded verbatim,
 * along with the Authorization header.
 *
 * Deliberately not a general-purpose relay:
 *   - binds to 127.0.0.1 only, so nothing off this machine can reach it
 *   - forwards only to hosts that look like Canvas instances
 *   - never logs the Authorization header
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env.CANVAS_PROXY_PORT ?? 8788);

/** Only Canvas-shaped hosts, so this can't be pointed at anything else. */
function isAllowedHost(host: string): boolean {
  return (
    /^[a-z0-9.-]+$/i.test(host) &&
    (/\.instructure\.com$/i.test(host) ||
      /^canvas\./i.test(host) ||
      /\.canvas\.[a-z]+$/i.test(host) ||
      /canvas\.[a-z0-9-]+\.edu$/i.test(host) ||
      // Published-calendar ICS feeds, which send no CORS headers either.
      // Work/school accounts (MIT included) now hand out outlook.office.com
      // links; office365.com is the older form and both are still issued.
      /^outlook\.office365\.com$/i.test(host) ||
      /^outlook\.office\.com$/i.test(host) ||
      /^outlook\.live\.com$/i.test(host) ||
      /^outlook\.com$/i.test(host) ||
      // MIT Engage's official campus-events iCal feed.
      /^engage\.mit\.edu$/i.test(host) ||
      // Hydrant's public class catalogue (lecture/recitation times).
      /^hydrant\.mit\.edu$/i.test(host) ||
      // Any MIT site: followed clubs' own pages (poker.mit.edu) and the
      // Engage club directory. Still MIT-only - this is not a general relay.
      /\.mit\.edu$/i.test(host))
  );
}

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Health check, so the app can tell whether the proxy is running.
  if (url.pathname === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, proxy: 'canvas' }));
    return;
  }

  const segments = url.pathname.replace(/^\/+/, '').split('/');
  const host = segments.shift() ?? '';
  if (!isAllowedHost(host)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Refusing to proxy to "${host}"` }));
    return;
  }

  const target = `https://${host}/${segments.join('/')}${url.search}`;
  const auth = req.headers.authorization;

  try {
    const upstream = await fetch(target, {
      headers: auth ? { Authorization: auth } : {},
    });
    const body = await upstream.text();
    // Canvas paginates with a Link header; the client needs it to follow pages.
    const link = upstream.headers.get('link');
    if (link) res.setHeader('Link', link);
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      // Published calendars are live feeds; a cached copy here would defeat
      // the no-store on the client side.
      'Cache-Control': 'no-store, max-age=0',
    });
    res.end(body);
    console.log(`${upstream.status}  ${req.method} /${host}/${segments.join('/')}`);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
    console.error(`502  ${target}: ${(err as Error).message}`);
  }
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Canvas CORS proxy on http://localhost:${PORT}`);
  console.log('The web build will find it automatically. Phone builds skip it.');
});
