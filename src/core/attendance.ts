/**
 * Attendance-graded "assignments".
 *
 * MIT PE classes live in Canvas like any other course, and the instructor
 * awards points per session attended - so Canvas shows a dated, graded
 * "assignment" for every class meeting. Those points are real and belong in
 * the Work tab's averages. They are not homework: there is nothing to do
 * ahead of time, and listing "10/22" as a task to plan for pushes actual
 * psets off the top of the Plan tab.
 *
 * So attendance courses are recognised once, here, and excluded from Plan,
 * Due, the calendar's deadline dots, and reminders, while Grades keeps them.
 */

import type { CourseRef, UnifiedEvent } from './types';

/** PE, PE.0521, PE_FA26, "PE & Wellness: ..." - all attendance. */
const ATTENDANCE_CODE_RE = /^PE(?:[\s._-]|$)/i;
const ATTENDANCE_NAME_RE = /\b(physical education|PE\s*&\s*wellness|DAPER)\b/i;

export function isAttendanceCourse(course: CourseRef | undefined): boolean {
  if (!course) return false;
  if (ATTENDANCE_CODE_RE.test(course.code.trim())) return true;
  return Boolean(course.name && ATTENDANCE_NAME_RE.test(course.name));
}

/** Graded-for-showing-up work: worth points, not worth planning time for. */
export function isAttendanceWork(ev: Pick<UnifiedEvent, 'course' | 'lane'>): boolean {
  return ev.lane === 'obligation' && isAttendanceCourse(ev.course);
}
