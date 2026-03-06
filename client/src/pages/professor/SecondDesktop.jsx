import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Paper, Alert, CircularProgress, Chip, LinearProgress } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
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

/** Horizontal bar chart for response distribution (Meteor-style percentage bars). */
function DistributionBars({ distribution, options, showCorrect }) {
  if (!distribution || !distribution.length) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        No responses yet.
      </Typography>
    );
  }
  const total = distribution.reduce((sum, d) => sum + (d.count || 0), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {distribution.map((d, i) => {
        const pct = total > 0 ? Math.round(100 * (d.count || 0) / total) : 0;
        const isCorrect = showCorrect && options?.[i]?.correct;
        const barColor = isCorrect ? 'success.main' : showCorrect && !options?.[i]?.correct ? 'error.light' : 'primary.main';
        return (
          <Box key={i}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.25 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 32, textAlign: 'center' }}>
                {OPTION_LETTERS[i]}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <RichContent html={options?.[i]?.answer || options?.[i]?.content || options?.[i]?.plainText || ''} />
              </Box>
              <Typography variant="h6" sx={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>
                {pct}% ({d.count || 0})
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 12,
                borderRadius: 1,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': { bgcolor: barColor, borderRadius: 1 },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

/** Numerical statistics display (large format) with histogram. */
function NumericalStats({ stats, allResponses }) {
  if (!stats) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
        No responses yet.
      </Typography>
    );
  }

  const values = (allResponses || [])
    .map((r) => Number(r.answer))
    .filter((v) => !isNaN(v));

  let histogramData = [];
  if (values.length > 1) {
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    const range = vmax - vmin;
    let nbins = Math.max(1, Math.floor(Math.sqrt(values.length)) + 1);
    if (nbins > 20) nbins = 20;
    if (range === 0) nbins = 1;
    const binWidth = range > 0 ? range / nbins : 1;
    const counts = new Array(nbins).fill(0);
    values.forEach((v) => {
      let idx = Math.floor((v - vmin) / binWidth);
      if (idx >= nbins) idx = nbins - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    });
    for (let i = 0; i < nbins; i++) {
      histogramData.push({
        bin: Number((vmin + (i + 0.5) * binWidth).toPrecision(4)),
        count: counts[i],
      });
    }
  } else if (values.length === 1) {
    histogramData = [{ bin: values[0], count: 1 }];
  }

  const entries = [
    { label: 'Count', value: stats.count ?? 0 },
    { label: 'Mean', value: stats.mean != null ? Number(stats.mean).toFixed(2) : '—' },
    { label: 'Median', value: stats.median != null ? Number(stats.median).toFixed(2) : '—' },
    { label: 'Min', value: stats.min != null ? Number(stats.min).toFixed(2) : '—' },
    { label: 'Max', value: stats.max != null ? Number(stats.max).toFixed(2) : '—' },
  ];
  return (
    <Box>
      {histogramData.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={histogramData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <XAxis dataKey="bin" />
              <YAxis allowDecimals={false} />
              <RechartsTooltip />
              <Bar dataKey="count" name="Responses" fill="#1976d2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
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
          {r.answerWysiwyg ? (
            <RichContent html={r.answerWysiwyg} />
          ) : (
            <Typography variant="body1">{r.answer ?? r.value ?? r.text ?? '(no answer)'}</Typography>
          )}
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
          {responseStats?.type === 'distribution' && responseStats.distribution ? (
            <DistributionBars
              distribution={responseStats.distribution}
              options={currentQ?.options}
              showCorrect={showCorrect}
            />
          ) : responseStats?.type === 'shortAnswer' ? (
            <ShortAnswerList responses={responseStats.answers || allResponses} />
          ) : responseStats?.type === 'numerical' ? (
            <NumericalStats stats={responseStats} allResponses={allResponses} />
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
