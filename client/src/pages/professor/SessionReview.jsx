import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress, Chip, Avatar,
  Switch, FormControlLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Tabs, Tab, LinearProgress, TextField, Autocomplete,
} from '@mui/material';
import {
  Download as DownloadIcon,
  ArrowBack as BackIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import { QUESTION_TYPES, TYPE_LABELS, TYPE_COLORS, normalizeQuestionType } from '../../components/questions/constants';
import { prepareRichTextInput, renderKatexInElement } from '../../components/questions/richTextUtils';
import SessionQuestionGradingPanel from '../../components/grades/SessionQuestionGradingPanel';

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

function normalizeAnswerValue(answer) {
  if (answer === null || answer === undefined) return '';
  return String(answer).trim();
}

function normalizeComparableText(answer) {
  return normalizeAnswerValue(answer)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isCorrectOption(option) {
  const value = option?.correct;
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

function resolveOptionIndex(answer, options = []) {
  if (answer && typeof answer === 'object') {
    if (Array.isArray(answer)) return -1;
    if (answer.optionId !== undefined) return resolveOptionIndex(answer.optionId, options);
    if (answer._id !== undefined) return resolveOptionIndex(answer._id, options);
    if (answer.id !== undefined) return resolveOptionIndex(answer.id, options);
    if (answer.index !== undefined) return resolveOptionIndex(answer.index, options);
    if (answer.value !== undefined) return resolveOptionIndex(answer.value, options);
    if (answer.answer !== undefined) return resolveOptionIndex(answer.answer, options);
    if (answer.text !== undefined) return resolveOptionIndex(answer.text, options);
  }

  if (typeof answer === 'number' && Number.isInteger(answer)) {
    if (answer >= 0 && answer < options.length) return answer;
    if (answer >= 1 && answer <= options.length) return answer - 1;
    return -1;
  }

  const normalizedRaw = normalizeAnswerValue(answer);
  if (!normalizedRaw) return -1;
  const normalized = normalizedRaw.toLowerCase();

  if (/^-?\d+$/.test(normalizedRaw)) {
    const parsed = Number(normalizedRaw);
    if (parsed >= 0 && parsed < options.length) return parsed;
    if (parsed >= 1 && parsed <= options.length) return parsed - 1;
  }

  if (/^[a-z]$/.test(normalized)) {
    const idx = normalized.charCodeAt(0) - 97;
    if (idx >= 0 && idx < options.length) return idx;
  }

  return options.findIndex((opt) => (
    normalizeAnswerValue(opt?._id).toLowerCase() === normalized
    || normalizeComparableText(opt?.answer) === normalizeComparableText(normalizedRaw)
    || normalizeComparableText(opt?.content) === normalizeComparableText(normalizedRaw)
    || normalizeComparableText(opt?.plainText) === normalizeComparableText(normalizedRaw)
  ));
}

function formatParticipation(participation) {
  const numeric = Number(participation);
  if (!Number.isFinite(numeric)) return '0%';
  return `${Math.round(numeric)}%`;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(numeric * 10) / 10}%`;
}

function summarizeUngradedMarks(grades = []) {
  const questionIds = new Set();
  const studentIds = new Set();
  let marks = 0;

  grades.forEach((grade) => {
    let studentHasUngradedMark = false;
    (grade?.marks || []).forEach((mark) => {
      if (!mark?.needsGrading) return;
      marks += 1;
      studentHasUngradedMark = true;
      if (mark?.questionId) questionIds.add(String(mark.questionId));
    });
    if (studentHasUngradedMark && grade?.userId) {
      studentIds.add(String(grade.userId));
    }
  });

  return {
    marks,
    students: studentIds.size,
    questions: questionIds.size,
  };
}

function formatJoinedAt(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function buildStudentInitials(student) {
  const first = normalizeAnswerValue(student?.firstname);
  const last = normalizeAnswerValue(student?.lastname);
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  const email = normalizeAnswerValue(student?.email);
  return email ? email.charAt(0).toUpperCase() : '?';
}

function optionDisplayHtml(option) {
  return option?.content
    || option?.plainText
    || option?.text
    || option?.label
    || option?.value
    || option?.option
    || option?.answer
    || '';
}

function collectAttemptNumbersForQuestion(question, studentResults = []) {
  const attemptNumbers = new Set();

  (question?.sessionOptions?.attempts || []).forEach((attempt) => {
    const number = Number(attempt?.number);
    if (Number.isInteger(number) && number > 0) {
      attemptNumbers.add(number);
    }
  });

  studentResults.forEach((student) => {
    const qr = (student?.questionResults || []).find(
      (result) => String(result?.questionId) === String(question?._id),
    );
    (qr?.responses || []).forEach((response) => {
      const attemptNumber = Number(response?.attempt);
      if (Number.isInteger(attemptNumber) && attemptNumber > 0) {
        attemptNumbers.add(attemptNumber);
      }
    });
  });

  const sorted = [...attemptNumbers].sort((a, b) => a - b);
  if (sorted.length === 0) sorted.push(1);
  return sorted;
}

function collectAnswerEntries(answer) {
  if (answer === undefined || answer === null) return [];
  if (Array.isArray(answer)) return answer;
  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fall back to scalar interpretation.
      }
    }
    if (trimmed.includes(',') && !/<[^>]*>/.test(trimmed)) {
      return trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [answer];
}

function getLatestResponse(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return null;
  return [...responses].sort((a, b) => {
    const attemptDiff = (Number(a?.attempt) || 0) - (Number(b?.attempt) || 0);
    if (attemptDiff !== 0) return attemptDiff;
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  })[responses.length - 1];
}

function isLatestResponseCorrect(question, response) {
  if (!question || !response) return null;
  if (typeof response.correct === 'boolean') return response.correct;

  const score = Number(response?.mark ?? response?.points);
  if (Number.isFinite(score)) {
    return score > 0;
  }

  const qType = normalizeQuestionType(question);
  const options = Array.isArray(question.options) ? question.options : [];

  if (
    [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(qType)
  ) {
    if (!options.length) return null;

    const correctIndices = options.reduce((acc, option, idx) => {
      if (isCorrectOption(option)) acc.push(idx);
      return acc;
    }, []);
    if (!correctIndices.length) return null;

    const selectedIndices = [...new Set(
      collectAnswerEntries(response.answer)
        .map((entry) => resolveOptionIndex(entry, options))
        .filter((idx) => idx >= 0 && idx < options.length),
    )];

    if (selectedIndices.length !== correctIndices.length) return false;
    return selectedIndices.every((idx) => correctIndices.includes(idx));
  }

  if (qType === QUESTION_TYPES.NUMERICAL) {
    const expected = Number(question.correctNumerical);
    if (!Number.isFinite(expected)) return null;

    const toleranceRaw = Number(question.toleranceNumerical ?? 0);
    const tolerance = Number.isFinite(toleranceRaw) ? Math.abs(toleranceRaw) : 0;
    const actual = Number(response.answer);
    if (!Number.isFinite(actual)) return false;
    return Math.abs(actual - expected) <= tolerance;
  }

  return null;
}

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
function DistributionBars({
  data, highlightCorrect, correctIndices, options, responseCount,
}) {
  if (!data || !data.length) {
    return <Typography variant="body2" color="text.secondary">No responses yet.</Typography>;
  }
  const total = Number(responseCount) > 0
    ? Number(responseCount)
    : data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {data.map((item, i) => {
        const pct = total > 0 ? Math.round(100 * item.count / total) : 0;
        const isCorrect = highlightCorrect && correctIndices?.includes(i);
        const barColor = isCorrect ? 'success.main' : !highlightCorrect || !correctIndices?.length ? 'primary.main' : 'error.light';
        return (
          <Box key={i}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '30px minmax(0, 1fr) 72px',
                columnGap: 1,
                alignItems: 'start',
                mb: 0.25,
              }}
            >
              <Chip
                label={item.label}
                size="small"
                color={isCorrect ? 'success' : 'default'}
                sx={{ ...COMPACT_CHIP_SX, fontWeight: 700, minWidth: 28, justifySelf: 'start' }}
              />
              <Box sx={{ minWidth: 0 }}>
                <RichContent
                  html={optionDisplayHtml(options?.[i])}
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
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [studentResults, setStudentResults] = useState([]);
  const [tab, setTab] = useState(0);
  const [togglingReviewable, setTogglingReviewable] = useState(false);
  const [reviewableWarning, setReviewableWarning] = useState('');
  const [gradingNeedsSummary, setGradingNeedsSummary] = useState({ marks: 0, students: 0, questions: 0 });
  const [studentSort, setStudentSort] = useState({ field: 'name', direction: 'asc' });
  const [studentSearch, setStudentSearch] = useState('');
  const requestedReturnTab = Number.parseInt(searchParams.get('returnTab') || '', 10);
  const resolvedReturnTab = Number.isInteger(requestedReturnTab) && requestedReturnTab >= 0 ? requestedReturnTab : 0;
  const backToCoursePath = resolvedReturnTab > 0
    ? `/manage/course/${courseId}?tab=${resolvedReturnTab}`
    : `/manage/course/${courseId}`;
  const editSessionParams = new URLSearchParams();
  if (resolvedReturnTab > 0) {
    editSessionParams.set('returnTab', String(resolvedReturnTab));
  }
  editSessionParams.set('returnTo', 'review');
  const editSessionPath = `/manage/course/${courseId}/session/${sessionId}?${editSessionParams.toString()}`;

  // ---- Data fetching ----

  const fetchResults = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/results`);
      setSession(data.session);
      setQuestions(data.questions || []);
      setStudentResults(data.studentResults || []);

      try {
        const gradesRes = await apiClient.get(`/sessions/${sessionId}/grades`);
        const summary = summarizeUngradedMarks(gradesRes.data?.grades || []);
        setGradingNeedsSummary(summary);
      } catch {
        setGradingNeedsSummary({ marks: 0, students: 0, questions: 0 });
      }

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
      const { data } = await apiClient.patch(`/sessions/${sessionId}`, { reviewable: checked });
      const updatedSession = data.session || data;
      const warnings = data.grading?.warnings || [];
      setSession((prev) => (prev ? { ...prev, ...updatedSession } : prev));
      setReviewableWarning(warnings.join(' '));
    } catch (err) {
      setReviewableWarning(err.response?.data?.message || 'Failed to update reviewable setting.');
    } finally {
      setTogglingReviewable(false);
    }
  }, [sessionId]);

  // ---- Summary stats ----

  const totalQuestions = questions.length;
  const totalStudents = studentResults.length;
  const joinedStudents = useMemo(() => {
    return studentResults.filter((student) => !!student?.inSession).length;
  }, [studentResults]);

  const hasOutstandingManualGrading = gradingNeedsSummary.marks > 0;

  const handleUngradedSummaryChange = useCallback((summary) => {
    if (!summary || typeof summary !== 'object') return;
    setGradingNeedsSummary({
      marks: Number(summary.marks) || 0,
      students: Number(summary.students) || 0,
      questions: Number(summary.questions) || 0,
    });
  }, []);

  // ---- Stats data for ALL questions / attempts ----

  const questionAttemptRows = useMemo(() => questions.flatMap((q, qi) => {
    const qType = normalizeQuestionType(q);
    const isOptionType = [
      QUESTION_TYPES.MULTIPLE_CHOICE,
      QUESTION_TYPES.TRUE_FALSE,
      QUESTION_TYPES.MULTI_SELECT,
    ].includes(qType);

    const responsesByAttempt = new Map();
    const attemptNumbers = new Set(collectAttemptNumbersForQuestion(q, studentResults));

    studentResults.forEach((student) => {
      const qr = (student.questionResults || []).find(
        (result) => String(result.questionId) === String(q._id),
      );
      if (!qr?.responses?.length) return;

      qr.responses.forEach((response) => {
        const attemptNumber = Number(response?.attempt);
        const normalizedAttempt = Number.isInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1;
        attemptNumbers.add(normalizedAttempt);
        if (!responsesByAttempt.has(normalizedAttempt)) {
          responsesByAttempt.set(normalizedAttempt, []);
        }
        responsesByAttempt.get(normalizedAttempt).push(response);
      });
    });

    const sortedAttempts = [...attemptNumbers].sort((a, b) => a - b);

    const correctIndices = (q.options || []).reduce((acc, option, idx) => {
      if (isCorrectOption(option)) acc.push(idx);
      return acc;
    }, []);

    return sortedAttempts.map((attemptNumber, attemptIndex) => {
      const attemptResponses = responsesByAttempt.get(attemptNumber) || [];
      const distribution = isOptionType && q.options ? q.options.map(() => 0) : [];

      if (isOptionType && q.options) {
        attemptResponses.forEach((response) => {
          const answer = response?.answer;
          if (answer === undefined || answer === null || answer === '') return;
          const answers = Array.isArray(answer) ? answer : [answer];
          answers
            .filter((entry) => entry !== undefined && entry !== null && !(typeof entry === 'string' && entry.trim() === ''))
            .forEach((entry) => {
              const idx = resolveOptionIndex(entry, q.options);
              if (idx >= 0 && idx < distribution.length) distribution[idx] += 1;
            });
        });
      }

      const chartData = isOptionType && q.options
        ? q.options.map((_, idx) => ({
          label: OPTION_LETTERS[idx] || String(idx + 1),
          count: distribution[idx] || 0,
        }))
        : null;

      return {
        key: `${String(q._id || qi)}-attempt-${attemptNumber}`,
        question: q,
        questionNumber: qi + 1,
        attemptNumber,
        attemptIndex: attemptIndex + 1,
        attemptTotal: sortedAttempts.length,
        qType,
        isOptionType,
        chartData,
        correctIndices,
        responseCount: attemptResponses.length,
      };
    });
  }), [questions, studentResults]);

  const csvQuestionAttempts = useMemo(() => questions.map((question, questionIndex) => ({
    question,
    questionNumber: questionIndex + 1,
    attempts: collectAttemptNumbersForQuestion(question, studentResults),
  })), [questions, studentResults]);

  const studentsTabRows = useMemo(() => studentResults.map((student) => {
    const questionResultsById = new Map(
      (student.questionResults || []).map((result) => [String(result.questionId), result]),
    );

    let gradedCount = 0;
    let correctCount = 0;
    questions.forEach((question) => {
      const qr = questionResultsById.get(String(question._id));
      const latestResponse = getLatestResponse(qr?.responses || []);
      if (!latestResponse) return;
      const correct = isLatestResponseCorrect(question, latestResponse);
      if (correct === null) return;
      gradedCount += 1;
      if (correct) correctCount += 1;
    });

    const first = normalizeAnswerValue(student.firstname);
    const last = normalizeAnswerValue(student.lastname);
    const fullName = `${first} ${last}`.trim();
    const displayName = fullName || student.email || 'Unknown Student';
    const joinedAtMillis = student.joinedAt ? new Date(student.joinedAt).getTime() : NaN;

    return {
      ...student,
      displayName,
      avatarSrc: student.profileThumbnail || student.profileImage || '',
      sortLastName: last,
      sortFirstName: first,
      sortEmail: normalizeAnswerValue(student.email),
      inSessionValue: student.inSession ? 1 : 0,
      participationValue: Number(student.participation) || 0,
      percentCorrectValue: gradedCount > 0 ? Math.round((1000 * correctCount) / gradedCount) / 10 : null,
      joinedAtValue: Number.isFinite(joinedAtMillis) ? joinedAtMillis : null,
    };
  }), [studentResults, questions]);

  const handleStudentsSort = useCallback((field) => {
    setStudentSort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      const defaultDirection = ['participation', 'percentCorrect'].includes(field) ? 'desc' : 'asc';
      return { field, direction: defaultDirection };
    });
  }, []);

  const sortedStudentsTabRows = useMemo(() => {
    const compareNullableNumber = (a, b) => {
      const aFinite = Number.isFinite(a);
      const bFinite = Number.isFinite(b);
      if (!aFinite && !bFinite) return 0;
      if (!aFinite) return 1;
      if (!bFinite) return -1;
      return a - b;
    };

    const query = normalizeAnswerValue(studentSearch).toLowerCase();
    const rows = studentsTabRows.filter((row) => {
      if (!query) return true;
      const haystack = [
        row.sortFirstName,
        row.sortLastName,
        row.displayName,
        row.sortEmail,
      ]
        .map((value) => normalizeAnswerValue(value).toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (studentSort.field === 'participation') {
        cmp = compareNullableNumber(a.participationValue, b.participationValue);
      } else if (studentSort.field === 'percentCorrect') {
        cmp = compareNullableNumber(a.percentCorrectValue, b.percentCorrectValue);
      } else if (studentSort.field === 'joinedAt') {
        cmp = compareNullableNumber(a.joinedAtValue, b.joinedAtValue);
      } else if (studentSort.field === 'inSession') {
        cmp = compareNullableNumber(a.inSessionValue, b.inSessionValue);
      } else if (studentSort.field === 'email') {
        cmp = normalizeAnswerValue(a.sortEmail).localeCompare(normalizeAnswerValue(b.sortEmail));
      } else {
        cmp = normalizeAnswerValue(a.sortLastName).localeCompare(normalizeAnswerValue(b.sortLastName));
        if (cmp === 0) {
          cmp = normalizeAnswerValue(a.sortFirstName).localeCompare(normalizeAnswerValue(b.sortFirstName));
        }
        if (cmp === 0) {
          cmp = normalizeAnswerValue(a.sortEmail).localeCompare(normalizeAnswerValue(b.sortEmail));
        }
      }
      return studentSort.direction === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [studentsTabRows, studentSort, studentSearch]);

  const studentSearchOptions = useMemo(() => {
    const options = new Set();
    studentsTabRows.forEach((row) => {
      if (row.displayName) options.add(row.displayName);
      if (row.sortEmail) options.add(row.sortEmail);
    });
    return [...options].sort((a, b) => a.localeCompare(b));
  }, [studentsTabRows]);

  // ---- CSV export ----

  const handleExportCsv = useCallback(() => {
    if (!csvQuestionAttempts.length || !studentResults.length) return;

    const headers = ['Last Name', 'First Name', 'Email', 'Participation'];
    csvQuestionAttempts.forEach(({ questionNumber, attempts }) => {
      if (attempts.length <= 1) {
        headers.push(`Q${questionNumber} Response`);
        headers.push(`Q${questionNumber} Points`);
        return;
      }
      attempts.forEach((attemptNumber) => {
        headers.push(`Q${questionNumber} Attempt ${attemptNumber} Response`);
        headers.push(`Q${questionNumber} Attempt ${attemptNumber} Points`);
      });
    });

    const rows = studentResults.map((student) => {
      const questionResultsById = new Map(
        (student.questionResults || []).map((result) => [String(result.questionId), result]),
      );

      const row = [
        escapeCsvCell(student.lastname),
        escapeCsvCell(student.firstname),
        escapeCsvCell(student.email),
        escapeCsvCell(formatParticipation(student.participation)),
      ];

      csvQuestionAttempts.forEach(({ question, attempts }) => {
        const qr = questionResultsById.get(String(question._id));
        const responsesByAttempt = new Map();
        (qr?.responses || []).forEach((response) => {
          const attemptNumber = Number(response?.attempt);
          const normalizedAttempt = Number.isInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1;
          const current = responsesByAttempt.get(normalizedAttempt);
          if (!current) {
            responsesByAttempt.set(normalizedAttempt, response);
            return;
          }
          const currentTime = current?.createdAt ? new Date(current.createdAt).getTime() : 0;
          const nextTime = response?.createdAt ? new Date(response.createdAt).getTime() : 0;
          if (nextTime >= currentTime) {
            responsesByAttempt.set(normalizedAttempt, response);
          }
        });

        attempts.forEach((attemptNumber) => {
          const attemptResponse = responsesByAttempt.get(attemptNumber);
          if (!attemptResponse) {
            row.push(escapeCsvCell(''));
            row.push(escapeCsvCell(''));
            return;
          }

          let answerText = attemptResponse?.answer ?? '';
          const normType = normalizeQuestionType(question);
          if (
            [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT]
              .includes(normType) && question.options
          ) {
            answerText = collectAnswerEntries(answerText)
              .map((entry) => {
                const idx = resolveOptionIndex(entry, question.options);
                return idx >= 0 ? OPTION_LETTERS[idx] : entry;
              })
              .join(', ');
          } else if (answerText && typeof answerText === 'object') {
            try {
              answerText = JSON.stringify(answerText);
            } catch {
              answerText = String(answerText);
            }
          }

          row.push(escapeCsvCell(answerText));
          row.push(escapeCsvCell(attemptResponse?.points ?? attemptResponse?.mark ?? ''));
        });
      });

      return row.join(',');
    });

    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const filename = `${(session?.name || 'session').replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
    downloadCsv(filename, csvContent);
  }, [csvQuestionAttempts, studentResults, session?.name]);

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
          onClick={() => navigate(backToCoursePath)}
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
          onClick={() => navigate(backToCoursePath)}
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Button
            size="small"
            startIcon={<BackIcon />}
            onClick={() => navigate(backToCoursePath)}
          >
            Back to course
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => navigate(editSessionPath, { state: { returnTab: resolvedReturnTab, returnTo: 'review' } })}
          >
            Edit session
          </Button>
        </Box>
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
          <Typography variant="caption" color="text.secondary">Joined Session</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{joinedStudents}/{totalStudents}</Typography>
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
      {reviewableWarning ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {reviewableWarning}
        </Alert>
      ) : null}
      {hasOutstandingManualGrading ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {`There ${gradingNeedsSummary.questions === 1 ? 'is' : 'are'} ${gradingNeedsSummary.questions} ungraded question${gradingNeedsSummary.questions === 1 ? '' : 's'}, affecting ${gradingNeedsSummary.students} student${gradingNeedsSummary.students === 1 ? '' : 's'} (${gradingNeedsSummary.marks} mark${gradingNeedsSummary.marks === 1 ? '' : 's'}).`}
        </Alert>
      ) : null}

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, newTab) => setTab(newTab)}
        aria-label="Session review tabs"
      >
        <Tab label="Results" />
        <Tab label="Response Data" />
        <Tab label="Students" />
        <Tab
          label={(
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <span>Grading</span>
              {hasOutstandingManualGrading && (
                <Chip size="small" color="error" label={`Needs grading (${gradingNeedsSummary.marks})`} />
              )}
            </Box>
          )}
          sx={hasOutstandingManualGrading ? { color: 'error.main !important', fontWeight: 700 } : undefined}
        />
      </Tabs>

      {/* Questions tab – all questions shown at once with inline stats */}
      <TabPanel value={tab} index={0}>
        {totalQuestions === 0 ? (
          <Alert severity="info">This session has no questions.</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {questionAttemptRows.map((row) => {
              const q = row.question;
              const qT = row.qType;
              const isOptionType = row.isOptionType;

              return (
                <Paper key={row.key} variant="outlined" sx={{ p: 2.5 }}>
                  {/* Question header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Q{row.questionNumber}
                    </Typography>
                    {row.attemptTotal > 1 && (
                      <Chip
                        label={`Attempt ${row.attemptIndex}/${row.attemptTotal}`}
                        size="small"
                        variant="outlined"
                        sx={COMPACT_CHIP_SX}
                      />
                    )}
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
                      label={`${row.responseCount || 0} response${row.responseCount !== 1 ? 's' : ''}`}
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
                  {isOptionType && row.chartData && (
                    <Box sx={{ mb: 1 }}>
                      <DistributionBars
                        data={row.chartData}
                        highlightCorrect
                        correctIndices={row.correctIndices}
                        options={q.options}
                        responseCount={row.responseCount}
                      />
                    </Box>
                  )}

                  {/* Fallback: show options without stats for types that don't have chart data */}
                  {isOptionType && !row.chartData && (q.options || []).length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
                      {(q.options || []).map((opt, i) => {
                        const isCorrect = isCorrectOption(opt);
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
                              <RichContent html={optionDisplayHtml(opt)} />
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
                  <TableCell component="th" scope="col" sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell component="th" scope="col" sx={{ fontWeight: 700 }}>Email</TableCell>
                  <TableCell component="th" scope="col" sx={{ fontWeight: 700 }} align="center">Participation</TableCell>
                  {questions.map((_, i) => (
                    <TableCell key={i} component="th" scope="col" sx={{ fontWeight: 700 }} align="center">
                      Q{i + 1}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {studentResults.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell component="th" scope="row">
                      {student.lastname}, {student.firstname}
                    </TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell align="center">
                      {formatParticipation(student.participation)}
                    </TableCell>
                    {questions.map((q, qi) => {
                      const qr = (student.questionResults || []).find(
                        (r) => String(r.questionId) === String(q._id),
                      );
                      if (!qr || !qr.responses || !qr.responses.length) {
                        return (
                          <TableCell key={qi} align="center">
                            <Typography variant="body2" color="text.secondary">—</Typography>
                          </TableCell>
                        );
                      }
                      const lastResponse = getLatestResponse(qr.responses);
                      let display = lastResponse?.answer ?? '—';
                      const normType = normalizeQuestionType(q);

                      if (
                        [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT]
                          .includes(normType) && q.options
                      ) {
                        display = collectAnswerEntries(display)
                          .map((a) => {
                            const idx = resolveOptionIndex(a, q.options);
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

      {/* Students tab */}
      <TabPanel value={tab} index={2}>
        {sortedStudentsTabRows.length === 0 ? (
          <Alert severity="info">No students are available for this session.</Alert>
        ) : (
          <>
            <Autocomplete
              freeSolo
              options={studentSearchOptions}
              value={studentSearch}
              onInputChange={(_, value) => setStudentSearch(value || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search students"
                  placeholder="Name or email"
                  size="small"
                />
              )}
              sx={{ mb: 1.5, maxWidth: 420 }}
            />
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" aria-label="Session student list">
                <TableHead>
                  <TableRow>
                    <TableCell component="th" scope="col" sx={{ fontWeight: 700 }}>
                      <TableSortLabel
                        active={studentSort.field === 'name'}
                        direction={studentSort.field === 'name' ? studentSort.direction : 'asc'}
                        onClick={() => handleStudentsSort('name')}
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell component="th" scope="col" sx={{ fontWeight: 700 }}>
                      <TableSortLabel
                        active={studentSort.field === 'email'}
                        direction={studentSort.field === 'email' ? studentSort.direction : 'asc'}
                        onClick={() => handleStudentsSort('email')}
                      >
                        Email
                      </TableSortLabel>
                    </TableCell>
                    <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                      <TableSortLabel
                        active={studentSort.field === 'inSession'}
                        direction={studentSort.field === 'inSession' ? studentSort.direction : 'asc'}
                        onClick={() => handleStudentsSort('inSession')}
                      >
                        In Session
                      </TableSortLabel>
                    </TableCell>
                    <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                      <TableSortLabel
                        active={studentSort.field === 'participation'}
                        direction={studentSort.field === 'participation' ? studentSort.direction : 'asc'}
                        onClick={() => handleStudentsSort('participation')}
                      >
                        Participation
                      </TableSortLabel>
                    </TableCell>
                    <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                      <TableSortLabel
                        active={studentSort.field === 'percentCorrect'}
                        direction={studentSort.field === 'percentCorrect' ? studentSort.direction : 'asc'}
                        onClick={() => handleStudentsSort('percentCorrect')}
                      >
                        Percent Correct
                      </TableSortLabel>
                    </TableCell>
                    <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                      <TableSortLabel
                        active={studentSort.field === 'joinedAt'}
                        direction={studentSort.field === 'joinedAt' ? studentSort.direction : 'asc'}
                        onClick={() => handleStudentsSort('joinedAt')}
                      >
                        Joined Session
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedStudentsTabRows.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell component="th" scope="row">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar src={student.avatarSrc} sx={{ width: 30, height: 30 }}>
                            {buildStudentInitials(student)}
                          </Avatar>
                          <Typography variant="body2">{student.displayName}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{student.email || '—'}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={student.inSession ? 'Yes' : 'No'}
                          color={student.inSession ? 'success' : 'default'}
                          size="small"
                          variant={student.inSession ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="center">{formatParticipation(student.participationValue)}</TableCell>
                      <TableCell align="center">{formatPercent(student.percentCorrectValue)}</TableCell>
                      <TableCell align="center">{formatJoinedAt(student.joinedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </TabPanel>

      {/* Grading tab */}
      <TabPanel value={tab} index={3}>
        <SessionQuestionGradingPanel
          sessionId={sessionId}
          session={session}
          questions={questions}
          studentResults={studentResults}
          onUngradedSummaryChange={handleUngradedSummaryChange}
        />
      </TabPanel>
    </Box>
  );
}
