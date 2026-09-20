/**
 * Event extraction from unstructured text, using the local model.
 *
 * Only items a connector could NOT parse deterministically get here - Canvas
 * assignments and Outlook calendar entries skip this path entirely. That
 * matters: local inference on a laptop is the slowest part of a sync, so we
 * spend it only where there's genuinely no structured date.
 *
 * Two rules keep this honest:
 *   1. The model never does date arithmetic. It emits a structured WhenRef and
 *      `resolveWhen` does the math against the real clock.
 *   2. No date, or low confidence, means the item is DROPPED. A calendar that
 *      invents a plausible-looking wrong time is worse than one that misses
 *      an event, because you stop trusting it.
 */

import type { EventKind, RawItem } from '../core/types';
import { resolveWhen, type WhenRef } from '../core/datetime';
import { chatJSON, type OllamaConfig } from './ollama';

export const EXTRACTABLE_KINDS: EventKind[] = [
  'assignment',
  'exam',
  'quiz',
  'project_milestone',
  'lecture',
  'recitation',
  'office_hours',
  'club_event',
  'urop',
  'talk',
  'career',
  'social',
  'application_deadline',
  'other',
];

/**
 * JSON Schema handed to Ollama's `format` parameter, which constrains decoding
 * so the output is always parseable.
 *
 * Every field inside `when` is REQUIRED, with an explicit "none" sentinel,
 * and that is load-bearing. With `weekday` merely optional, the model happily
 * emitted {"kind":"weekday","which":"this"} and left the day name out
 * entirely - eight of ten fixture items died that way. Grammar-constrained
 * decoding only guarantees what you mark required, so the fix is to force the
 * key to exist and let the enum force it to be a real day.
 */
const NONE = 'none';

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    is_event: { type: 'boolean' },
    title: { type: 'string' },
    kind: { type: 'string', enum: EXTRACTABLE_KINDS },
    when: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['absolute', 'weekday', 'offset_days', 'unknown'],
        },
        /** "YYYY-MM-DD", or "none". */
        date: { type: 'string' },
        weekday: {
          type: 'string',
          enum: [
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
            NONE,
          ],
        },
        which: { type: 'string', enum: ['this', 'next', NONE] },
        /** 0 = today, 1 = tomorrow. Ignored unless kind is offset_days. */
        offset_days: { type: 'integer' },
        /** "HH:MM" 24-hour, or "none". */
        time: { type: 'string' },
        end_time: { type: 'string' },
        all_day: { type: 'boolean' },
      },
      required: [
        'kind',
        'date',
        'weekday',
        'which',
        'offset_days',
        'time',
        'end_time',
        'all_day',
      ],
    },
    location: { type: 'string' },
    organizer: { type: 'string' },
    people: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    has_food: { type: 'boolean' },
    confidence: { type: 'number' },
  },
  required: ['is_event', 'title', 'kind', 'when', 'confidence'],
} as const;

/** Strip the "none" sentinels back to undefined before resolving. */
function cleanWhen(when: WhenRef): WhenRef {
  const blank = (v: unknown) =>
    typeof v === 'string' && (v.trim() === '' || v.trim().toLowerCase() === NONE);
  return {
    ...when,
    date: blank(when.date) ? undefined : when.date,
    weekday: blank(when.weekday) ? undefined : when.weekday,
    which: blank(when.which) ? undefined : when.which,
    time: blank(when.time) ? undefined : when.time,
    end_time: blank(when.end_time) ? undefined : when.end_time,
  };
}

export interface ExtractionResult {
  is_event: boolean;
  title: string;
  kind: EventKind;
  when: WhenRef;
  location?: string;
  organizer?: string;
  people?: string[];
  topics?: string[];
  has_food?: boolean;
  confidence: number;
}

const SYSTEM = `You extract calendar events from student messages at MIT.

You will be given one message (an email or an event listing).
Decide whether it announces a SPECIFIC scheduled thing, and if so, describe it.

Rules you must follow exactly:

1. NEVER compute a date. Describe when it happens using the "when" object.
   Every field of "when" must be present. Use the string "none" for any field
   that does not apply.

   - "absolute"    : the message states a month and day ("October 2",
                     "Sept 29-30"). Put that exact date in date as YYYY-MM-DD.
                     Use the year 2026 unless another year is stated.
                     NEVER put today's date here. If the message does not name
                     a month and day, this is the wrong kind.
   - "weekday"     : a day name is used ("Thursday", "this Saturday").
                     You MUST set weekday to that day name. Set which to
                     "this" for the coming one, "next" for the one after.
   - "offset_days" : "today"/"tonight" is 0, "tomorrow" is 1.
   - "unknown"     : no date is recoverable. Correct whenever you are unsure.

   time and end_time are 24-hour "HH:MM" ("19:00", "08:30"), or "none".
   Always pad to two digits. all_day is true only if it runs all day.

   Examples:
     "this Thursday at 4:00pm"  -> kind=weekday, weekday=thursday,
                                   which=this, time=16:00
     "Saturday 10am-4pm"        -> kind=weekday, weekday=saturday,
                                   which=this, time=10:00, end_time=16:00
     "due Friday, October 2 at 5pm" -> kind=absolute, date=2026-10-02,
                                   time=17:00
     "TONIGHT 8pm"              -> kind=offset_days, offset_days=0, time=20:00

2. Set is_event false for chatter, questions, and anything with no scheduled
   time: "does anyone have a cable", "thoughts on this paper?".

3. topics: 2-5 lowercase subject areas a student would use to describe this,
   e.g. "machine learning", "robotics", "synthetic biology", "venture capital".
   Describe the SUBJECT, not the format. Never use "seminar" or "meeting".

4. people: full names of professors, speakers, or hosts. Drop titles.

5. confidence: 0.0 to 1.0, how sure you are this is a real event with the time
   you gave. Below 0.5 means "probably wrong". Be harsh.

Respond with JSON only.`;

function userPrompt(item: RawItem, now: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const stamp = `${days[now.getDay()]}, ${now.toISOString().slice(0, 10)}`;
  return `Today is ${stamp}.
Source: ${item.source}

---
${item.text.slice(0, 4000)}
---

Extract the event.`;
}

export type DropReason =
  | 'not_event'
  | 'low_confidence'
  | 'no_date'
  | 'in_past'
  | 'model_error';

/**
 * The outcome of one extraction, including why it was rejected.
 *
 * Returning a bare null here was a mistake worth not repeating: nine of ten
 * fixture items were being discarded and there was no way to tell a genuine
 * "this is chatter" from a prompt bug without instrumenting by hand.
 */
export type ExtractOutcome =
  | {
      ok: true;
      result: ExtractionResult;
      start: string;
      end?: string;
      allDay: boolean;
    }
  | { ok: false; reason: DropReason; result?: ExtractionResult; error?: string };

export async function extractOne(
  cfg: OllamaConfig,
  item: RawItem,
  now: Date = new Date(),
  minConfidence = 0.5,
): Promise<ExtractOutcome> {
  let result: ExtractionResult;
  try {
    result = await chatJSON<ExtractionResult>(
      cfg,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt(item, now) },
      ],
      EXTRACTION_SCHEMA,
    );
  } catch (err) {
    return { ok: false, reason: 'model_error', error: (err as Error).message };
  }

  if (!result.is_event) return { ok: false, reason: 'not_event', result };
  if (typeof result.confidence !== 'number' || result.confidence < minConfidence) {
    return { ok: false, reason: 'low_confidence', result };
  }

  const resolved = resolveWhen(cleanWhen(result.when), now);
  // No recoverable date: drop rather than invent a plausible wrong time.
  if (!resolved) return { ok: false, reason: 'no_date', result };

  // A past event is a stale announcement, not something to schedule. All-day
  // items get until end of day, since "Saturday" shouldn't vanish at 12:01pm.
  const staleAfter = resolved.allDay ? 12 * 3600_000 : 3600_000;
  if (resolved.start.getTime() < now.getTime() - staleAfter) {
    return { ok: false, reason: 'in_past', result };
  }

  return {
    ok: true,
    result,
    start: resolved.start.toISOString(),
    end: resolved.end?.toISOString(),
    allDay: resolved.allDay,
  };
}

/**
 * Extract a batch with bounded concurrency. Local models serialize on the GPU
 * anyway, so a small pool keeps memory flat without losing throughput, and one
 * failed item never kills the sync.
 */
export async function extractMany(
  cfg: OllamaConfig,
  items: RawItem[],
  opts: {
    now?: Date;
    concurrency?: number;
    minConfidence?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<Map<string, ExtractOutcome>> {
  const now = opts.now ?? new Date();
  const concurrency = opts.concurrency ?? 2;
  const out = new Map<string, ExtractOutcome>();
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      // extractOne already converts model failures into an outcome, so a bad
      // item can't take the sync down with it.
      out.set(
        `${item.source}:${item.sourceId}`,
        await extractOne(cfg, item, now, opts.minConfidence),
      );
      opts.onProgress?.(++done, items.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Rationale: the one-line "why am I seeing this" under a recommended event.
// ---------------------------------------------------------------------------

const RATIONALE_SCHEMA = {
  type: 'object',
  properties: { reason: { type: 'string' } },
  required: ['reason'],
} as const;

export async function writeRationale(
  cfg: OllamaConfig,
  event: { title: string; description?: string; topics: string[]; organizer?: string },
  interests: { fields: string[]; people: string[]; orgs: string[] },
): Promise<string | undefined> {
  try {
    const out = await chatJSON<{ reason: string }>(
      cfg,
      [
        {
          role: 'system',
          content:
            'Write ONE fragment of at most 12 words saying why this event matches.\n\n' +
            'Address the reader as "you" or "your". Never write "the student".\n' +
            'Never start with "The event" or "This event". Name the specific overlap.\n' +
            'No full sentence needed, no period, no exclamation marks.\n\n' +
            'Good: "Computer vision research, and you listed computer vision"\n' +
            'Good: "Chelsea Finn is speaking, and you follow her"\n' +
            'Bad:  "The event focuses on computer vision, aligning with the student\'s interests"',
        },
        {
          role: 'user',
          content:
            `Event: ${event.title}\n` +
            `Host: ${event.organizer ?? 'unknown'}\n` +
            `Topics: ${event.topics.join(', ') || 'unknown'}\n` +
            `About: ${(event.description ?? '').slice(0, 400)}\n\n` +
            `Student's interests: ${interests.fields.join(', ') || 'none given'}\n` +
            `Follows: ${[...interests.people, ...interests.orgs].join(', ') || 'nobody'}\n\n` +
            'Why does this match?',
        },
      ],
      RATIONALE_SCHEMA,
      { temperature: 0.3 },
    );
    return tidyRationale(out.reason);
  } catch {
    return undefined; // rationales are a nicety, never a blocker
  }
}

/**
 * Enforce what the prompt asks for, because small models don't reliably honor
 * a word limit. This line sits on the card above the fold; a rambling one
 * pushes the actual event detail off screen.
 */
export function tidyRationale(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/\s+/g, ' ');

  // Strip the openers the prompt bans but the model still reaches for.
  s = s.replace(/^(this|the)\s+event\s+(is\s+|focuses\s+on\s+|matches\s+)?/i, '');
  s = s.replace(/\bthe student'?s?\b/gi, 'your');
  s = s.replace(/\bthe student\b/gi, 'you');

  // Keep the first clause, then hard-cap the length.
  const words = s.split(' ');
  if (words.length > 14) s = `${words.slice(0, 14).join(' ')}...`;

  s = s.replace(/[.\s]+$/, '');
  if (!s) return undefined;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
