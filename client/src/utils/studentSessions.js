function getTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeNowTimestamp(now) {
  if (typeof now === 'number') {
    return Number.isFinite(now) ? now : 0;
  }
  return getTimestamp(now);
}

function getSessionSortBucket(session) {
  const status = String(session?.status || '');
  if (status === 'running') return 0;
  if (status === 'hidden') return 1;
  if (status === 'visible') return 2;
  if (status === 'done') return 3;
  return 4;
}

export function getEffectiveQuizStatus(session, now = Date.now()) {
  const status = String(session?.status || '');
  if (!isQuizSession(session)) return status;
  if (status === 'hidden' || status === 'done') return status;

  const nowTimestamp = normalizeNowTimestamp(now);
  if (nowTimestamp <= 0) return status;

  const quizStartTimestamp = getTimestamp(session?.quizStart || session?.date || session?.createdAt);
  const quizEndTimestamp = getTimestamp(session?.quizEnd);

  if (quizEndTimestamp > 0 && nowTimestamp >= quizEndTimestamp) {
    return 'done';
  }

  if (quizStartTimestamp > 0) {
    if (nowTimestamp >= quizStartTimestamp) return 'running';
    return 'visible';
  }

  return status;
}

export function getSessionSortTime(session, now = Date.now()) {
  const isQuiz = isQuizSession(session);
  const status = isQuiz ? getEffectiveQuizStatus(session, now) : String(session?.status || '');

  if (isQuiz && status === 'visible') {
    return getTimestamp(session?.quizStart || session?.date || session?.createdAt || session?.quizEnd);
  }

  if (isQuiz && (status === 'running' || status === 'done')) {
    return getTimestamp(session?.quizEnd || session?.date || session?.quizStart || session?.createdAt);
  }

  if (isQuiz) {
    return getTimestamp(session?.quizStart || session?.date || session?.createdAt || session?.quizEnd);
  }

  return getTimestamp(session?.date || session?.createdAt || session?.quizStart || session?.quizEnd);
}

export function isQuizSession(session) {
  return !!(session?.quiz || session?.practiceQuiz);
}

export function isSubmittedLiveQuiz(session) {
  return !!(
    isQuizSession(session)
    && session?.status === 'running'
    && session?.quizSubmittedByCurrentUser
    && !session?.practiceQuiz
  );
}

export function shouldShowStudentSessionQuestionCount(session) {
  if (session?.studentCreated && session?.practiceQuiz) {
    return true;
  }
  return !!session?.reviewable;
}

export function getStudentSessionAction(session, courseId, listTabIndex = 0) {
  const isQuiz = isQuizSession(session);
  const submittedQuiz = isQuiz && session?.quizSubmittedByCurrentUser && !session?.practiceQuiz;
  const isOwnedPracticeSession = !!session?.practiceQuiz && !!session?.studentCreated;
  const practiceReviewPath = `/student/course/${courseId}/session/${session?._id}/review?returnTab=${listTabIndex}`;

  if (session?.status === 'done' && session?.reviewable) {
    return {
      clickable: true,
      path: practiceReviewPath,
      label: 'student.course.review',
      chipColor: 'success',
      chipVariant: 'outlined',
    };
  }

  if (submittedQuiz) {
    return {
      clickable: false,
      path: '',
      label: 'student.course.quizSubmitted',
      chipColor: 'default',
      chipVariant: 'outlined',
    };
  }

  if (session?.status === 'running' && !isQuiz) {
    return {
      clickable: true,
      path: `/student/course/${courseId}/session/${session?._id}/live`,
      label: 'student.course.joinLive',
      chipColor: 'primary',
      chipVariant: 'filled',
    };
  }

  if (isOwnedPracticeSession) {
    const hasQuestions = Array.isArray(session?.questions) && session.questions.length > 0;
    return {
      clickable: hasQuestions,
      path: hasQuestions ? practiceReviewPath : '',
      label: hasQuestions ? 'student.course.review' : '',
      chipColor: hasQuestions ? 'success' : 'default',
      chipVariant: 'outlined',
    };
  }

  if (isQuiz && session?.status === 'running') {
    const hasResponses = !!session?.quizHasResponsesByCurrentUser;
    const allQuestionsAnswered = !!session?.quizAllQuestionsAnsweredByCurrentUser;
    let quizActionLabel = 'student.course.startQuiz';
    let chipColor = 'primary';
    if (allQuestionsAnswered) {
      quizActionLabel = 'student.course.submitQuiz';
      chipColor = 'error';
    } else if (hasResponses) {
      quizActionLabel = 'student.course.resumeQuiz';
      chipColor = 'error';
    }
    return {
      clickable: true,
      path: `/student/course/${courseId}/session/${session?._id}/quiz`,
      label: quizActionLabel,
      chipColor,
      chipVariant: 'filled',
    };
  }

  if (isQuiz && session?.status === 'visible') {
    return {
      clickable: false,
      path: '',
      label: 'student.course.upcomingQuiz',
      chipColor: 'default',
      chipVariant: 'outlined',
    };
  }

  return {
    clickable: false,
    path: '',
    label: '',
    chipColor: 'default',
    chipVariant: 'outlined',
  };
}

export function sortStudentSessions(items, now = Date.now()) {
  return [...items].sort((a, b) => {
    const aBucket = getSessionSortBucket(a);
    const bBucket = getSessionSortBucket(b);
    if (aBucket !== bBucket) return aBucket - bBucket;
    const submittedDiff = Number(isSubmittedLiveQuiz(a)) - Number(isSubmittedLiveQuiz(b));
    if (submittedDiff !== 0) return submittedDiff;
    return getSessionSortTime(b, now) - getSessionSortTime(a, now);
  });
}

export const sortSessions = sortStudentSessions;
