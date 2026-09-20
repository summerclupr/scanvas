/** Loads the app with a seeded profile, triggers a sync, streams the console. */

import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL ?? 'http://localhost:8099';

const PROFILE = {
  version: 1,
  completedOnboarding: true,
  priorities: { urop: 0.95, club_event: 0.5, talk: 0.95, career: 0.5, social: 0.05, application_deadline: 0.5 },
  fields: ['machine learning'],
  people: [],
  orgs: ['CSAIL'],
  courses: ['6.1010'],
  keywords: { include: [], exclude: [] },
  freeFood: true,
  enabledSources: ['canvas', 'outlook', 'mit'],
  notify: {
    enabled: true,
    examLeadHours: [168, 72, 24, 2],
    assignmentLeadHours: [48, 12, 2],
    opportunityLeadHours: [24, 1],
    opportunityScoreFloor: 0.55,
    quietHours: [1, 8],
    dailyDigestHour: 8,
  },
  feedback: { saved: [], dismissed: [] },
};

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();

  page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`.slice(0, 400)));
  page.on('pageerror', (e: unknown) => console.log(`[PAGEERROR] ${(e as Error).message}`));
  page.on('requestfailed', (r) =>
    console.log(`[REQFAIL] ${r.url().slice(0, 90)} :: ${r.failure()?.errorText}`),
  );
  page.on('error', (e: unknown) => console.log(`[CRASH] ${(e as Error).message}`));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate((p: unknown) => {
    localStorage.setItem('agenda:profile:v1', JSON.stringify(p));
  }, PROFILE);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2500));

  console.log('--- triggering sync ---');
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.reverse().find((e) => (e as HTMLElement).innerText?.trim() === 'Settings');
    if (hit) (hit as HTMLElement).click();
    return Boolean(hit);
  });
  console.log('settings clicked:', clicked);
  await new Promise((r) => setTimeout(r, 1500));

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.reverse().find((e) => (e as HTMLElement).innerText?.trim() === 'Sync now');
    if (hit) (hit as HTMLElement).click();
  });

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const t = await page.evaluate(() => document.body.innerText.slice(0, 200));
      console.log(`t+${(i + 1) * 5}s alive. head: ${t.replace(/\n/g, ' | ').slice(0, 140)}`);
    } catch (e: unknown) {
      console.log(`t+${(i + 1) * 5}s PAGE GONE: ${(e as Error).message}`);
      break;
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
