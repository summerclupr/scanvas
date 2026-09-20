/**
 * Drives the web build through onboarding and screenshots every screen.
 *
 *   npm run web          # in one terminal
 *   npm run shots        # in another
 *
 * This exists because "it typechecks and bundles" says nothing about whether
 * the app actually renders with real data in it. Screenshots land in ./shots.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL ?? 'http://localhost:8099';
const OUT = 'shots';

/** A profile that makes the fixture data rank interestingly. */
const DEMO_PROFILE = {
  version: 1,
  completedOnboarding: true,
  priorities: {
    urop: 0.95,
    club_event: 0.5,
    talk: 0.95,
    career: 0.5,
    social: 0.05,
    application_deadline: 0.5,
  },
  fields: ['machine learning', 'computer vision', 'robotics'],
  people: ['Chelsea Finn', 'Nickolai Zeldovich'],
  orgs: ['CSAIL'],
  courses: ['6.1010', '6.1210', '18.06', '6.3900'],
  keywords: { include: ['pytorch'], exclude: [] },
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

async function shoot(page: Page, name: string, waitMs = 1200) {
  await new Promise((r) => setTimeout(r, waitMs));
  try {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`\n=== ${name} ===`);
    console.log(text.split('\n').filter(Boolean).slice(0, 26).join('\n'));
    return text;
  } catch (err) {
    console.log(`\n=== ${name} === FAILED: ${(err as Error).message}`);
    return '';
  }
}

/** Click by visible text - the RN web output has no stable test ids. */
async function clickText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t: string) => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.reverse().find(
      (e) => (e as HTMLElement).innerText?.trim() === t,
    );
    if (!hit) return false;
    (hit as HTMLElement).click();
    return true;
  }, text);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let browser: Browser | undefined;
  const errors: string[] = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      // A sync runs the local model for ~30s with no CDP traffic; the default
      // 30s protocol timeout kills the session right as it finishes.
      protocolTimeout: 180_000,
      args: ['--window-size=430,932'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 });

    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e: unknown) => {
      errors.push(`PAGEERROR: ${(e as Error).message}`);
    });

    // --- onboarding, as a new user sees it -------------------------------
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    await shoot(page, '01-onboarding-priorities', 2500);

    await clickText(page, 'Continue');
    await shoot(page, '02-onboarding-fields');

    await clickText(page, 'Continue');
    await shoot(page, '03-onboarding-people');

    await clickText(page, 'Continue');
    await shoot(page, '04-onboarding-courses');

    await clickText(page, 'Continue');
    await shoot(page, '05-onboarding-alerts');

    // --- seed a completed profile and reload into the app ----------------
    await page.evaluate((p: unknown) => {
      localStorage.setItem('agenda:profile:v1', JSON.stringify(p));
    }, DEMO_PROFILE);

    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    await shoot(page, '06-due-before-sync', 3000);

    // Tabs are navigated by route: the tab bar renders the emoji and the
    // label as separate nodes, so a text click is ambiguous.
    await page.goto(`${URL}/settings`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2000));
    await clickText(page, 'Sync now');
    console.log('\nsyncing (local model, this takes ~30s)...');
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const t = await page.evaluate(() => document.body.innerText);
      if (/Last synced/.test(t)) break;
    }
    await shoot(page, '07-settings-after-sync');

    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    await shoot(page, '08-due', 2500);

    await page.goto(`${URL}/feed`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await shoot(page, '09-for-you', 2500);

    // Expand a score breakdown to prove the explanation UI works.
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div,span'));
      const hit = els.find((e) => /% match/.test((e as HTMLElement).innerText ?? ''));
      (hit as HTMLElement | undefined)?.click();
    });
    await shoot(page, '10-score-breakdown', 1200);

    writeFileSync(`${OUT}/console-errors.txt`, errors.join('\n') || 'none');
    console.log(`\n=== console errors (${errors.length}) ===`);
    console.log(errors.slice(0, 20).join('\n') || 'none');
  } finally {
    await browser?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
