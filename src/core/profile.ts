/**
 * The interest profile — everything onboarding collects, plus what the app
 * learns from behavior afterward.
 *
 * This object is the *entire* filter. It never leaves the device.
 */

import type { EventKind, SourceId } from './types';

/** The buckets onboarding asks the student to rank. */
export type PriorityKey =
  | 'urop'
  | 'club_event'
  | 'talk'
  | 'career'
  | 'social'
  | 'application_deadline';

export const PRIORITY_KINDS: Record<PriorityKey, EventKind[]> = {
  urop: ['urop'],
  club_event: ['club_event'],
  talk: ['talk'],
  career: ['career'],
  social: ['social'],
  application_deadline: ['application_deadline'],
};

export interface NotificationPrefs {
  enabled: boolean;
  /** Play a sound and vibrate, rather than delivering silently. */
  sound: boolean;
  /** Hours before an exam to ping. Descending. */
  examLeadHours: number[];
  /** Hours before an assignment is due to ping. */
  assignmentLeadHours: number[];
  /** Hours before a high-scoring opportunity to ping. */
  opportunityLeadHours: number[];
  /** Below this score an opportunity never generates a notification. */
  opportunityScoreFloor: number;
  /** [startHour, endHour) in local time — no notifications fire inside this. */
  quietHours: [number, number];
  /** One rolled-up digest instead of individual pings, at this local hour. */
  dailyDigestHour: number | null;
}

export interface InterestProfile {
  version: number;
  completedOnboarding: boolean;

  /** 0..1 weight per bucket. Onboarding sets these; taps nudge them. */
  priorities: Record<PriorityKey, number>;

  /** Free-text research/subject areas, e.g. "computer vision". */
  fields: string[];
  /** Professors, PIs, speakers worth following. */
  people: string[];
  /** Labs / groups / clubs, e.g. "CSAIL", "MIT Solar Electric Vehicle Team". */
  orgs: string[];
  /** Enrolled course numbers — auto-filled from Canvas, user-confirmable. */
  courses: string[];
  /**
   * Which recitation/lab section you're in, keyed "COURSE:kind".
   * Hydrant lists every section; only you know which one is yours.
   */
  sectionChoice: Record<string, number>;

  /** Companies, labs, and programs to surface first on the Careers tab. */
  careerFollows: string[];
  /** Professor ids you starred. */
  savedProfessors: string[];

  /** Where you study. Used for school-restricted programs and a location nudge. */
  school: string;
  /** Expected graduation year, for eligibility. */
  gradYear: number | null;
  /** What you're enrolled in now. */
  degreeLevel: "Associate's" | "Bachelor's" | "Master's" | 'PhD' | 'MBA';
  /** Skills pulled from your resume by the local model, editable. */
  resumeSkills: string[];

  /** How the day planner weighs coursework vs applications vs events. */
  planWeights: { coursework: number; application: number; event: number };
  /** Which preset is selected, or 'custom'. */
  planPreset: string;
  /** How much focused work fits in a day, and how many distinct items. */
  capacity: { hoursPerDay: number; maxItemsPerDay: number };
  /** Session ids ("eventId@YYYY-MM-DD") already finished. */
  completedSessions: string[];
  /**
   * Hours each finished session was planned for, by session id. The planner
   * subtracts these from the estimate, so ticking off 2.5h of an 8h pset on
   * Tuesday leaves 5.5h to place, not 8h - and not a guess.
   */
  completedHours: Record<string, number>;

  keywords: {
    include: string[];
    exclude: string[];
  };

  /** Be honest, it's a real signal. Boosts events advertising food. */
  freeFood: boolean;

  /** Sources the user has connected and not muted. */
  enabledSources: SourceId[];

  notify: NotificationPrefs;

  /**
   * Implicit feedback. Event ids the user opened / saved / dismissed. Used to
   * nudge `priorities` and mine new keywords without ever leaving the phone.
   */
  feedback: {
    saved: string[];
    dismissed: string[];
    /**
     * Learned from "Not for me": hosts whose events are hidden outright, and
     * recurring event series (normalised titles) hidden outright. One tap on
     * a Christian fellowship meeting should silence the fellowship, not just
     * that Tuesday.
     */
    dismissedHosts: string[];
    dismissedSeries: string[];
  };
}

export const DEFAULT_NOTIFY: NotificationPrefs = {
  enabled: true,
  sound: true,
  examLeadHours: [168, 72, 24, 2],
  assignmentLeadHours: [48, 12, 2],
  opportunityLeadHours: [24, 1],
  // Measured, not guessed: against the fixture set a strong match (top-priority
  // category plus a real semantic hit) lands around 0.50-0.60. A 0.55 floor
  // meant the single best UROP posting of the week generated no notification.
  opportunityScoreFloor: 0.45,
  quietHours: [1, 8],
  dailyDigestHour: 8,
};

export const DEFAULT_PROFILE: InterestProfile = {
  version: 2,
  completedOnboarding: false,
  priorities: {
    urop: 0.5,
    club_event: 0.5,
    talk: 0.5,
    career: 0.5,
    social: 0.5,
    application_deadline: 0.5,
  },
  fields: [],
  people: [],
  orgs: [],
  courses: [],
  sectionChoice: {},
  careerFollows: [],
  savedProfessors: [],
  school: '',
  gradYear: null,
  degreeLevel: "Bachelor's",
  resumeSkills: [],
  planWeights: { coursework: 0.7, application: 0.6, event: 0.35 },
  planPreset: 'balanced',
  capacity: { hoursPerDay: 4, maxItemsPerDay: 4 },
  completedSessions: [],
  completedHours: {},
  keywords: { include: [], exclude: [] },
  freeFood: false,
  enabledSources: ['canvas', 'outlook', 'mit', 'clubs'],
  notify: DEFAULT_NOTIFY,
  feedback: { saved: [], dismissed: [], dismissedHosts: [], dismissedSeries: [] },
};

// ---------------------------------------------------------------------------
// Onboarding is data, not hardcoded screens, so the flow is easy to reorder.
// ---------------------------------------------------------------------------

export interface PriorityOption {
  key: PriorityKey;
  label: string;
  blurb: string;
  emoji: string;
}

export const PRIORITY_OPTIONS: PriorityOption[] = [
  {
    key: 'urop',
    label: 'UROPs & research',
    blurb: 'Lab openings, PI office hours, research info sessions',
    emoji: '🔬',
  },
  {
    key: 'club_event',
    label: 'Club events',
    blurb: 'Meetings, builds, competitions, performances',
    emoji: '🎪',
  },
  {
    key: 'talk',
    label: 'Talks & seminars',
    blurb: 'Colloquia, guest lectures, thesis defenses',
    emoji: '🎤',
  },
  {
    key: 'career',
    label: 'Career & recruiting',
    blurb: 'Info sessions, career fairs, application deadlines',
    emoji: '💼',
  },
  {
    key: 'social',
    label: 'Social',
    blurb: 'Dorm events, mixers, study breaks',
    emoji: '🎉',
  },
  {
    key: 'application_deadline',
    label: 'Application deadlines',
    blurb: 'Fellowships, programs, grants, competitions',
    emoji: '📮',
  },
];

/** Seed chips for the field picker. The user can type anything else. */
export const FIELD_SUGGESTIONS = [
  'machine learning',
  'computer vision',
  'natural language processing',
  'robotics',
  'systems & networking',
  'security & cryptography',
  'theory',
  'computational biology',
  'synthetic biology',
  'neuroscience',
  'quantum computing',
  'materials science',
  'aero/astro',
  'mechanical design',
  'energy & climate',
  'economics',
  'policy & governance',
  'urban studies',
  'design & HCI',
  'entrepreneurship',
  'mathematics',
  'physics',
  'chemistry',
  'medical devices',
];

export function priorityWeightFor(
  profile: InterestProfile,
  kind: EventKind,
): number {
  for (const [key, kinds] of Object.entries(PRIORITY_KINDS) as [
    PriorityKey,
    EventKind[],
  ][]) {
    if (kinds.includes(kind)) return profile.priorities[key];
  }
  return 0.25; // 'other' and anything unmapped
}
