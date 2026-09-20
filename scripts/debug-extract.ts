/**
 * Debug harness for the extractor. Prints raw model output and the resolved
 * date for each unstructured item, instead of swallowing failures the way the
 * sync path does.
 *
 *   npm run debug:extract -- --model=qwen3:4b
 */

import { CONNECTORS, defaultWindow } from '../src/connectors';
import { partition } from '../src/core/normalize';
import { DEFAULT_OLLAMA } from '../src/llm/ollama';
import { extractOne } from '../src/llm/extract';
import { resolveWhen } from '../src/core/datetime';

async function main() {
  const cfg = { ...DEFAULT_OLLAMA };
  const modelArg = process.argv.find((a: string) => a.startsWith('--model='));
  if (modelArg) cfg.chatModel = modelArg.split('=')[1];
  const limitArg = process.argv.find((a: string) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 99;

  const window = defaultWindow();
  const items = (
    await Promise.all(
      (['canvas', 'outlook', 'mit'] as const).map((id) =>
        CONNECTORS[id]!.fetch({}, window),
      ),
    )
  ).flat();

  const { unstructured } = partition(items);
  console.log(`\nmodel=${cfg.chatModel}  unstructured items=${unstructured.length}\n`);

  for (const item of unstructured.slice(0, limit)) {
    const label = `${item.source}:${item.sourceId}`;
    console.log('='.repeat(78));
    console.log(label);
    console.log('-'.repeat(78));
    console.log(item.text.slice(0, 220).replace(/\n/g, ' '));
    console.log('-'.repeat(78));

    const now = new Date();
    const t0 = Date.now();
    const out = await extractOne(cfg, item, now);
    const ms = Date.now() - t0;

    if (out.ok) {
      console.log(
        `KEPT (${ms}ms): ${out.result.title}\n` +
          `  kind=${out.result.kind} conf=${out.result.confidence}\n` +
          `  when=${JSON.stringify(out.result.when)}\n` +
          `  -> ${new Date(out.start).toLocaleString()}${out.allDay ? ' (all day)' : ''}`,
      );
    } else {
      console.log(`DROPPED (${ms}ms) reason=${out.reason}${out.error ? ` err=${out.error}` : ''}`);
      if (out.result) {
        console.log(`  model said: ${JSON.stringify(out.result).slice(0, 400)}`);
        const r = resolveWhen(out.result.when, now);
        console.log(`  resolveWhen -> ${r ? r.start.toLocaleString() : 'null'}`);
      }
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
