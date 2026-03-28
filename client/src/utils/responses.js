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
