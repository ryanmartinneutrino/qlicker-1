import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Paper, Alert, CircularProgress, Chip } from '@mui/material';
import apiClient from '../../api/client';
import { QUESTION_TYPES, TYPE_LABELS, TYPE_COLORS, normalizeQuestionType } from '../../components/questions/constants';
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

/** Horizontal bar chart for response distribution. */
function DistributionBars({ data, highlightCorrect, correctIndices }) {
  if (!data || !data.length) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        No responses yet.
      </Typography>
    );
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {data.map((item, i) => {
        const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const pctOfTotal = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
        const isCorrect = highlightCorrect && correctIndices?.includes(i);
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, minWidth: 32, textAlign: 'center' }}
            >
              {item.label}
            </Typography>
            <Box
              sx={{
                flex: 1,
                position: 'relative',
                height: 40,
                bgcolor: 'grey.100',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${pct}%`,
                  bgcolor: isCorrect ? 'success.main' : BAR_COLORS[i % BAR_COLORS.length],
                  borderRadius: 1,
                  transition: 'width 0.4s ease',
                  minWidth: item.count > 0 ? 4 : 0,
                }}
              />
            </Box>
            <Typography variant="h6" sx={{ minWidth: 64, textAlign: 'right', fontWeight: 600 }}>
              {item.count} ({pctOfTotal}%)
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/** Numerical statistics display (large format). */
function NumericalStats({ stats }) {
  if (!stats) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        No responses yet.
      </Typography>
    );
  }
  const entries = [
    { label: 'Count', value: stats.count ?? 0 },
    { label: 'Mean', value: stats.mean != null ? Number(stats.mean).toFixed(2) : '—' },
    { label: 'Median', value: stats.median != null ? Number(stats.median).toFixed(2) : '—' },
    { label: 'Min', value: stats.min != null ? Number(stats.min).toFixed(2) : '—' },
    { label: 'Max', value: stats.max != null ? Number(stats.max).toFixed(2) : '—' },
  ];
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
      {entries.map((e) => (
        <Paper key={e.label} variant="outlined" sx={{ p: 2, minWidth: 110, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">{e.label}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{e.value}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

/** Short-answer responses list (large format). */
function ShortAnswerList({ responses }) {
  if (!responses || !responses.length) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        No responses yet.
      </Typography>
    );
  }
  return (
    <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
      {responses.map((r, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 0.75 }}>
          <Typography variant="body1">{r.answer ?? r.value ?? r.text ?? '(no answer)'}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SecondDesktop() {
  const { courseId, sessionId } = useParams();

  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  // ---- Data fetching ----

  const fetchLive = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/live`);
      setLiveData(data);
      setError(null);
      if (data?.session?.status === 'done') {
        setSessionEnded(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load live session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // ---- WebSocket + polling ----

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

  // ---- Derived state ----

  const session = liveData?.session;
  const currentQ = liveData?.currentQuestion;
  const responseStats = liveData?.responseStats;
  const allResponses = liveData?.allResponses || [];
  const qType = currentQ ? normalizeQuestionType(currentQ) : null;
  const isHidden = !!currentQ?.sessionOptions?.hidden;
  const showStats = !!currentQ?.sessionOptions?.stats;
  const showCorrect = !!currentQ?.sessionOptions?.correct;
  const qIdx = session ? (session.questions || []).indexOf(session.currentQuestion) : -1;
  const totalQ = session?.questions?.length || 0;
  const joinedCount = session?.joinedCount ?? (session?.joined?.length || 0);
  const responseCount = liveData?.responseCount ?? allResponses.length;

  // Chart data for distribution
  let chartData = null;
  let correctIndices = [];
  if (responseStats?.type === 'distribution' && responseStats.distribution && currentQ) {
    chartData = (currentQ.options || []).map((opt, i) => ({
      label: OPTION_LETTERS[i] || String(i + 1),
      count: responseStats.distribution[i] ?? responseStats.distribution[opt._id] ?? 0,
    }));
    correctIndices = (currentQ.options || [])
      .map((opt, i) => (opt.correct ? i : -1))
      .filter((i) => i >= 0);
  }

  // ---- Window title ----

  useEffect(() => {
    const name = session?.name || 'Presentation';
    document.title = `${name} — Qlicker`;
  }, [session?.name]);

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
        }}
      >
        <Typography variant="h2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          Session Ended
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
        aria-label="Join code display"
      >
        <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.secondary', mb: 2 }}>
          Join Code
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
          {session.name || 'Live Session'}
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
          <Chip
            label={`${joinedCount} student${joinedCount !== 1 ? 's' : ''} joined`}
            size="small"
            sx={COMPACT_CHIP_SX}
          />
          {session.joinCodeInterval && (
            <Chip
              label={`Refreshes every ${session.joinCodeInterval}s`}
              size="small"
              variant="outlined"
              sx={COMPACT_CHIP_SX}
            />
          )}
        </Box>
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
        <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.secondary', mb: 2 }}>
          {session?.name || 'Live Session'}
        </Typography>
        <Typography variant="h5" sx={{ color: 'text.secondary' }}>
          Waiting for the next question…
        </Typography>
        <Chip
          label={`${joinedCount} student${joinedCount !== 1 ? 's' : ''} joined`}
          size="small"
          sx={{ ...COMPACT_CHIP_SX, mt: 3 }}
        />
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
      {/* Top info bar */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          mb: 3, flexWrap: 'wrap',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Q{qIdx + 1}/{totalQ}
        </Typography>
        <Chip
          label={TYPE_LABELS[qType] || 'Question'}
          color={TYPE_COLORS[qType] || 'default'}
          size="small"
          sx={COMPACT_CHIP_SX}
        />
        <Chip
          label={`${joinedCount} joined`}
          size="small"
          variant="outlined"
          sx={COMPACT_CHIP_SX}
        />
        <Chip
          label={`${responseCount} response${responseCount !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
          sx={COMPACT_CHIP_SX}
        />
      </Box>

      {/* Question content */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, mb: 3, flex: '0 0 auto' }}
        aria-label="Current question"
      >
        <RichContent html={currentQ.content} fallback={currentQ.plainText} />
      </Paper>

      {/* Options for MC / TF / MS */}
      {(qType === QUESTION_TYPES.MULTIPLE_CHOICE
        || qType === QUESTION_TYPES.TRUE_FALSE
        || qType === QUESTION_TYPES.MULTI_SELECT) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
          {(currentQ.options || []).map((opt, i) => {
            const isCorrect = showCorrect && !!opt.correct;
            return (
              <Paper
                key={opt._id || i}
                variant="outlined"
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  borderColor: isCorrect ? 'success.main' : 'divider',
                  bgcolor: isCorrect ? 'success.50' : 'transparent',
                  borderWidth: isCorrect ? 2 : 1,
                }}
              >
                <Chip
                  label={OPTION_LETTERS[i]}
                  size="small"
                  color={isCorrect ? 'success' : 'default'}
                  sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 32, fontSize: '1rem' }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <RichContent html={opt.answer || opt.content || opt.plainText} />
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
            Short Answer Question
          </Typography>
        </Paper>
      )}

      {/* Numerical placeholder */}
      {qType === QUESTION_TYPES.NUMERICAL && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            Numerical Question
          </Typography>
          {showCorrect && currentQ.correctNumerical != null && (
            <Typography variant="body1" sx={{ mt: 1 }}>
              Correct: {currentQ.correctNumerical} (± {currentQ.toleranceNumerical ?? 0})
            </Typography>
          )}
        </Paper>
      )}

      {/* Response statistics */}
      {showStats && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}
          aria-label="Response statistics"
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Response Distribution
          </Typography>
          {responseStats?.type === 'distribution' && chartData ? (
            <DistributionBars
              data={chartData}
              highlightCorrect={showCorrect}
              correctIndices={correctIndices}
            />
          ) : responseStats?.type === 'shortAnswer' ? (
            <ShortAnswerList responses={responseStats.answers || allResponses} />
          ) : responseStats?.type === 'numerical' ? (
            <NumericalStats stats={responseStats} />
          ) : allResponses.length > 0 ? (
            <ShortAnswerList responses={allResponses} />
          ) : (
            <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
              No responses yet.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
}
