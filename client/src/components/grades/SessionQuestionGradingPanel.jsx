import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import apiClient from '../../api/client';
import {
  QUESTION_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  normalizeQuestionType,
} from '../questions/constants';
import { prepareRichTextInput, renderKatexInElement } from '../questions/richTextUtils';
import StudentRichTextEditor, { MathPreview } from '../questions/StudentRichTextEditor';

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': { px: 1.15 },
};

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

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function stripHtml(value) {
  return normalizeValue(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value) {
  return stripHtml(value).toLowerCase();
}

function hasMathSyntax(value) {
  const text = normalizeValue(value);
  if (!text) return false;
  return /\\\(|\\\[|\$\$/.test(text);
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric * 10) / 10);
}

function formatDisplayName(student, fallback = 'Unknown Student') {
  const first = normalizeValue(student?.firstname);
  const last = normalizeValue(student?.lastname);
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  return normalizeValue(student?.email) || fallback;
}

function buildStudentInitials(student) {
  const first = normalizeValue(student?.firstname);
  const last = normalizeValue(student?.lastname);
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  const email = normalizeValue(student?.email);
  return email ? email.charAt(0).toUpperCase() : '?';
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
        // Keep scalar interpretation for invalid JSON.
      }
    }
    if (trimmed.includes(',') && !/<[^>]*>/.test(trimmed)) {
      return trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [answer];
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

  const normalizedRaw = normalizeValue(answer);
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
    normalizeValue(opt?._id).toLowerCase() === normalized
    || normalizeComparableText(optionDisplayHtml(opt)) === normalizeComparableText(normalizedRaw)
  ));
}

function getQuestionPoints(question) {
  const numeric = Number(question?.sessionOptions?.points);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function isAutoGradeableQuestionType(questionType) {
  return [
    QUESTION_TYPES.MULTIPLE_CHOICE,
    QUESTION_TYPES.TRUE_FALSE,
    QUESTION_TYPES.MULTI_SELECT,
    QUESTION_TYPES.NUMERICAL,
  ].includes(questionType);
}

function buildResponseSummary(question, response, noAnswerLabel = '(no answer)') {
  if (!response) {
    return {
      displayText: '—',
      filterText: '',
      richHtml: '',
    };
  }

  const qType = normalizeQuestionType(question);
  const answer = response?.answer;

  if (qType === QUESTION_TYPES.SHORT_ANSWER) {
    const richHtml = normalizeValue(response?.answerWysiwyg);
    const plain = normalizeValue(answer) || stripHtml(richHtml);
    return {
      displayText: plain || noAnswerLabel,
      filterText: [plain, stripHtml(richHtml)].filter(Boolean).join(' '),
      richHtml,
    };
  }

  if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(qType)) {
    const options = Array.isArray(question?.options) ? question.options : [];
    const selectedIndices = [...new Set(
      collectAnswerEntries(answer)
        .map((entry) => resolveOptionIndex(entry, options))
        .filter((idx) => idx >= 0 && idx < options.length)
    )];

    if (selectedIndices.length > 0) {
      const labels = selectedIndices.map((idx) => OPTION_LETTERS[idx] || String(idx + 1));
      const optionTexts = selectedIndices
        .map((idx) => stripHtml(optionDisplayHtml(options[idx])))
        .filter(Boolean);
      return {
        displayText: labels.join(', '),
        filterText: [labels.join(' '), optionTexts.join(' ')].filter(Boolean).join(' '),
        richHtml: '',
      };
    }
  }

  let displayText = '';
  if (answer && typeof answer === 'object') {
    try {
      displayText = JSON.stringify(answer);
    } catch {
      displayText = String(answer);
    }
  } else {
    displayText = normalizeValue(answer);
  }

  return {
    displayText: displayText || noAnswerLabel,
    filterText: displayText,
    richHtml: '',
  };
}

function formatCorrectAnswerSummary(question, labels = {}) {
  if (!question) return '—';
  const qType = normalizeQuestionType(question);

  if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(qType)) {
    const options = Array.isArray(question.options) ? question.options : [];
    const correctEntries = options
      .map((option, idx) => ({ option, idx }))
      .filter(({ option }) => isCorrectOption(option))
      .map(({ option, idx }) => {
        const label = OPTION_LETTERS[idx] || String(idx + 1);
        const text = stripHtml(optionDisplayHtml(option));
        return text ? `${label}: ${text}` : label;
      });
    if (correctEntries.length === 0) return labels.noCorrectOption || 'No correct option configured.';
    return correctEntries.join(' | ');
  }

  if (qType === QUESTION_TYPES.NUMERICAL && question.correctNumerical != null) {
    if (question.toleranceNumerical != null) {
      return `${question.correctNumerical} | tolerance: ${question.toleranceNumerical}`;
    }
    return `${question.correctNumerical}`;
  }

  if (qType === QUESTION_TYPES.SHORT_ANSWER) {
    return labels.manualGradingRequired || 'Manual grading required.';
  }

  return '—';
}

function summarizeUngradedFromGrades(gradesByStudentId = {}) {
  const questionIds = new Set();
  const studentIds = new Set();
  let marks = 0;

  Object.values(gradesByStudentId || {}).forEach((grade) => {
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

export default function SessionQuestionGradingPanel({
  sessionId,
  session = null,
  questions = [],
  studentResults = [],
  onUngradedSummaryChange = null,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalMessage, setGlobalMessage] = useState('');
  const [globalMessageType, setGlobalMessageType] = useState('info');
  const [gradesByStudentId, setGradesByStudentId] = useState({});
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [answerQuery, setAnswerQuery] = useState('');
  const [showNeedsGradingOnly, setShowNeedsGradingOnly] = useState(false);
  const [draftByStudentId, setDraftByStudentId] = useState({});
  const [savingByStudentId, setSavingByStudentId] = useState({});
  const [bulkPoints, setBulkPoints] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [tableSort, setTableSort] = useState({ field: 'student', direction: 'asc' });
  const [imageViewUrl, setImageViewUrl] = useState('');

  const fetchSessionGrades = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/grades`);
      const next = {};
      (data?.grades || []).forEach((grade) => {
        next[String(grade.userId)] = grade;
      });
      setGradesByStudentId(next);
    } catch (err) {
      setError(err.response?.data?.message || t('grades.questionPanel.failedLoadGrades'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessionGrades();
  }, [fetchSessionGrades]);

  const ungradedSummary = useMemo(
    () => summarizeUngradedFromGrades(gradesByStudentId),
    [gradesByStudentId]
  );

  useEffect(() => {
    if (typeof onUngradedSummaryChange !== 'function') return;
    onUngradedSummaryChange(ungradedSummary);
  }, [onUngradedSummaryChange, ungradedSummary]);

  useEffect(() => {
    const firstQuestionId = String(questions?.[0]?._id || '');
    if (!firstQuestionId) {
      setActiveQuestionId('');
      return;
    }
    const hasActiveQuestion = questions.some(
      (question) => String(question?._id) === String(activeQuestionId)
    );
    if (!hasActiveQuestion) {
      setActiveQuestionId(firstQuestionId);
    }
  }, [activeQuestionId, questions]);

  const activeQuestion = useMemo(() => {
    return questions.find((question) => String(question?._id) === String(activeQuestionId)) || null;
  }, [activeQuestionId, questions]);

  const isQuizSession = !!(session?.quiz || session?.practiceQuiz);

  const questionStatuses = useMemo(() => {
    const eligibleStudents = studentResults.filter((student) => {
      if (isQuizSession) {
        return (student?.questionResults || []).some((result) => (
          Array.isArray(result?.responses) && result.responses.length > 0
        ));
      }
      return !!student?.inSession;
    });

    return questions.map((question, index) => {
      const questionId = String(question?._id || '');
      let needsGradingCount = 0;
      const questionType = normalizeQuestionType(question);
      const autoGradeable = isAutoGradeableQuestionType(questionType);
      const outOf = getQuestionPoints(question);

      if (!autoGradeable && outOf > 0) {
        eligibleStudents.forEach((student) => {
          const studentId = String(student?.studentId || '');
          const grade = gradesByStudentId[studentId] || null;
          const mark = (grade?.marks || []).find((entry) => String(entry?.questionId) === questionId) || null;
          const questionResult = (student?.questionResults || []).find(
            (result) => String(result?.questionId) === questionId
          );
          const latestResponse = getLatestResponse(questionResult?.responses || []);
          if (!latestResponse) return;
          if (mark && !mark?.needsGrading) return;
          needsGradingCount += 1;
        });
      }

      return {
        questionId,
        label: `Q${index + 1}`,
        needsGradingCount,
      };
    });
  }, [gradesByStudentId, isQuizSession, questions, studentResults]);

  const allRows = useMemo(() => {
    if (!activeQuestion) return [];
    const questionId = String(activeQuestion._id);
    const questionType = normalizeQuestionType(activeQuestion);
    const questionNeedsManualGrading = !isAutoGradeableQuestionType(questionType) && getQuestionPoints(activeQuestion) > 0;
    const eligibleStudents = studentResults.filter((student) => {
      if (isQuizSession) {
        return (student?.questionResults || []).some((result) => (
          Array.isArray(result?.responses) && result.responses.length > 0
        ));
      }
      return !!student?.inSession;
    });

    return eligibleStudents.map((student) => {
      const studentId = String(student?.studentId || '');
      const grade = gradesByStudentId[studentId] || null;
      const mark = (grade?.marks || []).find((entry) => String(entry?.questionId) === questionId) || null;
      const questionResult = (student?.questionResults || []).find(
        (result) => String(result?.questionId) === questionId
      );
      const latestResponse = getLatestResponse(questionResult?.responses || []);
      const responseSummary = buildResponseSummary(activeQuestion, latestResponse, t('grades.questionPanel.noAnswer'));
      const displayName = formatDisplayName(student, t('common.unknown'));
      const markNeedsGrading = !!mark?.needsGrading;
      const needsManualGrading = questionNeedsManualGrading && !!latestResponse && (!mark || markNeedsGrading);
      const rowNeedsGrading = markNeedsGrading || needsManualGrading;

      return {
        studentId,
        student,
        displayName,
        email: normalizeValue(student?.email),
        latestResponse,
        responseSummary,
        gradeId: normalizeValue(grade?._id),
        mark,
        needsManualGrading,
        rowNeedsGrading,
      };
    });
  }, [activeQuestion, gradesByStudentId, isQuizSession, studentResults]);

  useEffect(() => {
    const nextDrafts = {};
    allRows.forEach((row) => {
      nextDrafts[row.studentId] = {
        points: row.mark ? String(row.mark.points ?? 0) : '',
        feedback: normalizeValue(row.mark?.feedback),
      };
    });
    setDraftByStudentId(nextDrafts);
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const studentNeedle = normalizeValue(studentQuery).toLowerCase();
    const answerNeedle = normalizeComparableText(answerQuery);
    return allRows.filter((row) => {
      if (studentNeedle) {
        const studentHaystack = [
          normalizeValue(row.displayName),
          normalizeValue(row.email),
        ].join(' ').toLowerCase();
        if (!studentHaystack.includes(studentNeedle)) return false;
      }

      if (answerNeedle) {
        const answerHaystack = normalizeComparableText(row.responseSummary?.filterText);
        if (!answerHaystack.includes(answerNeedle)) return false;
      }

      if (showNeedsGradingOnly && !row.rowNeedsGrading) {
        return false;
      }

      return true;
    });
  }, [allRows, answerQuery, showNeedsGradingOnly, studentQuery]);

  const sortedRows = useMemo(() => {
    const nextRows = [...filteredRows];
    const compareNullableNumber = (a, b) => {
      const aFinite = Number.isFinite(a);
      const bFinite = Number.isFinite(b);
      if (!aFinite && !bFinite) return 0;
      if (!aFinite) return 1;
      if (!bFinite) return -1;
      return a - b;
    };

    nextRows.sort((a, b) => {
      let compare = 0;
      if (tableSort.field === 'response') {
        compare = normalizeValue(a?.responseSummary?.displayText).localeCompare(
          normalizeValue(b?.responseSummary?.displayText)
        );
      } else if (tableSort.field === 'mark') {
        compare = compareNullableNumber(Number(a?.mark?.points), Number(b?.mark?.points));
      } else if (tableSort.field === 'feedback') {
        compare = normalizeValue(a?.mark?.feedback).localeCompare(normalizeValue(b?.mark?.feedback));
      } else {
        compare = normalizeValue(a?.displayName).localeCompare(normalizeValue(b?.displayName));
        if (compare === 0) {
          compare = normalizeValue(a?.email).localeCompare(normalizeValue(b?.email));
        }
      }

      return tableSort.direction === 'asc' ? compare : -compare;
    });

    return nextRows;
  }, [filteredRows, tableSort]);

  const handleTableSort = useCallback((field) => {
    setTableSort((previousSort) => {
      if (previousSort.field === field) {
        return {
          field,
          direction: previousSort.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      const defaultDirection = field === 'mark' ? 'desc' : 'asc';
      return { field, direction: defaultDirection };
    });
  }, []);

  const applyUpdatedGrade = useCallback((updatedGrade) => {
    if (!updatedGrade?.userId) return;
    setGradesByStudentId((prev) => ({
      ...prev,
      [String(updatedGrade.userId)]: updatedGrade,
    }));
  }, []);

  const handleUpdateDraft = useCallback((studentId, updater) => {
    setDraftByStudentId((prev) => {
      const current = prev[studentId] || { points: '', feedback: '' };
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [studentId]: next };
    });
  }, []);

  const isRowDirty = useCallback((row) => {
    if (!row?.mark) return false;
    const draft = draftByStudentId[row.studentId] || { points: '', feedback: '' };
    const draftPoints = Number(draft.points);
    const markPoints = Number(row.mark?.points) || 0;
    const pointsChanged = Number.isFinite(draftPoints) ? Math.abs(draftPoints - markPoints) > 0.0001 : true;
    const feedbackChanged = normalizeValue(draft.feedback) !== normalizeValue(row.mark?.feedback);
    return pointsChanged || feedbackChanged;
  }, [draftByStudentId]);

  const handleSaveRow = useCallback(async (row) => {
    if (!row?.gradeId || !row?.mark || !activeQuestionId) return;
    const draft = draftByStudentId[row.studentId] || { points: '', feedback: '' };
    const parsedPoints = Number(draft.points);
    if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
      setGlobalMessage(t('grades.questionPanel.pointsInvalid'));
      setGlobalMessageType('error');
      return;
    }

    setSavingByStudentId((prev) => ({ ...prev, [row.studentId]: true }));
    try {
      const { data } = await apiClient.patch(
        `/grades/${row.gradeId}/marks/${activeQuestionId}`,
        {
          points: parsedPoints,
          feedback: draft.feedback || '',
        }
      );
      applyUpdatedGrade(data?.grade);
      setGlobalMessage(t('grades.questionPanel.savedGrade', { name: row.displayName }));
      setGlobalMessageType('success');
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || t('grades.questionPanel.failedSaveGrade', { name: row.displayName }));
      setGlobalMessageType('error');
    } finally {
      setSavingByStudentId((prev) => ({ ...prev, [row.studentId]: false }));
    }
  }, [activeQuestionId, applyUpdatedGrade, draftByStudentId]);

  const handleCancelRow = useCallback((row) => {
    if (!row?.studentId) return;
    setDraftByStudentId((prev) => ({
      ...prev,
      [row.studentId]: {
        points: row.mark ? String(row.mark.points ?? 0) : '',
        feedback: normalizeValue(row.mark?.feedback),
      },
    }));
  }, []);

  const handleBulkApplyPoints = useCallback(async () => {
    if (!activeQuestionId) return;
    const parsedPoints = Number(bulkPoints);
    if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
      setGlobalMessage(t('grades.questionPanel.bulkPointsInvalid'));
      setGlobalMessageType('error');
      return;
    }

    const targetRows = filteredRows.filter((row) => row.gradeId && row.mark);
    if (targetRows.length === 0) {
      setGlobalMessage(t('grades.questionPanel.noFilteredRows'));
      setGlobalMessageType('warning');
      return;
    }

    setBulkApplying(true);
    let updatedCount = 0;
    try {
      for (const row of targetRows) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await apiClient.patch(
          `/grades/${row.gradeId}/marks/${activeQuestionId}`,
          { points: parsedPoints }
        );
        applyUpdatedGrade(data?.grade);
        updatedCount += 1;
      }
      setGlobalMessage(t('grades.questionPanel.updatedPoints', { count: updatedCount }));
      setGlobalMessageType('success');
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || t('grades.questionPanel.bulkPointsFailed'));
      setGlobalMessageType('error');
    } finally {
      setBulkApplying(false);
    }
  }, [activeQuestionId, applyUpdatedGrade, bulkPoints, filteredRows]);

  const handleBulkApplyFeedback = useCallback(async () => {
    if (!activeQuestionId) return;
    const targetRows = filteredRows.filter((row) => row.gradeId && row.mark);
    if (targetRows.length === 0) {
      setGlobalMessage(t('grades.questionPanel.noFilteredRows'));
      setGlobalMessageType('warning');
      return;
    }

    setBulkApplying(true);
    let updatedCount = 0;
    try {
      for (const row of targetRows) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await apiClient.patch(
          `/grades/${row.gradeId}/marks/${activeQuestionId}`,
          { feedback: bulkFeedback || '' }
        );
        applyUpdatedGrade(data?.grade);
        updatedCount += 1;
      }
      setGlobalMessage(t('grades.questionPanel.updatedFeedback', { count: updatedCount }));
      setGlobalMessageType('success');
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || t('grades.questionPanel.bulkFeedbackFailed'));
      setGlobalMessageType('error');
    } finally {
      setBulkApplying(false);
    }
  }, [activeQuestionId, applyUpdatedGrade, bulkFeedback, filteredRows]);

  const handleRecalculateAll = useCallback(async () => {
    if (!sessionId) return;
    setRecalculating(true);
    try {
      const { data } = await apiClient.post(`/sessions/${sessionId}/grades/recalculate`, {
        missingOnly: false,
      });
      const warnings = data?.summary?.warnings || [];
      if (warnings.length > 0) {
        setGlobalMessage(warnings.join(' '));
        setGlobalMessageType('warning');
      } else {
        setGlobalMessage(t('grades.questionPanel.gradesRecalculated'));
        setGlobalMessageType('success');
      }
      await fetchSessionGrades();
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || t('grades.questionPanel.failedRecalculate'));
      setGlobalMessageType('error');
    } finally {
      setRecalculating(false);
    }
  }, [fetchSessionGrades, sessionId]);

  if (loading) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={(
          <Button size="small" color="inherit" onClick={fetchSessionGrades}>
            {t('common.retry')}
          </Button>
        )}
      >
        {error}
      </Alert>
    );
  }

  if (!questions.length) {
    return <Alert severity="info">{t('grades.questionPanel.noQuestions')}</Alert>;
  }

  if (!activeQuestion) {
    return <Alert severity="info">{t('grades.questionPanel.selectQuestion')}</Alert>;
  }

  const activeQuestionType = normalizeQuestionType(activeQuestion);
  const activeQuestionPoints = getQuestionPoints(activeQuestion);
  const hasSolution = !!normalizeValue(activeQuestion.solution);
  const correctAnswerSummary = formatCorrectAnswerSummary(activeQuestion, {
    noCorrectOption: t('grades.questionPanel.noCorrectOption'),
    manualGradingRequired: t('grades.questionPanel.manualGradingRequired'),
  });
  const optionTypeQuestion = [
    QUESTION_TYPES.MULTIPLE_CHOICE,
    QUESTION_TYPES.TRUE_FALSE,
    QUESTION_TYPES.MULTI_SELECT,
  ].includes(activeQuestionType);
  const questionOptions = Array.isArray(activeQuestion.options) ? activeQuestion.options : [];
  const displayedStudentHint = isQuizSession
    ? t('grades.questionPanel.showingStudentsQuiz', { showing: sortedRows.length, total: allRows.length })
    : t('grades.questionPanel.showingStudentsSession', { showing: sortedRows.length, total: allRows.length });

  const renderQuestionRibbon = () => (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        flexWrap: 'wrap',
        mb: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
      }}
    >
      {questionStatuses.map((entry) => {
        const isActive = entry.questionId === activeQuestionId;
        const needsGrading = entry.needsGradingCount > 0;
        return (
          <Chip
            key={entry.questionId}
            clickable
            onClick={() => {
              setActiveQuestionId(entry.questionId);
              setShowSolution(false);
            }}
            label={needsGrading ? `${entry.label} (${entry.needsGradingCount})` : entry.label}
            color={needsGrading ? 'error' : 'success'}
            variant={isActive ? 'filled' : 'outlined'}
            sx={COMPACT_CHIP_SX}
          />
        );
      })}
    </Box>
  );

  return (
    <Box>
      {globalMessage ? (
        <Alert severity={globalMessageType} sx={{ mb: 1.5 }} onClose={() => setGlobalMessage('')}>
          {globalMessage}
        </Alert>
      ) : null}

      {renderQuestionRibbon()}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('grades.questionPanel.questionNumber', { number: questions.findIndex((question) => String(question?._id) === activeQuestionId) + 1 })}
          </Typography>
          <Chip
            label={TYPE_LABELS[activeQuestionType] || t('grades.coursePanel.question')}
            color={TYPE_COLORS[activeQuestionType] || 'default'}
            size="small"
            sx={COMPACT_CHIP_SX}
          />
          <Chip
            label={t('grades.questionPanel.pointsValue', { count: activeQuestionPoints })}
            size="small"
            variant="outlined"
            sx={COMPACT_CHIP_SX}
          />
        </Box>

        <RichContent html={activeQuestion.content} fallback={activeQuestion.plainText} />

        {optionTypeQuestion && questionOptions.length > 0 && (
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {questionOptions.map((option, index) => {
              const isCorrect = isCorrectOption(option);
              return (
                <Paper
                  key={option?._id || index}
                  variant="outlined"
                  sx={{
                    p: 0.85,
                    borderColor: isCorrect ? 'success.main' : 'divider',
                    bgcolor: isCorrect ? 'success.50' : 'transparent',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                    <Chip
                      label={OPTION_LETTERS[index] || String(index + 1)}
                      size="small"
                      color={isCorrect ? 'success' : 'default'}
                      sx={COMPACT_CHIP_SX}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <RichContent html={optionDisplayHtml(option)} />
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        <Typography variant="body2" sx={{ mt: 1 }}>
          <strong>{t('grades.questionPanel.correctAnswer')}</strong> {correctAnswerSummary}
        </Typography>

        {hasSolution && (
          <Box sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={() => setShowSolution((prev) => !prev)}>
              {showSolution ? t('grades.questionPanel.hideSolution') : t('grades.questionPanel.showSolution')}
            </Button>
            {showSolution && (
              <Paper variant="outlined" sx={{ mt: 1, p: 1.25 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                  {t('common.solution')}
                </Typography>
                <RichContent html={activeQuestion.solution} fallback={activeQuestion.solution_plainText} />
              </Paper>
            )}
          </Box>
        )}
      </Paper>

      {renderQuestionRibbon()}

      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {t('grades.questionPanel.bulkUpdateFiltered', { count: sortedRows.length })}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            type="number"
            label={t('grades.questionPanel.bulkPoints')}
            value={bulkPoints}
            onChange={(event) => setBulkPoints(event.target.value)}
            sx={{ width: 140 }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={handleBulkApplyPoints}
            disabled={bulkApplying}
          >
            {t('grades.questionPanel.applyPoints')}
          </Button>
          <TextField
            size="small"
            label={t('grades.questionPanel.bulkFeedback')}
            value={bulkFeedback}
            onChange={(event) => setBulkFeedback(event.target.value)}
            sx={{ minWidth: 260, flex: 1 }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={handleBulkApplyFeedback}
            disabled={bulkApplying}
          >
            {t('grades.questionPanel.applyFeedback')}
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.25, alignItems: 'center' }}>
        <TextField
          size="small"
          label={t('grades.questionPanel.searchStudents')}
          value={studentQuery}
          onChange={(event) => setStudentQuery(event.target.value)}
          sx={{ minWidth: 220 }}
        />
        <TextField
          size="small"
          label={t('grades.questionPanel.searchAnswerContent')}
          value={answerQuery}
          onChange={(event) => setAnswerQuery(event.target.value)}
          sx={{ minWidth: 260, flex: 1 }}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRecalculateAll}
          disabled={recalculating}
        >
          {t('grades.questionPanel.recalculateGrades')}
        </Button>
        <FormControlLabel
          control={(
            <Checkbox
              size="small"
              checked={showNeedsGradingOnly}
              onChange={(event) => setShowNeedsGradingOnly(event.target.checked)}
            />
          )}
          label={t('grades.questionPanel.onlyNeedsGrading')}
          sx={{ ml: { xs: 0, sm: 0.5 } }}
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
        {displayedStudentHint}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
        {t('grades.questionPanel.feedbackMathTip')}
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table
          size="small"
          aria-label={t('grades.questionPanel.questionGradingTable')}
          sx={{
            '& .MuiTableCell-root': {
              px: 0.75,
              py: 0.6,
              verticalAlign: 'top',
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 170 }}>
                <TableSortLabel
                  active={tableSort.field === 'student'}
                  direction={tableSort.field === 'student' ? tableSort.direction : 'asc'}
                  onClick={() => handleTableSort('student')}
                >
                  {t('grades.coursePanel.student')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>
                <TableSortLabel
                  active={tableSort.field === 'response'}
                  direction={tableSort.field === 'response' ? tableSort.direction : 'asc'}
                  onClick={() => handleTableSort('response')}
                >
                  {t('grades.questionPanel.response')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 150 }}>
                <TableSortLabel
                  active={tableSort.field === 'mark'}
                  direction={tableSort.field === 'mark' ? tableSort.direction : 'desc'}
                  onClick={() => handleTableSort('mark')}
                >
                  {t('grades.questionPanel.mark')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>
                <TableSortLabel
                  active={tableSort.field === 'feedback'}
                  direction={tableSort.field === 'feedback' ? tableSort.direction : 'asc'}
                  onClick={() => handleTableSort('feedback')}
                >
                  {t('grades.coursePanel.feedback')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 96 }} align="right">{t('grades.questionPanel.action')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row) => {
              const draft = draftByStudentId[row.studentId] || { points: '', feedback: '' };
              const saving = !!savingByStudentId[row.studentId];
              const rowDisabled = !row.gradeId || !row.mark;
              const rowDirty = isRowDirty(row);
              const rowNeedsGrading = !!row.rowNeedsGrading;

              return (
                <TableRow
                  key={row.studentId}
                  hover
                  sx={rowNeedsGrading ? { bgcolor: 'error.50' } : undefined}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
                      <Avatar
                        src={row.student?.profileThumbnail || row.student?.profileImage || ''}
                        sx={{
                          width: 30,
                          height: 30,
                          cursor: row.student?.profileImage ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (row.student?.profileImage) setImageViewUrl(row.student.profileImage);
                        }}
                      >
                        {buildStudentInitials(row.student)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap>{row.displayName}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{row.email || '—'}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ maxWidth: 260 }}>
                      {row.responseSummary.richHtml ? (
                        <RichContent html={row.responseSummary.richHtml} />
                      ) : (
                        <Typography variant="body2">{row.responseSummary.displayText}</Typography>
                      )}
                    </Box>
                    {row.latestResponse?.attempt ? (
                      <Typography variant="caption" color="text.secondary">
                        {t('grades.questionPanel.attemptNumber', { number: row.latestResponse.attempt })}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={draft.points}
                        disabled={rowDisabled || saving}
                        onChange={(event) => {
                          const value = event.target.value;
                          handleUpdateDraft(row.studentId, (current) => ({ ...current, points: value }));
                        }}
                        sx={{ width: 82 }}
                        inputProps={{ min: 0 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {t('grades.questionPanel.outOf', { value: formatPercent(row.mark?.outOf || 0) })}
                      </Typography>
                    </Box>
                    {rowNeedsGrading && (
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label={t('grades.questionPanel.needsGrading')}
                        sx={{ mt: 0.5 }}
                      />
                    )}
                    {rowDisabled && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={t('grades.questionPanel.noGradeItem')}
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ minWidth: 170 }}>
                      <StudentRichTextEditor
                        value={draft.feedback}
                        disabled={rowDisabled || saving}
                        onChangeDebounceMs={180}
                        onChange={({ html }) => {
                          const value = html || '';
                          handleUpdateDraft(row.studentId, (current) => ({ ...current, feedback: value }));
                        }}
                        placeholder={t('grades.questionPanel.addFeedback')}
                        ariaLabel={`${t('grades.coursePanel.feedback')} — ${row.displayName}`}
                        showMathHint={false}
                      />
                      {rowDirty && hasMathSyntax(draft.feedback) && (
                        <MathPreview html={draft.feedback} debounceMs={220} showLabel={false} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.35, flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleSaveRow(row)}
                        disabled={rowDisabled || saving || !rowDirty}
                      >
                        {t('common.save')}
                      </Button>
                      {rowDirty && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => handleCancelRow(row)}
                          disabled={rowDisabled || saving}
                        >
                          {t('common.cancel')}
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {sortedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary">
                    {t('grades.questionPanel.noStudentsMatch')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!imageViewUrl} onClose={() => setImageViewUrl('')} maxWidth="md" fullWidth>
        <DialogTitle>{t('grades.questionPanel.profileImage')}</DialogTitle>
        <DialogContent dividers>
          {imageViewUrl ? (
            <Box
              component="img"
              src={imageViewUrl}
              alt={t('grades.questionPanel.profileImage')}
              sx={{ width: '100%', maxHeight: 540, objectFit: 'contain', display: 'block' }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
