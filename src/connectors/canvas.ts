/**
 * Canvas connector.
 *
 * Canvas is the well-behaved source: everything already has a machine-readable
 * due date, so nothing here needs the LLM. Confidence is 1 across the board.
 * The only inference is exam-vs-assignment, which is a keyword call on the
 * title plus Canvas's own `is_quiz_assignment` flag.
 */

import type { EventKind, RawItem } from '../core/types';
import {
  extractPeople,
  htmlToText,
  nowISO,
  type Connector,
  type ConnectorCredentials,
  type SyncWindow,
} from './types';
import {
  ASSIGNMENTS,
  ASSIGNMENT_GROUPS,
  ASSIGNMENT_GROUP_OF,
  CALENDAR_EVENTS,
  COURSES,
  type CanvasAssignment,
  type CanvasAssignmentGroup,
  type CanvasCalendarEvent,
  type CanvasCourse,
} from '../fixtures/canvas';
import type { SubmissionInfo } from '../core/types';
import { canvasFetch } from './canvas-transport';

const EXAM_RE = /\b(exam|midterm|final|quiz|test)\b/i;
const OH_RE = /\boffice hours?\b/i;
const LECTURE_RE = /\b(lecture|lec\b)/i;
const RECITATION_RE = /\b(recitation|section)\b/i;

function courseByID(courses: CanvasCourse[], id: number) {
  const c = courses.find((x) => x.id === id);
  return c ? { code: c.course_code, name: c.name } : undefined;
}

function assignmentKind(a: CanvasAssignment): EventKind {
  if (a.is_quiz_assignment) return EXAM_RE.test(a.name) ? 'exam' : 'quiz';
  if (EXAM_RE.test(a.name)) return 'exam';
  return 'assignment';
}

function calendarKind(e: CanvasCalendarEvent): EventKind {
  if (EXAM_RE.test(e.title)) return 'exam';
  if (OH_RE.test(e.title)) return 'office_hours';
  if (RECITATION_RE.test(e.title)) return 'recitation';
  if (LECTURE_RE.test(e.title)) return 'lecture';
  return 'other';
}

/**
 * Translate a Canvas submission into our status model.
 *
 * Canvas reports a missing assignment as workflow_state 'unsubmitted' with a
 * score of 0 once the grader has swept it, which is genuinely a zero you
 * earned - distinct from 'unsubmitted' with no score, which is just work you
 * haven't done yet.
 */
function toSubmission(a: CanvasAssignment): SubmissionInfo | undefined {
  const sub = a.submission;
  if (!sub) return undefined;

  let state: SubmissionInfo['state'] = sub.workflow_state;
  if (sub.excused) state = 'excused';
  else if (sub.missing) state = 'missing';

  return {
    state,
    submittedAt: sub.submitted_at ?? undefined,
    gradedAt: sub.graded_at ?? undefined,
    // Only a real grade counts. 'submitted' with score null must not read as 0.
    score: sub.score ?? undefined,
    pointsPossible: a.points_possible ?? undefined,
    grade: sub.grade ?? undefined,
    late: sub.late,
  };
}

/** Has this been turned in (or graded), so it's no longer something you owe? */
export function isDone(a: CanvasAssignment): boolean {
  const st = a.submission?.workflow_state;
  return st === 'submitted' || st === 'graded' || st === 'pending_review'
    || Boolean(a.submission?.excused);
}

/**
 * How much an assignment is worth as a share of the FINAL grade.
 *
 * Canvas gives group weights as percentages ("Problem Sets 25%") and points
 * per assignment. The share of the final grade is therefore
 *
 *   (points / total points in that group) * group_weight
 *
 * which is the number that actually tells you what to work on: a 100-point
 * lab can be worth less of your grade than a 40-point quiz. Returns
 * undefined when the course doesn't use weighted groups or the group's
 * total is unknown - a guessed weight would misrank the whole planner.
 */
export function gradeImpactOf(
  assignment: CanvasAssignment,
  group: CanvasAssignmentGroup | undefined,
  groupTotalPoints: number,
  usesWeights: boolean,
): number | undefined {
  if (!usesWeights || !group || !group.group_weight) return undefined;
  const points = assignment.points_possible;
  if (!points || groupTotalPoints <= 0) return undefined;
  return (points / groupTotalPoints) * group.group_weight;
}

/** Index of group metadata + point totals, for one course. */
export interface GroupIndex {
  byAssignment: Map<number, { group: CanvasAssignmentGroup; total: number }>;
  usesWeights: boolean;
}

export function buildGroupIndex(
  groups: CanvasAssignmentGroup[],
  assignments: CanvasAssignment[],
  groupOf: (a: CanvasAssignment) => number | undefined,
  usesWeights: boolean,
): GroupIndex {
  const totals = new Map<number, number>();
  for (const a of assignments) {
    const gid = groupOf(a);
    if (gid === undefined) continue;
    totals.set(gid, (totals.get(gid) ?? 0) + (a.points_possible ?? 0));
  }
  const byAssignment = new Map<number, { group: CanvasAssignmentGroup; total: number }>();
  for (const a of assignments) {
    const gid = groupOf(a);
    const group = groups.find((g) => g.id === gid);
    if (!group) continue;
    byAssignment.set(a.id, { group, total: totals.get(gid!) ?? 0 });
  }
  return { byAssignment, usesWeights };
}

function assignmentToRaw(
  a: CanvasAssignment,
  courses: CanvasCourse[],
  groups?: GroupIndex,
): RawItem | null {
  // No due date means it's a placeholder or an ungraded resource. Skip.
  if (!a.due_at) return null;
  const body = htmlToText(a.description);
  return {
    source: 'canvas',
    sourceId: `assignment:${a.id}`,
    sourceUrl: a.html_url,
    text: `${a.name}\n\n${body}`,
    hints: {
      kind: assignmentKind(a),
      title: a.name,
      description: body,
      start: a.due_at,
      allDay: false,
      course: courseByID(courses, a.course_id),
      people: extractPeople(body),
    },
    submission: toSubmission(a),
    gradeImpact: (() => {
      const entry = groups?.byAssignment.get(a.id);
      return gradeImpactOf(a, entry?.group, entry?.total ?? 0, groups?.usesWeights ?? false);
    })(),
    gradeGroup: groups?.byAssignment.get(a.id)?.group.name,
    raw: a,
    fetchedAt: nowISO(),
  };
}

function calendarToRaw(e: CanvasCalendarEvent, courses: CanvasCourse[]): RawItem {
  const body = htmlToText(e.description);
  const courseId = Number(e.context_code.replace('course_', ''));
  return {
    source: 'canvas',
    sourceId: `calendar:${e.id}`,
    sourceUrl: e.html_url,
    text: `${e.title}\n\n${body}`,
    hints: {
      kind: calendarKind(e),
      title: e.title,
      description: body,
      start: e.start_at,
      end: e.end_at ?? undefined,
      allDay: e.all_day,
      location: e.location_name ?? undefined,
      course: courseByID(courses, courseId),
      organizer: e.context_name,
      people: extractPeople(body),
    },
    raw: e,
    fetchedAt: nowISO(),
  };
}

function inWindow(iso: string | null | undefined, w: SyncWindow): boolean {
  if (!iso) return false;
  return iso >= w.since && iso <= w.until;
}

// --- fixture implementation ------------------------------------------------

export const canvasFixture: Connector = {
  id: 'canvas',
  label: 'Canvas',
  isFixture: true,
  isConfigured: () => true,
  async fetch(_creds, window) {
    const items: RawItem[] = [];
    // One group index per course, so weights are computed against that
    // course's own point totals.
    const indexes = new Map<number, GroupIndex>();
    for (const course of COURSES) {
      const courseAssignments = ASSIGNMENTS.filter((a) => a.course_id === course.id);
      indexes.set(
        course.id,
        buildGroupIndex(
          ASSIGNMENT_GROUPS[course.id] ?? [],
          courseAssignments,
          (a) => ASSIGNMENT_GROUP_OF[a.id],
          course.apply_assignment_group_weights ?? false,
        ),
      );
    }
    for (const a of ASSIGNMENTS) {
      // Graded and submitted work is kept: it's no longer something you owe,
      // but it is what the Grades tab is built from. The lane split downstream
      // decides where it shows up.
      if (!inWindow(a.due_at, window) && !a.submission) continue;
      const raw = assignmentToRaw(a, COURSES, indexes.get(a.course_id));
      if (raw) items.push(raw);
    }
    for (const e of CALENDAR_EVENTS) {
      if (!inWindow(e.start_at, window)) continue;
      items.push(calendarToRaw(e, COURSES));
    }
    return items;
  },
};

// --- live implementation ---------------------------------------------------

async function canvasGet<T>(
  baseUrl: string,
  token: string,
  path: string,
): Promise<T> {
  const res = await canvasFetch(baseUrl, token, path);
  if (!res.ok) {
    throw new Error(`Canvas ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const canvasLive: Connector = {
  id: 'canvas',
  label: 'Canvas',
  isFixture: false,
  isConfigured: (creds) => Boolean(creds.canvas?.token && creds.canvas?.baseUrl),
  async fetch(creds, window) {
    const { baseUrl, token } = creds.canvas!;
    const courses = await canvasGet<CanvasCourse[]>(
      baseUrl,
      token,
      '/api/v1/courses?enrollment_state=active&per_page=50',
    );

    const items: RawItem[] = [];

    // Assignments and their groups are per-course; fetch both in parallel.
    const perCourse = await Promise.all(
      courses.map(async (c) => {
        const [assignments, groups] = await Promise.all([
          canvasGet<(CanvasAssignment & { assignment_group_id?: number })[]>(
            baseUrl,
            token,
            // include[]=submission is what returns scores at all.
            `/api/v1/courses/${c.id}/assignments?per_page=100&order_by=due_at&include[]=submission`,
          ).catch(() => []),
          canvasGet<CanvasAssignmentGroup[]>(
            baseUrl,
            token,
            `/api/v1/courses/${c.id}/assignment_groups?per_page=50`,
          ).catch(() => [] as CanvasAssignmentGroup[]),
        ]);
        return { course: c, assignments, groups };
      }),
    );
    for (const { course, assignments, groups } of perCourse) {
      const index = buildGroupIndex(
        groups,
        assignments,
        (a) => (a as { assignment_group_id?: number }).assignment_group_id,
        course.apply_assignment_group_weights ?? groups.some((g) => g.group_weight > 0),
      );
      for (const a of assignments) {
        if (!inWindow(a.due_at, window) && !a.submission) continue;
        const raw = assignmentToRaw(a, courses, index);
        if (raw) items.push(raw);
      }
    }

    const cal = await canvasGet<CanvasCalendarEvent[]>(
      baseUrl,
      token,
      `/api/v1/calendar_events?type=event&start_date=${window.since}&end_date=${window.until}&per_page=100`,
    ).catch(() => [] as CanvasCalendarEvent[]);
    for (const e of cal) items.push(calendarToRaw(e, courses));

    return items;
  },
};

/** Course codes the student is enrolled in — used to prefill the profile. */
export function enrolledCourseCodes(): string[] {
  return COURSES.map((c) => c.course_code);
}
