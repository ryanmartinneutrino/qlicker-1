export function getProfessorSessionPrimaryPath(session, courseId, returnTab = 0) {
  const sessionId = String(session?._id || '');
  const tabSuffix = `?returnTab=${returnTab}`;

  if (String(session?.status || '') === 'done') {
    return `/manage/course/${courseId}/session/${sessionId}/review${tabSuffix}`;
  }

  return `/manage/course/${courseId}/session/${sessionId}${tabSuffix}`;
}
