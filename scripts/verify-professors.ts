/**
 * Proves every professor link in the dataset actually resolves, and that no
 * email was invented - each listed email must appear in plain text on that
 * professor's own public page.
 *
 *   npm run verify:profs
 */
import { PROFESSORS } from '../src/careers/professors';
import { DEPARTMENTS } from '../src/search/intent';

/**
 * 0 = unreachable. 299 = the server answered but Node couldn't verify its
 * TLS chain (missing intermediate certificate) - browsers accept these, and
 * the link opens in the user's browser, so it counts as resolving, noted.
 */
async function head(url: string): Promise<number> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 20_000);
    const r = await fetch(url, { redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    return r.status;
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    return code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ? 299 : 0;
  }
}

async function bodyHasEmail(url: string, email: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 20_000);
    const r = await fetch(url, { redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    const text = await r.text();
    return text.toLowerCase().includes(email.toLowerCase());
  } catch { return false; }
}

async function main() {
  let bad = 0;
  console.log(`checking ${PROFESSORS.length} faculty entries\n`);
  for (const p of PROFESSORS) {
    const status = await head(p.homepage);
    let ok = status >= 200 && status < 400;
    if (p.deptPage) {
      const dept = await head(p.deptPage);
      if (dept < 200 || dept >= 400) { ok = false; console.log(`BAD ${dept}  ${p.name} deptPage ${p.deptPage}`); }
    }
    if (!ok) bad++;
    let emailNote = '';
    if (p.email) {
      const verified = await bodyHasEmail(p.homepage, p.email);
      if (!verified) { bad++; emailNote = `  EMAIL NOT ON PAGE: ${p.email}`; }
      else emailNote = `  email verified on page`;
    }
    console.log(`${ok ? 'OK ' : 'BAD'} ${String(status).padStart(3)}  ${p.name.padEnd(20)} ${p.homepage}${emailNote}`);
  }
  console.log(`\nchecking ${DEPARTMENTS.length} department homepages\n`);
  for (const d of DEPARTMENTS) {
    const status = await head(d.info.website);
    const ok = status >= 200 && status < 400;
    if (!ok) bad++;
    console.log(`${ok ? 'OK ' : 'BAD'} ${String(status).padStart(3)}  ${d.info.name.padEnd(52)} ${d.info.website}${status === 299 ? '  (answers; TLS chain incomplete for Node, fine in a browser)' : ''}`);
  }
  console.log(bad === 0 ? '\nall links resolve, all emails verified' : `\n${bad} problem(s)`);
  process.exit(bad ? 1 : 0);
}
main();
