import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Paper, Alert, CircularProgress, Chip } from '@mui/material';
import apiClient, { getAccessToken } from '../../api/client';
import {
  QUESTION_TYPES,
  TYPE_LABELS,
  TYPE_COLORS,
  isOptionBasedQuestionType,
  isSlideType,
  normalizeQuestionType,
} from '../../components/questions/constants';
import { getSessionActivities, getActivityIds, findActivityIndex } from '../../utils/activities';
import { prepareRichTextInput, renderKatexInElement } from '../../components/questions/richTextUtils';
import { buildHistogramData } from '../../utils/histogram';
import { buildCourseTitle } from '../../utils/courseTitle';
import HistogramBars from '../../components/common/HistogramBars';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': { px: 1.15 },
};

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const richContentSx = {
  '& p': { my: 0.5 },
  '& ul, & ol': { my: 0.5, pl: 3 },
  '& img': {
    display: 'block',
    maxWidth: '90% !important',
    height: 'auto !important',
    borderRadius: 0,
    my: 0.75,
  },
};

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

function optionDisplayHtml(option) {
  return option?.content || option?.plainText || option?.answer || '';
}

function applyCurrentQuestionUpdate(prev, payload) {
  if (!prev) return prev;

  const nextQuestionId = String(payload?.questionId || '');
  const currentQuestionId = String(prev?.currentQuestion?._id || prev?.session?.currentQuestion || '');
  if (!nextQuestionId || currentQuestionId !== nextQuestionId || !payload?.question) {
    return prev;
  }

  return {
    ...prev,
    currentQuestion: payload.question,
  };
}

function applyVisibilityChanged(prev, payload) {
  if (!prev) return prev;

  const nextQuestionId = String(payload?.questionId || '');
  const currentQuestionId = String(prev?.currentQuestion?._id || prev?.session?.currentQuestion || '');
  if (!nextQuestionId || currentQuestionId !== nextQuestionId || !prev.currentQuestion) {
    return prev;
  }

  return {
    ...prev,
    currentQuestion: {
      ...prev.currentQuestion,
      sessionOptions: {
        ...(prev.currentQuestion.sessionOptions || {}),
        hidden: payload?.hidden ?? prev.currentQuestion?.sessionOptions?.hidden,
        stats: payload?.stats ?? prev.currentQuestion?.sessionOptions?.stats,
        correct: payload?.correct ?? prev.currentQuestion?.sessionOptions?.correct,
      },
    },
  };
}

function applyAttemptChanged(prev, payload) {
  if (!prev) return prev;

  const nextQuestionId = String(payload?.questionId || '');
  const currentQuestionId = String(prev?.currentQuestion?._id || prev?.session?.currentQuestion || '');
  if (!nextQuestionId || currentQuestionId !== nextQuestionId) {
    return prev;
  }

  const nextQuestion = prev.currentQuestion
    ? {
      ...prev.currentQuestion,
      sessionOptions: {
        ...(prev.currentQuestion.sessionOptions || {}),
        stats: payload?.stats ?? prev.currentQuestion?.sessionOptions?.stats,
        correct: payload?.correct ?? prev.currentQuestion?.sessionOptions?.correct,
      },
    }
    : prev.currentQuestion;

  return {
    ...prev,
    currentQuestion: nextQuestion,
    responseStats: payload?.resetResponses ? null : prev.responseStats,
    allResponses: payload?.resetResponses ? [] : prev.allResponses,
  };
}

function applyJoinCodeChanged(prev, payload) {
  if (!prev?.session) return prev;
  return {
    ...prev,
    session: {
      ...prev.session,
      joinCodeEnabled: payload?.joinCodeEnabled ?? prev.session.joinCodeEnabled,
      joinCodeActive: payload?.joinCodeActive ?? prev.session.joinCodeActive,
      joinCodeInterval: payload?.joinCodeInterval ?? prev.session.joinCodeInterval,
      currentJoinCode: payload?.currentJoinCode ?? prev.session.currentJoinCode,
    },
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders rich-text content with KaTeX math support (large display). */
function RichContent({ html, fallback }) {
  const ref = useRef(null);
  const prepared = prepareRichTextInput(html || '', fallback || '');

  useEffect(() => {
    if (ref.current) renderKatexInElement(ref.current);
  }, [prepared]);

  if (!prepared) return null;
  return (
    <Box
      ref={ref}
      sx={{ ...richContentSx, fontSize: '1.35rem', lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: prepared }}
    />
  );
}

/** Numerical statistics display (large format) with histogram. */
function NumericalStats({ stats, allResponses }) {
  const { t } = useTranslation();
  if (!stats) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t('professor.secondDesktop.noResponsesYet')}
      </Typography>
    );
  }

  const values = (allResponses || [])
    .map((r) => Number(r.answer))
    .filter((v) => !isNaN(v));

  const histogramData = buildHistogramData(values);

  const entries = [
    { label: t('professor.secondDesktop.mean'), value: stats.mean != null ? Number(stats.mean).toFixed(2) : '—' },
    { label: t('professor.secondDesktop.median'), value: stats.median != null ? Number(stats.median).toFixed(2) : '—' },
    { label: t('professor.secondDesktop.min'), value: stats.min != null ? Number(stats.min).toFixed(2) : '—' },
    { label: t('professor.secondDesktop.max'), value: stats.max != null ? Number(stats.max).toFixed(2) : '—' },
  ];
  return (
    <Box>
      {histogramData.length > 0 && (
        <HistogramBars data={histogramData} height={190} />
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
        {entries.map((e) => (
          <Paper key={e.label} variant="outlined" sx={{ p: 2, minWidth: 110, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{e.label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{e.value}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

/** Short-answer responses list (large format, rendered rich text). */
function ShortAnswerList({ responses }) {
  const { t } = useTranslation();
  if (!responses || !responses.length) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t('professor.secondDesktop.noResponsesYet')}
      </Typography>
    );
  }
  return (
    <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
      {responses.map((r, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 0.75 }}>
          {r.answerWysiwyg ? (
            <RichContent html={r.answerWysiwyg} />
          ) : (
            <Typography variant="body1">{r.answer ?? r.value ?? r.text ?? t('common.noAnswer')}</Typography>
          )}
        </Paper>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PresentationWindow() {
  const { t } = useTranslation();
  const { sessionId } = useParams();

  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  // ---- Data fetching ----

  const fetchLive = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/live`, {
        params: { view: 'presentation' },
      });
      setLiveData(data);
      setError(null);
      if (data?.session?.status === 'done') {
        setSessionEnded(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || t('professor.secondDesktop.failedLoadLiveSession'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

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

  // ---- WebSocket + polling ----

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

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
            case 'session:question-updated':
              setLiveData((prev) => applyCurrentQuestionUpdate(prev, d));
              break;
            case 'session:attempt-changed':
              setLiveData((prev) => applyAttemptChanged(prev, d));
              break;
            case 'session:join-code-changed':
              setLiveData((prev) => applyJoinCodeChanged(prev, d));
              break;
            case 'session:visibility-changed':
              setLiveData((prev) => applyVisibilityChanged(prev, d));
              break;
            case 'session:status-changed':
              if (d.status === 'done') { setSessionEnded(true); }
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
  }, [fetchLive, scheduleFetchLive, sessionId]);

  // ---- Derived state ----

  const session = liveData?.session;
  const courseTitle = useMemo(
    () => (liveData?.course?._id ? buildCourseTitle(liveData.course, 'long') : ''),
    [liveData?.course]
  );
  const currentQ = liveData?.currentQuestion;
  const responseStats = liveData?.responseStats;
  const allResponses = liveData?.allResponses || [];
  const qType = currentQ ? normalizeQuestionType(currentQ) : null;
  const isSlide = isSlideType(qType);
  const isHidden = !!currentQ?.sessionOptions?.hidden;
  const showStats = !!currentQ?.sessionOptions?.stats;
  const showCorrect = !!currentQ?.sessionOptions?.correct;
  const qIdx = session ? findActivityIndex(getSessionActivities(session), session.currentQuestion) : -1;
  const totalQ = getActivityIds(getSessionActivities(session || {})).length || 0;
  const pageProgress = liveData?.pageProgress || (totalQ > 0 && qIdx >= 0
    ? { current: qIdx + 1, total: totalQ }
    : null);
  const questionProgress = liveData?.questionProgress || null;
  const hasSlidesInSession = !!(pageProgress && questionProgress && pageProgress.total !== questionProgress.total);
  const isOptionBasedQuestion = isOptionBasedQuestionType(qType) || qType === QUESTION_TYPES.TRUE_FALSE;
  const showInlineOptionStats = isOptionBasedQuestion
    && showStats
    && responseStats?.type === 'distribution';
  const inlineDistribution = showInlineOptionStats ? (responseStats.distribution || []) : [];
  const inlineDistributionTotal = Number(responseStats?.total) > 0
    ? Number(responseStats.total)
    : inlineDistribution.reduce((sum, d) => sum + (d.count || 0), 0);

  // ---- Auto-close popup window when session ends ----

  useEffect(() => {
    if (!sessionEnded) return;
    const timer = setTimeout(() => {
      if (window.opener) {
        window.close();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [sessionEnded]);

  useEffect(() => {
    const name = session?.name || t('professor.secondDesktop.presentation');
    document.title = `${name} — Qlicker`;
  }, [session?.name, t]);

  const renderHeader = ({ compact = false, showSessionName = true } = {}) => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 0.5 : 1,
        width: '100%',
        mb: compact ? 2 : 4,
        textAlign: 'center',
      }}
    >
      {courseTitle ? (
        <Typography variant={compact ? 'body1' : 'h5'} sx={{ fontWeight: 700 }}>
          {courseTitle}
        </Typography>
      ) : null}
      {showSessionName ? (
        <Typography variant={compact ? 'body2' : 'h6'} color="text.secondary">
          {session?.name || t('professor.secondDesktop.presentation')}
        </Typography>
      ) : null}
    </Box>
  );

  // ---- Render: loading ----

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          minHeight: '100vh', bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={48} />
      </Box>
    );
  }

  // ---- Render: error ----

  if (error) {
    return (
      <Box sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 8 }}>
        {renderHeader()}
        <Alert severity="error" sx={{ fontSize: '1.1rem' }}>{error}</Alert>
      </Box>
    );
  }

  // ---- Render: session ended ----

  if (sessionEnded) {
    return (
      <Box
        sx={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          minHeight: '100vh', bgcolor: 'background.default',
          flexDirection: 'column',
          p: 4,
        }}
      >
        {renderHeader()}
        <Typography variant="h2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          {t('professor.secondDesktop.sessionEnded')}
        </Typography>
      </Box>
    );
  }

  // ---- Render: join code overlay ----

  if (session?.joinCodeActive && session?.currentJoinCode) {
    return (
      <Box
        sx={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          alignItems: 'center', minHeight: '100vh', bgcolor: 'background.default',
          p: 4, textAlign: 'center',
        }}
        aria-label={t('professor.secondDesktop.joinCodeDisplay')}
      >
        {renderHeader()}
        <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.secondary', mb: 2 }}>
          {t('professor.secondDesktop.joinCode')}
        </Typography>
        <Typography
          variant="h1"
          sx={{
            fontWeight: 700,
            fontSize: { xs: '4rem', sm: '6rem', md: '8rem' },
            letterSpacing: 12,
            fontFamily: 'monospace',
            color: 'text.primary',
          }}
          aria-label={`Join code: ${session.currentJoinCode}`}
        >
          {session.currentJoinCode}
        </Typography>
        <Typography variant="h6" sx={{ mt: 3, color: 'text.secondary' }}>
          {session.name || t('professor.secondDesktop.liveSession')}
        </Typography>
        {session.joinCodeInterval && (
          <Chip
            label={t('professor.secondDesktop.refreshesEvery', { interval: session.joinCodeInterval })}
            size="small"
            variant="outlined"
            sx={{ ...COMPACT_CHIP_SX, mt: 2 }}
          />
        )}
      </Box>
    );
  }

  // ---- Render: waiting for question ----

  if (!currentQ || isHidden) {
    return (
      <Box
        sx={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          alignItems: 'center', minHeight: '100vh', bgcolor: 'background.default',
          p: 4, textAlign: 'center',
        }}
      >
        {renderHeader({ showSessionName: false })}
        <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.secondary', mb: 2 }}>
          {session?.name || t('professor.secondDesktop.liveSession')}
        </Typography>
        <Typography variant="h5" sx={{ color: 'text.secondary' }}>
          {t('professor.secondDesktop.waitingForQuestion')}
        </Typography>
      </Box>
    );
  }

  // ---- Render: active question ----

  return (
    <Box
      sx={{
        minHeight: '100vh', bgcolor: 'background.default',
        display: 'flex', flexDirection: 'column', p: { xs: 2, sm: 4 },
      }}
    >
      {renderHeader({ compact: true })}

      {/* Top info bar */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          mb: 3, flexWrap: 'wrap',
        }}
      >
        {hasSlidesInSession && pageProgress && (
          <Chip
            label={t('professor.secondDesktop.pageProgress', pageProgress)}
            size="small"
            variant="outlined"
            sx={COMPACT_CHIP_SX}
          />
        )}
        {!isSlide && questionProgress && (
          <Chip
            label={t('professor.secondDesktop.questionProgress', questionProgress)}
            size="small"
            variant="outlined"
            sx={COMPACT_CHIP_SX}
          />
        )}
        <Chip
          label={TYPE_LABELS[qType] || t('professor.secondDesktop.question')}
          color={TYPE_COLORS[qType] || 'default'}
          size="small"
          sx={COMPACT_CHIP_SX}
        />
      </Box>

      {/* Question content */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, mb: 3, flex: '0 0 auto' }}
        aria-label={t('professor.secondDesktop.currentQuestion')}
      >
        <RichContent html={currentQ.content} fallback={currentQ.plainText} />
      </Paper>

      {/* Options for MC / TF / MS */}
      {isOptionBasedQuestion && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
          {(currentQ.options || []).map((opt, i) => {
            const isCorrect = showCorrect && !!opt.correct;
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
                  p: { xs: 1.5, sm: 2 },
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  borderColor: isCorrect ? 'success.main' : 'divider',
                  bgcolor: isCorrect ? 'success.50' : 'transparent',
                  borderWidth: isCorrect ? 2 : 1,
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${showInlineOptionStats ? pct : 0}%`,
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
                    gridTemplateColumns: showInlineOptionStats
                      ? '34px minmax(0, 1fr) 88px'
                      : '34px minmax(0, 1fr)',
                    columnGap: 1.5,
                    alignItems: 'start',
                    width: '100%',
                  }}
                >
                <Chip
                  label={OPTION_LETTERS[i]}
                  size="small"
                  color={isCorrect ? 'success' : 'default'}
                  sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 32, fontSize: '1rem', justifySelf: 'start' }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <RichContent html={optionDisplayHtml(opt)} />
                </Box>
                {showInlineOptionStats && (
                  <Typography variant="h6" sx={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>
                    {pct}%
                  </Typography>
                )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Short answer placeholder */}
      {qType === QUESTION_TYPES.SHORT_ANSWER && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            {t('professor.secondDesktop.shortAnswerQuestion')}
          </Typography>
        </Paper>
      )}

      {/* Numerical placeholder */}
      {qType === QUESTION_TYPES.NUMERICAL && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            {t('professor.secondDesktop.numericalQuestion')}
          </Typography>
          {showCorrect && currentQ.correctNumerical != null && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body1">
                {t('professor.secondDesktop.correct', { value: currentQ.correctNumerical })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('professor.secondDesktop.tolerance', { value: currentQ.toleranceNumerical ?? 0 })}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Response statistics */}
      {showStats && !isSlide && (!isOptionBasedQuestion || responseStats?.type !== 'distribution') && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}
          aria-label={t('professor.secondDesktop.responseStatistics')}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            {t('professor.secondDesktop.responses')}
          </Typography>
          {responseStats?.type === 'shortAnswer' ? (
            <ShortAnswerList responses={responseStats.answers || allResponses} />
          ) : responseStats?.type === 'numerical' ? (
            <NumericalStats stats={responseStats} allResponses={allResponses} />
          ) : allResponses.length > 0 ? (
            <ShortAnswerList responses={allResponses} />
          ) : (
            <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('professor.secondDesktop.noResponsesYet')}
            </Typography>
          )}
        </Paper>
      )}

      {/* Solution (shown when showCorrect is enabled) */}
      {showCorrect && !isSlide && currentQ.solution && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, mb: 3, borderColor: 'success.main' }}
          aria-label={t('common.solution')}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: 'success.main' }}>
            {t('common.solution')}
          </Typography>
          <RichContent html={currentQ.solution} />
        </Paper>
      )}
    </Box>
  );
}
