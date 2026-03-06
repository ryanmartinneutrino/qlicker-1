import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress, Chip,
  TextField, Radio, RadioGroup, FormControlLabel, Checkbox, FormGroup,
  LinearProgress,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import apiClient from '../../api/client';
import StudentRichTextEditor, { MathPreview } from '../../components/questions/StudentRichTextEditor';
import {
  QUESTION_TYPES, TYPE_LABELS, TYPE_COLORS, normalizeQuestionType,
} from '../../components/questions/constants';
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

/** Renders rich-text content with KaTeX math support. */
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
      sx={richContentSx}
      dangerouslySetInnerHTML={{ __html: prepared }}
    />
  );
}

/** Meteor-style inline response bars for MC/MS/TF. */
function DistributionBars({ distribution, options, showCorrect }) {
  if (!distribution || !distribution.length) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  const total = distribution.reduce((sum, d) => sum + (d.count || 0), 0);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {distribution.map((d, i) => {
        const pct = total > 0 ? Math.round(100 * (d.count || 0) / total) : 0;
        const isCorrect = showCorrect && options?.[i]?.correct;
        const barColor = isCorrect ? 'success.main' : showCorrect && !options?.[i]?.correct ? 'error.light' : 'primary.main';
        return (
          <Box key={i}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}
              >
                {OPTION_LETTERS[i]}
              </Typography>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {pct}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 8,
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LiveSession() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();

  // Core state
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Join state
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  // Answer state
  const [answer, setAnswer] = useState(null); // string for MC/TF/SA/NUM, array for MS
  const [answerWysiwyg, setAnswerWysiwyg] = useState(''); // rich text HTML for SA
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Track current question/attempt to detect changes
  const prevQuestionRef = useRef(null);
  const prevAttemptRef = useRef(null);

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------

  const fetchLive = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/live`);
      setLiveData(data);
      setError(null);
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
  // Reset answer when question or attempt changes
  // --------------------------------------------------

  useEffect(() => {
    if (!liveData) return;
    const qId = liveData.currentQuestion?._id || null;
    const attemptNum = liveData.currentAttempt?.number ?? null;

    const questionChanged = qId !== prevQuestionRef.current;
    const attemptChanged = attemptNum !== prevAttemptRef.current;

    if (questionChanged || attemptChanged) {
      // Reset local answer state
      const qType = liveData.currentQuestion
        ? normalizeQuestionType(liveData.currentQuestion)
        : null;
      if (qType === QUESTION_TYPES.MULTI_SELECT) {
        setAnswer([]);
      } else {
        setAnswer('');
      }
      setAnswerWysiwyg('');
      setSubmitError(null);
    }

    prevQuestionRef.current = qId;
    prevAttemptRef.current = attemptNum;
  }, [liveData]);

  // --------------------------------------------------
  // Auto-join (when no join code required)
  // --------------------------------------------------

  useEffect(() => {
    if (!liveData || liveData.isJoined || autoJoinAttempted) return;
    if (liveData.session?.joinCodeActive) return; // needs code

    setAutoJoinAttempted(true);
    setJoining(true);
    apiClient.post(`/sessions/${sessionId}/join`, {})
      .then(() => fetchLive())
      .catch((err) => {
        setJoinError(err.response?.data?.message || 'Failed to join session');
      })
      .finally(() => setJoining(false));
  }, [liveData, sessionId, fetchLive, autoJoinAttempted]);

  // --------------------------------------------------
  // Join with code
  // --------------------------------------------------

  const handleJoinWithCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      await apiClient.post(`/sessions/${sessionId}/join`, { joinCode: joinCode.trim() });
      await fetchLive();
    } catch (err) {
      setJoinError(err.response?.data?.message || 'Invalid join code');
    } finally {
      setJoining(false);
    }
  }, [joinCode, sessionId, fetchLive]);

  // --------------------------------------------------
  // Submit response
  // --------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = { answer };
      if (answerWysiwyg) payload.answerWysiwyg = answerWysiwyg;
      await apiClient.post(`/sessions/${sessionId}/respond`, payload);
      await fetchLive();
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }, [answer, answerWysiwyg, sessionId, fetchLive]);

  // --------------------------------------------------
  // Derived values
  // --------------------------------------------------

  const session = liveData?.session;
  const currentQ = liveData?.currentQuestion;
  const currentAttempt = liveData?.currentAttempt;
  const studentResponse = liveData?.studentResponse;
  const isJoined = liveData?.isJoined;
  const showStats = liveData?.showStats;
  const showCorrect = liveData?.showCorrect;
  const questionHidden = liveData?.questionHidden;
  const responseStats = liveData?.responseStats;

  const qType = currentQ ? normalizeQuestionType(currentQ) : null;
  const hasSubmitted = !!studentResponse;
  const responseClosed = !!currentAttempt?.closed;
  const isLocked = hasSubmitted || responseClosed;

  // --------------------------------------------------
  // Render: loading state
  // --------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress aria-label="Loading live session" />
      </Box>
    );
  }

  // --------------------------------------------------
  // Render: error state
  // --------------------------------------------------

  if (error || !session) {
    return (
      <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error || 'Session not found'}</Alert>
        <Button variant="outlined" onClick={() => navigate(`/student/course/${courseId}`)}>
          Back to course
        </Button>
      </Box>
    );
  }

  // --------------------------------------------------
  // Render: session ended
  // --------------------------------------------------

  if (session.status === 'done') {
    return (
      <Box sx={{ p: 4, maxWidth: 600, mx: 'auto', textAlign: 'center' }}>
        <Alert severity="info" sx={{ mb: 3, justifyContent: 'center' }}>
          Session has ended.
        </Alert>
        <Button variant="contained" onClick={() => navigate(`/student/course/${courseId}`)}>
          Back to course
        </Button>
      </Box>
    );
  }

  // --------------------------------------------------
  // Render: join phase (with code)
  // --------------------------------------------------

  if (!isJoined && session.joinCodeActive) {
    return (
      <Box sx={{ p: 3, maxWidth: 400, mx: 'auto', textAlign: 'center' }}>
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            Join Session
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter the 6-digit code shown by your instructor
          </Typography>

          {joinError && (
            <Alert severity="error" sx={{ mb: 2 }}>{joinError}</Alert>
          )}

          <TextField
            value={joinCode}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setJoinCode(val);
            }}
            placeholder="000000"
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 6,
              'aria-label': 'Join code',
              style: {
                textAlign: 'center',
                fontSize: '2rem',
                fontWeight: 700,
                letterSpacing: '0.35em',
              },
            }}
            fullWidth
            autoFocus
            sx={{ mb: 3 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && joinCode.length === 6) handleJoinWithCode();
            }}
          />

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleJoinWithCode}
            disabled={joinCode.length < 6 || joining}
            sx={{ py: 1.5, fontSize: '1.1rem' }}
            aria-label="Join session"
          >
            {joining ? <CircularProgress size={24} color="inherit" /> : 'Join'}
          </Button>
        </Paper>
      </Box>
    );
  }

  // --------------------------------------------------
  // Render: joining in progress (auto-join without code)
  // --------------------------------------------------

  if (!isJoined) {
    return (
      <Box sx={{ p: 4, maxWidth: 600, mx: 'auto', textAlign: 'center' }}>
        {joinError ? (
          <>
            <Alert severity="error" sx={{ mb: 2 }}>{joinError}</Alert>
            <Button variant="outlined" onClick={() => navigate(`/student/course/${courseId}`)}>
              Back to course
            </Button>
          </>
        ) : (
          <>
            <CircularProgress sx={{ mb: 2 }} aria-label="Joining session" />
            <Typography variant="body1" color="text.secondary">
              Joining session…
            </Typography>
          </>
        )}
      </Box>
    );
  }

  // --------------------------------------------------
  // Render: waiting phase (question hidden)
  // --------------------------------------------------

  if (questionHidden || !currentQ) {
    return (
      <Box sx={{ p: 4, maxWidth: 600, mx: 'auto', textAlign: 'center' }}>
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            {session.name || 'Live Session'}
          </Typography>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              my: 4,
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.4, transform: 'scale(1)' },
                  '50%': { opacity: 1, transform: 'scale(1.3)' },
                },
              }}
            />
          </Box>

          <Typography variant="body1" color="text.secondary">
            Waiting for the instructor…
          </Typography>

          <Chip
            label={`${session.joinedCount ?? 0} students joined`}
            size="small"
            variant="outlined"
            sx={{ ...COMPACT_CHIP_SX, mt: 2 }}
          />
        </Paper>
      </Box>
    );
  }

  // --------------------------------------------------
  // Render: question phase (main view)
  // --------------------------------------------------

  // Resolve the student's previously submitted answer for display
  const submittedAnswer = studentResponse?.answer;

  // For MC/TF: selected option ID (string)
  // For MS: array of selected option IDs
  // For SA: text string
  // For Numerical: number string
  const displayAnswer = hasSubmitted ? submittedAnswer : answer;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 600, mx: 'auto' }}>

      {/* ============================================================ */}
      {/* Session header                                               */}
      {/* ============================================================ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap>
          {session.name || 'Live Session'}
        </Typography>
        {currentAttempt && (
          <Chip
            label={`Attempt ${currentAttempt.number ?? 1}`}
            size="small"
            variant="outlined"
            sx={COMPACT_CHIP_SX}
          />
        )}
      </Box>

      {/* ============================================================ */}
      {/* Question content                                             */}
      {/* ============================================================ */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }} aria-label="Current question">
        {/* Question header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            label={TYPE_LABELS[qType] || 'Question'}
            color={TYPE_COLORS[qType] || 'default'}
            size="small"
            sx={COMPACT_CHIP_SX}
          />
          {responseClosed && (
            <Chip label="Responses closed" size="small" color="warning" sx={COMPACT_CHIP_SX} />
          )}
        </Box>

        {/* Question body */}
        <Box sx={{ mb: 2 }}>
          <RichContent html={currentQ.content} fallback={currentQ.plainText} />
        </Box>

        {/* ============================================================ */}
        {/* Answer options                                               */}
        {/* ============================================================ */}

        {/* MC / TF: Radio buttons */}
        {(qType === QUESTION_TYPES.MULTIPLE_CHOICE || qType === QUESTION_TYPES.TRUE_FALSE) && (
          <RadioGroup
            value={displayAnswer ?? ''}
            onChange={(e) => {
              if (!isLocked) setAnswer(e.target.value);
            }}
          >
            {(currentQ.options || []).map((opt, i) => {
              const optId = opt._id || String(i);
              const isCorrectOpt = showCorrect && !!opt.correct;
              const isSelected = displayAnswer === optId;
              return (
                <Paper
                  key={optId}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    mb: 0.75,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    borderColor: isCorrectOpt ? 'success.main' : isSelected ? 'primary.main' : 'divider',
                    bgcolor: isCorrectOpt ? 'success.50' : isSelected && isLocked ? 'action.selected' : 'transparent',
                    opacity: isLocked ? 0.85 : 1,
                    cursor: isLocked ? 'default' : 'pointer',
                  }}
                  onClick={() => {
                    if (!isLocked) setAnswer(optId);
                  }}
                >
                  <FormControlLabel
                    value={optId}
                    control={<Radio disabled={isLocked} sx={{ p: 0.5 }} />}
                    label=""
                    sx={{ m: 0, mr: 0 }}
                    aria-label={`Option ${OPTION_LETTERS[i]}`}
                  />
                  <Chip
                    label={OPTION_LETTERS[i]}
                    size="small"
                    color={isCorrectOpt ? 'success' : 'default'}
                    sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 28, mt: 0.25 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
                    <RichContent html={opt.answer || opt.content || opt.plainText} />
                  </Box>
                </Paper>
              );
            })}
          </RadioGroup>
        )}

        {/* MS: Checkboxes */}
        {qType === QUESTION_TYPES.MULTI_SELECT && (
          <FormGroup>
            {(currentQ.options || []).map((opt, i) => {
              const optId = opt._id || String(i);
              const isCorrectOpt = showCorrect && !!opt.correct;
              const checked = Array.isArray(displayAnswer)
                ? displayAnswer.includes(optId)
                : false;
              return (
                <Paper
                  key={optId}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    mb: 0.75,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    borderColor: isCorrectOpt ? 'success.main' : checked ? 'primary.main' : 'divider',
                    bgcolor: isCorrectOpt ? 'success.50' : checked && isLocked ? 'action.selected' : 'transparent',
                    opacity: isLocked ? 0.85 : 1,
                    cursor: isLocked ? 'default' : 'pointer',
                  }}
                  onClick={() => {
                    if (isLocked) return;
                    setAnswer((prev) => {
                      const arr = Array.isArray(prev) ? prev : [];
                      return arr.includes(optId)
                        ? arr.filter((id) => id !== optId)
                        : [...arr, optId];
                    });
                  }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={checked}
                        disabled={isLocked}
                        sx={{ p: 0.5 }}
                        onChange={() => {
                          if (isLocked) return;
                          setAnswer((prev) => {
                            const arr = Array.isArray(prev) ? prev : [];
                            return arr.includes(optId)
                              ? arr.filter((id) => id !== optId)
                              : [...arr, optId];
                          });
                        }}
                      />
                    }
                    label=""
                    sx={{ m: 0, mr: 0 }}
                    aria-label={`Option ${OPTION_LETTERS[i]}`}
                  />
                  <Chip
                    label={OPTION_LETTERS[i]}
                    size="small"
                    color={isCorrectOpt ? 'success' : 'default'}
                    sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 28, mt: 0.25 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
                    <RichContent html={opt.answer || opt.content || opt.plainText} />
                  </Box>
                </Paper>
              );
            })}
          </FormGroup>
        )}

        {/* SA: TipTap rich text editor with math support */}
        {qType === QUESTION_TYPES.SHORT_ANSWER && (
          <Box>
            {isLocked ? (
              <Paper variant="outlined" sx={{ p: 1.5, opacity: 0.85 }}>
                {studentResponse?.answerWysiwyg ? (
                  <RichContent html={studentResponse.answerWysiwyg} />
                ) : (
                  <Typography variant="body2">{displayAnswer || '(no answer)'}</Typography>
                )}
              </Paper>
            ) : (
              <>
                <StudentRichTextEditor
                  value={answerWysiwyg || ''}
                  onChange={({ html, plainText }) => {
                    setAnswerWysiwyg(html);
                    setAnswer(plainText);
                  }}
                  placeholder="Type your answer…"
                  disabled={isLocked}
                />
                <MathPreview html={answerWysiwyg} />
              </>
            )}
          </Box>
        )}

        {/* Numerical: Number input */}
        {qType === QUESTION_TYPES.NUMERICAL && (
          <TextField
            value={displayAnswer ?? ''}
            onChange={(e) => {
              if (!isLocked) setAnswer(e.target.value);
            }}
            placeholder="Enter a number…"
            type="number"
            fullWidth
            disabled={isLocked}
            inputProps={{ 'aria-label': 'Numerical response' }}
          />
        )}
      </Paper>

      {/* ============================================================ */}
      {/* Submit / status area                                         */}
      {/* ============================================================ */}
      <Box sx={{ mb: 2 }}>
        {submitError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>{submitError}</Alert>
        )}

        {hasSubmitted ? (
          <Alert severity="success" icon={false} sx={{ justifyContent: 'center' }}>
            ✓ Response submitted
          </Alert>
        ) : responseClosed ? (
          <Alert severity="warning" sx={{ justifyContent: 'center' }}>
            Responses are currently closed
          </Alert>
        ) : (
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSubmit}
            disabled={
              submitting
              || answer === null
              || answer === ''
              || (Array.isArray(answer) && answer.length === 0)
            }
            sx={{ py: 1.5, fontSize: '1.05rem' }}
            aria-label="Submit response"
          >
            {submitting ? <CircularProgress size={24} color="inherit" /> : 'Submit'}
          </Button>
        )}
      </Box>

      {/* ============================================================ */}
      {/* Stats phase                                                  */}
      {/* ============================================================ */}
      {showStats && responseStats?.type === 'distribution' && responseStats.distribution && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }} aria-label="Response statistics">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Response Distribution
          </Typography>
          <DistributionBars
            distribution={responseStats.distribution}
            options={currentQ?.options}
            showCorrect={showCorrect}
          />
        </Paper>
      )}

      {showStats && responseStats?.type === 'numerical' && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }} aria-label="Numerical statistics">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Response Statistics
          </Typography>
          {(() => {
            const values = (responseStats.values || []).map(Number).filter((v) => !isNaN(v));
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
            return histogramData.length > 0 ? (
              <Box sx={{ mb: 2 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={histogramData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                    <XAxis dataKey="bin" />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" name="Responses" fill="#1976d2" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : null;
          })()}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {[
              { label: 'Count', value: responseStats.total ?? responseStats.count ?? 0 },
              { label: 'Mean', value: responseStats.mean != null ? Number(responseStats.mean).toFixed(2) : '—' },
              { label: 'Median', value: responseStats.median != null ? Number(responseStats.median).toFixed(2) : '—' },
            ].map((e) => (
              <Paper key={e.label} variant="outlined" sx={{ p: 1.5, minWidth: 80, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">{e.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{e.value}</Typography>
              </Paper>
            ))}
          </Box>
        </Paper>
      )}

      {showStats && responseStats?.type === 'shortAnswer' && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }} aria-label="Short answer responses">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Responses
          </Typography>
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            {(responseStats.answers || []).map((r, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1, mb: 0.5 }}>
                {r.answerWysiwyg ? (
                  <RichContent html={r.answerWysiwyg} />
                ) : (
                  <Typography variant="body2">{r.answer ?? '(no answer)'}</Typography>
                )}
              </Paper>
            ))}
          </Box>
        </Paper>
      )}

      {/* ============================================================ */}
      {/* Correct answer phase                                         */}
      {/* ============================================================ */}
      {showCorrect && qType === QUESTION_TYPES.NUMERICAL && currentQ.correctNumerical != null && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'success.main' }}>
          <Typography variant="body2" color="text.secondary">
            Correct answer: <strong>{currentQ.correctNumerical}</strong>
            {currentQ.toleranceNumerical != null && ` ± ${currentQ.toleranceNumerical}`}
          </Typography>
        </Paper>
      )}

      {showCorrect && currentQ.solution && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'success.main' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'success.main' }}>
            Solution
          </Typography>
          <RichContent html={currentQ.solution} />
        </Paper>
      )}
    </Box>
  );
}
