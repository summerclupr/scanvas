/**
 * Verifies classes are editable and that unticking one genuinely silences its
 * coursework - in the Due list and in the notification plan.
 */

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

async function clickChip(page: any, label: string) {
  return page.evaluate((l: string) => {
    const hits = Array.from(document.querySelectorAll('div')).filter(
      (n) => (n as HTMLElement).innerText?.trim() === l,
    );
    const t = hits[hits.length - 1];
    if (!t) return false;
    (t as HTMLElement).click();
    return true;
  }, label);
}

/**
 * Click a chip inside the classes card specifically. Scoped by climbing from
 * the "Add a class" input rather than by heading text - SectionHeader
 * uppercases its title, so matching on "Your classes" never fires.
 */
async function clickCourseChip(page: any, code: string) {
  return page.evaluate((c: string) => {
    const input = Array.from(document.querySelectorAll('input')).find((i) =>
      (i as HTMLInputElement).placeholder?.includes('Add a class'),
    );
    if (!input) return 'no-card';
    let root: HTMLElement | null = input as HTMLElement;
    for (let k = 0; k < 6 && root?.parentElement; k++) root = root.parentElement;
    if (!root) return 'no-root';
    const hits = Array.from(root.querySelectorAll('div')).filter(
      (n) => (n as HTMLElement).innerText?.trim() === c,
    );
    const t = hits[hits.length - 1];
    if (!t) return 'no-chip';
    (t as HTMLElement).click();
    return 'ok';
  }, code);
}

const dueSummary = (page: any) =>
  page.evaluate(() => {
    const t = document.body.innerText;
    const owe = /(\d+) things? you owe|Nothing outstanding/.exec(t);
    const hidden = /(\d+) items? hidden/.exec(t);
    const codes = [...t.matchAll(/\b(6\.1010|6\.1210|18\.06|6\.3900)\b/g)].map((m) => m[1]);
    return {
      owe: owe ? owe[0] : '?',
      hidden: hidden ? hidden[0] : 'none',
      codes: [...new Set(codes)].sort().join(', '),
    };
  });

const planned = (page: any) =>
  page.evaluate(() => {
    const m = /Would fire\s*\n?\s*(\d+ reminders?)/.exec(document.body.innerText);
    return m ? m[1] : '?';
  });

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 180_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 1500 });
  const errors: string[] = [];
  page.on('pageerror', (e: unknown) => errors.push((e as Error).message));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate((p: unknown) => {
    localStorage.setItem('agenda:profile:v1', JSON.stringify(p));
  }, PROFILE);

  await page.goto(`${URL}/settings`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));
  await clickChip(page, 'Sync now');
  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const t = await page.evaluate(() => document.body.innerText);
    if (/Would fire/.test(t) && !/Reading/.test(t)) break;
  }
  await new Promise((r) => setTimeout(r, 1200));

  console.log('baseline planned reminders:', await planned(page));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('baseline Due:', JSON.stringify(await dueSummary(page)));

  // Untick 6.1210 (has both a pset and a midterm in the fixtures).
  await page.goto(`${URL}/settings`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('\n-> unticking 6.1210');
  console.log('   clicked:', await clickCourseChip(page, '6.1210'));
  await new Promise((r) => setTimeout(r, 1800));
  console.log('   planned reminders:', await planned(page));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('   Due:', JSON.stringify(await dueSummary(page)));

  // Re-tick it: the chip must still be there (the old UI deleted it).
  await page.goto(`${URL}/settings`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('\n-> re-ticking 6.1210 (chip must still exist)');
  console.log('   clicked:', await clickCourseChip(page, '6.1210'));
  await new Promise((r) => setTimeout(r, 1800));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('   Due:', JSON.stringify(await dueSummary(page)));

  // Add a class by hand.
  await page.goto(`${URL}/settings`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.evaluate(() => {
    const i = Array.from(document.querySelectorAll('input')).find((x) =>
      (x as HTMLInputElement).placeholder?.includes('Add a class'),
    ) as HTMLInputElement | undefined;
    if (i) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )!.set!;
      setter.call(i, '8.02');
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  await clickChip(page, 'Add');
  await new Promise((r) => setTimeout(r, 1200));

  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('agenda:profile:v1') ?? '{}').courses,
  );
  console.log('\npersisted courses:', JSON.stringify(persisted));
  console.log('page errors:', errors.length ? errors.join('; ') : 'none');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
