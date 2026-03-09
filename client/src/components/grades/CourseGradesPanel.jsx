import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
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
    return normalizeAnswerValue(row?.student?.lastname).toLowerCase();
  }
  if (field === 'email') {
    return normalizeAnswerValue(row?.student?.email).toLowerCase();
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

export default function CourseGradesPanel({
  courseId,
  instructorView = false,
  onOpenSession,
  fixedSessionIds = [],
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState({ field: 'name', direction: 'asc' });
  const [refreshingSessionIds, setRefreshingSessionIds] = useState({});
  const [globalMessage, setGlobalMessage] = useState('');
  const [globalMessageType, setGlobalMessageType] = useState('info');
  const [conflictsDialog, setConflictsDialog] = useState({ open: false, conflicts: [] });
  const [gradeDialogState, setGradeDialogState] = useState({
    open: false,
    grade: null,
    student: null,
    sessionName: '',
  });
  const normalizedFixedSessionIds = useMemo(
    () => [...new Set((fixedSessionIds || []).map((id) => normalizeAnswerValue(id)).filter(Boolean))],
    [fixedSessionIds]
  );
  const hasFixedSessions = normalizedFixedSessionIds.length > 0;

  const fetchGrades = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requestConfig = hasFixedSessions
        ? { params: { sessionIds: normalizedFixedSessionIds.join(',') } }
        : undefined;
      const { data } = await apiClient.get(`/courses/${courseId}/grades`, requestConfig);
      const nextSessions = data.sessions || [];
      const nextRows = (data.rows || []).map((row) => {
        const gradeBySession = {};
        (row.grades || []).forEach((grade) => {
          gradeBySession[String(grade.sessionId)] = grade;
        });
        return {
          ...row,
          gradeBySession,
        };
      });
      setSessions(nextSessions);
      setRows(nextRows);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load grades.');
    } finally {
      setLoading(false);
    }
  }, [courseId, hasFixedSessions, normalizedFixedSessionIds]);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  const visibleSessions = useMemo(() => sessions, [sessions]);

  const sortedRows = useMemo(() => {
    const normalizedSearch = normalizeAnswerValue(searchTerm).toLowerCase();

    const filtered = rows.filter((row) => {
      if (!normalizedSearch) return true;
      const haystack = [
        normalizeAnswerValue(row?.student?.firstname),
        normalizeAnswerValue(row?.student?.lastname),
        normalizeAnswerValue(row?.student?.email),
        normalizeAnswerValue(row?.student?.displayName),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    const next = [...filtered];
    next.sort((a, b) => {
      const aValue = buildSortValueForField(a, sort.field);
      const bValue = buildSortValueForField(b, sort.field);
      let compare = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        compare = aValue - bValue;
      } else {
        compare = String(aValue).localeCompare(String(bValue));
      }

      if (sort.field === 'name' && compare === 0) {
        compare = normalizeAnswerValue(a?.student?.firstname)
          .localeCompare(normalizeAnswerValue(b?.student?.firstname));
      }

      return sort.direction === 'asc' ? compare : -compare;
    });

    return next;
  }, [rows, searchTerm, sort]);

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

  const handleExportCsv = useCallback(() => {
    const header = ['Last name', 'First name', 'Email', 'Avg. Participation'];
    visibleSessions.forEach((session) => {
      header.push(`${session.name} mark`);
      header.push(`${session.name} participation`);
    });

    const lines = sortedRows.map((row) => {
      const line = [
        escapeCsvCell(row?.student?.lastname || ''),
        escapeCsvCell(row?.student?.firstname || ''),
        escapeCsvCell(row?.student?.email || ''),
        escapeCsvCell(formatPercent(row?.avgParticipation || 0)),
      ];

      visibleSessions.forEach((session) => {
        const grade = row?.gradeBySession?.[session._id];
        line.push(escapeCsvCell(formatPercent(grade?.value || 0)));
        line.push(escapeCsvCell(formatPercent(grade?.participation || 0)));
      });

      return line.join(',');
    });

    const csvContent = [header.map(escapeCsvCell).join(','), ...lines].join('\n');
    downloadCsv('course_grades.csv', csvContent);
  }, [sortedRows, visibleSessions]);

  const handleRecalculateSession = useCallback(async (sessionId) => {
    if (!instructorView) return;
    setRefreshingSessionIds((prev) => ({ ...prev, [sessionId]: true }));
    try {
      const { data } = await apiClient.post(`/sessions/${sessionId}/grades/recalculate`, {
        missingOnly: false,
      });
      const summary = data.summary || {};
      if (Array.isArray(summary.manualMarkConflicts) && summary.manualMarkConflicts.length > 0) {
        setConflictsDialog({ open: true, conflicts: summary.manualMarkConflicts });
      }
      if (summary.warnings?.length) {
        setGlobalMessage(summary.warnings.join(' '));
        setGlobalMessageType('warning');
      } else {
        setGlobalMessage('Grades recalculated.');
        setGlobalMessageType('success');
      }
      await fetchGrades();
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to recalculate grades.');
      setGlobalMessageType('error');
    } finally {
      setRefreshingSessionIds((prev) => ({ ...prev, [sessionId]: false }));
    }
  }, [fetchGrades, instructorView]);

  const handleRecalculateAll = useCallback(async () => {
    if (!instructorView || !visibleSessions.length) return;
    for (const session of visibleSessions) {
      // eslint-disable-next-line no-await-in-loop
      await handleRecalculateSession(session._id);
    }
  }, [handleRecalculateSession, instructorView, visibleSessions]);

  const handleAcceptConflict = useCallback(async (conflict) => {
    if (!conflict?.gradeId || !conflict?.questionId) return;
    await apiClient.post(`/grades/${conflict.gradeId}/marks/${conflict.questionId}/set-automatic`);
  }, []);

  const handleAcceptAllConflicts = useCallback(async () => {
    try {
      for (const conflict of conflictsDialog.conflicts) {
        // eslint-disable-next-line no-await-in-loop
        await handleAcceptConflict(conflict);
      }
      setConflictsDialog({ open: false, conflicts: [] });
      setGlobalMessage('Applied recalculated automatic marks for selected manual overrides.');
      setGlobalMessageType('success');
      await fetchGrades();
    } catch (err) {
      setGlobalMessage(err.response?.data?.message || 'Failed to apply some recalculated marks.');
      setGlobalMessageType('error');
    }
  }, [conflictsDialog.conflicts, fetchGrades, handleAcceptConflict]);

  const handleOpenGradeDialog = useCallback((grade, student) => {
    if (!grade?._id) return;
    const matchingSession = sessions.find((session) => String(session._id) === String(grade?.sessionId));
    setGradeDialogState({
      open: true,
      grade,
      student,
      sessionName: matchingSession?.name || grade?.name || '',
    });
  }, [sessions]);

  const handleGradeDialogUpdated = useCallback(async () => {
    await fetchGrades();
  }, [fetchGrades]);

  if (loading) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      {globalMessage ? (
        <Alert severity={globalMessageType} sx={{ mb: 1.5 }} onClose={() => setGlobalMessage('')}>
          {globalMessage}
        </Alert>
      ) : null}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Search students"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          sx={{ minWidth: 220 }}
        />
        {instructorView && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRecalculateAll}
            disabled={!visibleSessions.length}
          >
            Re-calculate all
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportCsv}
          disabled={!visibleSessions.length || !sortedRows.length}
        >
          Export CSV
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Course grade table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>
                <TableSortLabel
                  active={sort.field === 'name'}
                  direction={sort.field === 'name' ? sort.direction : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Student
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>
                <TableSortLabel
                  active={sort.field === 'email'}
                  direction={sort.field === 'email' ? sort.direction : 'asc'}
                  onClick={() => handleSort('email')}
                >
                  Email
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 120 }}>
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
                return [
                  <TableCell key={`${session._id}-mark`} sx={{ fontWeight: 700, minWidth: 180 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                        {typeof onOpenSession === 'function' ? (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<ReviewIcon />}
                            onClick={() => onOpenSession(session._id)}
                            sx={{ textTransform: 'none', minWidth: 0, px: 0 }}
                          >
                            {session.name} mark
                          </Button>
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {session.name} mark
                          </Typography>
                        )}
                        {instructorView && (
                          <Tooltip title="Re-calculate this session's grades">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleRecalculateSession(session._id)}
                                disabled={!!refreshingSessionIds[session._id]}
                              >
                                <RefreshIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
                      {(session.marksNeedingGrading || 0) > 0 && (
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={`${session.marksNeedingGrading} ungraded`}
                          sx={{ maxWidth: 140 }}
                        />
                      )}
                      <TableSortLabel
                        active={sort.field === markSortKey}
                        direction={sort.field === markSortKey ? sort.direction : 'desc'}
                        onClick={() => handleSort(markSortKey)}
                      >
                        Sort
                      </TableSortLabel>
                    </Box>
                  </TableCell>,
                  <TableCell key={`${session._id}-participation`} sx={{ fontWeight: 700, minWidth: 130 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{session.name} participation</Typography>
                      <TableSortLabel
                        active={sort.field === participationSortKey}
                        direction={sort.field === participationSortKey ? sort.direction : 'desc'}
                        onClick={() => handleSort(participationSortKey)}
                      >
                        Sort
                      </TableSortLabel>
                    </Box>
                  </TableCell>,
                ];
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.student.studentId} hover>
                <TableCell>
                  {row.student.lastname}, {row.student.firstname}
                </TableCell>
                <TableCell>{row.student.email}</TableCell>
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
                      <TableCell>{conflict.questionId}</TableCell>
                      <TableCell>{formatPercent(conflict.existingPoints)}</TableCell>
                      <TableCell>{formatPercent(conflict.calculatedPoints)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={async () => {
                            await handleAcceptConflict(conflict);
                            setConflictsDialog((prev) => ({
                              ...prev,
                              conflicts: prev.conflicts.filter((entry) => (
                                !(entry.gradeId === conflict.gradeId && entry.questionId === conflict.questionId && entry.studentId === conflict.studentId)
                              )),
                            }));
                            await fetchGrades();
                          }}
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
    </Box>
  );
}
