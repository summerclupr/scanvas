/**
 * Core domain model.
 *
 * Everything from every source collapses into a single `UnifiedEvent`. The one
 * idea that drives the whole product: events fall into two lanes.
 *
 *  - `obligation` — graded work, exams, hard deadlines. NEVER interest-filtered.
 *    You don't get to be uninterested in your 6.006 final. These are surfaced by
 *    urgency and always notified.
 *
 *  - `opportunity` — club events, UROP openings, talks, recruiting. There are
 *    hundreds a week at MIT. These ARE interest-filtered, hard, and only the top
 *    few ever reach the user.
 *
 * Mixing the two is what makes every existing aggregator useless: you either
 * drown in dorm-spam or you miss a pset.
 */

export type SourceId = 'canvas' | 'schedule' | 'outlook' | 'mit' | 'clubs' | 'manual';

export const SOURCE_LABELS: Record<SourceId, string> = {
  canvas: 'Canvas',
  schedule: 'Class schedule',
  outlook: 'Outlook',
  // Public MIT feeds: the Institute events calendar and Engage's club feed.
  // No account exists to connect, so this is never an "account".
  mit: 'MIT campus',
  /** Each club you follow: its own Engage feed plus dated notices on its website. */
  clubs: 'Clubs you follow',
  manual: 'Added by you',
};

export type EventKind =
  // obligation lane
  | 'assignment'
  | 'exam'
  | 'quiz'
  | 'project_milestone'
  | 'lecture'
  | 'recitation'
  | 'office_hours'
  // opportunity lane
  | 'club_event'
  | 'urop'
  | 'talk'
  | 'career'
  | 'social'
  | 'application_deadline'
  | 'other';

export type Lane = 'obligation' | 'opportunity';

/** Which lane a kind belongs to. Single source of truth. */
export const LANE_OF: Record<EventKind, Lane> = {
  assignment: 'obligation',
  exam: 'obligation',
  quiz: 'obligation',
  project_milestone: 'obligation',
  lecture: 'obligation',
  recitation: 'obligation',
  office_hours: 'obligation',
  club_event: 'opportunity',
  urop: 'opportunity',
  talk: 'opportunity',
  career: 'opportunity',
  social: 'opportunity',
  application_deadline: 'opportunity',
  other: 'opportunity',
};

export const KIND_LABELS: Record<EventKind, string> = {
  assignment: 'Assignment',
  exam: 'Exam',
  quiz: 'Quiz',
  project_milestone: 'Project milestone',
  lecture: 'Lecture',
  recitation: 'Recitation',
  office_hours: 'Office hours',
  club_event: 'Club event',
  urop: 'UROP',
  talk: 'Talk',
  career: 'Career',
  social: 'Social',
  application_deadline: 'Deadline',
  other: 'Event',
};

/**
 * Work status, for anything that gets turned in.
 *
 * `score` stays undefined until it's actually graded. Conflating "not graded
 * yet" with zero is the single most alarming bug a grades screen can have,
 * so 'submitted' and 'graded' are distinct states and only the latter counts
 * toward an average.
 */
export interface SubmissionInfo {
  state: 'unsubmitted' | 'submitted' | 'graded' | 'pending_review' | 'missing' | 'excused';
  submittedAt?: string;
  gradedAt?: string;
  /** Points earned. Undefined unless state is 'graded'. */
  score?: number;
  pointsPossible?: number;
  /** Canvas's display grade - may be a letter, a percentage, or 'complete'. */
  grade?: string;
  late: boolean;
}

export interface CourseRef {
  /** Canonical MIT course number, e.g. "6.1010". */
  code: string;
  name?: string;
}

/**
 * A point in time OR a deadline. `end` absent means the event is instantaneous
 * (a due date). `allDay` means the time component is meaningless.
 */
export interface UnifiedEvent {
  /** Stable content hash — survives re-syncs, used for dedupe. */
  id: string;
  source: SourceId;
  /** Native id in the source system, for deep-linking and incremental sync. */
  sourceId: string;
  sourceUrl?: string;

  kind: EventKind;
  lane: Lane;

  title: string;
  description?: string;

  /** ISO 8601 with offset. For assignments this is the due instant. */
  start: string;
  end?: string;
  allDay: boolean;

  location?: string;
  /** Club, lab, department, or course that owns this. */
  organizer?: string;
  /** Professors / hosts / PIs named anywhere in the item. */
  people: string[];
  /** Research or subject areas, normalized lowercase. */
  topics: string[];
  tags: string[];

  course?: CourseRef;

  /** Present for graded coursework: what you turned in and what you got. */
  submission?: SubmissionInfo;

  /**
   * How much this is worth, as percentage points of the FINAL course grade.
   * Derived from Canvas assignment-group weights, so a 100-point lab in a
   * 60%-weighted Labs group of 500 total points is 12, not 100. Undefined
   * when the course doesn't publish weights - never guessed.
   */
  gradeImpact?: number;
  /** The assignment group it came from ("Problem Sets", "Exams"). */
  gradeGroup?: string;

  /** Extraction confidence 0..1. Deterministic parses are 1. */
  confidence: number;

  /** Original payload, kept for debugging and re-extraction after prompt changes. */
  raw?: unknown;

  firstSeenAt: string;
  updatedAt: string;
}

export interface ScoreReason {
  /** Machine-readable reason code, for explaining the ranking in the UI. */
  code:
    | 'priority'
    | 'field_match'
    | 'person_match'
    | 'keyword'
    | 'course_match'
    | 'excluded_keyword'
    | 'conflict'
    | 'free_food'
    | 'novelty'
    | 'audience'
    | 'dismissed_host';
  /** Signed contribution to the final score. */
  delta: number;
  label: string;
}

export interface ScoredEvent extends UnifiedEvent {
  /** 0..1 interest score. Obligations are pinned at 1. */
  score: number;
  /** 0..1 time pressure, used to order the obligation lane. */
  urgency: number;
  reasons: ScoreReason[];
  /** One-line "why you're seeing this", written by the local model. */
  rationale?: string;
  /** Obligations this opportunity collides with. */
  conflictsWith?: string[];
}

/** A normalized item straight out of a connector, before enrichment. */
export interface RawItem {
  source: SourceId;
  sourceId: string;
  sourceUrl?: string;
  /** Free text the extractor reads when the payload isn't already structured. */
  text: string;
  /** Fields the connector could parse deterministically. */
  hints: Partial<
    Pick<
      UnifiedEvent,
      | 'kind'
      | 'title'
      | 'description'
      | 'start'
      | 'end'
      | 'allDay'
      | 'location'
      | 'organizer'
      | 'people'
      | 'topics'
      | 'course'
    >
  >;
  /** Work status, when the source knows it (Canvas only, today). */
  submission?: SubmissionInfo;
  /** Share of the final course grade, from Canvas group weights. */
  gradeImpact?: number;
  gradeGroup?: string;
  raw: unknown;
  fetchedAt: string;
}
