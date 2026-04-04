export function buildReviewableWarningMessage(t, warning) {
  const manualCount = Number(warning?.nonAutoGradeableCount) || 0;
  const noResponseCount = Number(warning?.noResponseCount) || 0;

  if (manualCount > 0 && noResponseCount > 0) {
    return t('professor.liveSession.reviewableWarningCombined', {
      manualCount,
      noResponseCount,
    });
  }
  if (manualCount > 0) {
    return t('professor.liveSession.reviewableWarningManualOnly', {
      count: manualCount,
    });
  }
  return t('professor.liveSession.reviewableWarningNoResponsesOnly', {
    count: noResponseCount,
  });
}

export async function toggleSessionReviewable({
  apiClient,
  sessionId,
  reviewable,
  t,
}) {
  const sendToggle = (payload) => apiClient.patch(`/sessions/${sessionId}/reviewable`, payload);

  let response = await sendToggle({ reviewable });
  const warning = response?.data?.nonAutoGradeableWarning;

  if (reviewable && warning) {
    const warningMessage = buildReviewableWarningMessage(t, warning);
    const confirmed = window.confirm(
      t('professor.sessionReview.confirmReviewableWarning', {
        warning: warningMessage,
        defaultValue: '{{warning}} Make the session reviewable anyway?',
      })
    );

    if (!confirmed) {
      return {
        cancelled: true,
        data: response.data,
        warningMessage,
      };
    }

    response = await sendToggle({
      reviewable,
      acknowledgeNonAutoGradeable: true,
    });
  }

  return {
    cancelled: false,
    data: response.data,
    warningMessage: '',
  };
}
