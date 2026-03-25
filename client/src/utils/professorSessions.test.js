import { describe, expect, it } from 'vitest';
import { getProfessorSessionPrimaryPath } from './professorSessions';

describe('getProfessorSessionPrimaryPath', () => {
  it('routes active sessions to the editor', () => {
    expect(getProfessorSessionPrimaryPath({ _id: 'session-1', status: 'running' }, 'course-1', 2))
      .toBe('/manage/course/course-1/session/session-1?returnTab=2');
  });

  it('routes ended sessions to the review page', () => {
    expect(getProfessorSessionPrimaryPath({ _id: 'session-2', status: 'done' }, 'course-1', 3))
      .toBe('/manage/course/course-1/session/session-2/review?returnTab=3');
  });
});
