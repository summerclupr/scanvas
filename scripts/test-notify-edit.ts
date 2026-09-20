/**
 * Verifies notification timing is genuinely editable:
 * toggle a lead-time chip and confirm the planned count actually changes.
 */

import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL ?? 'http://localhost:8099';

const PROFILE = {
  version: 1,
  completedOnboarding: true,
  priorities: { urop: 0.95, club_event: 0.5, talk: 0.95, career: 0.5, social: 0.05, application_deadline: 0.5 },
  fields: ['machine learning', 'computer vision'],
  people: [],
  orgs: ['CSAIL'],
  courses: ['6.1010', '6.1210', '18.06', '6.3900'],
  keywords: { include: [], exclude: [] },
  freeFood: true,
  enabledSources: ['canvas', 'outlook', 'mit'],
  notify: {
    enabled: true,
    examLeadHours: [168, 72, 24, 2],
    assignmentLeadHours: [48, 12, 2],
    opportunityLeadHours: [24, 1],
    opportunityScoreFloor: 0.45,
    quietHours: [1, 8],
    dailyDigestHour: 8,
  },
  feedback: { saved: [], dismissed: [] },
};

/** Read the "Would fire N reminders" line. */
async function planned(page: any): Promise<string> {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const m = /Would fire\s*\n?\s*(\d+ reminders?)/.exec(t);
    return m ? m[1] : 'not found';
  });
}

async function chips(page: any): Promise<string> {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const m = /(\d+ exam)\s*\n?\s*(\d+ due)\s*\n?\s*(\d+ events)/.exec(t);
    return m ? `${m[1]}, ${m[2]}, ${m[3]}` : 'not found';
  });
}

/**
 * Click a chip by label, optionally scoped to the picker under a given
 * heading. Scoping matters: "1 week" appears in all three lead-time pickers,
 * and an unscoped click lands on whichever happens to be last in the DOM.
 */
async function clickChip(page: any, label: string, section?: string): Promise<boolean> {
  return page.evaluate(
    (l: string, sec: string | undefined) => {
      let root: ParentNode = document;
      if (sec) {
        const heading = Array.from(document.querySelectorAll('div')).find(
          (n) => (n as HTMLElement).innerText?.trim() === sec,
        );
        // The picker is heading + chip row inside a shared container.
        const container = heading?.parentElement?.parentElement;
        if (!container) return false;
        root = container;
      }
      const exact = Array.from(root.querySelectorAll('div')).filter(
        (n) => (n as HTMLElement).innerText?.trim() === l,
      );
      const target = exact[exact.length - 1];
      if (!target) return false;
      (target as HTMLElement).click();
      return true;
    },
    label,
    section,
  );
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 180_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932 });
  const errors: string[] = [];
  page.on('pageerror', (e: unknown) => errors.push((e as Error).message));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate((p: unknown) => {
    localStorage.setItem('agenda:profile:v1', JSON.stringify(p));
  }, PROFILE);

  // Sync once so there are real events to schedule against.
  await page.goto(`${URL}/settings`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));
  await clickChip(page, 'Sync now');
  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const t = await page.evaluate(() => document.body.innerText);
    if (/Would fire/.test(t) && !/Reading/.test(t)) break;
  }
  await new Promise((r) => setTimeout(r, 1500));

  console.log('baseline exam leads : 1 week, 3 days, 1 day, 2h');
  console.log('baseline planned    :', await planned(page), '|', await chips(page));

  // Turn OFF the "1 week" exam lead.
  console.log('\n-> tapping exam "1 week" to remove it');
  console.log('   clicked:', await clickChip(page, '1 week', 'Exams and quizzes'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('   planned:', await planned(page), '|', await chips(page));

  // Turn ON a "2 weeks" exam lead.
  console.log('\n-> tapping exam "2 weeks" to add it');
  console.log('   clicked:', await clickChip(page, '2 weeks', 'Exams and quizzes'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('   planned:', await planned(page), '|', await chips(page));

  // Tighten the event bar to Rare.
  console.log('\n-> setting event bar to "Rare"');
  console.log('   clicked:', await clickChip(page, 'Rare'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('   planned:', await planned(page), '|', await chips(page));

  // Turn reminders off entirely.
  console.log('\n-> toggling reminders Off');
  console.log('   clicked:', await clickChip(page, 'On'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('   planned:', await planned(page), '|', await chips(page));

  // Confirm it survives a reload.
  await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2500));
  const persisted = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('agenda:profile:v1') ?? '{}');
    return JSON.stringify(p.notify);
  });
  console.log('\npersisted notify prefs:', persisted);

  await page.screenshot({ path: 'shots/11-notify-editor.png', fullPage: false });
  console.log('\npage errors:', errors.length ? errors.join('; ') : 'none');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
