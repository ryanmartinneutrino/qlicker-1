import { describe, expect, it } from 'vitest';
import { getStudentSessionAction } from './CourseDetail';

describe('getStudentSessionAction', () => {
  it('shows start quiz when a running quiz has no saved responses', () => {
    const action = getStudentSessionAction({
      _id: 'session-1',
      quiz: true,
      status: 'running',
      quizHasResponsesByCurrentUser: false,
      quizAllQuestionsAnsweredByCurrentUser: false,
    }, 'course-1', 1);

    expect(action).toEqual({
      clickable: true,
      path: '/student/course/course-1/session/session-1/quiz',
      label: 'student.course.startQuiz',
      chipColor: 'primary',
      chipVariant: 'filled',
    });
  });

  it('shows resume quiz in red when a running quiz already has saved responses', () => {
    const action = getStudentSessionAction({
      _id: 'session-1',
      quiz: true,
      status: 'running',
      quizHasResponsesByCurrentUser: true,
      quizAllQuestionsAnsweredByCurrentUser: false,
    }, 'course-1', 1);

    expect(action).toEqual({
      clickable: true,
      path: '/student/course/course-1/session/session-1/quiz',
      label: 'student.course.resumeQuiz',
      chipColor: 'error',
      chipVariant: 'filled',
    });
  });

  it('shows submit quiz in red when all quiz questions already have responses', () => {
    const action = getStudentSessionAction({
      _id: 'session-1',
      quiz: true,
      status: 'running',
      quizHasResponsesByCurrentUser: true,
      quizAllQuestionsAnsweredByCurrentUser: true,
    }, 'course-1', 1);

    expect(action).toEqual({
      clickable: true,
      path: '/student/course/course-1/session/session-1/quiz',
      label: 'student.course.submitQuiz',
      chipColor: 'error',
      chipVariant: 'filled',
    });
  });
});
