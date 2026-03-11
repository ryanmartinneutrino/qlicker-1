import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AutoFixHigh as AutoFixHighIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  RateReview as ReviewIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import StudentRichTextEditor, { MathPreview } from '../questions/StudentRichTextEditor';
import QuestionDisplay from '../questions/QuestionDisplay';

function normalizeAnswerValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
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

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric * 10) / 10);
}

function buildSortValueForField(row, field) {
  if (field === 'name') {
    return normalizeAnswerValue(row?.studentSortLastName).toLowerCase();
  }
  if (field === 'email') {
    return normalizeAnswerValue(row?.studentSortEmail).toLowerCase();
  }
  if (field === 'avgParticipation') {
    return Number(row?.avgParticipation) || 0;
  }

  if (field.endsWith('_smark')) {
    const sessionId = field.replace('_smark', '');
    const grade = row?.gradeBySession?.[sessionId];
    return Number(grade?.value) || 0;
  }

  if (field.endsWith('_spart')) {
    const sessionId = field.replace('_spart', '');
    const grade = row?.gradeBySession?.[sessionId];
    return Number(grade?.participation) || 0;
  }

  return 0;
}

function buildStudentSearchIndex(student = {}) {
  return [
    normalizeAnswerValue(student?.firstname),
    normalizeAnswerValue(student?.lastname),
    normalizeAnswerValue(student?.email),
    normalizeAnswerValue(student?.displayName),
  ]
    .join(' ')
    .toLowerCase();
}

function normalizeGradeRows(rows = []) {
  return rows.map((row) => {
    const gradeBySession = {};
    (row.grades || []).forEach((grade) => {
      gradeBySession[String(grade.sessionId)] = grade;
    });

    return {
      ...row,
      gradeBySession,
      studentSortLastName: normalizeAnswerValue(row?.student?.lastname),
      studentSortFirstName: normalizeAnswerValue(row?.student?.firstname),
      studentSortEmail: normalizeAnswerValue(row?.student?.email),
      studentSearchIndex: buildStudentSearchIndex(row?.student),
    };
  });
}

function getSessionSortTime(session) {
  const timestamp = new Date(session?.date || session?.quizStart || session?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildFilteredSortedRows(rows, searchTerm, sort) {
  const normalizedSearch = normalizeAnswerValue(searchTerm).toLowerCase();
  const filteredRows = normalizedSearch
    ? rows.filter((row) => normalizeAnswerValue(row?.studentSearchIndex).includes(normalizedSearch))
    : rows;

  const nextRows = [...filteredRows];
  nextRows.sort((a, b) => {
    const aValue = buildSortValueForField(a, sort.field);
    const bValue = buildSortValueForField(b, sort.field);
    let compare = 0;
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      compare = aValue - bValue;
    } else {
      compare = String(aValue).localeCompare(String(bValue));
    }

    if (sort.field === 'name' && compare === 0) {
      compare = normalizeAnswerValue(a?.studentSortFirstName)
        .localeCompare(normalizeAnswerValue(b?.studentSortFirstName));
      if (compare === 0) {
        compare = normalizeAnswerValue(a?.studentSortEmail)
          .localeCompare(normalizeAnswerValue(b?.studentSortEmail));
      }
    }

    return sort.direction === 'asc' ? compare : -compare;
  });

  return nextRows;
}

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 0,
  TRUE_FALSE: 1,
  SHORT_ANSWER: 2,
  MULTI_SELECT: 3,
  NUMERICAL: 4,
};
const AUTO_GRADEABLE_QUESTION_TYPES = new Set([
  QUESTION_TYPES.MULTIPLE_CHOICE,
  QUESTION_TYPES.TRUE_FALSE,
  QUESTION_TYPES.MULTI_SELECT,
  QUESTION_TYPES.NUMERICAL,
]);

function collectAnswerEntries(answer) {
  if (answer === undefined || answer === null) return [];
  if (Array.isArray(answer)) return answer;
  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (!trimmed) return [];

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== answer) return collectAnswerEntries(parsed);
      } catch {
        // Fall through.
      }
    }

    if (/[|,;]/.test(trimmed) && !/<[^>]*>/.test(trimmed)) {
      return trimmed.split(/[|,;]/).map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [answer];
}

function resolveOptionIndex(answer, options = []) {
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

  return options.findIndex((option) => {
    const optionId = normalizeAnswerValue(option?._id).toLowerCase();
    const optionValue = normalizeAnswerValue(
      option?.content
      || option?.plainText
      || option?.text
      || option?.label
      || option?.answer
      || ''
    ).toLowerCase();
    return optionId === normalized || optionValue === normalized;
  });
}

function isCorrectOption(option) {
  const value = option?.correct;
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

function getLatestResponse(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return null;

  let latestResponse = responses[0];
  for (let index = 1; index < responses.length; index += 1) {
    const current = responses[index];
    const currentAttempt = Number(current?.attempt) || 0;
    const latestAttempt = Number(latestResponse?.attempt) || 0;
    if (currentAttempt > latestAttempt) {
      latestResponse = current;
      continue;
    }
    if (currentAttempt < latestAttempt) continue;

    const currentTime = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
    const latestTime = new Date(latestResponse?.updatedAt || latestResponse?.createdAt || 0).getTime();
    if (currentTime >= latestTime) {
      latestResponse = current;
    }
  }

  return latestResponse;
}

function formatAnswerValue(question, answer) {
  if (!question) return normalizeAnswerValue(answer) || '—';
  const type = Number(question?.type);
  const options = Array.isArray(question?.options) ? question.options : [];

  if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(type)) {
    const labels = collectAnswerEntries(answer)
      .map((entry) => {
        const optionIndex = resolveOptionIndex(entry, options);
        return optionIndex >= 0 && optionIndex < OPTION_LETTERS.length
          ? OPTION_LETTERS[optionIndex]
          : normalizeAnswerValue(entry);
      })
      .filter(Boolean);
    return labels.length ? labels.join(', ') : '—';
  }

  if (type === QUESTION_TYPES.NUMERICAL) {
    const numeric = Number(answer);
    return Number.isFinite(numeric) ? String(numeric) : normalizeAnswerValue(answer) || '—';
  }

  if (typeof answer === 'object' && answer !== null) {
    try {
      return JSON.stringify(answer);
    } catch {
      return String(answer);
    }
  }

  return normalizeAnswerValue(answer) || '—';
}

function formatCorrectAnswerValue(question) {
  if (!question) return '—';
  const type = Number(question?.type);
  const options = Array.isArray(question?.options) ? question.options : [];

  if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(type)) {
    const correctLabels = options
      .map((option, index) => (isCorrectOption(option) ? OPTION_LETTERS[index] : null))
      .filter(Boolean);
    return correctLabels.length ? correctLabels.join(', ') : '—';
  }

  if (type === QUESTION_TYPES.NUMERICAL) {
    const expected = Number(question?.correctNumerical);
    const toleranceRaw = Number(question?.toleranceNumerical ?? 0);
    if (!Number.isFinite(expected)) return '—';
    const tolerance = Number.isFinite(toleranceRaw) ? Math.abs(toleranceRaw) : 0;
    return `${expected} (± ${tolerance})`;
  }

  return normalizeAnswerValue(question?.solution) || 'Manual grading';
}

function buildConflictQuestionLabel(conflict) {
  const sessionName = normalizeAnswerValue(conflict?.sessionName) || 'Session';
  const questionNumber = Number(conflict?.questionNumber);
  if (Number.isInteger(questionNumber) && questionNumber > 0) {
    return `${sessionName}/Q${questionNumber}`;
  }
  return `${sessionName}/${normalizeAnswerValue(conflict?.questionId) || 'Question'}`;
}

function isAutoGradeableConflict(conflict, question = null) {
  const questionType = Number(question?.type ?? conflict?.questionType);
  return AUTO_GRADEABLE_QUESTION_TYPES.has(questionType);
}

function isSameConflict(left, right) {
  return String(left?.gradeId || '') === String(right?.gradeId || '')
    && String(left?.questionId || '') === String(right?.questionId || '')
    && String(left?.studentId || '') === String(right?.studentId || '')
    && String(left?.sessionId || '') === String(right?.sessionId || '');
}

function mergeUniqueConflicts(existingConflicts = [], incomingConflicts = []) {
  const merged = [...existingConflicts];
  incomingConflicts.forEach((incoming) => {
    const alreadyPresent = merged.some((existing) => isSameConflict(existing, incoming));
    if (!alreadyPresent) {
      merged.push(incoming);
    }
  });
  return merged;
}

function StudentSearchField({
  value,
  onSearchChange,
  disabled = false,
}) {
  const [draft, setDraft] = useState(() => value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onSearchChange(draft);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draft, onSearchChange]);

  return (
    <TextField
      size="small"
      label="Search students"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      sx={{ minWidth: 240 }}
      disabled={disabled}
    />
  );
}

function GradeDetailDialog({
  open,
  onClose,
  grade,
  student,
  sessionName,
  instructorView,
  onGradeUpdated,
}) {
  const [workingGrade, setWorkingGrade] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingMarkIndex, setEditingMarkIndex] = useState(-1);
  const [editingMarkPoints, setEditingMarkPoints] = useState('0');
  const [editingFeedbackHtml, setEditingFeedbackHtml] = useState('');
  const [editingGradeValue, setEditingGradeValue] = useState('0');

  useEffect(() => {
    if (!open || !grade) return;
    setWorkingGrade({ ...grade, marks: [...(grade.marks || [])] });
    setEditingMarkIndex(-1);
    setEditingGradeValue(String(grade.value ?? 0));
    setError('');
  }, [open, grade]);

  const beginEditMark = useCallback((mark, index) => {
    setEditingMarkIndex(index);
    setEditingMarkPoints(String(mark?.points ?? 0));
    setEditingFeedbackHtml(mark?.feedback || '');
    setError('');
  }, []);

  const persistGrade = useCallback(async (nextGrade) => {
    setWorkingGrade(nextGrade);
    if (onGradeUpdated) {
      await onGradeUpdated(nextGrade);
    }
  }, [onGradeUpdated]);

  const handleSaveMark = useCallback(async () => {
    if (!workingGrade || editingMarkIndex < 0) return;
    const targetMark = workingGrade.marks?.[editingMarkIndex];
    if (!targetMark) return;

    setSaving(true);
    setError('');
    try {
      const payload = {
        points: Number(editingMarkPoints),
        feedback: editingFeedbackHtml || '',
      };
      const { data } = await apiClient.patch(
        `/grades/${workingGrade._id}/marks/${targetMark.questionId}`,
        payload
      );
      await persistGrade(data.grade);
      setEditingMarkIndex(-1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update mark');
    } finally {
      setSaving(false);
    }
  }, [editingFeedbackHtml, editingMarkIndex, editingMarkPoints, persistGrade, workingGrade]);

  const handleSetMarkAutomatic = useCallback(async (mark) => {
    if (!workingGrade || !mark) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await apiClient.post(
        `/grades/${workingGrade._id}/marks/${mark.questionId}/set-automatic`
      );
      await persistGrade(data.grade);
      setEditingMarkIndex(-1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to auto-grade mark');
    } finally {
      setSaving(false);
    }
  }, [persistGrade, workingGrade]);

  const handleSaveGradeValue = useCallback(async () => {
    if (!workingGrade) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await apiClient.patch(`/grades/${workingGrade._id}/value`, {
        value: Number(editingGradeValue),
      });
      await persistGrade(data.grade);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update grade value');
    } finally {
      setSaving(false);
    }
  }, [editingGradeValue, persistGrade, workingGrade]);

  const handleSetGradeAutomatic = useCallback(async () => {
    if (!workingGrade) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await apiClient.post(`/grades/${workingGrade._id}/value/set-automatic`);
      await persistGrade(data.grade);
      setEditingGradeValue(String(data.grade?.value ?? 0));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to restore automatic grade');
    } finally {
      setSaving(false);
    }
  }, [persistGrade, workingGrade]);

  if (!workingGrade) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6">{student?.displayName || student?.email || 'Student'}</Typography>
            <Typography variant="body2" color="text.secondary">{sessionName || workingGrade.name}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              color={workingGrade.automatic ? 'default' : 'warning'}
              label={workingGrade.automatic ? 'Auto grade' : 'Manual override'}
            />
            {workingGrade.needsGrading && <Chip size="small" color="error" label="Needs grading" />}
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Grade: {formatPercent(workingGrade.value)}% ({formatPercent(workingGrade.points)} / {formatPercent(workingGrade.outOf)})
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Participation: {formatPercent(workingGrade.participation)}%
          </Typography>
          {instructorView && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                type="number"
                label="Grade %"
                value={editingGradeValue}
                onChange={(event) => setEditingGradeValue(event.target.value)}
                sx={{ width: 140 }}
              />
              <Button size="small" variant="outlined" onClick={handleSaveGradeValue} disabled={saving}>
                Save Grade Value
              </Button>
              {!workingGrade.automatic && (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AutoFixHighIcon />}
                  onClick={handleSetGradeAutomatic}
                  disabled={saving}
                >
                  Restore Automatic
                </Button>
              )}
            </Box>
          )}
        </Paper>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Question</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Points</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Attempt</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(workingGrade.marks || []).map((mark, index) => {
                const editing = editingMarkIndex === index;
                return (
                  <Fragment key={`${mark.questionId}-${index}`}>
                    <TableRow>
                      <TableCell>Q{index + 1}</TableCell>
                      <TableCell>{formatPercent(mark.points)} / {formatPercent(mark.outOf)}</TableCell>
                      <TableCell>{mark.attempt || 0}</TableCell>
                      <TableCell>
                        {mark.needsGrading ? (
                          <Chip size="small" color="error" label="Needs grading" />
                        ) : (
                          <Chip size="small" variant="outlined" color={mark.automatic ? 'default' : 'warning'} label={mark.automatic ? 'Auto' : 'Manual'} />
                        )}
                      </TableCell>
                      <TableCell>
                        {instructorView ? (
                          <Button size="small" onClick={() => beginEditMark(mark, index)}>Edit</Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    {editing && instructorView && (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ bgcolor: 'background.default' }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 1 }}>
                            <TextField
                              size="small"
                              type="number"
                              label="Points"
                              value={editingMarkPoints}
                              onChange={(event) => setEditingMarkPoints(event.target.value)}
                              sx={{ maxWidth: 160 }}
                            />
                            <Box>
                              <Typography variant="caption" color="text.secondary">Feedback</Typography>
                              <StudentRichTextEditor
                                value={editingFeedbackHtml}
                                onChange={({ html }) => setEditingFeedbackHtml(html)}
                                placeholder="Add feedback for this question"
                              />
                              <MathPreview html={editingFeedbackHtml} />
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              <Button size="small" variant="outlined" onClick={handleSaveMark} disabled={saving}>Save Mark</Button>
                              {!mark.automatic && (
                                <Button
                                  size="small"
                                  variant="text"
                                  startIcon={<AutoFixHighIcon />}
                                  onClick={() => handleSetMarkAutomatic(mark)}
                                  disabled={saving}
                                >
                                  Set Automatic
                                </Button>
                              )}
                              <Button size="small" variant="text" onClick={() => setEditingMarkIndex(-1)} disabled={saving}>Cancel</Button>
                            </Box>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function ConflictMarkDialog({
  open,
  onClose,
  loading,
  error,
  conflict,
  question,
  student,
  latestResponse,
  manualPoints,
  onManualPointsChange,
  saving,
  canAcceptAuto,
  onAcceptAuto,
  onSaveManual,
}) {
  if (!open) return null;

  const questionLabel = buildConflictQuestionLabel(conflict);
  const studentName = normalizeAnswerValue(student?.lastname) || normalizeAnswerValue(student?.firstname)
    ? `${normalizeAnswerValue(student?.lastname)}, ${normalizeAnswerValue(student?.firstname)}`.replace(/^,\s*/, '')
    : normalizeAnswerValue(conflict?.studentName) || normalizeAnswerValue(conflict?.studentId) || 'Student';
  const studentEmail = normalizeAnswerValue(student?.email);
  const studentAnswer = formatAnswerValue(question, latestResponse?.answer);
  const correctAnswer = formatCorrectAnswerValue(question);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{questionLabel}</DialogTitle>
      <DialogContent dividers>
        {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
        {loading ? (
          <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
              <Typography variant="body2">
                <strong>Student:</strong> {studentName}{studentEmail ? ` (${studentEmail})` : ''}
              </Typography>
              <Typography variant="body2">
                <strong>Current manual:</strong> {formatPercent(conflict?.existingPoints)} / {formatPercent(conflict?.outOf || question?.sessionOptions?.points || 0)}
              </Typography>
              <Typography variant="body2">
                <strong>Recalculated auto:</strong> {formatPercent(conflict?.calculatedPoints)}
              </Typography>
            </Paper>

            {question ? (
              <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Question</Typography>
                <QuestionDisplay question={question} />
              </Paper>
            ) : (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Question content could not be loaded for this conflict.
              </Alert>
            )}

            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Student answer:</strong> {studentAnswer}
              </Typography>
              <Typography variant="body2">
                <strong>Correct answer:</strong> {correctAnswer}
              </Typography>
            </Paper>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                type="number"
                label="Manual points"
                value={manualPoints}
                onChange={(event) => onManualPointsChange(event.target.value)}
                sx={{ width: 150 }}
                disabled={saving}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={onSaveManual}
                disabled={saving}
              >
                Save Manual Grade
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AutoFixHighIcon />}
                onClick={onAcceptAuto}
                disabled={saving || !canAcceptAuto}
              >
                Accept Auto Grade
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CourseGradesPanel({
  courseId,
  instructorView = false,
  onOpenSession,
  availableSessions = [],
  gradingSummaryBySessionId = {},
}) {
  const [loading, setLoading] = useState(() => !instructorView);
  const [loadingSessionOptions, setLoadingSessionOptions] = useState(false);
  const [error, setError] = useState('');
  const [sessionOptionsError, setSessionOptionsError] = useState('');
  const [fallbackSessionOptions, setFallbackSessionOptions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [rows, setRows] = useState([]);
  const [tableVisible, setTableVisible] = useState(() => !instructorView);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [sort, setSort] = useState({ field: 'name', direction: 'asc' });
  const [refreshingSessionIds, setRefreshingSessionIds] = useState({});
  const [recalculateAllProgress, setRecalculateAllProgress] = useState({
    active: false,
    total: 0,
    completed: 0,
    currentSessionName: '',
  });
  const [globalMessage, setGlobalMessage] = useState('');
  const [globalMessageType, setGlobalMessageType] = useState('info');
  const [sessionPicker, setSessionPicker] = useState({ open: false, mode: 'show' });
  const [sessionPickerSearch, setSessionPickerSearch] = useState('');
  const [sessionPickerSelectedIds, setSessionPickerSelectedIds] = useState([]);
  const [sessionPickerSubmitting, setSessionPickerSubmitting] = useState(false);
  const [conflictsDialog, setConflictsDialog] = useState({ open: false, conflicts: [] });
  const [conflictDetailState, setConflictDetailState] = useState({
    open: false,
    loading: false,
    saving: false,
    error: '',
    conflict: null,
    question: null,
    student: null,
    latestResponse: null,
    manualPoints: '',
  });
  const [gradeDialogState, setGradeDialogState] = useState({
    open: false,
    grade: null,
    student: null,
    sessionName: '',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const topScrollbarRef = useRef(null);
  const tableContainerRef = useRef(null);
  const conflictSessionResultsCacheRef = useRef(new Map());

  const hasProvidedSessionOptions = Array.isArray(availableSessions) && availableSessions.length > 0;

  const requestGradesData = useCallback(async (requestedSessionIds = []) => {
    const uniqueSessionIds = [...new Set((requestedSessionIds || []).map((id) => String(id)).filter(Boolean))];
    const params = {};
    if (uniqueSessionIds.length > 0) {
      params.sessionIds = uniqueSessionIds.join(',');
    }

    const requestConfig = Object.keys(params).length > 0 ? { params } : undefined;
    const { data } = await apiClient.get(`/courses/${courseId}/grades`, requestConfig);

    return {
      sessions: (data.sessions || []).map((session) => ({
        ...session,
        _id: String(session._id),
      })),
      rows: normalizeGradeRows(data.rows || []),
    };
  }, [courseId]);

  const fetchGrades = useCallback(async (requestedSessionIds = [], { applyToState = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const payload = await requestGradesData(requestedSessionIds);
      if (applyToState) {
        setSessions(payload.sessions);
        setRows(payload.rows);
      }
      return payload;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to load grades.';
      if (applyToState) {
        setError(message);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [requestGradesData]);

  const fetchFallbackSessionOptions = useCallback(async () => {
    if (!instructorView || hasProvidedSessionOptions) return;
    setLoadingSessionOptions(true);
    setSessionOptionsError('');
    try {
      const { data } = await apiClient.get(`/courses/${courseId}/sessions`);
      setFallbackSessionOptions(
        (data.sessions || []).map((session) => ({
          ...session,
          _id: String(session._id),
        }))
      );
    } catch (err) {
      setSessionOptionsError(err.response?.data?.message || 'Failed to load sessions for grade table.');
    } finally {
      setLoadingSessionOptions(false);
    }
  }, [courseId, hasProvidedSessionOptions, instructorView]);

  useEffect(() => {
    if (!instructorView) {
      fetchGrades([], { applyToState: true }).catch(() => {});
    }
  }, [fetchGrades, instructorView]);

  useEffect(() => {
    if (!instructorView || hasProvidedSessionOptions) {
      setFallbackSessionOptions([]);
      setLoadingSessionOptions(false);
      setSessionOptionsError('');
      return;
    }
    fetchFallbackSessionOptions();
  }, [fetchFallbackSessionOptions, hasProvidedSessionOptions, instructorView]);

  const sessionSelectionOptions = useMemo(() => {
    const sourceSessions = hasProvidedSessionOptions ? availableSessions : fallbackSessionOptions;
    const normalized = sourceSessions
      .map((session) => {
        const sessionId = String(session?._id || '').trim();
        if (!sessionId) return null;
        const summary = gradingSummaryBySessionId?.[sessionId] || {};
        return {
          ...session,
          _id: sessionId,
          marksNeedingGrading: Number(
            session?.marksNeedingGrading
            ?? summary?.marksNeedingGrading
            ?? 0
          ) || 0,
        };
      })
      .filter(Boolean);

    return normalized.sort((a, b) => getSessionSortTime(b) - getSessionSortTime(a));
  }, [availableSessions, fallbackSessionOptions, gradingSummaryBySessionId, hasProvidedSessionOptions]);

  const filteredSessionSelectionOptions = useMemo(() => {
    const normalizedSearch = normalizeAnswerValue(sessionPickerSearch).toLowerCase();
    if (!normalizedSearch) return sessionSelectionOptions;
    return sessionSelectionOptions.filter((session) => (
      normalizeAnswerValue(session?.name).toLowerCase().includes(normalizedSearch)
    ));
  }, [sessionPickerSearch, sessionSelectionOptions]);

  const visibleSessions = useMemo(() => sessions, [sessions]);

  const sortedRows = useMemo(() => (
    buildFilteredSortedRows(rows, studentSearchQuery, sort)
  ), [rows, sort, studentSearchQuery]);

  const paginatedRows = useMemo(() => {
    if (rowsPerPage === -1) return sortedRows;
    const start = page * rowsPerPage;
    return sortedRows.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, sortedRows]);

  const updateScrollWidth = useCallback(() => {
    const tableElement = tableContainerRef.current;
    if (!tableElement) return;
    setTableScrollWidth(tableElement.scrollWidth || 0);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [studentSearchQuery]);

  useEffect(() => {
    if (rowsPerPage === -1) {
      setPage(0);
      return;
    }
    setPage((previousPage) => {
      const maxPage = Math.max(Math.ceil(sortedRows.length / rowsPerPage) - 1, 0);
      return Math.min(previousPage, maxPage);
    });
  }, [rowsPerPage, sortedRows.length]);

  useEffect(() => {
    if (!tableVisible) return undefined;
    const rafId = window.requestAnimationFrame(updateScrollWidth);
    const handleResize = () => updateScrollWidth();
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [tableVisible, updateScrollWidth, visibleSessions.length, paginatedRows.length, rowsPerPage]);

  const handleSort = useCallback((field) => {
    setSort((previousSort) => {
      if (previousSort.field === field) {
        return {
          field,
          direction: previousSort.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        field,
        direction: field === 'avgParticipation' || field.endsWith('_smark') || field.endsWith('_spart')
          ? 'desc'
          : 'asc',
      };
    });
  }, []);

  const handleTopScrollbarScroll = useCallback(() => {
    if (!topScrollbarRef.current || !tableContainerRef.current) return;
    tableContainerRef.current.scrollLeft = topScrollbarRef.current.scrollLeft;
  }, []);

  const handleTableScroll = useCallback(() => {
    if (!topScrollbarRef.current || !tableContainerRef.current) return;
    topScrollbarRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
  }, []);

  const exportCsvWithData = useCallback((exportSessions, exportRows) => {
    if (!exportSessions.length || !exportRows.length) return;

    const header = ['Last name', 'First name', 'Email', 'Avg. Participation'];
    exportSessions.forEach((session) => {
      header.push(`${session.name} mark`);
      header.push(`${session.name} participation`);
    });

    const lines = exportRows.map((row) => {
      const line = [
        escapeCsvCell(row?.student?.lastname || ''),
        escapeCsvCell(row?.student?.firstname || ''),
        escapeCsvCell(row?.student?.email || ''),
        escapeCsvCell(formatPercent(row?.avgParticipation || 0)),
      ];

      exportSessions.forEach((session) => {
        const grade = row?.gradeBySession?.[session._id];
        line.push(escapeCsvCell(formatPercent(grade?.value || 0)));
        line.push(escapeCsvCell(formatPercent(grade?.participation || 0)));
      });

      return line.join(',');
    });

    const csvContent = [header.map(escapeCsvCell).join(','), ...lines].join('\n');
    downloadCsv('course_grades.csv', csvContent);
  }, []);

  const allSessionPickerIds = useMemo(() => (
    sessionSelectionOptions.map((session) => session._id)
  ), [sessionSelectionOptions]);

  const validSessionPickerSelection = useMemo(() => {
    if (!allSessionPickerIds.length) return [];
    const validIdSet = new Set(allSessionPickerIds);
    return [...new Set(sessionPickerSelectedIds.filter((id) => validIdSet.has(id)))];
  }, [allSessionPickerIds, sessionPickerSelectedIds]);

  const allSessionsSelected = allSessionPickerIds.length > 0
    && validSessionPickerSelection.length === allSessionPickerIds.length;
  const someSessionsSelected = validSessionPickerSelection.length > 0 && !allSessionsSelected;

  const openSessionPicker = useCallback((mode) => {
    const defaultSelectedIds = selectedSessionIds.length > 0
      ? selectedSessionIds
      : allSessionPickerIds;
    setSessionPickerSelectedIds(defaultSelectedIds);
    setSessionPickerSearch('');
    setSessionPicker({ open: true, mode });
  }, [allSessionPickerIds, selectedSessionIds]);

  const closeSessionPicker = useCallback(() => {
    if (sessionPickerSubmitting) return;
    setSessionPicker({ open: false, mode: 'show' });
  }, [sessionPickerSubmitting]);

  const toggleSessionPickerSession = useCallback((sessionId) => {
    setSessionPickerSelectedIds((previousIds) => {
      if (previousIds.includes(sessionId)) {
        return previousIds.filter((entry) => entry !== sessionId);
      }
      return [...previousIds, sessionId];
    });
  }, []);

  const toggleSelectAllSessions = useCallback((checked) => {
    if (checked) {
      setSessionPickerSelectedIds(allSessionPickerIds);
      return;
    }
    setSessionPickerSelectedIds([]);
  }, [allSessionPickerIds]);

  const handleConfirmSessionPicker = useCallback(async () => {
    const selectedIds = [...new Set(validSessionPickerSelection)];
    if (!selectedIds.length) return;

    setSessionPickerSubmitting(true);
    try {
      if (sessionPicker.mode === 'show') {
        const payload = await fetchGrades(selectedIds, { applyToState: true });
        const resolvedSessionIds = payload.sessions.map((session) => String(session._id));
        setSelectedSessionIds(resolvedSessionIds.length ? resolvedSessionIds : selectedIds);
        setTableVisible(true);
        setPage(0);
      } else {
        const payload = await fetchGrades(selectedIds, { applyToState: false });
        const exportRows = buildFilteredSortedRows(payload.rows, '', sort);
        exportCsvWithData(payload.sessions, exportRows);
      }
      setSessionPicker({ open: false, mode: 'show' });
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to load grade data.');
      setGlobalMessageType('error');
    } finally {
      setSessionPickerSubmitting(false);
    }
  }, [exportCsvWithData, fetchGrades, sessionPicker.mode, sort, validSessionPickerSelection]);

  const handleExportCsv = useCallback(() => {
    if (instructorView) {
      if (!tableVisible) {
        openSessionPicker('export');
        return;
      }
      exportCsvWithData(visibleSessions, sortedRows);
      return;
    }

    exportCsvWithData(visibleSessions, sortedRows);
  }, [
    exportCsvWithData,
    instructorView,
    openSessionPicker,
    sortedRows,
    tableVisible,
    visibleSessions,
  ]);

  const loadConflictSessionResults = useCallback(async (sessionId) => {
    const normalizedSessionId = normalizeAnswerValue(sessionId);
    if (!normalizedSessionId) return null;

    const cached = conflictSessionResultsCacheRef.current.get(normalizedSessionId);
    if (cached) return cached;

    const { data } = await apiClient.get(`/sessions/${normalizedSessionId}/results`);
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    const questionById = new Map();
    const questionNumberById = new Map();
    questions.forEach((question, index) => {
      const questionId = normalizeAnswerValue(question?._id);
      if (!questionId) return;
      questionById.set(questionId, question);
      questionNumberById.set(questionId, index + 1);
    });

    const studentResultById = new Map();
    const studentResults = Array.isArray(data?.studentResults) ? data.studentResults : [];
    studentResults.forEach((entry) => {
      const studentId = normalizeAnswerValue(entry?.studentId);
      if (!studentId) return;
      studentResultById.set(studentId, entry);
    });

    const normalizedPayload = {
      questionById,
      questionNumberById,
      studentResultById,
    };
    conflictSessionResultsCacheRef.current.set(normalizedSessionId, normalizedPayload);
    return normalizedPayload;
  }, []);

  const enrichConflictsWithSessionData = useCallback(async (conflicts = []) => {
    if (!Array.isArray(conflicts) || conflicts.length === 0) return [];

    const uniqueSessionIds = [...new Set(
      conflicts
        .map((entry) => normalizeAnswerValue(entry?.sessionId))
        .filter(Boolean)
    )];

    const sessionResultsById = {};
    await Promise.all(uniqueSessionIds.map(async (sessionId) => {
      try {
        sessionResultsById[sessionId] = await loadConflictSessionResults(sessionId);
      } catch {
        sessionResultsById[sessionId] = null;
      }
    }));

    return conflicts.map((conflict) => {
      const sessionId = normalizeAnswerValue(conflict?.sessionId);
      const questionId = normalizeAnswerValue(conflict?.questionId);
      const sessionResults = sessionResultsById[sessionId];
      const questionNumber = sessionResults?.questionNumberById?.get(questionId);
      if (!questionNumber) return conflict;
      return {
        ...conflict,
        questionNumber,
      };
    });
  }, [loadConflictSessionResults]);

  const recalculateOneSession = useCallback(async (session) => {
    const sessionId = normalizeAnswerValue(session?._id);
    if (!sessionId) {
      return {
        summary: {},
        warnings: [],
        conflicts: [],
      };
    }

    setRefreshingSessionIds((prev) => ({ ...prev, [sessionId]: true }));
    try {
      const { data } = await apiClient.post(`/sessions/${sessionId}/grades/recalculate`, {
        missingOnly: false,
      });
      const summary = data?.summary || {};
      const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
      const conflicts = (Array.isArray(summary.manualMarkConflicts) ? summary.manualMarkConflicts : [])
        .map((conflict) => ({
          ...conflict,
          sessionId,
          sessionName: normalizeAnswerValue(session?.name) || normalizeAnswerValue(conflict?.sessionName) || 'Session',
        }));
      return {
        summary,
        warnings,
        conflicts,
      };
    } finally {
      setRefreshingSessionIds((prev) => ({ ...prev, [sessionId]: false }));
    }
  }, []);

  const removeConflictFromDialogs = useCallback((targetConflict) => {
    setConflictsDialog((prev) => {
      const nextConflicts = prev.conflicts.filter((entry) => !isSameConflict(entry, targetConflict));
      return {
        ...prev,
        conflicts: nextConflicts,
      };
    });
    setConflictDetailState((prev) => {
      if (!prev.open || !isSameConflict(prev.conflict, targetConflict)) return prev;
      return {
        open: false,
        loading: false,
        saving: false,
        error: '',
        conflict: null,
        question: null,
        student: null,
        latestResponse: null,
        manualPoints: '',
      };
    });
  }, []);

  const handleRecalculateSession = useCallback(async (sessionId) => {
    if (!instructorView || recalculateAllProgress.active) return;

    const session = visibleSessions.find((entry) => String(entry._id) === String(sessionId));
    if (!session) return;

    try {
      const outcome = await recalculateOneSession(session);
      const enrichedConflicts = await enrichConflictsWithSessionData(outcome.conflicts);
      if (enrichedConflicts.length > 0) {
        setConflictsDialog((prev) => ({
          open: true,
          conflicts: mergeUniqueConflicts(prev.conflicts, enrichedConflicts),
        }));
      }
      if (outcome.warnings.length > 0) {
        setGlobalMessage(outcome.warnings.join(' '));
        setGlobalMessageType('warning');
      } else {
        setGlobalMessage('Grades recalculated.');
        setGlobalMessageType('success');
      }
      await fetchGrades(selectedSessionIds, { applyToState: true });
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to recalculate grades.');
      setGlobalMessageType('error');
    }
  }, [
    enrichConflictsWithSessionData,
    fetchGrades,
    instructorView,
    recalculateAllProgress.active,
    recalculateOneSession,
    selectedSessionIds,
    visibleSessions,
  ]);

  const handleRecalculateAll = useCallback(async () => {
    if (!instructorView || recalculateAllProgress.active || !visibleSessions.length) return;

    const collectedConflicts = [];
    const warningMessages = [];
    const errorMessages = [];

    setRecalculateAllProgress({
      active: true,
      total: visibleSessions.length,
      completed: 0,
      currentSessionName: '',
    });

    try {
      for (let index = 0; index < visibleSessions.length; index += 1) {
        const session = visibleSessions[index];
        setRecalculateAllProgress((prev) => ({
          ...prev,
          completed: index,
          currentSessionName: normalizeAnswerValue(session?.name) || 'Session',
        }));

        try {
          // eslint-disable-next-line no-await-in-loop
          const outcome = await recalculateOneSession(session);
          outcome.conflicts.forEach((conflict) => collectedConflicts.push(conflict));
          outcome.warnings.forEach((warning) => {
            warningMessages.push(`${normalizeAnswerValue(session?.name) || 'Session'}: ${warning}`);
          });
        } catch (err) {
          errorMessages.push(`${normalizeAnswerValue(session?.name) || 'Session'}: ${err.response?.data?.message || 'Failed to recalculate grades.'}`);
        }

        setRecalculateAllProgress((prev) => ({
          ...prev,
          completed: index + 1,
        }));
      }

      if (collectedConflicts.length > 0) {
        const enrichedConflicts = await enrichConflictsWithSessionData(collectedConflicts);
        setConflictsDialog((prev) => ({
          open: true,
          conflicts: mergeUniqueConflicts(prev.conflicts, enrichedConflicts),
        }));
      }

      await fetchGrades(selectedSessionIds, { applyToState: true });

      if (errorMessages.length > 0) {
        setGlobalMessage(errorMessages.join(' '));
        setGlobalMessageType('error');
      } else if (warningMessages.length > 0) {
        setGlobalMessage(warningMessages.join(' '));
        setGlobalMessageType('warning');
      } else {
        setGlobalMessage('Finished recalculating grades for selected sessions.');
        setGlobalMessageType('success');
      }
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to recalculate some grades.');
      setGlobalMessageType('error');
    } finally {
      setRecalculateAllProgress({
        active: false,
        total: 0,
        completed: 0,
        currentSessionName: '',
      });
    }
  }, [
    enrichConflictsWithSessionData,
    fetchGrades,
    instructorView,
    recalculateAllProgress.active,
    recalculateOneSession,
    selectedSessionIds,
    visibleSessions,
  ]);

  const handleAcceptConflict = useCallback(async (conflict) => {
    if (!conflict?.gradeId || !conflict?.questionId) return;
    await apiClient.post(`/grades/${conflict.gradeId}/marks/${conflict.questionId}/set-automatic`);
  }, []);

  const handleAcceptConflictFromList = useCallback(async (conflict) => {
    if (!isAutoGradeableConflict(conflict)) {
      setGlobalMessage('This question type cannot be auto-graded.');
      setGlobalMessageType('warning');
      return;
    }

    try {
      await handleAcceptConflict(conflict);
      removeConflictFromDialogs(conflict);
      setGlobalMessage('Applied recalculated automatic mark.');
      setGlobalMessageType('success');
      await fetchGrades(selectedSessionIds, { applyToState: true });
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to apply automatic mark.');
      setGlobalMessageType('error');
    }
  }, [fetchGrades, handleAcceptConflict, removeConflictFromDialogs, selectedSessionIds]);

  const handleOpenConflictDetail = useCallback(async (conflict) => {
    if (!conflict) return;

    const baseManualPoints = Number.isFinite(Number(conflict?.existingPoints))
      ? String(conflict.existingPoints)
      : '0';

    setConflictDetailState({
      open: true,
      loading: true,
      saving: false,
      error: '',
      conflict,
      question: null,
      student: null,
      latestResponse: null,
      manualPoints: baseManualPoints,
    });

    try {
      const sessionId = normalizeAnswerValue(conflict?.sessionId);
      const questionId = normalizeAnswerValue(conflict?.questionId);
      const studentId = normalizeAnswerValue(conflict?.studentId);
      if (!sessionId || !questionId || !studentId) {
        setConflictDetailState((prev) => ({
          ...prev,
          loading: false,
          error: 'Conflict detail is missing session, question, or student identifiers.',
        }));
        return;
      }

      const sessionResults = await loadConflictSessionResults(sessionId);
      const question = sessionResults?.questionById?.get(questionId) || null;
      const questionNumber = sessionResults?.questionNumberById?.get(questionId);
      const studentResult = sessionResults?.studentResultById?.get(studentId) || null;
      const questionResult = (studentResult?.questionResults || [])
        .find((entry) => String(entry?.questionId) === questionId);
      const latestResponse = getLatestResponse(questionResult?.responses || []);
      const student = studentResult
        ? {
          studentId,
          firstname: studentResult.firstname,
          lastname: studentResult.lastname,
          email: studentResult.email,
        }
        : null;

      setConflictDetailState((prev) => ({
        ...prev,
        loading: false,
        error: '',
        question,
        student,
        latestResponse,
        conflict: questionNumber
          ? { ...prev.conflict, questionNumber }
          : prev.conflict,
      }));
    } catch (err) {
      setConflictDetailState((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || 'Failed to load conflict details.',
      }));
    }
  }, [loadConflictSessionResults]);

  const handleCloseConflictDetail = useCallback(() => {
    if (conflictDetailState.saving) return;
    setConflictDetailState({
      open: false,
      loading: false,
      saving: false,
      error: '',
      conflict: null,
      question: null,
      student: null,
      latestResponse: null,
      manualPoints: '',
    });
  }, [conflictDetailState.saving]);

  const handleConflictManualPointsChange = useCallback((value) => {
    setConflictDetailState((prev) => ({
      ...prev,
      manualPoints: value,
      error: '',
    }));
  }, []);

  const handleAcceptConflictFromDetail = useCallback(async () => {
    const conflict = conflictDetailState.conflict;
    if (!conflict) return;
    if (!isAutoGradeableConflict(conflict, conflictDetailState.question)) {
      setConflictDetailState((prev) => ({
        ...prev,
        error: 'This question type cannot be auto-graded.',
      }));
      return;
    }

    setConflictDetailState((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      await handleAcceptConflict(conflict);
      removeConflictFromDialogs(conflict);
      setGlobalMessage('Applied recalculated automatic mark.');
      setGlobalMessageType('success');
      await fetchGrades(selectedSessionIds, { applyToState: true });
    } catch (err) {
      setConflictDetailState((prev) => ({
        ...prev,
        saving: false,
        error: err.response?.data?.message || 'Failed to apply automatic mark.',
      }));
    }
  }, [
    conflictDetailState.conflict,
    conflictDetailState.question,
    fetchGrades,
    handleAcceptConflict,
    removeConflictFromDialogs,
    selectedSessionIds,
  ]);

  const handleSaveManualConflictGrade = useCallback(async () => {
    const conflict = conflictDetailState.conflict;
    if (!conflict?.gradeId || !conflict?.questionId) return;

    const points = Number(conflictDetailState.manualPoints);
    if (!Number.isFinite(points) || points < 0) {
      setConflictDetailState((prev) => ({
        ...prev,
        error: 'Manual points must be a valid number greater than or equal to zero.',
      }));
      return;
    }

    setConflictDetailState((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      await apiClient.patch(`/grades/${conflict.gradeId}/marks/${conflict.questionId}`, { points });
      removeConflictFromDialogs(conflict);
      setGlobalMessage('Manual grade saved.');
      setGlobalMessageType('success');
      await fetchGrades(selectedSessionIds, { applyToState: true });
    } catch (err) {
      setConflictDetailState((prev) => ({
        ...prev,
        saving: false,
        error: err.response?.data?.message || 'Failed to save manual grade.',
      }));
    }
  }, [
    conflictDetailState.conflict,
    conflictDetailState.manualPoints,
    fetchGrades,
    removeConflictFromDialogs,
    selectedSessionIds,
  ]);

  const handleAcceptAllConflicts = useCallback(async () => {
    const autoConflicts = conflictsDialog.conflicts.filter((conflict) => isAutoGradeableConflict(conflict));
    if (!autoConflicts.length) {
      setGlobalMessage('No auto-gradeable conflicts to apply.');
      setGlobalMessageType('warning');
      return;
    }

    const acceptedConflicts = [];
    const errors = [];

    for (const conflict of autoConflicts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await handleAcceptConflict(conflict);
        acceptedConflicts.push(conflict);
      } catch (err) {
        errors.push(err.response?.data?.message || 'Failed to apply some recalculated marks.');
      }
    }

    if (acceptedConflicts.length > 0) {
      setConflictsDialog((prev) => ({
        ...prev,
        conflicts: prev.conflicts.filter((entry) => !acceptedConflicts.some((accepted) => isSameConflict(entry, accepted))),
      }));
      setConflictDetailState((prev) => {
        if (!prev.open || !acceptedConflicts.some((accepted) => isSameConflict(prev.conflict, accepted))) {
          return prev;
        }
        return {
          open: false,
          loading: false,
          saving: false,
          error: '',
          conflict: null,
          question: null,
          student: null,
          latestResponse: null,
          manualPoints: '',
        };
      });
      await fetchGrades(selectedSessionIds, { applyToState: true });
    }

    if (errors.length > 0) {
      setGlobalMessage(errors.join(' '));
      setGlobalMessageType('error');
    } else {
      const skippedCount = conflictsDialog.conflicts.length - autoConflicts.length;
      if (skippedCount > 0) {
        setGlobalMessage(`Applied automatic marks where supported. ${skippedCount} conflict(s) require manual handling.`);
        setGlobalMessageType('warning');
      } else {
        setGlobalMessage('Applied recalculated automatic marks for selected manual overrides.');
        setGlobalMessageType('success');
      }
    }
  }, [conflictsDialog.conflicts, fetchGrades, handleAcceptConflict, selectedSessionIds]);

  const handleOpenGradeDialog = useCallback((grade, student) => {
    if (!grade?._id) return;
    const matchingSession = visibleSessions.find((session) => String(session._id) === String(grade?.sessionId));
    setGradeDialogState({
      open: true,
      grade,
      student,
      sessionName: matchingSession?.name || grade?.name || '',
    });
  }, [visibleSessions]);

  const handleGradeDialogUpdated = useCallback(async () => {
    await fetchGrades(selectedSessionIds, { applyToState: true });
  }, [fetchGrades, selectedSessionIds]);

  if (loading && !instructorView) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !instructorView) {
    return <Alert severity="error">{error}</Alert>;
  }

  const canOpenSessionPicker = !loadingSessionOptions && allSessionPickerIds.length > 0;
  const canExportCurrentTable = tableVisible && visibleSessions.length > 0 && sortedRows.length > 0;

  return (
    <Box>
      {globalMessage ? (
        <Alert severity={globalMessageType} sx={{ mb: 1.5 }} onClose={() => setGlobalMessage('')}>
          {globalMessage}
        </Alert>
      ) : null}

      {instructorView && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => openSessionPicker('show')}
            disabled={!canOpenSessionPicker}
          >
            Show Grades Table
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCsv}
            disabled={tableVisible ? !canExportCurrentTable : !canOpenSessionPicker}
          >
            Export grades to CSV
          </Button>
          {loadingSessionOptions && <CircularProgress size={18} />}
        </Box>
      )}

      {sessionOptionsError && !tableVisible && (
        <Alert severity="error" sx={{ mb: 1.5 }}>{sessionOptionsError}</Alert>
      )}

      {instructorView && !tableVisible && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Choose one or more sessions to show the grade table.
        </Alert>
      )}

      <Dialog
        open={sessionPicker.open}
        onClose={closeSessionPicker}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {sessionPicker.mode === 'show' ? 'Select sessions for grade table' : 'Select sessions for CSV export'}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            size="small"
            fullWidth
            label="Search sessions"
            placeholder="Filter by session name"
            value={sessionPickerSearch}
            onChange={(event) => setSessionPickerSearch(event.target.value)}
            sx={{ mb: 1.25 }}
          />
          <FormControlLabel
            control={(
              <Checkbox
                size="small"
                checked={allSessionsSelected}
                indeterminate={someSessionsSelected}
                onChange={(event) => toggleSelectAllSessions(event.target.checked)}
              />
            )}
            label={`Select all (${allSessionPickerIds.length})`}
            sx={{ mb: 1 }}
          />
          {filteredSessionSelectionOptions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No sessions match your search.
            </Typography>
          ) : (
            <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 360, overflowY: 'auto' }}>
              {filteredSessionSelectionOptions.map((session) => {
                const sessionId = String(session._id);
                const checked = validSessionPickerSelection.includes(sessionId);
                const ungradedCount = Number(session.marksNeedingGrading || 0);
                return (
                  <ListItemButton key={sessionId} onClick={() => toggleSessionPickerSession(sessionId)}>
                    <Checkbox size="small" checked={checked} />
                    <ListItemText
                      primary={session.name || 'Untitled session'}
                      secondary={session.status ? `Status: ${session.status}` : undefined}
                    />
                    {ungradedCount > 0 && (
                      <Chip size="small" color="warning" variant="outlined" label={`Needs grading (${ungradedCount})`} />
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSessionPicker} disabled={sessionPickerSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmSessionPicker}
            disabled={sessionPickerSubmitting || !validSessionPickerSelection.length}
          >
            {sessionPicker.mode === 'show' ? 'Show Table' : 'Export CSV'}
          </Button>
        </DialogActions>
      </Dialog>

      {tableVisible && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
            {instructorView && (
              <StudentSearchField
                value={studentSearchQuery}
                onSearchChange={setStudentSearchQuery}
                disabled={loading}
              />
            )}
            {instructorView && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRecalculateAll}
                disabled={!visibleSessions.length || recalculateAllProgress.active}
              >
                Re-calculate all
              </Button>
            )}
            {!instructorView && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExportCsv}
                disabled={!visibleSessions.length || !sortedRows.length}
              >
                Export CSV
              </Button>
            )}
            {instructorView && (
              <Chip
                size="small"
                variant="outlined"
                label={`${visibleSessions.length} session${visibleSessions.length === 1 ? '' : 's'} selected`}
              />
            )}
          </Box>

          {recalculateAllProgress.active && (
            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.25 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Recalculating grades {recalculateAllProgress.completed}/{recalculateAllProgress.total}
                {recalculateAllProgress.currentSessionName ? `: ${recalculateAllProgress.currentSessionName}` : ''}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={recalculateAllProgress.total > 0
                  ? (100 * recalculateAllProgress.completed) / recalculateAllProgress.total
                  : 0}
              />
            </Paper>
          )}

          {loading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <>
              <TablePagination
                component="div"
                count={sortedRows.length}
                page={rowsPerPage === -1 ? 0 : page}
                onPageChange={(_, nextPage) => {
                  if (rowsPerPage === -1) {
                    setPage(0);
                    return;
                  }
                  setPage(nextPage);
                }}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setRowsPerPage(Number.isFinite(nextValue) ? nextValue : 25);
                  setPage(0);
                }}
                rowsPerPageOptions={instructorView ? [25, 50, 100, { label: 'All', value: -1 }] : [rowsPerPage]}
                labelRowsPerPage={instructorView ? 'Rows per page:' : ''}
                sx={{ mb: 0.75 }}
              />

              <Box
                ref={topScrollbarRef}
                onScroll={handleTopScrollbarScroll}
                sx={{
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  height: 12,
                  mb: 0.75,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ width: Math.max(tableScrollWidth, 1), height: 1 }} />
              </Box>

              <TableContainer
                ref={tableContainerRef}
                component={Paper}
                variant="outlined"
                onScroll={handleTableScroll}
              >
                <Table size="small" aria-label="Course grade table" sx={{ '& .MuiTableCell-root': { py: 0.55, px: 0.75 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, minWidth: 130 }}>
                        <TableSortLabel
                          active={sort.field === 'name'}
                          direction={sort.field === 'name' ? sort.direction : 'asc'}
                          onClick={() => handleSort('name')}
                        >
                          Student
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 160 }}>
                        <TableSortLabel
                          active={sort.field === 'email'}
                          direction={sort.field === 'email' ? sort.direction : 'asc'}
                          onClick={() => handleSort('email')}
                        >
                          Email
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 96 }}>
                        <TableSortLabel
                          active={sort.field === 'avgParticipation'}
                          direction={sort.field === 'avgParticipation' ? sort.direction : 'desc'}
                          onClick={() => handleSort('avgParticipation')}
                        >
                          Avg. Participation
                        </TableSortLabel>
                      </TableCell>
                      {visibleSessions.flatMap((session) => {
                        const markSortKey = `${session._id}_smark`;
                        const participationSortKey = `${session._id}_spart`;
                        const ungradedCount = Number(session.marksNeedingGrading || 0);
                        const showUngradedChip = instructorView
                          ? ungradedCount > 0
                          : rows.some((row) => {
                            const grade = row?.gradeBySession?.[session._id];
                            return Boolean(grade?.needsGrading && grade?.joined);
                          });
                        return [
                          <TableCell key={`${session._id}-mark`} sx={{ fontWeight: 700, minWidth: 125 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                <TableSortLabel
                                  active={sort.field === markSortKey}
                                  direction={sort.field === markSortKey ? sort.direction : 'desc'}
                                  onClick={() => handleSort(markSortKey)}
                                >
                                  {session.name} mark
                                </TableSortLabel>
                                {typeof onOpenSession === 'function' && (
                                  <Tooltip title="Open session review">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => onOpenSession(session._id)}
                                        sx={{ p: 0.25 }}
                                      >
                                        <ReviewIcon fontSize="inherit" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                )}
                                {instructorView && (
                                  <Tooltip title="Re-calculate this session's grades">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => handleRecalculateSession(session._id)}
                                        disabled={recalculateAllProgress.active || !!refreshingSessionIds[session._id]}
                                      >
                                        <RefreshIcon fontSize="inherit" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                )}
                              </Box>
                              {showUngradedChip && (
                                <Chip
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  label={instructorView ? `${ungradedCount} ungraded` : 'Ungraded'}
                                  sx={{ maxWidth: 140 }}
                                />
                              )}
                            </Box>
                          </TableCell>,
                          <TableCell key={`${session._id}-participation`} sx={{ fontWeight: 700, minWidth: 110 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                              <TableSortLabel
                                active={sort.field === participationSortKey}
                                direction={sort.field === participationSortKey ? sort.direction : 'desc'}
                                onClick={() => handleSort(participationSortKey)}
                              >
                                {session.name} part.
                              </TableSortLabel>
                            </Box>
                          </TableCell>,
                        ];
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedRows.map((row) => (
                      <TableRow key={row.student.studentId} hover>
                        <TableCell>
                          {row.student.lastname}, {row.student.firstname}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.student.email}</TableCell>
                        <TableCell>{formatPercent(row.avgParticipation)}%</TableCell>
                        {visibleSessions.map((session) => {
                          const grade = row.gradeBySession?.[session._id];
                          const markLabel = `${formatPercent(grade?.value || 0)}%`;
                          const participationLabel = `${formatPercent(grade?.participation || 0)}%`;
                          return (
                            <Fragment key={`${row.student.studentId}-${session._id}`}>
                              <TableCell>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => handleOpenGradeDialog(grade, row.student)}
                                  disabled={!grade?._id}
                                  sx={{ textTransform: 'none', px: 0 }}
                                >
                                  {markLabel}
                                </Button>
                                {grade?.needsGrading && grade?.joined && (
                                  <Chip size="small" color="error" label="Needs grading" sx={{ ml: 0.5 }} />
                                )}
                              </TableCell>
                              <TableCell>
                                {participationLabel}
                              </TableCell>
                            </Fragment>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </>
      )}

      <Dialog
        open={conflictsDialog.open}
        onClose={() => setConflictsDialog({ open: false, conflicts: [] })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Manual override conflicts</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Automatic recalculation produced different marks than existing manual overrides. Manual marks were preserved.
          </Typography>
          {conflictsDialog.conflicts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No conflicts.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Student</TableCell>
                    <TableCell>Question</TableCell>
                    <TableCell>Manual</TableCell>
                    <TableCell>Auto</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {conflictsDialog.conflicts.map((conflict) => (
                    <TableRow key={`${conflict.gradeId}-${conflict.questionId}-${conflict.studentId}`}>
                      <TableCell>{conflict.studentName || conflict.studentId}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => handleOpenConflictDetail(conflict)}
                          sx={{ px: 0, textTransform: 'none' }}
                        >
                          {buildConflictQuestionLabel(conflict)}
                        </Button>
                      </TableCell>
                      <TableCell>{formatPercent(conflict.existingPoints)}</TableCell>
                      <TableCell>{formatPercent(conflict.calculatedPoints)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleAcceptConflictFromList(conflict)}
                          disabled={!isAutoGradeableConflict(conflict)}
                        >
                          Accept Auto
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictsDialog({ open: false, conflicts: [] })}>Keep Manual</Button>
          <Button variant="contained" onClick={handleAcceptAllConflicts} disabled={!conflictsDialog.conflicts.length}>
            Accept All Auto Marks
          </Button>
        </DialogActions>
      </Dialog>

      <GradeDetailDialog
        open={gradeDialogState.open}
        onClose={() => setGradeDialogState({ open: false, grade: null, student: null, sessionName: '' })}
        grade={gradeDialogState.grade}
        student={gradeDialogState.student}
        sessionName={gradeDialogState.sessionName}
        instructorView={instructorView}
        onGradeUpdated={handleGradeDialogUpdated}
      />

      <ConflictMarkDialog
        open={conflictDetailState.open}
        onClose={handleCloseConflictDetail}
        loading={conflictDetailState.loading}
        error={conflictDetailState.error}
        conflict={conflictDetailState.conflict}
        question={conflictDetailState.question}
        student={conflictDetailState.student}
        latestResponse={conflictDetailState.latestResponse}
        manualPoints={conflictDetailState.manualPoints}
        onManualPointsChange={handleConflictManualPointsChange}
        saving={conflictDetailState.saving}
        canAcceptAuto={isAutoGradeableConflict(conflictDetailState.conflict, conflictDetailState.question)}
        onAcceptAuto={handleAcceptConflictFromDetail}
        onSaveManual={handleSaveManualConflictGrade}
      />
    </Box>
  );
}
