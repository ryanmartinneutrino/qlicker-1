import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, Snackbar, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  Switch, FormControlLabel, TextField, Divider, useMediaQuery,
} from '@mui/material';
import {
  ArrowBack as PrevIcon, ArrowForward as NextIcon,
  Stop as StopIcon, OpenInNew as OpenInNewIcon,
  Visibility as ShowIcon, VisibilityOff as HideIcon,
  BarChart as ChartIcon, Check as CheckIcon,
  Replay as AttemptIcon, Lock as LockIcon, LockOpen as UnlockIcon,
  People as PeopleIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import apiClient from '../../api/client';
import { QUESTION_TYPES, TYPE_LABELS, normalizeQuestionType } from '../../components/questions/constants';
import { prepareRichTextInput, renderKatexInElement } from '../../components/questions/richTextUtils';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': { px: 1.15 },
};

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const BAR_COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#d32f2f',
  '#7b1fa2', '#0097a7', '#c2185b', '#455a64',
];

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

function questionIndex(session, questionId) {
  const ids = session?.questions || [];
  return ids.indexOf(questionId);
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

/** Bar chart for MC / TF / MS distribution data. */
function DistributionChart({ data }) {
  if (!data || !data.length) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
        <XAxis dataKey="label" />
        <YAxis allowDecimals={false} />
        <RechartsTooltip />
        <Bar dataKey="count" name="Responses" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Short-answer responses list. */
function ShortAnswerList({ responses }) {
  if (!responses || !responses.length) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  return (
    <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
      {responses.map((r, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 1, mb: 0.5 }}>
          <Typography variant="body2">{r.answer ?? r.value ?? r.text ?? '(no answer)'}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

/** Numerical statistics display. */
function NumericalStats({ stats }) {
  if (!stats) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  const entries = [
    { label: 'Count', value: stats.count ?? 0 },
    { label: 'Mean', value: stats.mean != null ? Number(stats.mean).toFixed(2) : '—' },
    { label: 'Median', value: stats.median != null ? Number(stats.median).toFixed(2) : '—' },
    { label: 'Min', value: stats.min != null ? Number(stats.min).toFixed(2) : '—' },
    { label: 'Max', value: stats.max != null ? Number(stats.max).toFixed(2) : '—' },
  ];
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {entries.map((e) => (
        <Paper key={e.label} variant="outlined" sx={{ p: 1.5, minWidth: 90, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">{e.label}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{e.value}</Typography>
        </Paper>
      ))}
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

  // Session ended redirect
  const [sessionEnded, setSessionEnded] = useState(false);

  // Join code refresh interval ref
  const joinCodeTimerRef = useRef(null);

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------

  const fetchLive = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/live`);
      setLiveData(data);
      setError(null);

      // Redirect if session is done
      if (data?.session?.status === 'done') {
        setSessionEnded(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load live session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

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
      const latestToken = localStorage.getItem('token');
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
          if (message?.event !== 'session:updated') return;
          if (String(message?.data?.sessionId || '') !== String(sessionId)) return;
          fetchLive();
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
      stopPolling();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchLive, sessionId]);

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

    const interval = (session.joinCodeInterval || 60) * 1000;
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

  // --------------------------------------------------
  // Session ended → redirect after brief delay
  // --------------------------------------------------

  useEffect(() => {
    if (!sessionEnded) return;
    const timer = setTimeout(() => {
      navigate(`/manage/course/${courseId}`);
    }, 3000);
    return () => clearTimeout(timer);
  }, [sessionEnded, navigate, courseId]);

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
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Action failed' });
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
    const idx = questionIndex(session, session.currentQuestion);
    if (idx > 0) handleSetQuestion(session.questions[idx - 1]);
  }, [liveData, handleSetQuestion]);

  const handleNext = useCallback(() => {
    const session = liveData?.session;
    if (!session) return;
    const idx = questionIndex(session, session.currentQuestion);
    if (idx < session.questions.length - 1) handleSetQuestion(session.questions[idx + 1]);
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
      'New attempt started',
    );
  }, [doAction, sessionId]);

  const handleToggleResponses = useCallback(() => {
    const closed = liveData?.currentAttempt?.closed;
    doAction(() => apiClient.patch(`/sessions/${sessionId}/toggle-responses`, { closed: !closed }));
  }, [doAction, sessionId, liveData]);

  // End session
  const handleEndSession = useCallback(async () => {
    setEnding(true);
    try {
      if (makeReviewable) {
        await apiClient.patch(`/sessions/${sessionId}/reviewable`, { reviewable: true });
      }
      await apiClient.post(`/sessions/${sessionId}/end`);
      setEndDialogOpen(false);
      setSessionEnded(true);
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to end session' });
    } finally {
      setEnding(false);
    }
  }, [sessionId, makeReviewable]);

  // Join code controls
  const handleToggleJoinCode = useCallback((active) => {
    doAction(() => apiClient.patch(`/sessions/${sessionId}/join-code-settings`, {
      joinCodeActive: active,
      joinCodeEnabled: liveData?.session?.joinCodeEnabled ?? true,
      joinCodeInterval: liveData?.session?.joinCodeInterval ?? 60,
    }));
  }, [doAction, sessionId, liveData]);

  const handleRefreshJoinCode = useCallback(() => {
    doAction(
      () => apiClient.post(`/sessions/${sessionId}/refresh-join-code`),
      'Join code refreshed',
    );
  }, [doAction, sessionId]);

  // Second desktop / present window
  const handleOpenPresent = useCallback(() => {
    window.open(
      `/manage/course/${courseId}/session/${sessionId}/present`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [courseId, sessionId]);

  // --------------------------------------------------
  // Derived values
  // --------------------------------------------------

  const session = liveData?.session;
  const currentQ = liveData?.currentQuestion;
  const currentAttempt = liveData?.currentAttempt;
  const responseStats = liveData?.responseStats;
  const allResponses = liveData?.allResponses || [];
  const responseCount = liveData?.responseCount ?? allResponses.length;
  const joinedCount = session?.joinedCount ?? (session?.joined?.length || 0);

  const qIdx = session ? questionIndex(session, session.currentQuestion) : -1;
  const totalQ = session?.questions?.length || 0;
  const hasPrev = qIdx > 0;
  const hasNext = qIdx < totalQ - 1;
  const qType = currentQ ? normalizeQuestionType(currentQ) : null;
  const isHidden = !!currentQ?.sessionOptions?.hidden;
  const showStats = !!currentQ?.sessionOptions?.stats;
  const showCorrect = !!currentQ?.sessionOptions?.correct;
  const responsesClosed = !!currentAttempt?.closed;
  const attemptNum = currentAttempt?.number ?? 1;

  // --------------------------------------------------
  // Render: loading / error / ended states
  // --------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress aria-label="Loading live session" />
      </Box>
    );
  }

  if (sessionEnded) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="info" sx={{ mb: 2 }}>Session has ended. Redirecting to course…</Alert>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error || !session) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error || 'Session not found'}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate(`/manage/course/${courseId}`)}>
          Back to Course
        </Button>
      </Box>
    );
  }

  // --------------------------------------------------
  // Build chart data from responseStats
  // --------------------------------------------------

  let chartData = null;
  if (responseStats?.type === 'distribution' && responseStats.distribution) {
    chartData = (currentQ?.options || []).map((opt, i) => ({
      label: OPTION_LETTERS[i] || String(i + 1),
      count: responseStats.distribution[i] ?? responseStats.distribution[opt._id] ?? 0,
    }));
  }

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 1200, mx: 'auto' }}>

      {/* ============================================================ */}
      {/* Top bar                                                      */}
      {/* ============================================================ */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap>
          {session.name || 'Live Session'}
        </Typography>

        {totalQ > 0 && (
          <Chip
            label={`Q${qIdx + 1} / ${totalQ}`}
            size="small"
            color="primary"
            sx={COMPACT_CHIP_SX}
            aria-label={`Question ${qIdx + 1} of ${totalQ}`}
          />
        )}

        <Chip
          icon={<PeopleIcon />}
          label={`${joinedCount} joined`}
          size="small"
          variant="outlined"
          sx={COMPACT_CHIP_SX}
          aria-label={`${joinedCount} students joined`}
        />

        <Chip
          label={`${responseCount} / ${joinedCount} responded`}
          size="small"
          variant="outlined"
          color={responseCount >= joinedCount && joinedCount > 0 ? 'success' : 'default'}
          sx={COMPACT_CHIP_SX}
          aria-label={`${responseCount} of ${joinedCount} students responded`}
        />

        <Chip
          label={`Attempt ${attemptNum}`}
          size="small"
          variant="outlined"
          sx={COMPACT_CHIP_SX}
        />

        <Tooltip title="Open presentation view in new window">
          <Button
            size="small"
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            onClick={handleOpenPresent}
            aria-label="Open second desktop presentation view"
          >
            {isMobile ? 'Present' : 'Second Desktop'}
          </Button>
        </Tooltip>

        <Button
          size="small"
          variant="contained"
          color="error"
          startIcon={<StopIcon />}
          onClick={() => setEndDialogOpen(true)}
          aria-label="End session"
        >
          End Session
        </Button>
      </Paper>

      {/* ============================================================ */}
      {/* Main content: question + stats                               */}
      {/* ============================================================ */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          mb: 2,
        }}
      >
        {/* ---- Left panel: question content ---- */}
        <Paper
          variant="outlined"
          sx={{ flex: { md: 1 }, p: 2, minWidth: 0 }}
          aria-label="Current question"
        >
          {currentQ ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Question {qIdx + 1}
                </Typography>
                <Chip
                  label={TYPE_LABELS[qType] || 'Unknown'}
                  size="small"
                  variant="outlined"
                  sx={COMPACT_CHIP_SX}
                />
                {isHidden && (
                  <Chip label="Hidden" size="small" color="warning" sx={COMPACT_CHIP_SX} />
                )}
              </Box>

              {/* Question content (rich text with KaTeX) */}
              <Box sx={{ mb: 2 }}>
                <RichContent html={currentQ.content || currentQ.plainText} />
              </Box>

              {/* Options for MC / TF / MS */}
              {(qType === QUESTION_TYPES.MULTIPLE_CHOICE
                || qType === QUESTION_TYPES.TRUE_FALSE
                || qType === QUESTION_TYPES.MULTI_SELECT) && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {(currentQ.options || []).map((opt, i) => {
                    const isCorrect = !!opt.correct;
                    return (
                      <Paper
                        key={opt._id || i}
                        variant="outlined"
                        sx={{
                          p: 1,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 1,
                          borderColor: isCorrect ? 'success.main' : 'divider',
                          bgcolor: isCorrect ? 'success.lighter' : 'transparent',
                        }}
                      >
                        <Chip
                          label={OPTION_LETTERS[i]}
                          size="small"
                          color={isCorrect ? 'success' : 'default'}
                          sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 28 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <RichContent html={opt.answer || opt.content || opt.plainText} />
                        </Box>
                        {isCorrect && (
                          <CheckIcon color="success" fontSize="small" aria-label="Correct answer" />
                        )}
                      </Paper>
                    );
                  })}
                </Box>
              )}

              {/* Correct answer for numerical */}
              {qType === QUESTION_TYPES.NUMERICAL && currentQ.correctNumerical != null && (
                <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Correct: <strong>{currentQ.correctNumerical}</strong>
                    {currentQ.toleranceNumerical != null && ` ± ${currentQ.toleranceNumerical}`}
                  </Typography>
                </Paper>
              )}

              {/* Solution */}
              {currentQ.solution && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Solution
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <RichContent html={currentQ.solution} />
                  </Paper>
                </Box>
              )}
            </>
          ) : (
            <Typography variant="body1" color="text.secondary">
              No question selected. Use the controls below to navigate.
            </Typography>
          )}
        </Paper>

        {/* ---- Right panel: response statistics ---- */}
        <Paper
          variant="outlined"
          sx={{ flex: { md: 1 }, p: 2, minWidth: 0 }}
          aria-label="Response statistics"
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Responses
          </Typography>

          {!currentQ ? (
            <Typography variant="body2" color="text.secondary">
              Select a question to view responses.
            </Typography>
          ) : responseStats?.type === 'distribution' ? (
            <DistributionChart data={chartData} />
          ) : responseStats?.type === 'shortAnswer' ? (
            <ShortAnswerList responses={responseStats.answers || allResponses} />
          ) : responseStats?.type === 'numerical' ? (
            <NumericalStats stats={responseStats} />
          ) : allResponses.length > 0 ? (
            <ShortAnswerList responses={allResponses} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No responses yet.
            </Typography>
          )}
        </Paper>
      </Box>

      {/* ============================================================ */}
      {/* Join code controls                                           */}
      {/* ============================================================ */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Join Code</Typography>

          <FormControlLabel
            control={
              <Switch
                checked={!!session.joinCodeActive}
                onChange={(e) => handleToggleJoinCode(e.target.checked)}
                disabled={actionLoading}
                size="small"
              />
            }
            label={session.joinCodeActive ? 'Active' : 'Inactive'}
          />

          {session.joinCodeActive && session.currentJoinCode && (
            <>
              <Chip
                label={session.currentJoinCode}
                color="primary"
                sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: 2 }}
                aria-label={`Current join code: ${session.currentJoinCode}`}
              />
              <Tooltip title="Refresh join code now">
                <IconButton
                  size="small"
                  onClick={handleRefreshJoinCode}
                  disabled={actionLoading}
                  aria-label="Refresh join code"
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              {session.joinCodeInterval && (
                <Typography variant="caption" color="text.secondary">
                  Refreshes every {session.joinCodeInterval}s
                </Typography>
              )}
            </>
          )}
        </Box>
      </Paper>

      {/* ============================================================ */}
      {/* Bottom control bar                                           */}
      {/* ============================================================ */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.5, sm: 2 },
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {/* Visibility toggle */}
        <Tooltip title={isHidden ? 'Show question to students' : 'Hide question from students'}>
          <Button
            size="small"
            variant={isHidden ? 'contained' : 'outlined'}
            color={isHidden ? 'warning' : 'primary'}
            startIcon={isHidden ? <HideIcon /> : <ShowIcon />}
            onClick={() => handleToggleVisibility('hidden')}
            disabled={!currentQ || actionLoading}
            aria-label={isHidden ? 'Show question' : 'Hide question'}
          >
            {isHidden ? 'Hidden' : 'Visible'}
          </Button>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Navigation */}
        <Tooltip title="Previous question">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrevIcon />}
              onClick={handlePrev}
              disabled={!hasPrev || actionLoading}
              aria-label="Previous question"
            >
              Prev
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Next question">
          <span>
            <Button
              size="small"
              variant="outlined"
              endIcon={<NextIcon />}
              onClick={handleNext}
              disabled={!hasNext || actionLoading}
              aria-label="Next question"
            >
              Next
            </Button>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Show stats toggle */}
        <Tooltip title={showStats ? 'Hide stats from students' : 'Show stats to students'}>
          <Button
            size="small"
            variant={showStats ? 'contained' : 'outlined'}
            startIcon={<ChartIcon />}
            onClick={() => handleToggleVisibility('stats')}
            disabled={!currentQ || actionLoading}
            aria-label={showStats ? 'Hide stats' : 'Show stats'}
          >
            {showStats ? 'Stats On' : 'Stats Off'}
          </Button>
        </Tooltip>

        {/* Show correct toggle */}
        <Tooltip title={showCorrect ? 'Hide correct answer from students' : 'Show correct answer to students'}>
          <Button
            size="small"
            variant={showCorrect ? 'contained' : 'outlined'}
            color={showCorrect ? 'success' : 'primary'}
            startIcon={<CheckIcon />}
            onClick={() => handleToggleVisibility('correct')}
            disabled={!currentQ || actionLoading}
            aria-label={showCorrect ? 'Hide correct answer' : 'Show correct answer'}
          >
            {showCorrect ? 'Correct On' : 'Correct Off'}
          </Button>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* New attempt */}
        <Tooltip title="Start a new attempt for this question">
          <Button
            size="small"
            variant="outlined"
            startIcon={<AttemptIcon />}
            onClick={handleNewAttempt}
            disabled={!currentQ || actionLoading}
            aria-label="New attempt"
          >
            New Attempt
          </Button>
        </Tooltip>

        {/* Allow / close responses */}
        <Tooltip title={responsesClosed ? 'Open responses for students' : 'Close responses'}>
          <Button
            size="small"
            variant={responsesClosed ? 'contained' : 'outlined'}
            color={responsesClosed ? 'error' : 'success'}
            startIcon={responsesClosed ? <LockIcon /> : <UnlockIcon />}
            onClick={handleToggleResponses}
            disabled={!currentQ || actionLoading}
            aria-label={responsesClosed ? 'Allow responses' : 'Close responses'}
          >
            {responsesClosed ? 'Responses Closed' : 'Responses Open'}
          </Button>
        </Tooltip>
      </Paper>

      {/* ============================================================ */}
      {/* End Session confirmation dialog                              */}
      {/* ============================================================ */}
      <Dialog
        open={endDialogOpen}
        onClose={() => !ending && setEndDialogOpen(false)}
        aria-labelledby="end-session-dialog-title"
      >
        <DialogTitle id="end-session-dialog-title">End Session</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to end <strong>{session.name}</strong>?
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={makeReviewable}
                onChange={(e) => setMakeReviewable(e.target.checked)}
              />
            }
            label="Make session reviewable for students"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndDialogOpen(false)} disabled={ending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleEndSession}
            disabled={ending}
          >
            {ending ? 'Ending…' : 'End Session'}
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
