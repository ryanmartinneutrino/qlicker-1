import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress, Chip, Collapse,
  Switch, FormControlLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, LinearProgress, TextField, Autocomplete,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import {
  QUESTION_TYPES,
  TYPE_COLORS,
  getQuestionTypeLabel,
  buildQuestionProgressList,
  isOptionBasedQuestionType,
  isSlideType,
  normalizeQuestionType,
} from '../../components/questions/constants';
import {
  normalizeStoredHtml,
  prepareRichTextInput,
  renderKatexInElement,
} from '../../components/questions/richTextUtils';
import SessionQuestionGradingPanel from '../../components/grades/SessionQuestionGradingPanel';
import SessionChatPanel from '../../components/live/SessionChatPanel';
import WordCloudPanel from '../../components/questions/WordCloudPanel';
import HistogramPanel from '../../components/questions/HistogramPanel';
import BackLinkButton from '../../components/common/BackLinkButton';
import StudentIdentity from '../../components/common/StudentIdentity';
import ResponsiveTabsNavigation from '../../components/common/ResponsiveTabsNavigation';
import { buildCourseTitle } from '../../utils/courseTitle';
import { getLatestResponse, sortResponsesNewestFirst } from '../../utils/responses';
import { toggleSessionReviewable } from '../../utils/reviewableToggle';

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

function buildStudentDisplayName(student, fallbackName) {
  const first = normalizeAnswerValue(student?.firstname);
  const last = normalizeAnswerValue(student?.lastname);
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  const email = normalizeAnswerValue(student?.email);
  if (email) return email;
  return fallbackName;
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

function getOptionRichContentProps(option) {
  return {
    html: normalizeStoredHtml(option?.content || ''),
    fallback: option?.plainText || option?.text || option?.label || option?.value || option?.option || option?.answer || '',
  };
}

function collectAttemptNumbersForQuestion(question, studentResults = []) {
  const attemptNumbers = new Set();

  (question?.sessionOptions?.attempts || []).forEach((attempt) => {
    const number = Number(attempt?.number);
    if (Number.isInteger(number) && number > 0) {
      attemptNumbers.add(number);
    }
  });

  (question?.sessionOptions?.attemptStats || []).forEach((attempt) => {
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

function buildGradesByStudentId(grades = []) {
  return Object.fromEntries(
    (grades || [])
      .filter((grade) => grade?.userId)
      .map((grade) => [String(grade.userId), grade])
  );
}

function getStudentQuestionPoints(gradesByStudentId = {}, studentId, questionId, response = null) {
  const grade = gradesByStudentId[String(studentId)];
  const mark = (grade?.marks || []).find((entry) => String(entry?.questionId) === String(questionId));
  const markPoints = Number(mark?.points);
  if (Number.isFinite(markPoints)) return markPoints;

  const responsePoints = Number(response?.points ?? response?.mark);
  if (Number.isFinite(responsePoints)) return responsePoints;

  return null;
}

function formatAnswerText(question, answer) {
  let answerText = answer ?? '';
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

  return String(answerText || '');
}

export function buildSessionResultsCsv({
  csvQuestionAttempts,
  gradesByStudentId,
  sessionName,
  studentResults,
  visibleStudents = [],
  t,
}) {
  const orderedStudents = visibleStudents.length > 0
    ? visibleStudents
    : studentResults;
  if (!csvQuestionAttempts.length || !orderedStudents.length) return null;

  const studentResultsById = new Map(
    studentResults.map((student) => [String(student?.studentId || ''), student]),
  );

  const headers = [
    t('professor.sessionReview.csvLastName'),
    t('professor.sessionReview.csvFirstName'),
    t('professor.sessionReview.csvEmail'),
    t('professor.sessionReview.grade'),
    t('professor.sessionReview.inSession'),
    t('professor.sessionReview.csvParticipation'),
    t('professor.sessionReview.percentCorrect'),
    t('professor.sessionReview.joinedSession'),
  ];
  csvQuestionAttempts.forEach(({ questionNumber, attempts }) => {
    if (attempts.length <= 1) {
      headers.push(t('professor.sessionReview.csvResponse', { number: questionNumber }));
      headers.push(t('professor.sessionReview.csvPoints', { number: questionNumber }));
      return;
    }
    attempts.forEach((attemptNumber) => {
      headers.push(t('professor.sessionReview.csvAttemptResponse', { number: questionNumber, attempt: attemptNumber }));
      headers.push(t('professor.sessionReview.csvAttemptPoints', { number: questionNumber, attempt: attemptNumber }));
    });
  });

  const rows = orderedStudents.map((visibleStudent) => {
    const student = studentResultsById.get(String(visibleStudent?.studentId || ''));
    if (!student) return null;
    const questionResultsById = new Map(
      (student.questionResults || []).map((result) => [String(result.questionId), result]),
    );
    const gradeValue = gradesByStudentId[String(student.studentId)]?.value;

    const row = [
      escapeCsvCell(student.lastname),
      escapeCsvCell(student.firstname),
      escapeCsvCell(student.email),
      escapeCsvCell(formatPercent(gradeValue)),
      escapeCsvCell(student.inSession ? t('common.yes') : t('common.no')),
      escapeCsvCell(formatParticipation(student.participation)),
      escapeCsvCell(formatPercent(visibleStudent?.percentCorrectValue)),
      escapeCsvCell(formatJoinedAt(student.joinedAt)),
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

        const answerText = formatAnswerText(question, attemptResponse?.answer);
        const points = getStudentQuestionPoints(
          gradesByStudentId,
          student.studentId,
          question._id,
          attemptResponse
        );

        row.push(escapeCsvCell(answerText));
        row.push(escapeCsvCell(points ?? ''));
      });
    });

    return row.join(',');
  }).filter(Boolean);

  return {
    csvContent: [headers.map(escapeCsvCell).join(','), ...rows].join('\n'),
    filename: `${(sessionName || 'session').replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`,
  };
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
function RichContent({ html, fallback, allowVideoEmbeds = false }) {
  const ref = useRef(null);
  const prepared = prepareRichTextInput(
    html || '',
    fallback || '',
    { allowVideoEmbeds }
  );

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
  const { t } = useTranslation();
  if (!data || !data.length) {
    return <Typography variant="body2" color="text.secondary">{t('professor.sessionReview.noResponsesYet')}</Typography>;
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
        const optionContent = getOptionRichContentProps(options?.[i]);
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
                  html={optionContent.html}
                  fallback={optionContent.fallback}
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
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [course, setCourse] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [studentResults, setStudentResults] = useState([]);
  const [chatPosts, setChatPosts] = useState([]);
  const [tab, setTab] = useState(0);
  const [togglingReviewable, setTogglingReviewable] = useState(false);
  const [reviewableWarning, setReviewableWarning] = useState('');
  const [gradingNeedsSummary, setGradingNeedsSummary] = useState({ marks: 0, students: 0, questions: 0 });
  const [studentSort, setStudentSort] = useState({ field: 'name', direction: 'asc' });
  const [studentSearch, setStudentSearch] = useState('');
  const [gradesByStudentId, setGradesByStudentId] = useState({});
  const [groupCategories, setGroupCategories] = useState([]);
  const [selectedCatIdx, setSelectedCatIdx] = useState(-1);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(-1);
  const [expandedSARows, setExpandedSARows] = useState({});
  const [expandedNURows, setExpandedNURows] = useState({});
  const [wordCloudByRow, setWordCloudByRow] = useState({});
  const [histogramByRow, setHistogramByRow] = useState({});
  const requestedReturnTab = Number.parseInt(searchParams.get('returnTab') || '', 10);
  const resolvedReturnTab = Number.isInteger(requestedReturnTab) && requestedReturnTab >= 0 ? requestedReturnTab : 0;
  const backToCoursePath = resolvedReturnTab > 0
    ? `/prof/course/${courseId}?tab=${resolvedReturnTab}`
    : `/prof/course/${courseId}`;
  const editSessionParams = new URLSearchParams();
  if (resolvedReturnTab > 0) {
    editSessionParams.set('returnTab', String(resolvedReturnTab));
  }
  editSessionParams.set('returnTo', 'review');
  const editSessionPath = `/prof/course/${courseId}/session/${sessionId}?${editSessionParams.toString()}`;

  // ---- Data fetching ----

  const fetchResults = useCallback(async () => {
    try {
      const [{ data }, courseResponse] = await Promise.all([
        apiClient.get(`/sessions/${sessionId}/results`),
        apiClient.get(`/courses/${courseId}`).catch(() => ({ data: null })),
      ]);
      setSession(data.session);
      setCourse(courseResponse?.data?.course || courseResponse?.data || null);
      setQuestions(data.questions || []);
      setStudentResults(data.studentResults || []);
      setChatPosts(data.chatPosts || []);

      try {
        const gradesRes = await apiClient.get(`/sessions/${sessionId}/grades`);
        const grades = gradesRes.data?.grades || [];
        const summary = summarizeUngradedMarks(grades);
        setGradesByStudentId(buildGradesByStudentId(grades));
        setGradingNeedsSummary(summary);
      } catch {
        setGradesByStudentId({});
        setGradingNeedsSummary({ marks: 0, students: 0, questions: 0 });
      }

      setError(null);
    } catch (err) {
      const msg = err.response?.data?.message || t('professor.sessionReview.failedToLoadResults');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [courseId, sessionId, t]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // ---- Fetch group categories for filtering ----
  useEffect(() => {
    if (!courseId) return;
    apiClient.get(`/courses/${courseId}/groups`)
      .then(({ data }) => setGroupCategories(data.groupCategories || []))
      .catch(() => setGroupCategories([]));
  }, [courseId]);

  // ---- Toggle reviewable ----

  const handleToggleReviewable = useCallback(async (checked) => {
    setTogglingReviewable(true);
    try {
      const data = await toggleSessionReviewable({
        apiClient,
        sessionId,
        reviewable: checked,
      });
      const updatedSession = data.session || data;
      const warnings = data.grading?.warnings || [];
      setSession((prev) => (prev ? { ...prev, ...updatedSession } : prev));
      setReviewableWarning(warnings.join(' '));
    } catch (err) {
      setReviewableWarning(err.response?.data?.message || t('professor.sessionReview.failedToUpdateReviewable'));
    } finally {
      setTogglingReviewable(false);
    }
  }, [sessionId, t]);

  // ---- Summary stats ----

  const totalQuestions = questions.length;
  const progressList = useMemo(() => buildQuestionProgressList(questions), [questions]);
  const totalStudents = studentResults.length;
  const courseTitle = course?._id ? buildCourseTitle(course, 'long') : '';
  const courseSection = normalizeAnswerValue(course?.section);
  const joinedStudents = useMemo(() => {
    return studentResults.filter((student) => !!student?.inSession).length;
  }, [studentResults]);

  const hasOutstandingManualGrading = gradingNeedsSummary.marks > 0;
  const liveInteractiveSession = session?.status === 'running' && !session?.quiz && !session?.practiceQuiz;
  const sessionChatAvailable = !!session?.chatEnabled || chatPosts.length > 0;

  // ---- Group-filtered student results for grading tab ----
  const selectedGroupCat = groupCategories[selectedCatIdx] || null;
  const selectedGroupObj = selectedGroupCat ? (selectedGroupCat.groups || [])[selectedGroupIdx] : null;
  const groupFilteredStudentResults = useMemo(() => {
    if (!selectedGroupObj) return studentResults;
    const memberSet = new Set(selectedGroupObj.members || []);
    return studentResults.filter((s) => memberSet.has(s.studentId));
  }, [studentResults, selectedGroupObj]);

  const handleUngradedSummaryChange = useCallback((summary) => {
    if (!summary || typeof summary !== 'object') return;
    setGradingNeedsSummary({
      marks: Number(summary.marks) || 0,
      students: Number(summary.students) || 0,
      questions: Number(summary.questions) || 0,
    });
  }, []);

  const toggleSARow = useCallback((rowKey) => {
    setExpandedSARows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  }, []);

  const toggleNURow = useCallback((rowKey) => {
    setExpandedNURows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  }, []);

  const handleGenerateWordCloudForQuestion = useCallback(async (questionId, rowKey) => {
    const stopWords = t('stopWords', { returnObjects: true });
    const payload = Array.isArray(stopWords) ? { stopWords } : {};
    try {
      const res = await apiClient.post(`/questions/${questionId}/word-cloud`, payload);
      if (res.data?.wordCloudData) {
        setWordCloudByRow((prev) => ({ ...prev, [rowKey]: res.data.wordCloudData }));
      }
    } catch {
      // silently fail — user can retry
    }
  }, [t]);

  const handleGenerateHistogramForQuestion = useCallback(async (questionId, rowKey, opts = {}) => {
    try {
      const res = await apiClient.post(`/questions/${questionId}/histogram`, opts);
      if (res.data?.histogramData) {
        setHistogramByRow((prev) => ({ ...prev, [rowKey]: res.data.histogramData }));
      }
    } catch {
      // silently fail — user can retry
    }
  }, []);

  // ---- Stats data for ALL questions / attempts ----

  const studentNameById = useMemo(() => {
    const names = new Map();
    studentResults.forEach((student) => {
      names.set(
        String(student?.studentId || ''),
        buildStudentDisplayName(student, t('professor.sessionReview.unknownStudent'))
      );
    });
    return names;
  }, [studentResults, t]);

  const questionAttemptRows = useMemo(() => questions.flatMap((q, qi) => {
    const qType = normalizeQuestionType(q);
    const isOptionType = isOptionBasedQuestionType(qType) || qType === QUESTION_TYPES.TRUE_FALSE;

    const responsesByAttempt = new Map();
    const attemptNumbers = new Set(collectAttemptNumbersForQuestion(q, studentResults));
    const attemptStatsByNumber = new Map(
      (q?.sessionOptions?.attemptStats || [])
        .map((attempt) => [Number(attempt?.number), attempt])
        .filter(([number]) => Number.isInteger(number) && number > 0)
    );

    studentResults.forEach((student) => {
      const qr = (student.questionResults || []).find(
        (result) => String(result.questionId) === String(q._id),
      );
      if (!qr?.responses?.length) return;
      const studentName = buildStudentDisplayName(student, t('professor.sessionReview.unknownStudent'));

      qr.responses.forEach((response) => {
        const attemptNumber = Number(response?.attempt);
        const normalizedAttempt = Number.isInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1;
        attemptNumbers.add(normalizedAttempt);
        if (!responsesByAttempt.has(normalizedAttempt)) {
          responsesByAttempt.set(normalizedAttempt, []);
        }
        responsesByAttempt.get(normalizedAttempt).push({
          ...response,
          studentName,
        });
      });
    });

    const sortedAttempts = [...new Set([
      ...attemptNumbers,
      ...attemptStatsByNumber.keys(),
    ])].sort((a, b) => a - b);

    const correctIndices = (q.options || []).reduce((acc, option, idx) => {
      if (isCorrectOption(option)) acc.push(idx);
      return acc;
    }, []);

    return sortedAttempts.map((attemptNumber, attemptIndex) => {
      const cachedAttemptStats = attemptStatsByNumber.get(attemptNumber) || null;
      const attemptResponses = responsesByAttempt.get(attemptNumber) || [];
      const distribution = isOptionType && q.options ? q.options.map((_, optionIndex) => {
        const cachedEntry = Array.isArray(cachedAttemptStats?.distribution)
          ? cachedAttemptStats.distribution.find((entry) => Number(entry?.index) === optionIndex)
          : null;
        return Number(cachedEntry?.count || 0);
      }) : [];

      if (!cachedAttemptStats && isOptionType && q.options) {
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

      const saResponses = qType === QUESTION_TYPES.SHORT_ANSWER
        ? sortResponsesNewestFirst(
          Array.isArray(cachedAttemptStats?.answers) && cachedAttemptStats.answers.length > 0
            ? cachedAttemptStats.answers.map((response) => ({
              answer: response?.answer,
              answerWysiwyg: response?.answerWysiwyg,
              createdAt: response?.createdAt,
              updatedAt: response?.updatedAt,
              studentName: studentNameById.get(String(response?.studentUserId || '')) || t('professor.sessionReview.unknownStudent'),
            }))
            : attemptResponses.map((response) => ({
              answer: response?.answer,
              answerWysiwyg: response?.answerWysiwyg,
              createdAt: response?.createdAt,
              updatedAt: response?.updatedAt,
              studentName: response?.studentName || t('professor.sessionReview.unknownStudent'),
            }))
        )
        : null;

      const nuResponses = qType === QUESTION_TYPES.NUMERICAL
        ? (
          Array.isArray(cachedAttemptStats?.answers) && cachedAttemptStats.answers.length > 0
            ? cachedAttemptStats.answers.map((response) => ({
              answer: response?.answer,
              studentName: studentNameById.get(String(response?.studentUserId || '')) || t('professor.sessionReview.unknownStudent'),
            }))
            : attemptResponses.map((response) => ({
              answer: response?.answer,
              studentName: response?.studentName || t('professor.sessionReview.unknownStudent'),
            }))
        )
        : null;

      return {
        key: `${String(q._id || qi)}-attempt-${attemptNumber}`,
        question: q,
        questionNumber: qi + 1,
        progress: progressList[qi] || null,
        attemptNumber,
        attemptIndex: attemptIndex + 1,
        attemptTotal: sortedAttempts.length,
        qType,
        isOptionType,
        chartData,
        correctIndices,
        responseCount: cachedAttemptStats ? Number(cachedAttemptStats.total || 0) : attemptResponses.length,
        saResponses,
        nuResponses,
      };
    });
  }), [progressList, questions, studentNameById, studentResults, t]);

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
    const questionCells = {};
    questions.forEach((question) => {
      const qr = questionResultsById.get(String(question._id));
      const latestResponse = getLatestResponse(qr?.responses || []);
      const responseDisplay = latestResponse ? (formatAnswerText(question, latestResponse?.answer) || '—') : '—';
      const responsePoints = latestResponse
        ? getStudentQuestionPoints(gradesByStudentId, student.studentId, question._id, latestResponse)
        : null;
      questionCells[String(question._id)] = {
        display: responseDisplay,
        sortDisplay: normalizeComparableText(responseDisplay),
        pointsValue: Number.isFinite(Number(responsePoints)) ? Number(responsePoints) : null,
        hasResponse: !!latestResponse,
      };
      if (!latestResponse) return;
      const correct = isLatestResponseCorrect(question, latestResponse);
      if (correct === null) return;
      gradedCount += 1;
      if (correct) correctCount += 1;
    });

    const first = normalizeAnswerValue(student.firstname);
    const last = normalizeAnswerValue(student.lastname);
    const fullName = `${first} ${last}`.trim();
    const displayName = fullName || student.email || t('professor.sessionReview.unknownStudent');
    const joinedAtMillis = student.joinedAt ? new Date(student.joinedAt).getTime() : NaN;
    const gradeValue = Number(gradesByStudentId[String(student.studentId)]?.value);

    return {
      ...student,
      displayName,
      avatarSrc: student.profileThumbnail || student.profileImage || '',
      sortLastName: last,
      sortFirstName: first,
      sortEmail: normalizeAnswerValue(student.email),
      inSessionValue: student.inSession ? 1 : 0,
      gradeValue: Number.isFinite(gradeValue) ? gradeValue : null,
      participationValue: Number(student.participation) || 0,
      percentCorrectValue: gradedCount > 0 ? Math.round((1000 * correctCount) / gradedCount) / 10 : null,
      joinedAtValue: Number.isFinite(joinedAtMillis) ? joinedAtMillis : null,
      questionCells,
    };
  }), [gradesByStudentId, questions, studentResults, t]);

  const handleStudentsSort = useCallback((field) => {
    setStudentSort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      const defaultDirection = ['grade', 'participation', 'percentCorrect'].includes(field) ? 'desc' : 'asc';
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
    const compareQuestionCell = (a, b) => {
      if (!a?.hasResponse && !b?.hasResponse) return 0;
      if (!a?.hasResponse) return 1;
      if (!b?.hasResponse) return -1;
      const textCompare = normalizeAnswerValue(a?.sortDisplay).localeCompare(normalizeAnswerValue(b?.sortDisplay));
      if (textCompare !== 0) return textCompare;
      return compareNullableNumber(a?.pointsValue, b?.pointsValue);
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
      } else if (studentSort.field === 'grade') {
        cmp = compareNullableNumber(a.gradeValue, b.gradeValue);
      } else if (studentSort.field === 'percentCorrect') {
        cmp = compareNullableNumber(a.percentCorrectValue, b.percentCorrectValue);
      } else if (studentSort.field === 'joinedAt') {
        cmp = compareNullableNumber(a.joinedAtValue, b.joinedAtValue);
      } else if (studentSort.field === 'inSession') {
        cmp = compareNullableNumber(a.inSessionValue, b.inSessionValue);
      } else if (studentSort.field.startsWith('question:')) {
        const questionId = studentSort.field.slice('question:'.length);
        cmp = compareQuestionCell(a.questionCells?.[questionId], b.questionCells?.[questionId]);
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
    const csvExport = buildSessionResultsCsv({
      csvQuestionAttempts,
      gradesByStudentId,
      sessionName: session?.name,
      studentResults,
      visibleStudents: sortedStudentsTabRows,
      t,
    });
    if (!csvExport) return;

    downloadCsv(csvExport.filename, csvExport.csvContent);
  }, [csvQuestionAttempts, gradesByStudentId, sortedStudentsTabRows, studentResults, session?.name, t]);

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
        <BackLinkButton variant="outlined" label={t('professor.sessionReview.backToCourse')} onClick={() => navigate(backToCoursePath)} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5, maxWidth: 1120 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <BackLinkButton label={t('professor.sessionReview.backToCourse')} onClick={() => navigate(backToCoursePath)} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => navigate(editSessionPath, { state: { returnTab: resolvedReturnTab, returnTo: 'review' } })}
          >
            {t('professor.sessionReview.editSession')}
          </Button>
        </Box>
        {courseTitle ? (
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
            {courseTitle}
          </Typography>
        ) : null}
        {courseSection ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('professor.course.sectionHeader', { section: courseSection })}
          </Typography>
        ) : null}
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {session?.name || t('professor.sessionReview.sessionReview')}
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
          <Typography variant="caption" color="text.secondary">{t('professor.sessionReview.questions')}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{totalQuestions}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 110, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">{t('professor.sessionReview.joinedSession')}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('professor.sessionReview.joinedCount', { joined: joinedStudents, total: totalStudents })}</Typography>
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
          label={t('professor.sessionReview.studentsCanReview')}
          aria-label={t('professor.sessionReview.toggleReview')}
        />

      </Box>
      {reviewableWarning ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {reviewableWarning}
        </Alert>
      ) : null}
      {liveInteractiveSession ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('professor.sessionReview.liveResultsAvailableWhileRunning')}
        </Alert>
      ) : null}
      {hasOutstandingManualGrading ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('professor.sessionReview.ungradedSummary', {
            verb: gradingNeedsSummary.questions === 1 ? 'is' : 'are',
            questions: gradingNeedsSummary.questions,
            questionWord: gradingNeedsSummary.questions === 1 ? 'question' : 'questions',
            students: gradingNeedsSummary.students,
            studentWord: gradingNeedsSummary.students === 1 ? 'student' : 'students',
            marks: gradingNeedsSummary.marks,
            markWord: gradingNeedsSummary.marks === 1 ? 'mark' : 'marks',
          })}
        </Alert>
      ) : null}

      {/* Tabs */}
      <ResponsiveTabsNavigation
        value={tab}
        onChange={setTab}
        ariaLabel={t('professor.sessionReview.sessionReviewTabs')}
        dropdownLabel={t('common.view')}
        dropdownSx={{ mb: 1.5 }}
        tabs={[
          { value: 0, label: t('professor.sessionReview.results') },
          { value: 1, label: t('professor.sessionReview.responseData') },
          {
            value: 2,
            label: (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>{t('professor.sessionReview.grading')}</span>
                {hasOutstandingManualGrading && (
                  <Chip size="small" color="error" label={t('professor.sessionReview.needsGradingCount', { count: gradingNeedsSummary.marks })} />
                )}
              </Box>
            ),
            dropdownLabel: t('professor.sessionReview.grading'),
            tabProps: {
              sx: hasOutstandingManualGrading ? { color: 'error.main !important', fontWeight: 700 } : undefined,
            },
          },
          ...(sessionChatAvailable ? [{ value: 3, label: t('sessionChat.chat') }] : []),
        ]}
      />

      {/* Questions tab – all questions shown at once with inline stats */}
      <TabPanel value={tab} index={0}>
        {totalQuestions === 0 ? (
          <Alert severity="info">{t('professor.sessionReview.noQuestions')}</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {questionAttemptRows.map((row) => {
              const q = row.question;
              const qT = row.qType;
              const isOptionType = row.isOptionType;
              const isSlide = isSlideType(qT);

              return (
                <Paper key={row.key} variant="outlined" sx={{ p: 2.5 }}>
                  {/* Question header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    {row.progress && (
                      <>
                        <Chip
                          label={t('professor.sessionReview.pageProgress', {
                            current: row.progress.pageCurrent,
                            total: row.progress.pageTotal,
                          })}
                          size="small"
                          variant="outlined"
                          sx={COMPACT_CHIP_SX}
                        />
                        <Chip
                          label={t('professor.sessionReview.questionProgress', {
                            current: row.progress.questionCurrent,
                            total: row.progress.questionTotal,
                          })}
                          size="small"
                          variant="outlined"
                          sx={COMPACT_CHIP_SX}
                        />
                      </>
                    )}
                    {row.attemptTotal > 1 && (
                      <Chip
                        label={t('professor.sessionReview.attemptProgress', { current: row.attemptIndex, total: row.attemptTotal })}
                        size="small"
                        variant="outlined"
                        sx={COMPACT_CHIP_SX}
                      />
                    )}
                    <Chip
                      label={getQuestionTypeLabel(t, qT)}
                      color={TYPE_COLORS[qT] || 'default'}
                      size="small"
                      sx={COMPACT_CHIP_SX}
                    />
                    {!isSlide && q.sessionOptions?.points != null && (
                      <Chip
                        label={t('professor.sessionReview.pointsAbbrev', { count: q.sessionOptions.points })}
                        size="small"
                        variant="outlined"
                        sx={COMPACT_CHIP_SX}
                      />
                    )}
                    <Chip
                      label={t('professor.sessionReview.responseCountLabel', { count: row.responseCount || 0 })}
                      size="small"
                      variant="outlined"
                      sx={COMPACT_CHIP_SX}
                    />
                  </Box>

                  {/* Question content */}
                  <Box sx={{ mb: 2 }}>
                    <RichContent html={q.content} fallback={q.plainText} allowVideoEmbeds />
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
                        const optionContent = getOptionRichContentProps(opt);
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
                              <RichContent html={optionContent.html} fallback={optionContent.fallback} />
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>
                  )}

                  {/* Numerical correct answer */}
                  {qT === QUESTION_TYPES.NUMERICAL && q.correctNumerical != null && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('professor.sessionReview.correct', { value: q.correctNumerical })}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('professor.sessionReview.tolerance', { value: q.toleranceNumerical ?? 0 })}
                      </Typography>
                    </Box>
                  )}

                  {/* SA: expandable responses + word cloud */}
                  {qT === QUESTION_TYPES.SHORT_ANSWER && row.saResponses && row.saResponses.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => toggleSARow(row.key)}
                        startIcon={expandedSARows[row.key] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      >
                        {expandedSARows[row.key]
                          ? t('professor.sessionReview.hideResponses')
                          : t('professor.sessionReview.showResponses')}
                      </Button>
                      <Collapse in={!!expandedSARows[row.key]}>
                        <Box sx={{ mt: 1 }}>
                          <WordCloudPanel
                            wordCloudData={wordCloudByRow[row.key] || q.sessionOptions?.wordCloudData}
                            onGenerate={() => handleGenerateWordCloudForQuestion(q._id, row.key)}
                            showControls
                          />
                          <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                            {row.saResponses.map((r, idx) => (
                              <Paper key={idx} variant="outlined" sx={{ p: 1, mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                  {normalizeAnswerValue(r.studentName) || t('professor.sessionReview.unknownStudent')}
                                </Typography>
                                {r.answerWysiwyg ? (
                                  <RichContent html={r.answerWysiwyg} />
                                ) : (
                                  <Typography variant="body2">
                                    {normalizeAnswerValue(r.answer) || t('common.noAnswer')}
                                  </Typography>
                                )}
                              </Paper>
                            ))}
                          </Box>
                        </Box>
                      </Collapse>
                    </Box>
                  )}

                  {/* NU: expandable responses + histogram */}
                  {qT === QUESTION_TYPES.NUMERICAL && row.nuResponses && row.nuResponses.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => toggleNURow(row.key)}
                        startIcon={expandedNURows[row.key] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      >
                        {expandedNURows[row.key]
                          ? t('professor.sessionReview.hideResponses')
                          : t('professor.sessionReview.showResponses')}
                      </Button>
                      <Collapse in={!!expandedNURows[row.key]}>
                        <Box sx={{ mt: 1 }}>
                          <HistogramPanel
                            histogramData={histogramByRow[row.key] || q.sessionOptions?.histogramData}
                            onGenerate={(opts) => handleGenerateHistogramForQuestion(q._id, row.key, opts)}
                            showControls
                          />
                          <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                            {row.nuResponses.map((r, idx) => (
                              <Paper key={idx} variant="outlined" sx={{ p: 1, mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                  {normalizeAnswerValue(r.studentName) || t('professor.sessionReview.unknownStudent')}
                                </Typography>
                                <Typography variant="body2">
                                  {normalizeAnswerValue(r.answer) || t('common.noAnswer')}
                                </Typography>
                              </Paper>
                            ))}
                          </Box>
                        </Box>
                      </Collapse>
                    </Box>
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
          <Alert severity="info">{t('professor.sessionReview.noResults')}</Alert>
        ) : (
          <>
            <Box
              sx={{
                display: 'flex',
                gap: 1.5,
                mb: 1.5,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <Autocomplete
                freeSolo
                options={studentSearchOptions}
                value={studentSearch}
                onInputChange={(_, value) => setStudentSearch(value || '')}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('professor.sessionReview.searchStudents')}
                    placeholder={t('professor.sessionReview.nameOrEmail')}
                    size="small"
                  />
                )}
                sx={{ flex: '1 1 320px', maxWidth: 420 }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExportCsv}
                disabled={!sortedStudentsTabRows.length}
                aria-label={t('professor.sessionReview.exportResultsCSV')}
              >
                {t('professor.sessionReview.exportCSV')}
              </Button>
            </Box>

            {sortedStudentsTabRows.length === 0 ? (
              <Alert severity="info">{t('professor.sessionReview.noStudentsMatch')}</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table
                  size="small"
                  aria-label={t('professor.sessionReview.studentResults')}
                  sx={{ '& .MuiTableCell-root': { px: 0.65, py: 0.5 } }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell component="th" scope="col" sx={{ fontWeight: 700, minWidth: 220 }}>
                        <TableSortLabel
                          active={studentSort.field === 'name'}
                          direction={studentSort.field === 'name' ? studentSort.direction : 'asc'}
                          onClick={() => handleStudentsSort('name')}
                        >
                          {t('professor.sessionReview.name')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={studentSort.field === 'grade'}
                          direction={studentSort.field === 'grade' ? studentSort.direction : 'desc'}
                          onClick={() => handleStudentsSort('grade')}
                        >
                          {t('professor.sessionReview.grade')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={studentSort.field === 'inSession'}
                          direction={studentSort.field === 'inSession' ? studentSort.direction : 'asc'}
                          onClick={() => handleStudentsSort('inSession')}
                        >
                          {t('professor.sessionReview.inSession')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={studentSort.field === 'participation'}
                          direction={studentSort.field === 'participation' ? studentSort.direction : 'desc'}
                          onClick={() => handleStudentsSort('participation')}
                        >
                          {t('professor.sessionReview.participation')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={studentSort.field === 'percentCorrect'}
                          direction={studentSort.field === 'percentCorrect' ? studentSort.direction : 'desc'}
                          onClick={() => handleStudentsSort('percentCorrect')}
                        >
                          {t('professor.sessionReview.percentCorrect')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell component="th" scope="col" align="center" sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={studentSort.field === 'joinedAt'}
                          direction={studentSort.field === 'joinedAt' ? studentSort.direction : 'asc'}
                          onClick={() => handleStudentsSort('joinedAt')}
                        >
                          {t('professor.sessionReview.joinedSession')}
                        </TableSortLabel>
                      </TableCell>
                      {questions.map((_, i) => (
                        <TableCell key={i} component="th" scope="col" sx={{ fontWeight: 700 }} align="center">
                          <TableSortLabel
                            active={studentSort.field === `question:${String(questions[i]?._id || i)}`}
                            direction={studentSort.field === `question:${String(questions[i]?._id || i)}` ? studentSort.direction : 'asc'}
                            onClick={() => handleStudentsSort(`question:${String(questions[i]?._id || i)}`)}
                          >
                            Q{i + 1}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedStudentsTabRows.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell component="th" scope="row">
                          <StudentIdentity
                            student={student}
                            showEmail
                            avatarSize={30}
                            nameVariant="body2"
                            nameWeight={600}
                          />
                        </TableCell>
                        <TableCell align="center">
                          {formatPercent(student.gradeValue)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={student.inSession ? t('common.yes') : t('common.no')}
                            color={student.inSession ? 'success' : 'default'}
                            size="small"
                            variant={student.inSession ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell align="center">{formatParticipation(student.participationValue)}</TableCell>
                        <TableCell align="center">{formatPercent(student.percentCorrectValue)}</TableCell>
                        <TableCell align="center">{formatJoinedAt(student.joinedAt)}</TableCell>
                        {questions.map((q, qi) => {
                          const questionCell = student.questionCells?.[String(q._id)];
                          return (
                            <TableCell key={qi} align="center">
                              <Typography variant="body2">
                                {questionCell?.display || '—'}
                                {` (${questionCell?.pointsValue ?? '—'})`}
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
          </>
        )}
      </TabPanel>

      {/* Grading tab */}
      <TabPanel value={tab} index={2}>
        <SessionQuestionGradingPanel
          sessionId={sessionId}
          session={session}
          questions={questions.filter((question) => !isSlideType(normalizeQuestionType(question)))}
          studentResults={groupFilteredStudentResults}
          onSessionDataRefresh={fetchResults}
          onUngradedSummaryChange={handleUngradedSummaryChange}
          filterSlot={groupCategories.length > 0 ? (
            <>
              <TextField
                select
                size="small"
                label={t('professor.sessionReview.selectCategoryFilter')}
                value={selectedCatIdx >= 0 ? String(selectedCatIdx) : ''}
                onChange={(e) => {
                  const idx = e.target.value === '' ? -1 : Number(e.target.value);
                  setSelectedCatIdx(idx);
                  const cat = idx >= 0 ? groupCategories[idx] : null;
                  setSelectedGroupIdx(cat && cat.groups && cat.groups.length > 0 ? 0 : -1);
                }}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              >
                <option value="">{t('professor.sessionReview.allStudentsFilter')}</option>
                {groupCategories.map((cat, idx) => (
                  <option key={cat.categoryNumber} value={String(idx)}>{cat.categoryName}</option>
                ))}
              </TextField>
              {selectedGroupCat && (
                <TextField
                  select
                  size="small"
                  label={t('professor.sessionReview.selectGroupFilter')}
                  value={selectedGroupIdx >= 0 ? String(selectedGroupIdx) : ''}
                  onChange={(e) => setSelectedGroupIdx(Number(e.target.value))}
                  SelectProps={{ native: true }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 180 }}
                >
                  {(selectedGroupCat.groups || []).map((g, idx) => (
                    <option key={idx} value={String(idx)}>
                      {g.name} ({(g.members || []).length})
                    </option>
                  ))}
                </TextField>
              )}
            </>
          ) : null}
        />
      </TabPanel>

      {sessionChatAvailable ? (
        <TabPanel value={tab} index={3}>
          <SessionChatPanel
            sessionId={sessionId}
            enabled={sessionChatAvailable}
            role="professor"
            view="review"
            initialData={{
              enabled: sessionChatAvailable,
              canPost: false,
              canComment: false,
              canVote: false,
              canDismiss: false,
              canViewNames: true,
              posts: chatPosts,
              quickPosts: [],
            }}
          />
        </TabPanel>
      ) : null}
    </Box>
  );
}
