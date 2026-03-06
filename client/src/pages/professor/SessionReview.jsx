import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress, Chip,
  Switch, FormControlLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, Tab,
} from '@mui/material';
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Download as DownloadIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
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

function escapeCsvCell(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

/** Tab panel helper. */
function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

/** Horizontal bar chart for response distribution. */
function DistributionBars({ data, highlightCorrect, correctIndices }) {
  if (!data || !data.length) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {data.map((item, i) => {
        const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const pctOfTotal = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
        const isCorrect = highlightCorrect && correctIndices?.includes(i);
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}
            >
              {item.label}
            </Typography>
            <Box
              sx={{
                flex: 1, position: 'relative', height: 28,
                bgcolor: 'grey.100', borderRadius: 1, overflow: 'hidden',
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
            <Typography variant="body2" sx={{ minWidth: 56, textAlign: 'right' }}>
              {item.count} ({pctOfTotal}%)
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SessionReview() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [studentResults, setStudentResults] = useState([]);
  const [tab, setTab] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [togglingReviewable, setTogglingReviewable] = useState(false);

  // ---- Data fetching ----

  const fetchResults = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/results`);
      setSession(data.session);
      setQuestions(data.questions || []);
      setStudentResults(data.studentResults || []);
      setError(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load session results.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // ---- Toggle reviewable ----

  const handleToggleReviewable = useCallback(async (checked) => {
    setTogglingReviewable(true);
    try {
      await apiClient.patch(`/sessions/${sessionId}`, { reviewable: checked });
      setSession((prev) => (prev ? { ...prev, reviewable: checked } : prev));
    } catch {
      // Revert on failure
    } finally {
      setTogglingReviewable(false);
    }
  }, [sessionId]);

  // ---- Summary stats ----

  const totalQuestions = questions.length;
  const totalStudents = session?.joined?.length || studentResults.length || 0;
  const avgParticipation = useMemo(() => {
    if (!studentResults.length) return 0;
    const sum = studentResults.reduce((acc, s) => acc + (s.participation || 0), 0);
    return (sum / studentResults.length).toFixed(1);
  }, [studentResults]);

  // ---- Current question data for Questions tab ----

  const currentQ = questions[questionIdx];
  const qType = currentQ ? normalizeQuestionType(currentQ) : null;

  const { chartData, correctIndices, responseCount } = useMemo(() => {
    if (!currentQ || !studentResults.length) {
      return { chartData: null, correctIndices: [], responseCount: 0 };
    }

    const optionType = [
      QUESTION_TYPES.MULTIPLE_CHOICE,
      QUESTION_TYPES.TRUE_FALSE,
      QUESTION_TYPES.MULTI_SELECT,
    ].includes(qType);

    let count = 0;
    const distribution = {};

    if (optionType && currentQ.options) {
      currentQ.options.forEach((opt) => {
        distribution[opt._id || ''] = 0;
      });
    }

    studentResults.forEach((student) => {
      const qr = (student.questionResults || []).find(
        (r) => r.questionId === currentQ._id,
      );
      if (!qr || !qr.responses || !qr.responses.length) return;
      count += 1;
      const lastResponse = qr.responses[qr.responses.length - 1];
      const answer = lastResponse?.answer;

      if (optionType && answer) {
        const answers = Array.isArray(answer) ? answer : [answer];
        answers.forEach((a) => {
          if (distribution[a] != null) {
            distribution[a] += 1;
          }
        });
      }
    });

    let cData = null;
    const cIndices = [];

    if (optionType && currentQ.options) {
      cData = currentQ.options.map((opt, i) => {
        if (opt.correct) cIndices.push(i);
        return {
          label: OPTION_LETTERS[i] || String(i + 1),
          count: distribution[opt._id || ''] || 0,
        };
      });
    }

    return { chartData: cData, correctIndices: cIndices, responseCount: count };
  }, [currentQ, studentResults, qType]);

  // ---- Question content ref for KaTeX ----

  const questionContainerRef = useRef(null);
  useEffect(() => {
    if (questionContainerRef.current) {
      renderKatexInElement(questionContainerRef.current);
    }
  }, [currentQ, questionIdx]);

  // ---- CSV export ----

  const handleExportCsv = useCallback(() => {
    if (!questions.length || !studentResults.length) return;

    const headers = ['Last Name', 'First Name', 'Email', 'Participation'];
    questions.forEach((_, i) => {
      headers.push(`Q${i + 1} Response`);
      headers.push(`Q${i + 1} Points`);
    });

    const rows = studentResults.map((student) => {
      const row = [
        escapeCsvCell(student.lastname),
        escapeCsvCell(student.firstname),
        escapeCsvCell(student.email),
        escapeCsvCell(
          student.participation != null
            ? `${(student.participation * 100).toFixed(0)}%`
            : '0%',
        ),
      ];

      questions.forEach((q) => {
        const qr = (student.questionResults || []).find(
          (r) => r.questionId === q._id,
        );
        if (!qr || !qr.responses || !qr.responses.length) {
          row.push(escapeCsvCell(''));
          row.push(escapeCsvCell(''));
          return;
        }
        const lastResponse = qr.responses[qr.responses.length - 1];
        let answerText = lastResponse?.answer ?? '';

        // Convert option IDs to letters for MC/TF/MS
        const normType = normalizeQuestionType(q);
        if (
          [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT]
            .includes(normType) && q.options
        ) {
          const answers = Array.isArray(answerText) ? answerText : [answerText];
          answerText = answers
            .map((a) => {
              const idx = q.options.findIndex((o) => o._id === a);
              return idx >= 0 ? OPTION_LETTERS[idx] : a;
            })
            .join(', ');
        }

        row.push(escapeCsvCell(answerText));
        row.push(escapeCsvCell(lastResponse?.points ?? ''));
      });

      return row.join(',');
    });

    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const filename = `${(session?.name || 'session').replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
    downloadCsv(filename, csvContent);
  }, [questions, studentResults, session?.name]);

  // ---- Render: loading ----

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // ---- Render: error ----

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: 800 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button
          variant="outlined"
          startIcon={<BackIcon />}
          onClick={() => navigate(`/manage/course/${courseId}`)}
        >
          Back to course
        </Button>
      </Box>
    );
  }

  // ---- Render: session still running ----

  if (session?.status === 'running') {
    return (
      <Box sx={{ p: 3, maxWidth: 800 }}>
        <Button
          size="small"
          startIcon={<BackIcon />}
          onClick={() => navigate(`/manage/course/${courseId}`)}
          sx={{ mb: 2 }}
        >
          Back to course
        </Button>
        <Alert severity="info">
          This session is still running. Results will be available after the session ends.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5, maxWidth: 1000 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Button
          size="small"
          startIcon={<BackIcon />}
          onClick={() => navigate(`/manage/course/${courseId}`)}
          sx={{ mb: 1 }}
        >
          Back to course
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

      {/* Summary stats */}
      <Box
        sx={{
          display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 110, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">Questions</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{totalQuestions}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 110, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">Students</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{totalStudents}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 110, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">Avg Participation</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{avgParticipation}%</Typography>
        </Paper>

        <Box sx={{ flex: 1 }} />

        <FormControlLabel
          control={
            <Switch
              checked={!!session?.reviewable}
              onChange={(e) => handleToggleReviewable(e.target.checked)}
              disabled={togglingReviewable}
              size="small"
            />
          }
          label="Students can review"
          aria-label="Toggle student review access"
        />

        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleExportCsv}
          disabled={!studentResults.length}
          aria-label="Export results to CSV"
        >
          Export CSV
        </Button>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, newTab) => setTab(newTab)}
        aria-label="Session review tabs"
      >
        <Tab label="Questions" />
        <Tab label="Students" />
      </Tabs>

      {/* Questions tab */}
      <TabPanel value={tab} index={0}>
        {totalQuestions === 0 ? (
          <Alert severity="info">This session has no questions.</Alert>
        ) : (
          <Box>
            {/* Navigation */}
            {totalQuestions > 1 && (
              <Box
                sx={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 2, mb: 2,
                }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrevIcon />}
                  disabled={questionIdx <= 0}
                  onClick={() => setQuestionIdx((prev) => prev - 1)}
                  aria-label="Previous question"
                >
                  Prev
                </Button>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Question {questionIdx + 1} of {totalQuestions}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  endIcon={<NextIcon />}
                  disabled={questionIdx >= totalQuestions - 1}
                  onClick={() => setQuestionIdx((prev) => prev + 1)}
                  aria-label="Next question"
                >
                  Next
                </Button>
              </Box>
            )}

            {currentQ && (
              <Paper
                variant="outlined"
                sx={{ p: 2.5, mb: 2 }}
                ref={questionContainerRef}
              >
                {/* Question header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Q{questionIdx + 1}
                  </Typography>
                  <Chip
                    label={TYPE_LABELS[qType] || 'Unknown'}
                    color={TYPE_COLORS[qType] || 'default'}
                    size="small"
                    sx={COMPACT_CHIP_SX}
                  />
                  {currentQ.sessionOptions?.points != null && (
                    <Chip
                      label={`${currentQ.sessionOptions.points} pt${currentQ.sessionOptions.points !== 1 ? 's' : ''}`}
                      size="small"
                      variant="outlined"
                      sx={COMPACT_CHIP_SX}
                    />
                  )}
                  <Chip
                    label={`${responseCount} response${responseCount !== 1 ? 's' : ''}`}
                    size="small"
                    variant="outlined"
                    sx={COMPACT_CHIP_SX}
                  />
                </Box>

                {/* Question content */}
                <Box sx={{ mb: 2 }}>
                  <RichContent html={currentQ.content} fallback={currentQ.plainText} />
                </Box>

                {/* Options for MC / TF / MS */}
                {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT]
                  .includes(qType) && (currentQ.options || []).length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
                    {(currentQ.options || []).map((opt, i) => {
                      const isCorrect = !!opt.correct;
                      return (
                        <Paper
                          key={opt._id || i}
                          variant="outlined"
                          sx={{
                            p: 1, display: 'flex', alignItems: 'flex-start', gap: 1,
                            borderColor: isCorrect ? 'success.main' : 'divider',
                            bgcolor: isCorrect ? 'success.50' : 'transparent',
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
                        </Paper>
                      );
                    })}
                  </Box>
                )}

                {/* Numerical correct answer */}
                {qType === QUESTION_TYPES.NUMERICAL && currentQ.correctNumerical != null && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Correct: {currentQ.correctNumerical} (± {currentQ.toleranceNumerical ?? 0})
                  </Typography>
                )}
              </Paper>
            )}

            {/* Response distribution */}
            {currentQ && chartData && (
              <Paper variant="outlined" sx={{ p: 2.5 }} aria-label="Response distribution">
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Response Distribution
                </Typography>
                <DistributionBars
                  data={chartData}
                  highlightCorrect
                  correctIndices={correctIndices}
                />
              </Paper>
            )}
          </Box>
        )}
      </TabPanel>

      {/* Students tab */}
      <TabPanel value={tab} index={1}>
        {studentResults.length === 0 ? (
          <Alert severity="info">No student results available.</Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Student results">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Participation</TableCell>
                  {questions.map((_, i) => (
                    <TableCell key={i} sx={{ fontWeight: 700 }} align="center">
                      Q{i + 1}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {studentResults.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell>
                      {student.lastname}, {student.firstname}
                    </TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell align="center">
                      {student.participation != null
                        ? `${(student.participation * 100).toFixed(0)}%`
                        : '0%'}
                    </TableCell>
                    {questions.map((q, qi) => {
                      const qr = (student.questionResults || []).find(
                        (r) => r.questionId === q._id,
                      );
                      if (!qr || !qr.responses || !qr.responses.length) {
                        return (
                          <TableCell key={qi} align="center">
                            <Typography variant="body2" color="text.secondary">—</Typography>
                          </TableCell>
                        );
                      }
                      const lastResponse = qr.responses[qr.responses.length - 1];
                      let display = lastResponse?.answer ?? '—';
                      const normType = normalizeQuestionType(q);

                      if (
                        [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT]
                          .includes(normType) && q.options
                      ) {
                        const answers = Array.isArray(display) ? display : [display];
                        display = answers
                          .map((a) => {
                            const idx = q.options.findIndex((o) => o._id === a);
                            return idx >= 0 ? OPTION_LETTERS[idx] : a;
                          })
                          .join(', ');
                      }

                      return (
                        <TableCell key={qi} align="center">
                          <Typography variant="body2">{display}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            attempt {qr.responses.length}
                          </Typography>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>
    </Box>
  );
}
