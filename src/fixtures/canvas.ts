/**
 * Recorded Canvas LMS payloads, in the exact shape the real REST API returns.
 * Endpoints mirrored:
 *   GET /api/v1/courses?enrollment_state=active
 *   GET /api/v1/courses/:id/assignments
 *   GET /api/v1/calendar_events?type=event
 */

import { daysFromNow, hoursFromNow } from './time';

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  term: { name: string };
  /** When false, the course grades on raw points rather than group weights. */
  apply_assignment_group_weights?: boolean;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  unlock_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
  has_submitted_submissions: boolean;
  is_quiz_assignment: boolean;
  /** Present when the request used ?include[]=submission. */
  submission?: CanvasSubmission;
}

/**
 * Shape of a Canvas submission (GET /courses/:id/assignments?include[]=submission).
 * `workflow_state` is the authoritative status; `score` is null until graded,
 * even when `submitted_at` is set.
 */
export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  workflow_state: 'unsubmitted' | 'submitted' | 'graded' | 'pending_review';
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  grade: string | null;
  late: boolean;
  missing: boolean;
  excused: boolean;
  attempt: number | null;
}

/**
 * GET /api/v1/courses/:id/assignment_groups?include[]=assignments
 * `group_weight` is a percentage and only meaningful when the course sets
 * apply_assignment_group_weights.
 */
export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
  group_weight: number;
  assignments?: { id: number; points_possible: number | null }[];
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location_name: string | null;
  all_day: boolean;
  context_code: string;
  context_name: string;
  html_url: string;
}

export const ASSIGNMENT_GROUPS: Record<number, CanvasAssignmentGroup[]> = {
  // 6.1010 - labs dominate
  28114: [
    { id: 501, name: 'Labs', position: 1, group_weight: 60 },
    { id: 502, name: 'Quizzes', position: 2, group_weight: 40 },
  ],
  // 6.1210 - exams dominate, psets are a smaller slice
  28277: [
    { id: 511, name: 'Problem Sets', position: 1, group_weight: 25 },
    { id: 512, name: 'Exams', position: 2, group_weight: 75 },
  ],
  27980: [
    { id: 521, name: 'Problem Sets', position: 1, group_weight: 30 },
    { id: 522, name: 'Exams', position: 2, group_weight: 70 },
  ],
  28451: [
    { id: 531, name: 'Homework', position: 1, group_weight: 40 },
    { id: 532, name: 'Quizzes', position: 2, group_weight: 60 },
  ],
};

/** Which group each fixture assignment belongs to. */
export const ASSIGNMENT_GROUP_OF: Record<number, number> = {
  901233: 501, 901700: 501, 901701: 501, // 6.1010 labs
  901402: 511, 901702: 511,              // 6.1210 psets
  901555: 521, 901703: 521, 901704: 522, // 18.06
  901601: 531, 901705: 531, 901706: 531, // 6.3900 homework
  901688: 532,                           // 6.3900 quiz
};

export const COURSES: CanvasCourse[] = [
  { id: 28114, name: 'Fundamentals of Programming', course_code: '6.1010', term: { name: 'Fall 2026' }, apply_assignment_group_weights: true },
  { id: 28277, name: 'Introduction to Algorithms', course_code: '6.1210', term: { name: 'Fall 2026' }, apply_assignment_group_weights: true },
  { id: 27980, name: 'Linear Algebra', course_code: '18.06', term: { name: 'Fall 2026' }, apply_assignment_group_weights: true },
  { id: 28451, name: 'Introduction to Machine Learning', course_code: '6.3900', term: { name: 'Fall 2026' }, apply_assignment_group_weights: true },
];

export const ASSIGNMENTS: CanvasAssignment[] = [
  {
    id: 901233,
    course_id: 28114,
    name: 'Lab 6: Symbolic Algebra',
    description:
      '<p>Implement a symbolic algebra system supporting differentiation and simplification. See the <a href="https://py.mit.edu/fall26/labs/symbolic">lab handout</a>.</p><p><strong>Checkoff required</strong> during office hours.</p>',
    due_at: hoursFromNow(31),
    unlock_at: null,
    points_possible: 100,
    html_url: 'https://canvas.mit.edu/courses/28114/assignments/901233',
    submission_types: ['online_upload'],
    has_submitted_submissions: false,
    is_quiz_assignment: false,
    submission: {
      id: 700001, assignment_id: 901233, workflow_state: 'unsubmitted',
      submitted_at: null, graded_at: null, score: null, grade: null,
      late: false, missing: false, excused: false, attempt: null,
    },
  },
  {
    id: 901402,
    course_id: 28277,
    name: 'Problem Set 5 — Dynamic Programming',
    description:
      '<p>Four problems on DP. Collaboration policy applies; list collaborators at the top of your submission.</p>',
    due_at: daysFromNow(4, 22, 0),
    unlock_at: null,
    points_possible: 60,
    html_url: 'https://canvas.mit.edu/courses/28277/assignments/901402',
    submission_types: ['online_upload'],
    has_submitted_submissions: false,
    is_quiz_assignment: false,
  },
  {
    id: 901555,
    course_id: 27980,
    name: 'Problem Set 4',
    description: '<p>Sections 5.1–5.4. Determinants and eigenvalues.</p>',
    due_at: daysFromNow(2, 23, 59),
    unlock_at: null,
    points_possible: 40,
    html_url: 'https://canvas.mit.edu/courses/27980/assignments/901555',
    submission_types: ['online_upload'],
    has_submitted_submissions: false,
    is_quiz_assignment: false,
  },
  {
    id: 901601,
    course_id: 28451,
    name: 'Homework 3: Regularization and Model Selection',
    description:
      '<p>Written + coding. The coding portion autogrades; you get unlimited submissions before the deadline.</p>',
    due_at: daysFromNow(6, 23, 59),
    unlock_at: null,
    points_possible: 80,
    html_url: 'https://canvas.mit.edu/courses/28451/assignments/901601',
    submission_types: ['online_upload', 'online_quiz'],
    has_submitted_submissions: false,
    is_quiz_assignment: false,
  },
  {
    id: 901688,
    course_id: 28451,
    name: 'Quiz 2 (in class)',
    description:
      '<p>Covers lectures 8–14: SVMs, kernels, neural networks, regularization. One double-sided sheet of notes permitted. No calculators.</p>',
    due_at: daysFromNow(9, 14, 0),
    unlock_at: null,
    points_possible: 150,
    html_url: 'https://canvas.mit.edu/courses/28451/assignments/901688',
    submission_types: ['on_paper'],
    has_submitted_submissions: false,
    is_quiz_assignment: true,
  },
  {
    id: 901700,
    course_id: 28114,
    name: 'Lab 5: Autocomplete',
    description: '<p>Tries and prefix search.</p>',
    due_at: daysFromNow(-3, 23, 59),
    unlock_at: null,
    points_possible: 100,
    html_url: 'https://canvas.mit.edu/courses/28114/assignments/901700',
    submission_types: ['online_upload'],
    has_submitted_submissions: true,
    is_quiz_assignment: false,
    submission: {
      id: 700010, assignment_id: 901700, workflow_state: 'graded',
      submitted_at: daysFromNow(-3, 21, 14), graded_at: daysFromNow(-1, 16, 2),
      score: 94, grade: '94', late: false, missing: false, excused: false, attempt: 2,
    },
  },
  {
    id: 901701,
    course_id: 28114,
    name: 'Lab 4: Bacon Number',
    description: '<p>Graph search over the actor dataset.</p>',
    due_at: daysFromNow(-10, 23, 59),
    unlock_at: null,
    points_possible: 100,
    html_url: 'https://canvas.mit.edu/courses/28114/assignments/901701',
    submission_types: ['online_upload'],
    has_submitted_submissions: true,
    is_quiz_assignment: false,
    submission: {
      id: 700011, assignment_id: 901701, workflow_state: 'graded',
      submitted_at: daysFromNow(-10, 23, 51), graded_at: daysFromNow(-7, 12, 0),
      score: 88, grade: '88', late: false, missing: false, excused: false, attempt: 1,
    },
  },
  {
    id: 901702,
    course_id: 28277,
    name: 'Problem Set 4 — Graphs',
    description: '<p>BFS, DFS, and shortest paths.</p>',
    due_at: daysFromNow(-6, 22, 0),
    unlock_at: null,
    points_possible: 60,
    html_url: 'https://canvas.mit.edu/courses/28277/assignments/901702',
    submission_types: ['online_upload'],
    has_submitted_submissions: true,
    is_quiz_assignment: false,
    submission: {
      id: 700012, assignment_id: 901702, workflow_state: 'graded',
      submitted_at: daysFromNow(-5, 9, 30), graded_at: daysFromNow(-2, 18, 45),
      score: 51, grade: '51', late: true, missing: false, excused: false, attempt: 1,
    },
  },
  {
    id: 901703,
    course_id: 27980,
    name: 'Problem Set 3',
    description: '<p>Orthogonality and projections.</p>',
    due_at: daysFromNow(-8, 23, 59),
    unlock_at: null,
    points_possible: 40,
    html_url: 'https://canvas.mit.edu/courses/27980/assignments/901703',
    submission_types: ['online_upload'],
    has_submitted_submissions: true,
    is_quiz_assignment: false,
    submission: {
      id: 700013, assignment_id: 901703, workflow_state: 'graded',
      submitted_at: daysFromNow(-8, 20, 10), graded_at: daysFromNow(-4, 11, 20),
      score: 38, grade: '38', late: false, missing: false, excused: false, attempt: 1,
    },
  },
  {
    id: 901704,
    course_id: 27980,
    name: 'Exam 1',
    description: '<p>Through least squares.</p>',
    due_at: daysFromNow(-14, 15, 0),
    unlock_at: null,
    points_possible: 100,
    html_url: 'https://canvas.mit.edu/courses/27980/assignments/901704',
    submission_types: ['on_paper'],
    has_submitted_submissions: true,
    is_quiz_assignment: true,
    submission: {
      id: 700014, assignment_id: 901704, workflow_state: 'graded',
      submitted_at: daysFromNow(-14, 15, 0), graded_at: daysFromNow(-9, 9, 0),
      score: 82, grade: '82', late: false, missing: false, excused: false, attempt: 1,
    },
  },
  {
    id: 901705,
    course_id: 28451,
    name: 'Homework 2: Linear Classifiers',
    description: '<p>Perceptron and logistic regression.</p>',
    due_at: daysFromNow(-4, 23, 59),
    unlock_at: null,
    points_possible: 80,
    html_url: 'https://canvas.mit.edu/courses/28451/assignments/901705',
    submission_types: ['online_upload'],
    has_submitted_submissions: true,
    is_quiz_assignment: false,
    // Submitted but not yet graded - the case a naive UI reports as a 0.
    submission: {
      id: 700015, assignment_id: 901705, workflow_state: 'submitted',
      submitted_at: daysFromNow(-4, 23, 12), graded_at: null,
      score: null, grade: null, late: false, missing: false, excused: false, attempt: 1,
    },
  },
  {
    id: 901706,
    course_id: 28451,
    name: 'Homework 1: Probability Review',
    description: '<p>Warm-up.</p>',
    due_at: daysFromNow(-18, 23, 59),
    unlock_at: null,
    points_possible: 40,
    html_url: 'https://canvas.mit.edu/courses/28451/assignments/901706',
    submission_types: ['online_upload'],
    has_submitted_submissions: false,
    is_quiz_assignment: false,
    // Never turned in. Counts as a zero, and the UI should say so.
    submission: {
      id: 700016, assignment_id: 901706, workflow_state: 'unsubmitted',
      submitted_at: null, graded_at: daysFromNow(-12, 10, 0),
      score: 0, grade: '0', late: false, missing: true, excused: false, attempt: null,
    },
  },
];

export const CALENDAR_EVENTS: CanvasCalendarEvent[] = [
  {
    id: 554001,
    title: '6.1210 Midterm Exam 1',
    description:
      '<p>Covers everything through amortized analysis. <strong>Room assignments by last name:</strong> A–L in 26-100, M–Z in 32-123. Bring your MIT ID.</p>',
    start_at: daysFromNow(5, 19, 30),
    end_at: daysFromNow(5, 21, 30),
    location_name: '26-100',
    all_day: false,
    context_code: 'course_28277',
    context_name: 'Introduction to Algorithms',
    html_url: 'https://canvas.mit.edu/calendar?event_id=554001',
  },
  {
    id: 554188,
    title: '18.06 Exam 2',
    description: '<p>Through eigenvalues. Closed book, one page of notes.</p>',
    start_at: daysFromNow(12, 14, 5),
    end_at: daysFromNow(12, 15, 25),
    location_name: '54-100',
    all_day: false,
    context_code: 'course_27980',
    context_name: 'Linear Algebra',
    html_url: 'https://canvas.mit.edu/calendar?event_id=554188',
  },
  {
    id: 554220,
    title: '6.1010 Office Hours',
    description: '<p>Checkoffs for Lab 6. First come first served.</p>',
    start_at: hoursFromNow(20),
    end_at: hoursFromNow(23),
    location_name: '34-501',
    all_day: false,
    context_code: 'course_28114',
    context_name: 'Fundamentals of Programming',
    html_url: 'https://canvas.mit.edu/calendar?event_id=554220',
  },
];
