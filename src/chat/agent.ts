/**
 * The assistant's brain: one constrained call to your local Ollama.
 *
 * It sees a compact snapshot of your actual state - courses, interests,
 * what's due, how the day is planned - so "did you stack too much on me
 * today?" can be answered from real numbers rather than guessed at. Nothing
 * leaves the device.
 *
 * Grounding matters more than eloquence here. The system prompt forbids
 * inventing deadlines or grades, because a confident wrong answer about when
 * a pset is due is the single most damaging thing this app could say.
 */

import { chatJSON, type ChatMessage, type OllamaConfig } from '../llm/ollama';
import { CHAT_SCHEMA, validate, type ChatAction } from './actions';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  actions?: ChatAction[];
}

/** Compact, factual view of the app, injected into every request. */
export interface AppSnapshot {
  courses: string[];
  interests: string[];
  /** Companies and labs followed on Careers. */
  follows: string[];
  /** Clubs, labs and groups followed for events. */
  clubs?: string[];
  /** Words that zero out any event mentioning them. */
  muted?: string[];
  /**
   * Synced events whose title, host or description matches words in the
   * user's message - so "any poker club events?" can be answered from data
   * rather than guessed at. Empty when nothing matched.
   */
  matchingEvents?: { title: string; host?: string; when: string; where?: string }[];
  planPreset: string;
  dailyHours: number;
  maxItemsPerDay: number;
  /** Today's scheduled work: title, hours, due-ness. */
  todaySessions: { title: string; hours: number; due: string }[];
  todayCommitments: string[];
  /** Next few deadlines, soonest first. */
  upcoming: { title: string; course?: string; due: string; weight?: string }[];
  notificationsScheduled: number;
  demoSources: string[];
}

export function renderSnapshot(s: AppSnapshot): string {
  const lines: string[] = [];
  lines.push(`Courses tracked: ${s.courses.join(', ') || 'none'}`);
  lines.push(`Interests: ${s.interests.join(', ') || 'none set'}`);
  lines.push(`Following (companies/labs, Careers): ${s.follows.join(', ') || 'nobody'}`);
  lines.push(`Following (clubs/groups, events): ${s.clubs?.join(', ') || 'none'}`);
  lines.push(`Muted words: ${s.muted?.join(', ') || 'none'}`);
  lines.push(
    `Planning style: ${s.planPreset}; budget ${s.dailyHours}h/day, max ${s.maxItemsPerDay} items/day`,
  );

  lines.push(
    s.todaySessions.length
      ? `\nToday's planned work (${s.todaySessions
          .reduce((n, t) => n + t.hours, 0)
          .toFixed(1)}h total):\n` +
          s.todaySessions
            .map((t) => `  - ${t.title} (~${t.hours}h, due ${t.due})`)
            .join('\n')
      : '\nToday has no planned work.',
  );
  if (s.todayCommitments.length) {
    lines.push(`Fixed today: ${s.todayCommitments.join(', ')}`);
  }
  if (s.upcoming.length) {
    lines.push(
      '\nUpcoming deadlines:\n' +
        s.upcoming
          .map(
            (u) =>
              `  - ${u.title}${u.course ? ` (${u.course})` : ''} due ${u.due}${
                u.weight ? `, ${u.weight}` : ''
              }`,
          )
          .join('\n'),
    );
  }
  // Spell out the absence explicitly. "No deadline known for X" is far
  // harder for a small model to talk past than silence is.
  const withDeadlines = new Set(s.upcoming.map((u) => u.course).filter(Boolean));
  const silent = s.courses.filter((c) => !withDeadlines.has(c));
  if (silent.length) {
    lines.push(
      `\nNO deadlines are known for: ${silent.join(', ')}. If asked about ` +
        'these, say you have nothing for them - do NOT borrow another ' +
        "course's date.",
    );
  }
  if (s.matchingEvents?.length) {
    lines.push(
      '\nEvents matching the user\'s message (synced, real):\n' +
        s.matchingEvents
          .map((e) => `  - ${e.title}${e.host ? ` (${e.host})` : ''} - ${e.when}${e.where ? `, ${e.where}` : ''}`)
          .join('\n'),
    );
  } else {
    lines.push(
      '\nNo synced event matches the user\'s message. If they ask about a ' +
        "club's or topic's events, say none are synced and offer the " +
        'search action so they can look on campus calendars.',
    );
  }
  if (s.demoSources.length) {
    lines.push(
      `\nNOTE: ${s.demoSources.join(', ')} are showing SAMPLE data, not the user's real account.`,
    );
  }
  return lines.join('\n');
}

const SYSTEM = `You are the assistant inside a student's calendar app at MIT.
You answer questions about their schedule AND change app settings for them.

You are shown a factual snapshot of their current state.

TWO SEPARATE JOBS. Do not confuse them.

1. ANSWERING (the "reply" field)
   - Ground every factual claim in the snapshot. NEVER invent a deadline,
     grade, class time, or event, and never attribute one course's deadline
     to a different course. If the snapshot doesn't say it, say you don't
     have it.
   - Never echo the user's own words back at them.
   - 1-2 short sentences. You are a control surface, not a chat partner.

2. DOING (the "actions" array)
   - If the user asks you to CHANGE anything, you MUST emit the matching
     action. Saying "I'll do that" in the reply does NOT do it - only the
     action array does anything.
   - Grounding does NOT restrict actions. The user can add an interest,
     follow a company, or track a class that is not in the snapshot; that is
     how new things get added. Never refuse an action because the subject is
     unfamiliar.
   - Use an empty array ONLY for pure questions where nothing changes.

ACTIONS

  navigate           value = due|plan|calendar|feed|careers|work|settings
  add_interest       value = an interest, e.g. "robotics"
  remove_interest    value = an existing interest (from the Interests list)
  mute_keyword       value = ONE word or short phrase; events mentioning it are
                     never recommended. To stop a THEME ("no more prayer
                     nights", "less religious stuff") emit SEVERAL mute_keyword
                     actions covering the obvious related words - e.g. prayer,
                     worship, bible, christian, fellowship - not just the one
                     they said, or the theme keeps coming back.
  unmute_keyword     value = a muted word
  set_priority       value = urop|club_event|talk|career|social|application_deadline
                     level = skip|sometimes|priority
  track_course       value = course number, e.g. "6.1210"
  untrack_course     value = course number (hides its psets and exams)
  follow_org         value = a COMPANY or LAB for internships, e.g. "Jane Street"
  unfollow_org       value = one they follow
  follow_club        value = a CLUB, student group or lab whose EVENTS they want,
                     e.g. "Pokerbots", "MIT Outing Club"
  unfollow_club      value = one they follow
  dismiss_event      value = the title of a synced event to hide
  search             value = words to search on the For you tab (professors,
                     courses, clubs, labs, events across MIT's public sources)
  set_plan_preset    value = coursework|balanced|internships|social
  spread_out_day     fewer items per day, work starts earlier
  pack_day           more per day, finish sooner
  set_daily_hours    hours = a number of focused hours per day
  set_notifications  mode = quieter|louder|off|on
  sync               refetch their accounts

WHEN ASKED ABOUT A CLUB'S OR TOPIC'S EVENTS: answer from "Events matching
the user's message" if any are listed. If the club is not in "Following
(clubs/groups)", also emit follow_club for it so its events rank first.
If nothing matched, say so and emit search with the club or topic name.

Examples (note the reply never just repeats the request):
  "remove prayer nights from my interests"
     reply: "Muted prayer, worship, bible, christian and fellowship - none of that will be recommended."
     actions: [{kind: mute_keyword, value: prayer}, {kind: mute_keyword, value: worship},
               {kind: mute_keyword, value: bible}, {kind: mute_keyword, value: christian},
               {kind: mute_keyword, value: fellowship}]
  "show me upcoming events for the mit poker club"   (snapshot lists Pokerbots Meeting for Recruitment, Thu 7pm)
     reply: "Pokerbots Meeting for Recruitment, Thu 7pm. Following Pokerbots now so their events rank first."
     actions: [{kind: follow_club, value: Pokerbots}, {kind: search, value: poker}]
  "any robotics club events?"   (nothing matched)
     reply: "Nothing synced for robotics clubs yet - searching campus calendars."
     actions: [{kind: search, value: robotics club}]
  "you stacked too much on me today"
     reply: "Spread out - fewer items per day, starting earlier."
     actions: [{kind: spread_out_day}]
  "I care more about internships than homework"
     reply: "Switched to internships-first planning."
     actions: [{kind: set_plan_preset, value: internships}]
  "I'm not taking 18.06 anymore"
     reply: "Dropped 18.06; its psets and exams are hidden now."
     actions: [{kind: untrack_course, value: 18.06}]
  "add quantum computing to my interests"
     reply: "Added quantum computing."
     actions: [{kind: add_interest, value: quantum computing}]
  "show me my calendar"
     reply: "Opening your calendar."
     actions: [{kind: navigate, value: calendar}]
  "follow Jane Street"
     reply: "Following Jane Street - their postings will rank first."
     actions: [{kind: follow_org, value: Jane Street}]
  "make notifications quieter"
     reply: "Fewer reminders, higher bar for events."
     actions: [{kind: set_notifications, mode: quieter}]
  "what's due soonest?"
     reply: "Pset 5 for 6.1210, due in 4 days - 12.5% of your grade."
     actions: []

Respond with JSON only.`;

export interface AgentReply {
  reply: string;
  actions: ChatAction[];
  /** Set when a claim was stripped for not being supported by the snapshot. */
  corrected?: boolean;
}

/** Course numbers like 6.1210, 18.C06, 8.01, 21M.301. */
const COURSE_RE = /\b(\d{1,2}[A-Z]?|HST|STS|CMS|ESD|WGS)\.([A-Z]?[0-9]{2,4}[A-Z]?)\b/g;
const TEMPORAL_RE =
  /\b(due|in \d+\s*(d|day|days|h|hour|hours|w|week|weeks)|tomorrow|today|tonight|next week|on \w+day)\b/i;

/**
 * Verify the reply instead of trusting it.
 *
 * Measured failure: asked "when is my 18.C06 pset due?" with no 18.C06
 * deadline in the snapshot, the model answered "due in 4 days" - silently
 * borrowing another course's date. Prompt wording reduced it but did not
 * eliminate it, and a wrong deadline is the most damaging thing this app can
 * say. So any temporal claim about a course with no known deadline is
 * replaced outright.
 */
export function groundReply(
  reply: string,
  snapshot: AppSnapshot,
): { reply: string; corrected: boolean } {
  if (!TEMPORAL_RE.test(reply)) return { reply, corrected: false };

  const known = new Set(
    snapshot.upcoming.map((u) => u.course).filter(Boolean) as string[],
  );
  const mentioned = [...reply.matchAll(COURSE_RE)].map((m) => `${m[1]}.${m[2]}`);
  const unsupported = [...new Set(mentioned)].filter((c) => !known.has(c));

  if (unsupported.length === 0) return { reply, corrected: false };

  return {
    reply:
      `I don't have any deadline for ${unsupported.join(', ')} — nothing has ` +
      `synced for it. Check Canvas directly, or re-sync.`,
    corrected: true,
  };
}

export async function askAgent(
  cfg: OllamaConfig,
  history: ChatTurn[],
  snapshot: AppSnapshot,
  userText: string,
): Promise<AgentReply> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Current state:\n${renderSnapshot(snapshot)}`,
    },
    // Only the last few turns - a 4B model loses the thread past that, and
    // the snapshot already carries everything that actually matters.
    ...history.slice(-6).map((t) => ({
      role: t.role as 'user' | 'assistant',
      content: t.text,
    })),
    { role: 'user', content: userText },
  ];

  const out = await chatJSON<{ reply?: string; actions?: ChatAction[] }>(
    cfg,
    messages,
    CHAT_SCHEMA,
    { temperature: 0.2 },
  );

  const actions = (out.actions ?? [])
    .map(validate)
    .filter((a): a is ChatAction => a !== null)
    // One request shouldn't rewrite the whole profile - but muting a theme
    // legitimately takes several words.
    .slice(0, 8);

  const grounded = groundReply((out.reply ?? '').trim() || 'Done.', snapshot);
  return { reply: grounded.reply, actions, corrected: grounded.corrected };
}
