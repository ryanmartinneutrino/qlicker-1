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
    width: 'auto !important',
    height: 'auto !important',
    borderRadius: 0,
    my: 0.75,
  },
};

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
        <Chip label={TYPE_LABELS[normalizedType] || 'Unknown'} color={TYPE_COLORS[normalizedType] || 'default'} size="small" />
        {points != null && <Chip label={`${points} pt${points !== 1 ? 's' : ''}`} size="small" variant="outlined" />}
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
                          width: 'auto !important', height: 'auto !important',
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

  // View mode: 'one' (single question) or 'all'
  const [viewMode, setViewMode] = useState('one');
  // Current question index (for single-question mode)
  const [questionIdx, setQuestionIdx] = useState(0);
  // Track which questions have their solution revealed (keyed by question._id)
  const [solutionVisible, setSolutionVisible] = useState({});

  const fetchReview = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/review`);
      setSession(data.session);
      setQuestions(data.questions || []);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        setError(err.response?.data?.message || 'You do not have permission to review this session.');
      } else if (status === 404) {
        setError('Session not found.');
      } else {
        setError('Failed to load session review.');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchReview(); }, [fetchReview]);

  // Reset solution visibility and index when switching modes
  const handleViewModeChange = (_e, next) => {
    if (!next) return;
    setViewMode(next);
    setSolutionVisible({});
    setQuestionIdx(0);
  };

  // Reset solution visibility when navigating to a new question
  const goTo = (idx) => {
    setQuestionIdx(idx);
    setSolutionVisible({});
  };

  const toggleSolution = (qId) => {
    setSolutionVisible((prev) => ({ ...prev, [qId]: !prev[qId] }));
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
              <Typography variant="body2" color="text.secondary">
                Question {questionIdx + 1} of {total}
              </Typography>
            )}
          </Box>

          {/* Single question view */}
          {viewMode === 'one' && currentQ && (
            <Box>
              <ReviewQuestionCard
                question={currentQ}
                index={questionIdx}
                total={total}
                solutionVisible={!!solutionVisible[currentQ._id]}
                onToggleSolution={() => toggleSolution(currentQ._id)}
              />

              {/* Navigation controls */}
              {total > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<PrevIcon />}
                    disabled={questionIdx <= 0}
                    onClick={() => goTo(questionIdx - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="contained"
                    endIcon={<NextIcon />}
                    disabled={questionIdx >= total - 1}
                    onClick={() => goTo(questionIdx + 1)}
                  >
                    Next
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {/* All questions view */}
          {viewMode === 'all' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {questions.map((q, i) => (
                <ReviewQuestionCard
                  key={q._id}
                  question={q}
                  index={i}
                  total={total}
                  solutionVisible={!!solutionVisible[q._id]}
                  onToggleSolution={() => toggleSolution(q._id)}
                />
              ))}
            </Box>
          )}
        </>
      )}

    </Box>
  );
}
