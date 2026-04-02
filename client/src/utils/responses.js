export function getResponseTimestampMs(response) {
  const timestamp = new Date(response?.updatedAt || response?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getLatestResponse(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return null;

  let latestResponse = null;
  responses.forEach((response) => {
    if (!response) return;
    if (!latestResponse) {
      latestResponse = response;
      return;
    }

    const attemptDiff = (Number(response?.attempt) || 0) - (Number(latestResponse?.attempt) || 0);
    if (attemptDiff > 0) {
      latestResponse = response;
      return;
    }
    if (attemptDiff < 0) {
      return;
    }

    if (getResponseTimestampMs(response) >= getResponseTimestampMs(latestResponse)) {
      latestResponse = response;
    }
  });

  return latestResponse;
}

export function sortResponsesNewestFirst(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return [];
  return [...responses].sort((a, b) => {
    const timestampDiff = getResponseTimestampMs(b) - getResponseTimestampMs(a);
    if (timestampDiff !== 0) return timestampDiff;
    return String(b?._id || '').localeCompare(String(a?._id || ''));
  });
}

function getResponseMergeKey(response = {}) {
  const responseId = String(response?._id || '').trim();
  if (responseId) return `id:${responseId}`;

  return [
    Number(response?.attempt || 0),
    String(response?.questionId || ''),
    String(response?.studentName || ''),
    String(response?.answer ?? ''),
    String(response?.answerWysiwyg ?? ''),
    getResponseTimestampMs(response),
  ].join('|');
}

export function mergeResponsesNewestFirst(existingResponses = [], incomingResponses = []) {
  const mergedByKey = new Map();
  [...(Array.isArray(existingResponses) ? existingResponses : []), ...(Array.isArray(incomingResponses) ? incomingResponses : [])]
    .forEach((response) => {
      if (!response) return;
      mergedByKey.set(getResponseMergeKey(response), response);
    });
  return sortResponsesNewestFirst([...mergedByKey.values()]);
}

export function applyLiveResponseAddedDelta(prev, payload = {}) {
  if (!prev) return prev;

  const currentQuestionId = String(prev?.currentQuestion?._id || prev?.session?.currentQuestion || '');
  const payloadQuestionId = String(payload?.questionId || '');
  if (currentQuestionId && payloadQuestionId && payloadQuestionId !== currentQuestionId) {
    return prev;
  }

  const currentAttemptNumber = Number(prev?.currentAttempt?.number || 0);
  const payloadAttemptNumber = Number(payload?.attempt || currentAttemptNumber || 0);
  if (currentAttemptNumber > 0 && payloadAttemptNumber > 0 && payloadAttemptNumber !== currentAttemptNumber) {
    return prev;
  }

  const nextResponse = payload?.response || null;
  const nextAllResponses = nextResponse
    ? mergeResponsesNewestFirst(prev?.allResponses || [], [nextResponse])
    : (Array.isArray(prev?.allResponses) ? prev.allResponses : []);

  const currentStats = prev?.responseStats;
  let nextResponseStats = currentStats;

  if (payload?.responseStats && typeof payload.responseStats === 'object') {
    if (payload.responseStats.type === 'distribution') {
      nextResponseStats = payload.responseStats;
    } else {
      const existingAnswers = Array.isArray(currentStats?.answers) ? currentStats.answers : [];
      const payloadAnswers = Array.isArray(payload.responseStats.answers) ? payload.responseStats.answers : null;
      const mergedAnswers = payloadAnswers
        ? payloadAnswers
        : nextResponse
          ? mergeResponsesNewestFirst(existingAnswers, [nextResponse])
          : existingAnswers;
      nextResponseStats = {
        ...(currentStats || {}),
        ...payload.responseStats,
        ...(mergedAnswers.length > 0 || payloadAnswers ? { answers: mergedAnswers } : {}),
      };
    }
  } else if (currentStats && nextResponse && ['shortAnswer', 'numerical'].includes(currentStats.type)) {
    nextResponseStats = {
      ...currentStats,
      total: payload?.responseCount ?? currentStats.total,
      answers: mergeResponsesNewestFirst(currentStats.answers || [], [nextResponse]),
    };
  }

  return {
    ...prev,
    responseCount: payload?.responseCount ?? prev?.responseCount,
    session: prev?.session
      ? {
        ...prev.session,
        joinedCount: payload?.joinedCount ?? prev.session?.joinedCount,
      }
      : prev?.session,
    allResponses: nextAllResponses,
    responseStats: nextResponseStats,
  };
}
