/**
 * Headless run of the whole pipeline against real Ollama.
 *
 *   npm run pipeline
 *
 * This exercises every part of the app except React Native: connectors,
 * deterministic normalization, LLM extraction from prose, dedupe, interest
 * scoring, and the notification plan. Useful for tuning prompts and weights
 * without rebuilding the app, and it's the fastest way to see whether a
 * different local model is good enough.
 */

import { sync, defaultWindow, buildRegistry } from '../src/connectors';
import type { ConnectorCredentials } from '../src/connectors/types';
import { DEFAULT_PROFILE, type InterestProfile } from '../src/core/profile';
import { DEFAULT_OLLAMA, health } from '../src/llm/ollama';
import { EmbeddingCache, embeddingText } from '../src/ranking/embed';
import { feedFor, scoreAll, sortForAgenda } from '../src/ranking/score';
import { planNotifications, planDigest } from '../src/notify/rules';
import { relativeLabel } from '../src/core/datetime';
import { pct, summarize } from '../src/core/grades';
import { enrolledCourseCodes } from '../src/connectors/canvas';

/** A plausible sophomore: wants a UROP, into ML, follows two CSAIL names. */
const DEMO_PROFILE: InterestProfile = {
  ...DEFAULT_PROFILE,
  completedOnboarding: true,
  priorities: {
    urop: 0.95,
    talk: 0.8,
    club_event: 0.6,
    career: 0.45,
    social: 0.2,
    application_deadline: 0.7,
  },
  fields: ['machine learning', 'computer vision', 'robotics'],
  people: ['Chelsea Finn', 'Nickolai Zeldovich'],
  orgs: ['CSAIL'],
  courses: enrolledCourseCodes(),
  keywords: { include: ['pytorch'], exclude: ['ballroom'] },
  freeFood: true,
};

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function bar(score: number, width = 12): string {
  const filled = Math.round(score * width);
  return `${'#'.repeat(filled)}${'.'.repeat(width - filled)}`;
}

async function main() {
  const cfg = { ...DEFAULT_OLLAMA };
  const hostArg = process.argv.find((a: string) => a.startsWith('--host='));
  if (hostArg) cfg.host = hostArg.split('=')[1];
  const modelArg = process.argv.find((a: string) => a.startsWith('--model='));
  if (modelArg) cfg.chatModel = modelArg.split('=')[1];

  /**
   * Real credentials come from the environment, never from a file in the
   * repo. With CANVAS_TOKEN set, Canvas runs live and everything else keeps
   * replaying samples - the same per-source split the app does.
   */
  const creds: ConnectorCredentials = {};
  if (process.env.CANVAS_TOKEN) {
    creds.canvas = {
      baseUrl: process.env.CANVAS_URL ?? 'https://canvas.mit.edu',
      token: process.env.CANVAS_TOKEN,
    };
  }
  const registry = buildRegistry(creds);
  const liveSources = (Object.keys(registry) as (keyof typeof registry)[])
    .filter((id) => registry[id] && !registry[id]!.isFixture);
  console.log(
    liveSources.length
      ? green(`\nLIVE: ${liveSources.join(', ')}`) + dim('  (others are samples)')
      : yellow('\nAll sources are SAMPLE DATA. Set CANVAS_TOKEN for real Canvas.'),
  );

  console.log(bold('\nChecking Ollama...'));
  const h = await health(cfg);
  if (!h.reachable) {
    console.error(red(`  unreachable at ${cfg.host}: ${h.error}`));
    console.error(dim('  start it with: ollama serve'));
    process.exit(1);
  }
  console.log(green(`  up at ${cfg.host}`));
  if (h.missing.length) {
    console.error(red(`  missing models: ${h.missing.join(', ')}`));
    console.error(dim(`  pull them with: ollama pull ${h.missing.join(' && ollama pull ')}`));
    process.exit(1);
  }
  console.log(dim(`  chat=${cfg.chatModel}  embed=${cfg.embedModel}`));

  // --- sync ---------------------------------------------------------------
  console.log(bold('\nSyncing...'));
  let partialAt = 0;
  const t0 = Date.now();
  const result = await sync({
    window: defaultWindow(),
    creds,
    registry,
    ollama: cfg,
    onPartial: () => {
      partialAt = Date.now() - t0;
    },
    onProgress: (p) => {
      if (p.phase === 'extracting' && p.extracted !== undefined) {
        process.stdout.write(`\r  ${p.message}   `);
      } else {
        console.log(`  ${p.message}`);
      }
    },
  });
  console.log('');

  for (const s of result.sources) {
    const note = s.error ? red(` (${s.error})`) : '';
    console.log(dim(`  ${s.id.padEnd(8)} ${String(s.fetched).padStart(2)} items${note}`));
  }
  console.log(
    dim(
      `  structured ready in ${partialAt}ms; ` +
        `model read ${result.inferred.attempted} messages, kept ${result.inferred.kept}; ` +
        `total ${(result.durationMs / 1000).toFixed(1)}s`,
    ),
  );

  // --- score --------------------------------------------------------------
  console.log(bold('\nEmbedding interests and events...'));
  const cache = new EmbeddingCache();
  await cache.warm(cfg, DEMO_PROFILE.fields, 'query');
  await cache.warm(cfg, result.events.map(embeddingText), 'document');
  console.log(dim(`  ${cache.size} vectors cached`));

  const scored = scoreAll(result.events, {
    profile: DEMO_PROFILE,
    cache,
    obligations: [],
  });

  // --- obligations --------------------------------------------------------
  const DONE = new Set(['submitted', 'graded', 'pending_review', 'excused', 'missing']);
  const agenda = sortForAgenda(scored).filter((e) => e.lane === 'obligation');
  console.log(bold('\n=== DUE / EXAMS (never filtered) ==='));
  for (const e of agenda) {
    if (['lecture', 'recitation', 'office_hours'].includes(e.kind)) continue;
    // Handed in already: it belongs to the grades view, not the to-do list.
    if (DONE.has(e.submission?.state ?? '')) continue;
    const flag = e.kind === 'exam' || e.kind === 'quiz' ? red('EXAM ') : yellow('DUE  ');
    console.log(
      `  ${flag} ${bar(e.urgency)} ${(e.course?.code ?? '').padEnd(7)} ${e.title}`,
    );
    console.log(dim(`         ${relativeLabel(e.start)}  ${e.location ?? ''}  [${e.source}]`));
  }

  // --- opportunities ------------------------------------------------------
  const feed = feedFor(scored, 0);
  console.log(bold('\n=== FOR YOU (interest-filtered) ==='));
  for (const e of feed) {
    const shown = e.score >= 0.4 ? green('SHOW') : dim('hide');
    console.log(`  ${shown} ${bar(e.score)} ${e.score.toFixed(2)}  ${e.title}`);
    console.log(
      dim(`         ${relativeLabel(e.start)}  ${e.organizer ?? ''}  [${e.source}]`),
    );
    for (const r of e.reasons) {
      const sign = r.delta >= 0 ? '+' : '';
      console.log(dim(`           ${sign}${r.delta.toFixed(2)}  ${r.label}`));
    }
  }

  // --- grades ---------------------------------------------------------------
  const grades = summarize(result.events);
  console.log(bold('\n=== WORK HANDED IN ==='));
  if (grades.courses.length === 0) {
    console.log(dim('  nothing graded yet'));
  } else {
    for (const course of grades.courses) {
      const avg = course.average === null ? '  -- ' : pct(course.average).padStart(5);
      console.log(
        `  ${bold(course.courseCode.padEnd(8))} ${avg}  ` +
          dim(`${course.earned}/${course.possible} pts, ${course.graded.length} graded`),
      );
      for (const g of course.graded) {
        const flag = g.missing ? red(' MISSING') : g.late ? yellow(' late') : '';
        console.log(
          dim(`      ${pct(g.fraction).padStart(4)}  ${String(g.score).padStart(3)}/${g.pointsPossible}  ${g.title}${flag}`),
        );
      }
      for (const p of course.pending) {
        console.log(dim(`      ${'--'.padStart(4)}  submitted, not graded: ${p.title}`));
      }
    }
    if (grades.overall !== null) {
      console.log(bold(`\n  overall ${pct(grades.overall)}`) + dim(' (points-weighted, graded only)'));
    }
  }

  // --- notifications ------------------------------------------------------
  const plan = planNotifications(scored, DEMO_PROFILE.notify);
  const digest = planDigest(scored, DEMO_PROFILE.notify);
  console.log(bold(`\n=== NOTIFICATION PLAN (${plan.length + (digest ? 1 : 0)}) ===`));
  for (const p of [...(digest ? [digest] : []), ...plan].slice(0, 16)) {
    const at = p.fireAt.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    console.log(`  ${at.padEnd(20)} ${p.category.padEnd(11)} ${p.title}`);
    console.log(dim(`  ${' '.repeat(20)} ${p.body}`));
  }
  if (plan.length > 16) console.log(dim(`  ... and ${plan.length - 16} more`));

  console.log('');
}

main().catch((err) => {
  console.error(red(`\nFailed: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
