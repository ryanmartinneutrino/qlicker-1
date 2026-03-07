import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress,
  Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  ViewList as AllIcon,
  ViewCarousel as OneIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideIcon,
  CheckCircle as CorrectIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import {
  TYPE_LABELS, TYPE_COLORS, QUESTION_TYPES, normalizeQuestionType,
} from '../../components/questions/constants';
import { prepareRichTextInput, renderKatexInElement } from '../../components/questions/richTextUtils';

/* ------------------------------------------------------------------ */
/*  Shared rich-text / image display styles                           */
/* ------------------------------------------------------------------ */
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

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': {
    px: 1.15,
  },
};

function questionKey(question, fallbackIndex = 0) {
  if (question?._id !== undefined && question?._id !== null && question?._id !== '') {
    return String(question._id);
  }
  return `q-${fallbackIndex}`;
}

/* ------------------------------------------------------------------ */
/*  Helper: render rich HTML with fallback                            */
/* ------------------------------------------------------------------ */
function RichHtml({ value, fallback }) {
  const html = prepareRichTextInput(value || '', fallback || '');
  if (!html) return <Typography variant="body1">(no content)</Typography>;
  return <Box sx={{ ...richContentSx, mb: 1 }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ------------------------------------------------------------------ */
/*  Single question card (shared by both view modes)                  */
/* ------------------------------------------------------------------ */
function ReviewQuestionCard({ question, index, total, solutionVisible, onToggleSolution }) {
  const containerRef = useRef(null);
  const normalizedType = useMemo(() => normalizeQuestionType(question), [question]);
  const opts = question.options || [];
  const points = question.sessionOptions?.points;
  const shouldLetter = [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTI_SELECT].includes(normalizedType);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const run = () => { if (containerRef.current) renderKatexInElement(containerRef.current); };
    run();
    const raf = requestAnimationFrame(run);
    const t = setTimeout(run, 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [question, solutionVisible]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, width: '100%', minWidth: 0, overflow: 'hidden' }} ref={containerRef}>
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Q{index + 1}{total > 1 ? `/${total}` : ''}
        </Typography>
        <Chip label={TYPE_LABELS[normalizedType] || 'Unknown'} color={TYPE_COLORS[normalizedType] || 'default'} size="small" sx={COMPACT_CHIP_SX} />
        {points != null && <Chip label={`${points} pt${points !== 1 ? 's' : ''}`} size="small" variant="outlined" sx={COMPACT_CHIP_SX} />}
      </Box>

      {/* Question content */}
      <RichHtml value={question.content} fallback={question.plainText} />

      {/* Options (MC / TF / MS) */}
      {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(normalizedType)
        && opts.length > 0 && (
        <Box sx={{ pl: 2, mt: 1 }}>
          {opts.map((opt, i) => {
            const showCorrectMark = solutionVisible && opt.correct;
            return (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}>
                <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', pt: 0.25 }}>
                  {showCorrectMark ? <CorrectIcon color="success" fontSize="small" /> : null}
                </Box>
                <Box sx={{ color: showCorrectMark ? 'success.main' : 'text.primary' }}>
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: shouldLetter ? '20px minmax(0, 1fr)' : 'minmax(0, 1fr)',
                    columnGap: 0.5,
                    alignItems: 'start',
                  }}>
                    {shouldLetter && (
                      <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                        {String.fromCharCode(65 + i)}.
                      </Typography>
                    )}
                    <Box
                      sx={{
                        '& p': { my: 0 },
                        '& ul, & ol': { my: 0, pl: 2.5 },
                        '& li': { my: 0 },
                        '& img': {
                          display: 'block', maxWidth: '90% !important',
                          height: 'auto !important',
                          borderRadius: 0, my: 0.5,
                        },
                      }}
                      dangerouslySetInnerHTML={{
                        __html: prepareRichTextInput(
                          opt.content || opt.plainText || opt.answer || `Option ${i + 1}`,
                        ),
                      }}
                    />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Numerical correct answer */}
      {normalizedType === QUESTION_TYPES.NUMERICAL && solutionVisible && (
        <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 1 }}>
          Correct: {question.correctNumerical ?? '—'} (± {question.toleranceNumerical ?? 0})
        </Typography>
      )}

      {/* Show / Hide Solution button */}
      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={solutionVisible ? <HideIcon /> : <ShowIcon />}
          onClick={onToggleSolution}
        >
          {solutionVisible ? 'Hide solution' : 'Show solution'}
        </Button>
      </Box>

      {/* Solution text (when visible) */}
      {solutionVisible && (question.solution || question.solution_plainText) && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Solution
          </Typography>
          <Box
            sx={richContentSx}
            dangerouslySetInnerHTML={{ __html: prepareRichTextInput(question.solution, question.solution_plainText) }}
          />
        </Box>
      )}
    </Paper>
  );
}

/* ================================================================== */
/*  SessionReview page                                                */
/* ================================================================== */
export default function SessionReview() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responsesByQuestion, setResponsesByQuestion] = useState({});

  // View mode: 'one' (single question) or 'all'
  const [viewMode, setViewMode] = useState('one');
  // Current question index (for single-question mode)
  const [questionIdx, setQuestionIdx] = useState(0);
  // Track which questions have their solution revealed (keyed by question._id)
  const [solutionVisible, setSolutionVisible] = useState({});
  // Track which questions show "my response" (keyed by question._id)
  const [myResponseVisible, setMyResponseVisible] = useState({});
  // Track which attempt index is shown per question (keyed by question._id)
  const [responseAttemptIdx, setResponseAttemptIdx] = useState({});

  const fetchReview = useCallback(async ({ background = false } = {}) => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/review`);
      setSession(data.session);
      setQuestions(data.questions || []);
      setResponsesByQuestion(data.responses || {});
      if (!background) {
        setError(null);
      }
      return true;
    } catch (err) {
      const status = err.response?.status;
      const forbiddenMessage = err.response?.data?.message || 'You do not have permission to review this session.';
      if (background && (status === 403 || status === 404)) {
        navigate(`/student/course/${courseId}`, { replace: true });
        return false;
      }
      if (status === 403) {
        setError(forbiddenMessage);
      } else if (status === 404) {
        setError('Session not found.');
      } else {
        setError('Failed to load session review.');
      }
      return false;
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [sessionId, navigate, courseId]);

  useEffect(() => { fetchReview(); }, [fetchReview]);

  useEffect(() => {
    setQuestionIdx((prev) => {
      if (!questions.length) return 0;
      return Math.min(prev, questions.length - 1);
    });
  }, [questions.length]);

  useEffect(() => {
    if (loading || error) return undefined;

    const runCheck = () => {
      fetchReview({ background: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runCheck();
    };

    const intervalId = setInterval(runCheck, 30000);
    window.addEventListener('focus', runCheck);
    window.addEventListener('online', runCheck);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', runCheck);
      window.removeEventListener('online', runCheck);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loading, error, fetchReview]);

  // Reset solution visibility and index when switching modes
  const handleViewModeChange = (_e, next) => {
    if (!next) return;
    setViewMode(next);
    setSolutionVisible({});
    setMyResponseVisible({});
    setResponseAttemptIdx({});
    setQuestionIdx(0);
  };

  // Reset solution visibility when navigating to a new question
  const goTo = (idx) => {
    const bounded = Math.max(0, Math.min(idx, Math.max(questions.length - 1, 0)));
    setQuestionIdx(bounded);
    setSolutionVisible({});
    setMyResponseVisible({});
    setResponseAttemptIdx({});
  };

  const toggleSolution = (qId) => {
    setSolutionVisible((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const toggleMyResponse = (qKey) => {
    setMyResponseVisible((prev) => {
      const nextVisible = !prev[qKey];
      if (nextVisible) {
        setResponseAttemptIdx((prevAttemptIdx) => ({ ...prevAttemptIdx, [qKey]: 0 }));
      }
      return { ...prev, [qKey]: nextVisible };
    });
  };

  const cycleAttempt = (qKey, responses, direction) => {
    if (responses.length === 0) return;
    setResponseAttemptIdx((prev) => {
      const current = prev[qKey] || 0;
      const next = current + direction;
      if (next < 0 || next >= responses.length) return prev;
      return { ...prev, [qKey]: next };
    });
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  }

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: 700 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="outlined" onClick={() => navigate(`/student/course/${courseId}`)}>
          Back to course
        </Button>
      </Box>
    );
  }

  const total = questions.length;
  const currentQ = questions[questionIdx];
  const currentQKey = currentQ ? questionKey(currentQ, questionIdx) : '';
  const currentResponses = currentQ?._id != null
    ? (responsesByQuestion[String(currentQ._id)] || []).sort((a, b) => a.attempt - b.attempt)
    : [];

  return (
    <Box sx={{ p: 2.5, maxWidth: 860 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Button size="small" onClick={() => navigate(`/student/course/${courseId}`)} sx={{ mb: 1 }}>
          ← Back to course
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {session?.name || 'Session Review'}
        </Typography>
        {session?.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {session.description}
          </Typography>
        )}
      </Box>

      {total === 0 ? (
        <Alert severity="info">This session has no questions.</Alert>
      ) : (
        <>
          {/* View toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
            >
              <ToggleButton value="one"><OneIcon sx={{ mr: 0.5 }} fontSize="small" />One at a time</ToggleButton>
              <ToggleButton value="all"><AllIcon sx={{ mr: 0.5 }} fontSize="small" />All questions</ToggleButton>
            </ToggleButtonGroup>

            {viewMode === 'one' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary">
                  Question {questionIdx + 1} of {total}
                </Typography>
                {total > 1 && (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PrevIcon />}
                      disabled={questionIdx <= 0}
                      onClick={() => goTo(questionIdx - 1)}
                      aria-label="Previous question"
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      endIcon={<NextIcon />}
                      disabled={questionIdx >= total - 1}
                      onClick={() => goTo(questionIdx + 1)}
                      aria-label="Next question"
                    >
                      Next
                    </Button>
                  </>
                )}
              </Box>
            )}
          </Box>

          {/* Single question view */}
          {viewMode === 'one' && currentQ && (
            <Box>
              <ReviewQuestionCard
                key={currentQKey}
                question={currentQ}
                index={questionIdx}
                total={total}
                solutionVisible={!!solutionVisible[currentQKey]}
                onToggleSolution={() => toggleSolution(currentQKey)}
              />

              {/* My Response section */}
              {(() => {
                const responses = currentResponses;
                const hasResponses = responses.length > 0;
                const showingResponse = !!myResponseVisible[currentQKey];
                const attemptIdx = responseAttemptIdx[currentQKey] || 0;
                const currentResponse = responses[attemptIdx];

                return (
                  <Box sx={{ mt: 2 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => toggleMyResponse(currentQKey)}
                      disabled={!hasResponses}
                      aria-label={showingResponse ? 'Hide my response' : 'Show my response'}
                    >
                      {showingResponse ? 'Hide my response' : 'Show my response'}
                    </Button>
                    {!hasResponses && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        No response recorded
                      </Typography>
                    )}
                    {showingResponse && currentResponse && (
                      <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                        {responses.length > 1 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Button
                              size="small"
                              disabled={attemptIdx <= 0}
                              onClick={() => cycleAttempt(currentQKey, responses, -1)}
                            >
                              ← Prev attempt
                            </Button>
                            <Typography variant="body2" color="text.secondary">
                              Attempt {currentResponse.attempt} of {responses.length}
                            </Typography>
                            <Button
                              size="small"
                              disabled={attemptIdx >= responses.length - 1}
                              onClick={() => cycleAttempt(currentQKey, responses, 1)}
                            >
                              Next attempt →
                            </Button>
                          </Box>
                        )}
                        <Typography variant="body2">
                          <strong>Your answer:</strong>{' '}
                          {Array.isArray(currentResponse.answer)
                            ? currentResponse.answer.join(', ')
                            : String(currentResponse.answer)}
                        </Typography>
                      </Paper>
                    )}
                  </Box>
                );
              })()}

            </Box>
          )}

          {/* All questions view */}
          {viewMode === 'all' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {questions.map((q, i) => {
                const qKey = questionKey(q, i);
                const responses = q?._id != null
                  ? (responsesByQuestion[String(q._id)] || []).sort((a, b) => a.attempt - b.attempt)
                  : [];
                const hasResponses = responses.length > 0;
                const showingResponse = !!myResponseVisible[qKey];
                const attemptIdx = responseAttemptIdx[qKey] || 0;
                const currentResponse = responses[attemptIdx];

                return (
                  <Box key={qKey}>
                    <ReviewQuestionCard
                      question={q}
                      index={i}
                      total={total}
                      solutionVisible={!!solutionVisible[qKey]}
                      onToggleSolution={() => toggleSolution(qKey)}
                    />
                    <Box sx={{ mt: 1, ml: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => toggleMyResponse(qKey)}
                        disabled={!hasResponses}
                      >
                        {showingResponse ? 'Hide my response' : 'Show my response'}
                      </Button>
                      {!hasResponses && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          No response recorded
                        </Typography>
                      )}
                      {showingResponse && currentResponse && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                          {responses.length > 1 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Button
                                size="small"
                                disabled={attemptIdx <= 0}
                                onClick={() => cycleAttempt(qKey, responses, -1)}
                              >
                                ← Prev attempt
                              </Button>
                              <Typography variant="body2" color="text.secondary">
                                Attempt {currentResponse.attempt} of {responses.length}
                              </Typography>
                              <Button
                                size="small"
                                disabled={attemptIdx >= responses.length - 1}
                                onClick={() => cycleAttempt(qKey, responses, 1)}
                              >
                                Next attempt →
                              </Button>
                            </Box>
                          )}
                          <Typography variant="body2">
                            <strong>Your answer:</strong>{' '}
                            {Array.isArray(currentResponse.answer)
                              ? currentResponse.answer.join(', ')
                              : String(currentResponse.answer)}
                          </Typography>
                        </Paper>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </>
      )}

    </Box>
  );
}
