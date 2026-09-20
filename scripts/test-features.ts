/** End-to-end check of the Work tab, course editing, and notification prefs. */

import { launch, seed, go, clickText, runSync, bodyText, URL } from './lib-e2e';

const line = (s: string) => console.log(s);

async function main() {
  const { browser, page, errors } = await launch();
  try {
    await seed(page);
    await go(page, '/settings');
    line(`sync: ${(await runSync(page)) ? 'completed' : 'TIMED OUT'}`);

    // --- Work tab ---------------------------------------------------------
    await go(page, '/grades');
    const work = await bodyText(page);
    line('\n=== WORK TAB ===');
    line(work.split('\n').filter(Boolean).slice(0, 26).join('\n'));
    line(`\nshows "not graded" (pending excluded from average): ${/not graded/.test(work)}`);
    line(`shows "never submitted" for the real zero      : ${/never submitted/.test(work)}`);
    line(`avoids inventing letter grades                 : ${!/\b[ABCDF][+-]?\b\s*$/m.test(work)}`);

    // --- Due excludes submitted work --------------------------------------
    await go(page, '');
    const due = await bodyText(page);
    const owe = /(\d+) things? you owe|Nothing outstanding/.exec(due)?.[0];
    line(`\n=== DUE ===\n${owe}`);
    line(`graded work kept out of Due: ${!/Lab 5: Autocomplete|Bacon Number/.test(due)}`);

    // --- classes are editable and actually filter -------------------------
    await go(page, '/settings');
    const untick = await page.evaluate(() => {
      const input = Array.from(document.querySelectorAll('input')).find((i) =>
        (i as HTMLInputElement).placeholder?.includes('Add a class'),
      );
      if (!input) return 'no-card';
      let root: HTMLElement | null = input as HTMLElement;
      for (let k = 0; k < 6 && root?.parentElement; k++) root = root.parentElement;
      const hits = Array.from(root!.querySelectorAll('div')).filter(
        (n) => (n as HTMLElement).innerText?.trim() === '6.1210',
      );
      const t = hits[hits.length - 1];
      if (!t) return 'no-chip';
      (t as HTMLElement).click();
      return 'ok';
    });
    await new Promise((r) => setTimeout(r, 1600));
    line(`\n=== CLASSES ===\nunticked 6.1210: ${untick}`);

    await go(page, '');
    const after = await bodyText(page);
    line(`6.1210 gone from Due : ${!/6\.1210/.test(after)}`);
    line(`hidden count shown   : ${/(\d+) items? hidden/.exec(after)?.[0] ?? 'NONE'}`);

    await go(page, '/grades');
    const gradesAfter = await bodyText(page);
    line(`6.1210 gone from Work: ${!/6\.1210/.test(gradesAfter)}`);

    const persisted = await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('agenda:profile:v1') ?? '{}');
      return { courses: p.courses, sound: p.notify?.sound };
    });
    line(`\npersisted: ${JSON.stringify(persisted)}`);
    line(`page errors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
