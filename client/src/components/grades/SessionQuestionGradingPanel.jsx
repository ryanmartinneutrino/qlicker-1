import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric * 10) / 10);
}

function formatDisplayName(student) {
  const first = normalizeValue(student?.firstname);
  const last = normalizeValue(student?.lastname);
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  return normalizeValue(student?.email) || 'Unknown Student';
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

function buildResponseSummary(question, response) {
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
      displayText: plain || '(no answer)',
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
    displayText: displayText || '(no answer)',
    filterText: displayText,
    richHtml: '',
  };
}

function formatCorrectAnswerSummary(question) {
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
    if (correctEntries.length === 0) return 'No correct option configured.';
    return correctEntries.join(' | ');
  }

  if (qType === QUESTION_TYPES.NUMERICAL && question.correctNumerical != null) {
    const toleranceText = question.toleranceNumerical != null
      ? ` (+/- ${question.toleranceNumerical})`
      : '';
    return `${question.correctNumerical}${toleranceText}`;
  }

  if (qType === QUESTION_TYPES.SHORT_ANSWER) {
    return 'Manual grading required.';
  }

  return '—';
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
  questions = [],
  studentResults = [],
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalMessage, setGlobalMessage] = useState('');
  const [globalMessageType, setGlobalMessageType] = useState('info');
  const [gradesByStudentId, setGradesByStudentId] = useState({});
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [answerQuery, setAnswerQuery] = useState('');
  const [draftByStudentId, setDraftByStudentId] = useState({});
  const [savingByStudentId, setSavingByStudentId] = useState({});
  const [bulkPoints, setBulkPoints] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

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
      setError(err.response?.data?.message || 'Failed to load grades for this session.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessionGrades();
  }, [fetchSessionGrades]);

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

  const questionStatuses = useMemo(() => {
    const gradeList = Object.values(gradesByStudentId);
    return questions.map((question, index) => {
      const questionId = String(question?._id || '');
      let marksCount = 0;
      let needsGradingCount = 0;

      gradeList.forEach((grade) => {
        const mark = (grade?.marks || []).find((entry) => String(entry?.questionId) === questionId);
        if (!mark) return;
        const outOf = Number(mark?.outOf) || 0;
        if (outOf <= 0) return;
        marksCount += 1;
        if (mark?.needsGrading) needsGradingCount += 1;
      });

      return {
        questionId,
        label: `Q${index + 1}`,
        marksCount,
        needsGradingCount,
      };
    });
  }, [gradesByStudentId, questions]);

  const allRows = useMemo(() => {
    if (!activeQuestion) return [];
    const questionId = String(activeQuestion._id);

    return studentResults.map((student) => {
      const studentId = String(student?.studentId || '');
      const grade = gradesByStudentId[studentId] || null;
      const mark = (grade?.marks || []).find((entry) => String(entry?.questionId) === questionId) || null;
      const questionResult = (student?.questionResults || []).find(
        (result) => String(result?.questionId) === questionId
      );
      const latestResponse = getLatestResponse(questionResult?.responses || []);
      const responseSummary = buildResponseSummary(activeQuestion, latestResponse);
      const displayName = formatDisplayName(student);

      return {
        studentId,
        displayName,
        email: normalizeValue(student?.email),
        latestResponse,
        responseSummary,
        gradeId: normalizeValue(grade?._id),
        gradeValue: Number(grade?.value) || 0,
        mark,
      };
    });
  }, [activeQuestion, gradesByStudentId, studentResults]);

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

      return true;
    });
  }, [allRows, answerQuery, studentQuery]);

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
      setGlobalMessage('Points must be a number greater than or equal to 0.');
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
      setGlobalMessage(`Saved grade for ${row.displayName}.`);
      setGlobalMessageType('success');
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || `Failed to save grade for ${row.displayName}.`);
      setGlobalMessageType('error');
    } finally {
      setSavingByStudentId((prev) => ({ ...prev, [row.studentId]: false }));
    }
  }, [activeQuestionId, applyUpdatedGrade, draftByStudentId]);

  const handleBulkApplyPoints = useCallback(async () => {
    if (!activeQuestionId) return;
    const parsedPoints = Number(bulkPoints);
    if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
      setGlobalMessage('Bulk points must be a number greater than or equal to 0.');
      setGlobalMessageType('error');
      return;
    }

    const targetRows = filteredRows.filter((row) => row.gradeId && row.mark);
    if (targetRows.length === 0) {
      setGlobalMessage('No filtered rows can be updated.');
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
      setGlobalMessage(`Updated points for ${updatedCount} student${updatedCount === 1 ? '' : 's'}.`);
      setGlobalMessageType('success');
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Bulk points update failed.');
      setGlobalMessageType('error');
    } finally {
      setBulkApplying(false);
    }
  }, [activeQuestionId, applyUpdatedGrade, bulkPoints, filteredRows]);

  const handleBulkApplyFeedback = useCallback(async () => {
    if (!activeQuestionId) return;
    const targetRows = filteredRows.filter((row) => row.gradeId && row.mark);
    if (targetRows.length === 0) {
      setGlobalMessage('No filtered rows can be updated.');
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
      setGlobalMessage(`Updated feedback for ${updatedCount} student${updatedCount === 1 ? '' : 's'}.`);
      setGlobalMessageType('success');
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Bulk feedback update failed.');
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
        setGlobalMessage('Grades recalculated.');
        setGlobalMessageType('success');
      }
      await fetchSessionGrades();
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to re-calculate grades.');
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
            Retry
          </Button>
        )}
      >
        {error}
      </Alert>
    );
  }

  if (!questions.length) {
    return <Alert severity="info">This session has no questions to grade.</Alert>;
  }

  if (!activeQuestion) {
    return <Alert severity="info">Select a question to begin grading.</Alert>;
  }

  const activeQuestionType = normalizeQuestionType(activeQuestion);
  const activeQuestionPoints = getQuestionPoints(activeQuestion);
  const hasSolution = !!normalizeValue(activeQuestion.solution);
  const correctAnswerSummary = formatCorrectAnswerSummary(activeQuestion);

  return (
    <Box>
      {globalMessage ? (
        <Alert severity={globalMessageType} sx={{ mb: 1.5 }} onClose={() => setGlobalMessage('')}>
          {globalMessage}
        </Alert>
      ) : null}

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

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Question {questions.findIndex((question) => String(question?._id) === activeQuestionId) + 1}
          </Typography>
          <Chip
            label={TYPE_LABELS[activeQuestionType] || 'Question'}
            color={TYPE_COLORS[activeQuestionType] || 'default'}
            size="small"
            sx={COMPACT_CHIP_SX}
          />
          <Chip
            label={`${activeQuestionPoints} pt${activeQuestionPoints === 1 ? '' : 's'}`}
            size="small"
            variant="outlined"
            sx={COMPACT_CHIP_SX}
          />
        </Box>

        <RichContent html={activeQuestion.content} fallback={activeQuestion.plainText} />

        <Typography variant="body2" sx={{ mt: 1 }}>
          <strong>Correct answer:</strong> {correctAnswerSummary}
        </Typography>

        {hasSolution && (
          <Box sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={() => setShowSolution((prev) => !prev)}>
              {showSolution ? 'Hide Solution' : 'Show Solution'}
            </Button>
            {showSolution && (
              <Paper variant="outlined" sx={{ mt: 1, p: 1.25 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                  Solution
                </Typography>
                <RichContent html={activeQuestion.solution} fallback={activeQuestion.solution_plainText} />
              </Paper>
            )}
          </Box>
        )}
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.25, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Search students"
          value={studentQuery}
          onChange={(event) => setStudentQuery(event.target.value)}
          sx={{ minWidth: 220 }}
        />
        <TextField
          size="small"
          label="Search answer content"
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
          Re-calculate all grades
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Bulk update filtered rows ({filteredRows.length})
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            type="number"
            label="Bulk points"
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
            Apply points
          </Button>
          <TextField
            size="small"
            label="Bulk feedback"
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
            Apply feedback
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Question grading table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Student</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 260 }}>Response</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 210 }}>Mark</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 260 }}>Feedback</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 120 }} align="center">Grade Value</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 130 }} align="center">Status</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 120 }} align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.map((row) => {
              const draft = draftByStudentId[row.studentId] || { points: '', feedback: '' };
              const saving = !!savingByStudentId[row.studentId];
              const rowDisabled = !row.gradeId || !row.mark;
              const rowDirty = isRowDirty(row);

              return (
                <TableRow key={row.studentId} hover>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell>{row.email || '—'}</TableCell>
                  <TableCell>
                    {row.responseSummary.richHtml ? (
                      <RichContent html={row.responseSummary.richHtml} />
                    ) : (
                      <Typography variant="body2">{row.responseSummary.displayText}</Typography>
                    )}
                    {row.latestResponse?.attempt ? (
                      <Typography variant="caption" color="text.secondary">
                        attempt {row.latestResponse.attempt}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={draft.points}
                        disabled={rowDisabled || saving}
                        onChange={(event) => {
                          const value = event.target.value;
                          handleUpdateDraft(row.studentId, (current) => ({ ...current, points: value }));
                        }}
                        sx={{ width: 100 }}
                        inputProps={{ min: 0 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        / {formatPercent(row.mark?.outOf || 0)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      value={draft.feedback}
                      disabled={rowDisabled || saving}
                      onChange={(event) => {
                        const value = event.target.value;
                        handleUpdateDraft(row.studentId, (current) => ({ ...current, feedback: value }));
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">{formatPercent(row.gradeValue)}%</TableCell>
                  <TableCell align="center">
                    {rowDisabled ? (
                      <Chip size="small" color="warning" variant="outlined" label="No grade item" />
                    ) : row.mark?.needsGrading ? (
                      <Chip size="small" color="error" label="Needs grading" />
                    ) : (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={row.mark?.automatic ? 'default' : 'warning'}
                        label={row.mark?.automatic ? 'Auto' : 'Manual'}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleSaveRow(row)}
                      disabled={rowDisabled || saving || !rowDirty}
                    >
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary">
                    No students match the current filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
