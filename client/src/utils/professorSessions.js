export function getProfessorSessionPrimaryPath(session, courseId, returnTab = 0) {
  const sessionId = String(session?._id || '');
  const tabSuffix = `?returnTab=${returnTab}`;

  if (String(session?.status || '') === 'done') {
    return `/manage/course/${courseId}/session/${sessionId}/review${tabSuffix}`;
  }

  return `/manage/course/${courseId}/session/${sessionId}${tabSuffix}`;
}

export function sessionCanShowLiveReviewAction(session) {
  return String(session?.status || '') === 'running';
}

export function sessionCanShowListReviewAction(session) {
  const status = String(session?.status || '');
  if (!['hidden', 'visible'].includes(status)) return false;
  return !!session?.hasResponses;
}
