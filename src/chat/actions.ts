/**
 * What the assistant is allowed to do.
 *
 * A closed set of typed actions, not free-form code. The model proposes;
 * this module validates and the store executes. That boundary matters: a 4B
 * model running locally will occasionally emit nonsense, and the difference
 * between "ignored an invalid action" and "corrupted the profile" is entirely
 * in how tightly this is constrained.
 *
 * Every action is reversible from the UI, and the panel echoes what it did in
 * plain language, so a wrong action is visible and one tap from undone.
 */

export type ActionKind =
  | 'navigate'
  | 'add_interest'
  | 'remove_interest'
  | 'mute_keyword'
  | 'unmute_keyword'
  | 'set_priority'
  | 'track_course'
  | 'untrack_course'
  | 'follow_org'
  | 'unfollow_org'
  | 'follow_club'
  | 'unfollow_club'
  | 'set_plan_preset'
  | 'spread_out_day'
  | 'pack_day'
  | 'set_daily_hours'
  | 'set_notifications'
  | 'save_event'
  | 'dismiss_event'
  | 'search'
  | 'sync';

/** Every kind, in one place, so the schema enum and the validator agree. */
export const ACTION_KINDS: ActionKind[] = [
  'navigate',
  'add_interest',
  'remove_interest',
  'mute_keyword',
  'unmute_keyword',
  'set_priority',
  'track_course',
  'untrack_course',
  'follow_org',
  'unfollow_org',
  'follow_club',
  'unfollow_club',
  'set_plan_preset',
  'spread_out_day',
  'pack_day',
  'set_daily_hours',
  'set_notifications',
  'save_event',
  'dismiss_event',
  'search',
  'sync',
];

export const PRIORITY_KEYS = [
  'urop',
  'club_event',
  'talk',
  'career',
  'social',
  'application_deadline',
] as const;

export const PRIORITY_LEVELS = ['skip', 'sometimes', 'priority'] as const;

export const TABS = [
  'due',
  'plan',
  'calendar',
  'feed',
  'careers',
  'work',
  'settings',
] as const;

export const PLAN_PRESETS_KEYS = [
  'coursework',
  'balanced',
  'internships',
  'social',
] as const;

export interface ChatAction {
  kind: ActionKind;
  /** Free-text target: an interest, a course code, a company, a tab. */
  value?: string;
  /** For set_priority. */
  level?: (typeof PRIORITY_LEVELS)[number];
  /** For set_daily_hours. */
  hours?: number;
  /** For set_notifications: quieter | louder | off | on. */
  mode?: string;
}

/**
 * JSON Schema handed to Ollama.
 *
 * There is deliberately NO "none" action. With one in the enum the model
 * reached for it constantly - it would write "I'll make notifications
 * quieter" in the reply and then emit `none`, so the app did nothing while
 * claiming otherwise. An empty array already means "no action"; removing the
 * placeholder forces the choice to be real.
 */
export const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ACTION_KINDS,
          },
          value: { type: 'string' },
          level: { type: 'string', enum: ['skip', 'sometimes', 'priority', 'none'] },
          hours: { type: 'number' },
          mode: { type: 'string' },
        },
        required: ['kind'],
      },
    },
  },
  required: ['reply', 'actions'],
} as const;

/** Human-readable confirmation, shown under the reply. */
export function describeAction(a: ChatAction): string | null {
  switch (a.kind) {
    case 'navigate':
      return `Opened ${a.value}`;
    case 'add_interest':
      return `Added "${a.value}" to your interests`;
    case 'remove_interest':
      return `Removed "${a.value}" from your interests`;
    case 'mute_keyword':
      return `Muted "${a.value}" — events mentioning it won't be recommended`;
    case 'unmute_keyword':
      return `Unmuted "${a.value}"`;
    case 'follow_club':
      return `Following ${a.value} — their events rank first`;
    case 'unfollow_club':
      return `Unfollowed ${a.value}`;
    case 'dismiss_event':
      return `Hid "${a.value}"`;
    case 'search':
      return `Searched for "${a.value}" on For you`;
    case 'set_priority':
      return `Set ${a.value?.replace(/_/g, ' ')} to ${a.level}`;
    case 'track_course':
      return `Now tracking ${a.value}`;
    case 'untrack_course':
      return `Stopped tracking ${a.value} — its work is hidden`;
    case 'follow_org':
      return `Following ${a.value}`;
    case 'unfollow_org':
      return `Unfollowed ${a.value}`;
    case 'set_plan_preset':
      return `Switched your planning style to "${a.value}"`;
    case 'spread_out_day':
      return 'Spread your work out — fewer things per day';
    case 'pack_day':
      return 'Packed your days tighter — more per day, finished sooner';
    case 'set_daily_hours':
      return `Daily work budget set to ${a.hours}h`;
    case 'set_notifications':
      return `Notifications: ${a.mode}`;
    case 'sync':
      return 'Re-syncing your accounts';
    default:
      return null;
  }
}

/** Reject anything malformed before it reaches the store. */
export function validate(a: ChatAction): ChatAction | null {
  if (!a || typeof a.kind !== 'string') return null;
  if (!ACTION_KINDS.includes(a.kind)) return null;
  const needsValue: ActionKind[] = [
    'navigate',
    'add_interest',
    'remove_interest',
    'mute_keyword',
    'unmute_keyword',
    'set_priority',
    'track_course',
    'untrack_course',
    'follow_org',
    'unfollow_org',
    'follow_club',
    'unfollow_club',
    'set_plan_preset',
    'save_event',
    'dismiss_event',
    'search',
  ];
  if (needsValue.includes(a.kind) && !a.value?.trim()) return null;

  if (a.kind === 'navigate') {
    const v = a.value!.toLowerCase().replace(/[^a-z]/g, '');
    const match = TABS.find((t) => t === v || v.includes(t));
    if (!match) return null;
    return { kind: 'navigate', value: match };
  }
  if (a.kind === 'set_priority') {
    const key = PRIORITY_KEYS.find(
      (k) => k === a.value || a.value!.toLowerCase().replace(/[\s-]/g, '_') === k,
    );
    const level = PRIORITY_LEVELS.find((l) => l === a.level);
    if (!key || !level) return null;
    return { kind: 'set_priority', value: key, level };
  }
  if (a.kind === 'set_plan_preset') {
    const p = PLAN_PRESETS_KEYS.find((k) => k === a.value?.toLowerCase());
    if (!p) return null;
    return { kind: 'set_plan_preset', value: p };
  }
  if (a.kind === 'set_daily_hours') {
    const h = Number(a.hours);
    if (!Number.isFinite(h) || h < 0.5 || h > 16) return null;
    return { kind: 'set_daily_hours', hours: Math.round(h * 2) / 2 };
  }
  if (a.kind === 'set_notifications') {
    const m = (a.mode ?? '').toLowerCase();
    if (!['quieter', 'louder', 'off', 'on'].includes(m)) return null;
    return { kind: 'set_notifications', mode: m };
  }
  return { ...a, value: a.value?.trim() };
}
