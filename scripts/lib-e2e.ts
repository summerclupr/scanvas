/**
 * Shared helpers for the browser-driven tests.
 *
 * `waitForSync` exists because the obvious wait is wrong: "Would fire ..." is
 * a static label in Settings, so polling for it matches instantly, before the
 * sync has even started. Tests then read localStorage too early and conclude
 * nothing persisted. Wait on the stored artifact instead of on-screen text.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const URL = process.env.APP_URL ?? 'http://localhost:8099';

export const DEMO_PROFILE = {
  version: 1,
  completedOnboarding: true,
  priorities: {
    urop: 0.95, club_event: 0.5, talk: 0.95,
    career: 0.5, social: 0.05, application_deadline: 0.5,
  },
  fields: ['machine learning', 'computer vision'],
  people: [],
  orgs: ['CSAIL'],
  courses: ['6.1010', '6.1210', '18.06', '6.3900'],
  keywords: { include: [], exclude: [] },
  freeFood: true,
  enabledSources: ['canvas', 'outlook', 'mit'],
  notify: {
    enabled: true,
    sound: true,
    examLeadHours: [168, 72, 24, 2],
    assignmentLeadHours: [48, 12, 2],
    opportunityLeadHours: [24, 1],
    opportunityScoreFloor: 0.45,
    quietHours: [1, 8],
    dailyDigestHour: 8,
  },
  feedback: { saved: [], dismissed: [] },
};

export async function launch(): Promise<{ browser: Browser; page: Page; errors: string[] }> {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 180_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 1600 });
  const errors: string[] = [];
  page.on('pageerror', (e: unknown) => errors.push((e as Error).message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { browser, page, errors };
}

export async function seed(page: Page, profile: unknown = DEMO_PROFILE) {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate((p: unknown) => {
    localStorage.setItem('agenda:profile:v1', JSON.stringify(p));
  }, profile);
}

export async function go(page: Page, path = '') {
  await page.goto(`${URL}${path}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  // Storage reads plus first paint; the gate renders nothing until ready.
  await new Promise((r) => setTimeout(r, 2800));
}

/** Click the last element whose trimmed text matches exactly. */
export async function clickText(page: Page, label: string): Promise<boolean> {
  return page.evaluate((l: string) => {
    const hits = Array.from(document.querySelectorAll('div,span,button')).filter(
      (n) => (n as HTMLElement).innerText?.trim() === l,
    );
    const t = hits[hits.length - 1];
    if (!t) return false;
    (t as HTMLElement).click();
    return true;
  }, label);
}

/** Press Sync now and wait until events are actually written to storage. */
export async function runSync(page: Page, timeoutMs = 120_000): Promise<boolean> {
  const before = await page.evaluate(
    () => localStorage.getItem('agenda:lastSync:v1') ?? '',
  );
  if (!(await clickText(page, 'Sync now'))) return false;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const done = await page.evaluate((prev: string) => {
      const last = localStorage.getItem('agenda:lastSync:v1') ?? '';
      return Boolean(localStorage.getItem('agenda:events:v1')) && last !== prev;
    }, before);
    if (done) {
      // Let the post-sync renders settle before anything reads the DOM.
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    }
  }
  return false;
}

export const bodyText = (page: Page) =>
  page.evaluate(() => document.body.innerText);
