import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress, Chip,
  Switch, FormControlLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, Tab, LinearProgress,
} from '@mui/material';
import {
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

/** Meteor-style inline response bars for MC/MS/TF (options as bars). */
function DistributionBars({ data, highlightCorrect, correctIndices, options }) {
  if (!data || !data.length) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {data.map((item, i) => {
        const pct = total > 0 ? Math.round(100 * item.count / total) : 0;
        const isCorrect = highlightCorrect && correctIndices?.includes(i);
        const barColor = isCorrect ? 'success.main' : !highlightCorrect || !correctIndices?.length ? 'primary.main' : 'error.light';
        return (
          <Box key={i}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
              <Chip
                label={item.label}
                size="small"
                color={isCorrect ? 'success' : 'default'}
                sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 28 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <RichContent
                  html={options?.[i]?.answer || options?.[i]?.content || options?.[i]?.plainText || ''}
                />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 56, textAlign: 'right' }}>
                {pct}% ({item.count})
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

export default function SessionReview() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [studentResults, setStudentResults] = useState([]);
  const [tab, setTab] = useState(0);
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

  // ---- Stats data for ALL questions ----

  const allQuestionStats = useMemo(() => {
    return questions.map((q) => {
      const qT = normalizeQuestionType(q);
      const optionType = [
        QUESTION_TYPES.MULTIPLE_CHOICE,
        QUESTION_TYPES.TRUE_FALSE,
        QUESTION_TYPES.MULTI_SELECT,
      ].includes(qT);

      let count = 0;
      const distribution = {};

      if (optionType && q.options) {
        q.options.forEach((opt) => {
          distribution[opt._id || ''] = 0;
        });
      }

      studentResults.forEach((student) => {
        const qr = (student.questionResults || []).find(
          (r) => r.questionId === q._id,
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

      let chartData = null;
      const correctIndices = [];

      if (optionType && q.options) {
        chartData = q.options.map((opt, i) => {
          if (opt.correct) correctIndices.push(i);
          return {
            label: OPTION_LETTERS[i] || String(i + 1),
            count: distribution[opt._id || ''] || 0,
          };
        });
      }

      return { qType: qT, chartData, correctIndices, responseCount: count };
    });
  }, [questions, studentResults]);

  // ---- Question content ref for KaTeX ----

  const questionContainerRef = useRef(null);
  useEffect(() => {
    if (questionContainerRef.current) {
      renderKatexInElement(questionContainerRef.current);
    }
  }, [questions, tab]);

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
        <Tab label="Response Data" />
      </Tabs>

      {/* Questions tab – all questions shown at once with inline stats */}
      <TabPanel value={tab} index={0}>
        {totalQuestions === 0 ? (
          <Alert severity="info">This session has no questions.</Alert>
        ) : (
          <Box ref={questionContainerRef} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {questions.map((q, qi) => {
              const stats = allQuestionStats[qi] || {};
              const qT = stats.qType;
              const isOptionType = [
                QUESTION_TYPES.MULTIPLE_CHOICE,
                QUESTION_TYPES.TRUE_FALSE,
                QUESTION_TYPES.MULTI_SELECT,
              ].includes(qT);

              return (
                <Paper key={q._id || qi} variant="outlined" sx={{ p: 2.5 }}>
                  {/* Question header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Q{qi + 1}
                    </Typography>
                    <Chip
                      label={TYPE_LABELS[qT] || 'Unknown'}
                      color={TYPE_COLORS[qT] || 'default'}
                      size="small"
                      sx={COMPACT_CHIP_SX}
                    />
                    {q.sessionOptions?.points != null && (
                      <Chip
                        label={`${q.sessionOptions.points} pt${q.sessionOptions.points !== 1 ? 's' : ''}`}
                        size="small"
                        variant="outlined"
                        sx={COMPACT_CHIP_SX}
                      />
                    )}
                    <Chip
                      label={`${stats.responseCount || 0} response${stats.responseCount !== 1 ? 's' : ''}`}
                      size="small"
                      variant="outlined"
                      sx={COMPACT_CHIP_SX}
                    />
                  </Box>

                  {/* Question content */}
                  <Box sx={{ mb: 2 }}>
                    <RichContent html={q.content} fallback={q.plainText} />
                  </Box>

                  {/* Inline stats for MC/TF/MS using option bars */}
                  {isOptionType && stats.chartData && (
                    <Box sx={{ mb: 1 }}>
                      <DistributionBars
                        data={stats.chartData}
                        highlightCorrect
                        correctIndices={stats.correctIndices}
                        options={q.options}
                      />
                    </Box>
                  )}

                  {/* Fallback: show options without stats for types that don't have chart data */}
                  {isOptionType && !stats.chartData && (q.options || []).length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
                      {(q.options || []).map((opt, i) => {
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
                  {qT === QUESTION_TYPES.NUMERICAL && q.correctNumerical != null && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Correct: {q.correctNumerical} (± {q.toleranceNumerical ?? 0})
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Box>
        )}
      </TabPanel>

      {/* Response Data tab */}
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
