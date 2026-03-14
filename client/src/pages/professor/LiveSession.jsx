import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, Snackbar, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  Switch, FormControlLabel, TextField, Divider, useMediaQuery,
  Radio, RadioGroup, FormControl, FormLabel,
} from '@mui/material';
import {
  ArrowBack as PrevIcon, ArrowForward as NextIcon,
  Stop as StopIcon, OpenInNew as OpenInNewIcon,
  Check as CheckIcon,
  Replay as AttemptIcon,
  People as PeopleIcon, Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import apiClient, { getAccessToken } from '../../api/client';
import {
  QUESTION_TYPES,
  TYPE_LABELS,
  isOptionBasedQuestionType,
  isSlideType,
  normalizeQuestionType,
} from '../../components/questions/constants';
import { getSessionActivities, getActivityIds, findActivityIndex, isSlideActivity } from '../../utils/activities';
import { prepareRichTextInput, renderKatexInElement } from '../../components/questions/richTextUtils';
import { buildHistogramData } from '../../utils/histogram';
import { buildCourseTitle } from '../../utils/courseTitle';
import HistogramBars from '../../components/common/HistogramBars';
import { useTranslation } from 'react-i18next';
import BackLinkButton from '../../components/common/BackLinkButton';
import StudentIdentity from '../../components/common/StudentIdentity';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': { px: 1.15 },
};

const SR_ONLY_SX = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

function activityIndex(session, activityId) {
  const activities = session?.activities;
  if (Array.isArray(activities) && activities.length > 0) {
    return findActivityIndex(activities, activityId);
  }
  const ids = session?.questions || [];
  return ids.indexOf(activityId);
}

function optionDisplayHtml(option) {
  return option?.content || option?.plainText || option?.answer || '';
}

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatJoinedTimestamp(value, fallbackLabel) {
  if (!value) return fallbackLabel;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallbackLabel;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders rich-text question content with KaTeX math support. */
function RichContent({ html }) {
  const ref = useRef(null);
  const prepared = prepareRichTextInput(html);

  useEffect(() => {
    if (ref.current) renderKatexInElement(ref.current);
  }, [prepared]);

  if (!prepared) return null;
  return (
    <Box
      ref={ref}
      sx={{ '& p': { my: 0.5 }, '& img': { maxWidth: '100%' } }}
      dangerouslySetInnerHTML={{ __html: prepared }}
    />
  );
}

/** Short-answer responses list (rendered rich text). */
function ShortAnswerList({ responses, showStudentNames = false }) {
  const { t } = useTranslation();
  if (!responses || !responses.length) {
    return <Typography variant="body2" color="text.secondary">{t('professor.liveSession.noResponsesYet')}</Typography>;
  }
  return (
    <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
      {responses.map((r, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 1, mb: 0.5 }}>
          {showStudentNames && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {r.studentName || t('common.unknown')}
            </Typography>
          )}
          {r.answerWysiwyg ? (
            <RichContent html={r.answerWysiwyg} />
          ) : (
            <Typography variant="body2">{r.answer ?? r.value ?? r.text ?? t('common.noAnswer')}</Typography>
          )}
        </Paper>
      ))}
    </Box>
  );
}

/** Numerical statistics display with histogram. */
function NumericalStats({ stats, allResponses }) {
  const { t } = useTranslation();
  if (!stats) {
    return <Typography variant="body2" color="text.secondary">{t('professor.liveSession.noResponsesYet')}</Typography>;
  }

  // Build histogram bins from raw values
  const values = (allResponses || [])
    .map((r) => Number(r.answer))
    .filter((v) => !isNaN(v));

  const histogramData = buildHistogramData(values);

  const entries = [
    { label: t('common.count'), value: stats.total ?? stats.count ?? 0 },
    { label: t('professor.secondDesktop.mean'), value: stats.mean != null ? Number(stats.mean).toFixed(2) : '—' },
    { label: t('professor.secondDesktop.median'), value: stats.median != null ? Number(stats.median).toFixed(2) : '—' },
    { label: t('professor.secondDesktop.min'), value: stats.min != null ? Number(stats.min).toFixed(2) : '—' },
    { label: t('professor.secondDesktop.max'), value: stats.max != null ? Number(stats.max).toFixed(2) : '—' },
  ];
  return (
    <Box>
      {histogramData.length > 0 && (
        <HistogramBars data={histogramData} height={170} />
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {entries.map((e) => (
          <Paper key={e.label} variant="outlined" sx={{ p: 1.5, minWidth: 90, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">{e.label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{e.value}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LiveSession() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width:768px)');
  const { t } = useTranslation();

  // Core state
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // End session dialog
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [makeReviewable, setMakeReviewable] = useState(false);
  const [ending, setEnding] = useState(false);
  const [nonAutoGradeableWarning, setNonAutoGradeableWarning] = useState(null);
  const [reviewableOption, setReviewableOption] = useState('proceed'); // 'proceed', 'zero', 'cancel'

  const [joinCodeIntervalInput, setJoinCodeIntervalInput] = useState('10');
  const [activePanel, setActivePanel] = useState('question');

  // Join code refresh interval ref
  const joinCodeTimerRef = useRef(null);

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------

  const fetchLive = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/live`, {
        params: { includeStudentNames: true },
      });
      setLiveData(data);
      setError(null);

      if (data?.session?.status === 'done') {
        navigate(`/manage/course/${courseId}`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || t('professor.liveSession.failedLoadLiveSession'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, navigate, courseId]);

  // Throttled re-fetch: batches rapid response-added events into at most one
  // re-fetch per 2-second window, dramatically reducing DB load during live sessions.
  const fetchThrottleRef = useRef(null);
  const scheduleFetchLive = useCallback(() => {
    if (fetchThrottleRef.current) return;
    fetchThrottleRef.current = setTimeout(() => {
      fetchThrottleRef.current = null;
      fetchLive();
    }, 2000);
  }, [fetchLive]);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  // --------------------------------------------------
  // WebSocket real-time updates (with polling fallback)
  // --------------------------------------------------

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let pollingTimer = null;
    let closed = false;

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      fetchLive();
    };

    const startPolling = () => {
      if (pollingTimer || closed) return;
      pollingTimer = setInterval(refresh, 3000);
    };

    const stopPolling = () => {
      if (!pollingTimer) return;
      clearInterval(pollingTimer);
      pollingTimer = null;
    };

    const connect = () => {
      if (closed) return;
      const latestToken = getAccessToken();
      if (!latestToken) return;
      try {
        ws = new WebSocket(buildWebsocketUrl(latestToken));
      } catch {
        startPolling();
        reconnectTimer = setTimeout(connect, 2500);
        return;
      }

      ws.onopen = () => { stopPolling(); };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const evt = message?.event;
          const d = message?.data;
          if (!evt || String(d?.sessionId || '') !== String(sessionId)) return;

          switch (evt) {
            case 'session:response-added':
              // Update count immediately; schedule throttled re-fetch for full stats
              setLiveData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  responseCount: d.responseCount ?? prev.responseCount,
                  session: {
                    ...prev.session,
                    joinedCount: d.joinedCount ?? prev.session?.joinedCount,
                  },
                };
              });
              scheduleFetchLive();
              break;
            case 'session:question-changed':
              fetchLive();
              break;
            case 'session:visibility-changed':
              fetchLive();
              break;
            case 'session:status-changed':
              if (d.status === 'done') {
                navigate(`/manage/course/${courseId}`, { replace: true });
                return;
              }
              fetchLive();
              break;
            case 'session:updated':
              fetchLive();
              break;
            default:
              break;
          }
        } catch {
          // Ignore malformed payloads
        }
      };

      ws.onclose = () => {
        if (closed) return;
        startPolling();
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    const init = async () => {
      try {
        const { data } = await apiClient.get('/health');
        if (data?.websocket === true) { connect(); return; }
      } catch { /* fall through */ }
      startPolling();
    };

    init();

    const handleVisibility = () => refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (fetchThrottleRef.current) clearTimeout(fetchThrottleRef.current);
      fetchThrottleRef.current = null;
      stopPolling();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchLive, scheduleFetchLive, sessionId, courseId, navigate]);

  // --------------------------------------------------
  // Auto-refresh join code
  // --------------------------------------------------

  useEffect(() => {
    if (joinCodeTimerRef.current) {
      clearInterval(joinCodeTimerRef.current);
      joinCodeTimerRef.current = null;
    }

    const session = liveData?.session;
    if (!session?.joinCodeEnabled || !session?.joinCodeActive) return;

    const interval = (session.joinCodeInterval || 10) * 1000;
    joinCodeTimerRef.current = setInterval(async () => {
      try {
        await apiClient.post(`/sessions/${sessionId}/refresh-join-code`);
        fetchLive();
      } catch { /* ignore */ }
    }, interval);

    return () => {
      if (joinCodeTimerRef.current) {
        clearInterval(joinCodeTimerRef.current);
        joinCodeTimerRef.current = null;
      }
    };
  }, [
    liveData?.session?.joinCodeEnabled,
    liveData?.session?.joinCodeActive,
    liveData?.session?.joinCodeInterval,
    sessionId,
    fetchLive,
  ]);

  useEffect(() => {
    const interval = liveData?.session?.joinCodeInterval;
    if (interval == null) return;
    setJoinCodeIntervalInput(String(interval));
  }, [liveData?.session?.joinCodeInterval]);

  // --------------------------------------------------
  // Action helpers
  // --------------------------------------------------

  const doAction = useCallback(async (requestFn, successMsg) => {
    setActionLoading(true);
    try {
      await requestFn();
      if (successMsg) setMsg({ severity: 'success', text: successMsg });
      await fetchLive();
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || t('professor.liveSession.actionFailed') });
    } finally {
      setActionLoading(false);
    }
  }, [fetchLive]);

  // Navigation
  const handleSetQuestion = useCallback((qId) => {
    doAction(() => apiClient.patch(`/sessions/${sessionId}/current`, { questionId: qId }));
  }, [doAction, sessionId]);

  const handlePrev = useCallback(() => {
    const session = liveData?.session;
    if (!session) return;
    const ids = getActivityIds(getSessionActivities(session));
    const idx = ids.indexOf(session.currentQuestion);
    if (idx > 0) handleSetQuestion(ids[idx - 1]);
  }, [liveData, handleSetQuestion]);

  const handleNext = useCallback(() => {
    const session = liveData?.session;
    if (!session) return;
    const ids = getActivityIds(getSessionActivities(session));
    const idx = ids.indexOf(session.currentQuestion);
    if (idx < ids.length - 1) handleSetQuestion(ids[idx + 1]);
  }, [liveData, handleSetQuestion]);

  // Visibility toggles
  const handleToggleVisibility = useCallback((field) => {
    const opts = liveData?.currentQuestion?.sessionOptions || {};
    const newVal = !opts[field];
    doAction(() => apiClient.patch(`/sessions/${sessionId}/question-visibility`, {
      hidden: field === 'hidden' ? newVal : !!opts.hidden,
      stats: field === 'stats' ? newVal : !!opts.stats,
      correct: field === 'correct' ? newVal : !!opts.correct,
    }));
  }, [doAction, sessionId, liveData]);

  // Attempts & responses
  const handleNewAttempt = useCallback(() => {
    doAction(
      () => apiClient.post(`/sessions/${sessionId}/new-attempt`),
      t('professor.liveSession.newAttemptStarted'),
    );
  }, [doAction, sessionId, t]);

  const handleToggleResponses = useCallback(() => {
    const closed = liveData?.currentAttempt?.closed;
    doAction(() => apiClient.patch(`/sessions/${sessionId}/toggle-responses`, { closed: !closed }));
  }, [doAction, sessionId, liveData]);

  // End session
  const handleEndSession = useCallback(async () => {
    setEnding(true);
    try {
      const shouldMakeReviewable = makeReviewable && (!nonAutoGradeableWarning || reviewableOption !== 'cancel');
      const payload = { reviewable: shouldMakeReviewable };
      if (shouldMakeReviewable && nonAutoGradeableWarning) {
        payload.acknowledgeNonAutoGradeable = true;
        if (reviewableOption === 'zero') {
          payload.zeroNonAutoGradeable = true;
        }
      }
      const { data } = await apiClient.post(`/sessions/${sessionId}/end`, payload);
      if (data?.nonAutoGradeableWarning && !nonAutoGradeableWarning) {
        setNonAutoGradeableWarning(data.nonAutoGradeableWarning);
        setEnding(false);
        return;
      }
      setEndDialogOpen(false);
      setNonAutoGradeableWarning(null);
      navigate(`/manage/course/${courseId}`, { replace: true });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || t('professor.liveSession.failedEndSession') });
    } finally {
      setEnding(false);
    }
  }, [sessionId, makeReviewable, navigate, courseId, nonAutoGradeableWarning, reviewableOption]);

  // Join code controls
  const handleTogglePasscodeRequired = useCallback((enabled) => {
    doAction(
      () => apiClient.patch(`/sessions/${sessionId}/join-code-settings`, { joinCodeEnabled: enabled }),
      enabled ? t('professor.liveSession.passcodeEnabled') : t('professor.liveSession.passcodeDisabled'),
    );
  }, [doAction, sessionId, t]);

  const handleToggleJoinCode = useCallback((active) => {
    doAction(
      () => apiClient.patch(`/sessions/${sessionId}/join-code-settings`, { joinCodeActive: active }),
      active ? t('professor.liveSession.joinPeriodStarted') : t('professor.liveSession.joinPeriodClosed'),
    );
  }, [doAction, sessionId, t]);

  const handleRefreshJoinCode = useCallback(() => {
    doAction(
      () => apiClient.post(`/sessions/${sessionId}/refresh-join-code`),
      t('professor.liveSession.joinCodeRefreshed'),
    );
  }, [doAction, sessionId, t]);

  const handleJoinCodeIntervalBlur = useCallback(() => {
    const currentInterval = Number(liveData?.session?.joinCodeInterval || 10);
    const parsed = Number(joinCodeIntervalInput);
    if (!Number.isFinite(parsed)) {
      setJoinCodeIntervalInput(String(currentInterval));
      return;
    }
    const rounded = Math.round(parsed);
    if (rounded < 5 || rounded > 120) {
      setMsg({ severity: 'error', text: t('professor.liveSession.joinCodeIntervalRange') });
      setJoinCodeIntervalInput(String(currentInterval));
      return;
    }
    if (rounded === currentInterval) return;

    doAction(
      () => apiClient.patch(`/sessions/${sessionId}/join-code-settings`, { joinCodeInterval: rounded }),
      t('professor.liveSession.joinCodeIntervalUpdated'),
    );
  }, [doAction, joinCodeIntervalInput, liveData?.session?.joinCodeInterval, sessionId]);

  // Presentation window
  const presentationWindowRef = useRef(null);

  const handleOpenPresent = useCallback(() => {
    const url = `/manage/course/${courseId}/session/${sessionId}/present`;
    const w = Math.min(1200, window.screen.availWidth * 0.8);
    const h = Math.min(800, window.screen.availHeight * 0.8);
    const left = Math.round((window.screen.availWidth - w) / 2);
    const top = Math.round((window.screen.availHeight - h) / 2);
    const features = `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,scrollbars=yes,resizable=yes`;
    const win = window.open(url, 'qlicker-presentation-window', features);
    if (win) presentationWindowRef.current = win;
  }, [courseId, sessionId]);

  // --------------------------------------------------
  // Derived values
  // --------------------------------------------------

  const session = liveData?.session;
  const courseTitle = useMemo(() => (
    liveData?.course?._id ? buildCourseTitle(liveData.course, 'long') : ''
  ), [liveData?.course]);
  const courseSection = useMemo(
    () => normalizeValue(liveData?.course?.section),
    [liveData?.course?.section]
  );
  const currentQ = liveData?.currentQuestion;
  const currentAttempt = liveData?.currentAttempt;
  const responseStats = liveData?.responseStats;
  const allResponses = liveData?.allResponses || [];
  const responseCount = liveData?.responseCount ?? allResponses.length;
  const joinedCount = session?.joinedCount ?? (session?.joined?.length || 0);
  const joinedStudents = Array.isArray(session?.joinedStudents) ? session.joinedStudents : [];
  const sortedJoinedStudents = useMemo(() => [...joinedStudents].sort((a, b) => {
    const lastCmp = normalizeValue(a?.lastname).localeCompare(normalizeValue(b?.lastname));
    if (lastCmp !== 0) return lastCmp;
    const firstCmp = normalizeValue(a?.firstname).localeCompare(normalizeValue(b?.firstname));
    if (firstCmp !== 0) return firstCmp;
    return normalizeValue(a?.email).localeCompare(normalizeValue(b?.email));
  }), [joinedStudents]);

  const qIdx = session ? activityIndex(session, session.currentQuestion) : -1;
  const totalQ = getActivityIds(getSessionActivities(session || {})).length || 0;
  const hasPrev = qIdx > 0;
  const hasNext = qIdx < totalQ - 1;
  const qType = currentQ ? normalizeQuestionType(currentQ) : null;
  const isSlide = isSlideType(qType);
  const pageProgress = liveData?.pageProgress || (totalQ > 0 && qIdx >= 0
    ? { current: qIdx + 1, total: totalQ }
    : null);
  const questionProgress = liveData?.questionProgress || null;
  const hasSlidesInSession = !!(pageProgress && questionProgress && pageProgress.total !== questionProgress.total);
  const isHidden = !!currentQ?.sessionOptions?.hidden;
  const showStats = !!currentQ?.sessionOptions?.stats;
  const showCorrect = !!currentQ?.sessionOptions?.correct;
  const responsesClosed = !!currentAttempt?.closed;
  const attemptNum = currentAttempt?.number ?? null;
  const isOptionBasedQuestion = isOptionBasedQuestionType(qType) || qType === QUESTION_TYPES.TRUE_FALSE;
  const inlineDistribution = responseStats?.type === 'distribution'
    ? responseStats.distribution || []
    : [];
  const inlineDistributionTotal = Number(responseStats?.total) > 0
    ? Number(responseStats.total)
    : inlineDistribution.reduce((sum, d) => sum + (d.count || 0), 0);
  const liveStatusMessage = [
    hasSlidesInSession && pageProgress ? t('professor.liveSession.pageProgress', pageProgress) : null,
    !isSlide && questionProgress ? t('professor.liveSession.questionProgress', questionProgress) : null,
    t('professor.liveSession.studentsJoined', { count: joinedCount }),
    !isSlide ? t('professor.liveSession.studentsResponded', { responded: responseCount, total: joinedCount }) : null,
    attemptNum != null ? t('professor.liveSession.attemptNumber', { number: attemptNum }) : null,
    !isSlide ? (responsesClosed ? t('professor.liveSession.responsesCurrentlyClosed') : t('professor.liveSession.responsesCurrentlyOpen')) : null,
    isHidden ? t('professor.liveSession.questionHidden') : t('professor.liveSession.questionVisible'),
  ].filter(Boolean).join(' ');

  // --------------------------------------------------
  // Render: loading / error / ended states
  // --------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress aria-label={t('professor.liveSession.loadingLiveSession')} />
      </Box>
    );
  }

  if (error || !session) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error || t('professor.liveSession.sessionNotFound')}</Alert>
        <BackLinkButton sx={{ mt: 2 }} label={t('professor.liveSession.backToCourse')} onClick={() => navigate(`/manage/course/${courseId}`)} />
      </Box>
    );
  }

  // --------------------------------------------------
  // Build chart data from responseStats
  // --------------------------------------------------

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 1200, mx: 'auto' }}>
      <Box role="status" aria-live="polite" aria-atomic="true" sx={SR_ONLY_SX}>
        {liveStatusMessage}
      </Box>

      {/* ============================================================ */}
      {/* Top bar                                                      */}
      {/* ============================================================ */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
        }}
      >
        <Box sx={{ width: '100%' }}>
          <BackLinkButton
            label={t('professor.liveSession.backToCourse')}
            onClick={() => navigate(`/manage/course/${courseId}`)}
          />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.25, width: '100%' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {!isMobile && courseTitle ? (
              <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
                {courseTitle}
              </Typography>
            ) : null}
            {!isMobile && courseSection ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t('professor.course.sectionHeader', { section: courseSection })}
              </Typography>
            ) : null}
            <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
              {session.name || t('professor.liveSession.liveSessionFallback')}
            </Typography>
          </Box>

          <Tooltip title={t('professor.liveSession.openPresentationWindow')}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={handleOpenPresent}
              aria-label={t('professor.liveSession.openPresentationWindow')}
            >
              {isMobile ? t('professor.liveSession.present') : t('professor.liveSession.presentationWindow')}
            </Button>
          </Tooltip>

          <Tooltip title={t('professor.liveSession.sessionSettings')}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={() => navigate(`/manage/course/${courseId}/session/${sessionId}`)}
              aria-label={t('professor.liveSession.sessionSettings')}
            >
              {t('professor.liveSession.settings')}
            </Button>
          </Tooltip>

          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            onClick={() => setEndDialogOpen(true)}
            aria-label={t('professor.liveSession.endSessionAction')}
          >
            {t('professor.liveSession.endSession')}
          </Button>
        </Box>

        <Box
          role="tablist"
          aria-label={t('professor.liveSession.panelsLabel')}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, width: '100%' }}
        >
          <Button
            size="medium"
            variant={activePanel === 'question' ? 'contained' : 'outlined'}
            onClick={() => setActivePanel('question')}
            aria-label={pageProgress
              ? t('professor.liveSession.pageControlsProgress', pageProgress)
              : t('professor.liveSession.questionControls')}
            sx={{ minWidth: { xs: 170, sm: 220 }, justifyContent: 'center' }}
          >
            {pageProgress
              ? t('professor.liveSession.pageControlsLabel', pageProgress)
              : t('professor.liveSession.questionControls')}
          </Button>
          <Button
            size="medium"
            variant={activePanel === 'students' ? 'contained' : 'outlined'}
            startIcon={<PeopleIcon />}
            onClick={() => setActivePanel('students')}
            aria-label={t('professor.liveSession.showStudentsPanel', { count: joinedCount })}
            sx={{ minWidth: { xs: 170, sm: 220 }, justifyContent: 'center' }}
          >
            {t('professor.liveSession.studentsInSession', { count: joinedCount })}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, width: '100%' }}>
          <Chip
            label={t('professor.liveSession.respondedSummary', { responded: responseCount, total: joinedCount })}
            size="small"
            variant="outlined"
            color={responseCount >= joinedCount && joinedCount > 0 ? 'success' : 'default'}
            sx={COMPACT_CHIP_SX}
            aria-label={t('professor.liveSession.respondedSummaryAria', { responded: responseCount, total: joinedCount })}
          />

          {activePanel === 'question' && (
            attemptNum != null ? (
              <Chip
                label={t('professor.liveSession.attemptChip', { number: attemptNum })}
                size="small"
                variant="outlined"
                sx={COMPACT_CHIP_SX}
              />
            ) : null
          )}
        </Box>
      </Paper>

      {activePanel === 'question' ? (
        <>
          {/* ============================================================ */}
          {/* Control bar (always above the question)                      */}
          {/* ============================================================ */}
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.5, sm: 2 },
              mb: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!session.joinCodeEnabled}
                    onChange={(e) => handleTogglePasscodeRequired(e.target.checked)}
                    disabled={actionLoading}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{t('professor.liveSession.requirePasscode')}</Typography>}
              />

              {session.joinCodeEnabled && (
                <>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!!session.joinCodeActive}
                        onChange={(e) => handleToggleJoinCode(e.target.checked)}
                        disabled={actionLoading}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">{t('professor.liveSession.joinPeriod')}</Typography>}
                  />
                  <TextField
                    size="small"
                    label={t('professor.liveSession.refreshSec')}
                    type="number"
                    value={joinCodeIntervalInput}
                    onChange={(e) => setJoinCodeIntervalInput(e.target.value)}
                    onBlur={handleJoinCodeIntervalBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    inputProps={{ min: 5, max: 120 }}
                    disabled={actionLoading}
                    sx={{ width: 130 }}
                  />
                  {session.joinCodeActive && session.currentJoinCode && (
                    <>
                      <Chip
                        label={session.currentJoinCode}
                        color="primary"
                        sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: 2 }}
                        aria-label={`Current join code: ${session.currentJoinCode}`}
                      />
                      <Tooltip title={t('professor.liveSession.refreshJoinCodeNow')}>
                        <IconButton
                          size="small"
                          onClick={handleRefreshJoinCode}
                          disabled={actionLoading}
                          aria-label={t('professor.liveSession.refreshJoinCode')}
                        >
                          <RefreshIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </>
              )}
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!isHidden}
                    onChange={() => handleToggleVisibility('hidden')}
                    disabled={!currentQ || actionLoading}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{t('professor.liveSession.visible')}</Typography>}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={showStats}
                    onChange={() => handleToggleVisibility('stats')}
                    disabled={!currentQ || actionLoading || isSlide}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{t('professor.liveSession.showStats')}</Typography>}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={showCorrect}
                    onChange={() => handleToggleVisibility('correct')}
                    disabled={!currentQ || actionLoading || isSlide}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{t('professor.liveSession.showCorrect')}</Typography>}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={!responsesClosed}
                    onChange={handleToggleResponses}
                    disabled={!currentQ || actionLoading || isSlide}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{t('professor.liveSession.responsesOpen')}</Typography>}
              />
            </Box>

            <Divider />

            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'stretch',
                gap: 1,
              }}
            >
              <Tooltip title={t('professor.liveSession.previousQuestion')}>
                <Box component="span" sx={{ display: 'flex', order: { xs: 2, sm: 1 }, flex: '1 1 0', minWidth: { xs: 'calc(50% - 4px)', sm: 0 } }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PrevIcon />}
                    onClick={handlePrev}
                    disabled={!hasPrev || actionLoading}
                    aria-label={t('professor.liveSession.previousQuestion')}
                    sx={{ width: '100%' }}
                  >
                    {t('professor.liveSession.prev')}
                  </Button>
                </Box>
              </Tooltip>

              <Tooltip title={t('professor.liveSession.startNewAttempt')}>
                <Box component="span" sx={{ display: 'flex', order: { xs: 1, sm: 2 }, flex: { xs: '1 0 100%', sm: '0 0 auto' }, width: { xs: '100%', sm: 'auto' } }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AttemptIcon />}
                    onClick={handleNewAttempt}
                    disabled={!currentQ || actionLoading || isSlide}
                    aria-label={t('professor.liveSession.newAttempt')}
                    sx={{ width: '100%' }}
                  >
                    {t('professor.liveSession.newAttempt')}
                  </Button>
                </Box>
              </Tooltip>

              <Tooltip title={t('professor.liveSession.nextQuestion')}>
                <Box component="span" sx={{ display: 'flex', order: 3, flex: '1 1 0', minWidth: { xs: 'calc(50% - 4px)', sm: 0 } }}>
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<NextIcon />}
                    onClick={handleNext}
                    disabled={!hasNext || actionLoading}
                    aria-label={t('professor.liveSession.nextQuestion')}
                    sx={{ width: '100%' }}
                  >
                    {t('common.next')}
                  </Button>
                </Box>
              </Tooltip>
            </Box>
          </Paper>

          {/* ============================================================ */}
          {/* Main content: question + stats                               */}
          {/* ============================================================ */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: isOptionBasedQuestion || isSlide ? 'column' : 'row' },
              gap: 2,
              mb: 2,
            }}
          >
            {/* ---- Left panel: question content ---- */}
            <Paper
              variant="outlined"
              sx={{ flex: { md: 1 }, p: 2, minWidth: 0 }}
              aria-label={t('professor.liveSession.currentQuestion')}
            >
              {currentQ ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    {hasSlidesInSession && pageProgress && (
                      <Chip
                        label={t('professor.liveSession.pageProgress', pageProgress)}
                        size="small"
                        variant="outlined"
                        sx={COMPACT_CHIP_SX}
                      />
                    )}
                    {!isSlide && questionProgress && (
                      <Chip
                        label={t('professor.liveSession.questionProgress', questionProgress)}
                        size="small"
                        variant="outlined"
                        sx={COMPACT_CHIP_SX}
                      />
                    )}
                    <Chip
                      label={TYPE_LABELS[qType] || t('sessionStatus.unknown')}
                      size="small"
                      variant="outlined"
                      sx={COMPACT_CHIP_SX}
                    />
                    {isHidden && (
                      <Chip label={t('professor.liveSession.hidden')} size="small" color="warning" sx={COMPACT_CHIP_SX} />
                    )}
                  </Box>

                  {/* Question content (rich text with KaTeX) */}
                  <Box sx={{ mb: 2 }}>
                    <RichContent html={currentQ.content || currentQ.plainText} />
                  </Box>

                  {/* Options for MC / TF / MS */}
                  {isOptionBasedQuestion && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {(currentQ.options || []).map((opt, i) => {
                        const isCorrect = !!opt.correct;
                        const count = inlineDistribution?.[i]?.count || 0;
                        const pct = inlineDistributionTotal > 0 ? Math.round(100 * count / inlineDistributionTotal) : 0;
                        const barColor = showCorrect
                          ? (isCorrect ? 'rgba(46, 125, 50, 0.22)' : 'rgba(211, 47, 47, 0.14)')
                          : 'rgba(25, 118, 210, 0.18)';
                        return (
                          <Paper
                            key={opt._id || i}
                            variant="outlined"
                            sx={{
                              position: 'relative',
                              overflow: 'hidden',
                              p: 1,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1,
                              borderColor: isCorrect ? 'success.main' : 'divider',
                              bgcolor: isCorrect ? 'success.lighter' : 'transparent',
                            }}
                          >
                            <Box
                              aria-hidden
                              sx={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${pct}%`,
                                bgcolor: barColor,
                                transition: 'width 0.4s ease-out',
                                pointerEvents: 'none',
                              }}
                            />
                            <Box
                              sx={{
                                position: 'relative',
                                zIndex: 1,
                                display: 'grid',
                                gridTemplateColumns: '30px minmax(0, 1fr) 74px 20px',
                                columnGap: 1,
                                alignItems: 'start',
                                width: '100%',
                              }}
                            >
                              <Chip
                                label={OPTION_LETTERS[i]}
                                size="small"
                                color={isCorrect ? 'success' : 'default'}
                                sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 28, justifySelf: 'start' }}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <RichContent html={optionDisplayHtml(opt)} />
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 58, textAlign: 'right' }}>
                                {pct}% ({count})
                              </Typography>
                              {isCorrect && (
                                <CheckIcon color="success" fontSize="small" aria-label={t('professor.liveSession.correctAnswerAria')} />
                              )}
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>
                  )}

                  {/* Correct answer for numerical */}
                  {qType === QUESTION_TYPES.NUMERICAL && currentQ.correctNumerical != null && (
                    <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('professor.liveSession.correct', { value: currentQ.correctNumerical })}
                      </Typography>
                      {currentQ.toleranceNumerical != null && (
                        <Typography variant="body2" color="text.secondary">
                          {t('professor.liveSession.tolerance', { value: currentQ.toleranceNumerical })}
                        </Typography>
                      )}
                    </Paper>
                  )}

                  {/* Solution */}
                  {currentQ.solution && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                        {t('common.solution')}
                      </Typography>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <RichContent html={currentQ.solution} />
                      </Paper>
                    </Box>
                  )}
                </>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  {t('professor.liveSession.noQuestionSelected')}
                </Typography>
              )}
            </Paper>

            {/* ---- Right panel: response statistics ---- */}
            {!isOptionBasedQuestion && !isSlide && (
              <Paper
                variant="outlined"
                sx={{ flex: { md: 1 }, p: 2, minWidth: 0 }}
                aria-label={t('professor.liveSession.responseStatisticsAria')}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                  {t('professor.liveSession.responses')}
                </Typography>

                {!currentQ ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('professor.liveSession.selectQuestionToViewResponses')}
                  </Typography>
                ) : responseStats?.type === 'distribution' ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('professor.liveSession.statsInline')}
                  </Typography>
                ) : responseStats?.type === 'shortAnswer' ? (
                  <ShortAnswerList
                    responses={responseStats.answers || allResponses}
                    showStudentNames
                  />
                ) : responseStats?.type === 'numerical' ? (
                  <NumericalStats stats={responseStats} allResponses={allResponses} />
                ) : allResponses.length > 0 ? (
                  <ShortAnswerList
                    responses={allResponses}
                    showStudentNames
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {t('professor.liveSession.noResponsesYet')}
                  </Typography>
                )}
              </Paper>
            )}
          </Box>
        </>
      ) : (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}
          aria-label={t('professor.liveSession.studentsCurrently')}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            {t('professor.liveSession.studentsInSession', { count: joinedCount })}
          </Typography>

          {sortedJoinedStudents.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('professor.liveSession.noStudentsJoined')}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {sortedJoinedStudents.map((student) => (
                <Paper
                  key={student._id}
                  variant="outlined"
                  sx={{
                    p: 1.1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <StudentIdentity
                    student={student}
                    avatarSize={34}
                    nameVariant="body2"
                    emailVariant="caption"
                    nameWeight={600}
                    sx={{ flex: '1 1 220px', minWidth: 0 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {formatJoinedTimestamp(student.joinedAt, t('professor.liveSession.joinTimeUnavailable'))}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {/* ============================================================ */}
      {/* End Session confirmation dialog                              */}
      {/* ============================================================ */}
      <Dialog
        open={endDialogOpen}
        onClose={() => { if (!ending) { setEndDialogOpen(false); setNonAutoGradeableWarning(null); } }}
        aria-labelledby="end-session-dialog-title"
      >
        <DialogTitle id="end-session-dialog-title">{t('professor.liveSession.endSession')}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to end <strong>{session.name}</strong>?
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={makeReviewable}
                onChange={(e) => { setMakeReviewable(e.target.checked); setNonAutoGradeableWarning(null); }}
              />
            }
            label={t('professor.liveSession.makeReviewable')}
          />
          {nonAutoGradeableWarning && makeReviewable && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('professor.liveSession.nonAutoGradeableWarning', {
                  count: nonAutoGradeableWarning.questionCount,
                })}
              </Typography>
              <FormControl sx={{ mt: 1 }}>
                <FormLabel>{t('professor.liveSession.nonAutoGradeableChoose')}</FormLabel>
                <RadioGroup
                  value={reviewableOption}
                  onChange={(e) => setReviewableOption(e.target.value)}
                >
                  <FormControlLabel value="proceed" control={<Radio size="small" />} label={t('professor.liveSession.nonAutoGradeableProceed')} />
                  <FormControlLabel value="zero" control={<Radio size="small" />} label={t('professor.liveSession.nonAutoGradeableZero')} />
                  <FormControlLabel value="cancel" control={<Radio size="small" />} label={t('professor.liveSession.nonAutoGradeableCancel')} />
                </RadioGroup>
              </FormControl>
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEndDialogOpen(false); setNonAutoGradeableWarning(null); }} disabled={ending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleEndSession}
            disabled={ending}
          >
            {ending ? t('professor.liveSession.ending') : t('professor.liveSession.endSession')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/* Snackbar for messages                                        */}
      {/* ============================================================ */}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
