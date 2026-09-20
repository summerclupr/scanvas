/**
 * Render the Scanvas mark (assets/brand/*.svg) to the PNGs Expo needs.
 *
 *   npm run brand
 *
 * Uses the local Chrome through puppeteer, since no image tooling is
 * assumed on the machine. The SVG is the source of truth; never edit the
 * PNGs by hand.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface Job {
  svg: string;
  out: string;
  size: number;
  /** Scale the artwork inside the canvas (Android foreground wants a 66% safe zone). */
  inset?: number;
  /** Solid background instead of transparency. */
  background?: string;
}

const JOBS: Job[] = [
  { svg: 'assets/brand/scanvas-mark.svg', out: 'assets/images/icon.png', size: 1024 },
  { svg: 'assets/brand/scanvas-mark.svg', out: 'assets/images/favicon.png', size: 64 },
  { svg: 'assets/brand/scanvas-mark.svg', out: 'assets/images/favicon-192.png', size: 192 },
  { svg: 'assets/brand/scanvas-mark.svg', out: 'assets/images/splash-icon.png', size: 512 },
  { svg: 'assets/brand/scanvas-mark.svg', out: 'assets/images/scanvas-mark.png', size: 256 },
  { svg: 'assets/brand/scanvas-mark.svg', out: 'assets/images/android-icon-foreground.png', size: 1024, inset: 0.66 },
  { svg: 'assets/brand/scanvas-mono.svg', out: 'assets/images/android-icon-monochrome.png', size: 1024, inset: 0.66 },
  { svg: '', out: 'assets/images/android-icon-background.png', size: 1024, background: '#3D7BFF' },
];

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  for (const job of JOBS) {
    const svg = job.svg ? readFileSync(job.svg, 'utf8') : '';
    const inner = job.inset ? job.size * job.inset : job.size;
    const pad = (job.size - inner) / 2;
    await page.setViewport({ width: job.size, height: job.size, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;width:${job.size}px;height:${job.size}px;background:${job.background ?? 'transparent'}">` +
        (svg
          ? `<div style="position:absolute;left:${pad}px;top:${pad}px;width:${inner}px;height:${inner}px">${svg.replace(
              /width="1024" height="1024"/,
              `width="${inner}" height="${inner}"`,
            )}</div>`
          : '') +
        `</body></html>`,
    );
    const png = await page.screenshot({
      omitBackground: !job.background,
      clip: { x: 0, y: 0, width: job.size, height: job.size },
    });
    mkdirSync(job.out.split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(job.out, png);
    console.log(`${job.out}  ${job.size}px${job.inset ? ` (art ${Math.round(job.inset * 100)}%)` : ''}`);
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
