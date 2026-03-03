import { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Paper, Chip,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, Snackbar, Switch, FormControlLabel, CircularProgress,
  Card, CardContent, Tooltip, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  ArrowBack as BackIcon, ContentCopy as CopyIcon, Delete as DeleteIcon,
  Add as AddIcon, Edit as EditIcon,
  KeyboardArrowUp as UpIcon, KeyboardArrowDown as DownIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import QuestionEditor from '../../components/questions/QuestionEditor';
import QuestionDisplay from '../../components/questions/QuestionDisplay';
import AutoSaveStatus from '../../components/common/AutoSaveStatus';

const STATUS_COLORS = { hidden: 'default', visible: 'info', running: 'success', done: 'secondary' };
const STATUS_LABELS = {
  hidden: 'Draft',
  visible: 'Upcoming',
  running: 'Live',
  done: 'Ended',
};

const MAX_COURSE_TAB_INDEX = 4;

function parseCourseTab(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < 0 || parsed > MAX_COURSE_TAB_INDEX) return 0;
  return parsed;
}

export default function SessionEditor() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnTab = parseCourseTab(searchParams.get('returnTab') ?? location.state?.returnTab);
  const courseBackLink = returnTab === 0
    ? `/manage/course/${courseId}`
    : `/manage/course/${courseId}?tab=${returnTab}`;

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // Edit session fields
  const [editFields, setEditFields] = useState({ name: '', description: '' });
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaveStatus, setSessionSaveStatus] = useState('idle');
  const [sessionSaveError, setSessionSaveError] = useState('');

  // Quiz settings
  const [quiz, setQuiz] = useState(false);
  const [practiceQuiz, setPracticeQuiz] = useState(false);
  const [quizStart, setQuizStart] = useState('');
  const [quizEnd, setQuizEnd] = useState('');
  const [reviewable, setReviewable] = useState(false);
  const [status, setStatus] = useState('hidden');
  const [sessionDate, setSessionDate] = useState('');

  // Dialogs
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmGoLiveOpen, setConfirmGoLiveOpen] = useState(false);

  // Question editor
  const [inlineEditor, setInlineEditor] = useState(null);

  // Delete question
  const [deleteQTarget, setDeleteQTarget] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState({});

  const fetchSession = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}`);
      const s = data.session || data;
      setSession(s);
      setEditFields({ name: s.name || '', description: s.description || '' });
      setQuiz(!!s.quiz);
      setPracticeQuiz(!!s.practiceQuiz);
      setQuizStart(s.quizStart ? new Date(s.quizStart).toISOString().slice(0, 16) : '');
      setQuizEnd(s.quizEnd ? new Date(s.quizEnd).toISOString().slice(0, 16) : '');
      setReviewable(!!s.reviewable);
      setStatus(s.status || 'hidden');
      setSessionDate(s.date ? new Date(s.date).toISOString().slice(0, 16) : '');

      // Fetch full question objects
      const qIds = s.questions || [];
      if (qIds.length) {
        const results = await Promise.all(
          qIds.map(qId => apiClient.get(`/questions/${qId}`).then(r => r.data.question || r.data).catch(() => null))
        );
        setQuestions(results.filter(Boolean));
      } else {
        setQuestions([]);
      }
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load session' });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  const toIsoIfValid = (dateValue) => {
    if (!dateValue) return null;
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  // Save session properties immediately as fields change
  const saveSessionPatch = async (updates) => {
    setSavingSession(true);
    setSessionSaveStatus('saving');
    setSessionSaveError('');
    try {
      const { data } = await apiClient.patch(`/sessions/${sessionId}`, updates);
      setSession(data.session || data);
      setSessionSaveStatus('success');
    } catch (err) {
      setSessionSaveStatus('error');
      const message = err.response?.data?.message || 'Failed to update session.';
      setSessionSaveError(`${message} Your last change was not recorded.`);
      fetchSession();
    } finally {
      setSavingSession(false);
    }
  };

  const handleStatusChange = (nextStatus) => {
    if (nextStatus === status) return;
    if (nextStatus === 'running') {
      setConfirmGoLiveOpen(true);
      return;
    }
    setStatus(nextStatus);
    saveSessionPatch({ status: nextStatus });
  };

  const confirmGoLive = () => {
    setConfirmGoLiveOpen(false);
    setStatus('running');
    saveSessionPatch({ status: 'running' });
  };

  // Delete session
  const handleDeleteSession = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/sessions/${sessionId}`);
      navigate(courseBackLink);
    } catch {
      setMsg({ severity: 'error', text: 'Failed to delete session' });
      setDeleting(false);
    }
  };

  // Copy session
  const handleCopySession = async () => {
    setCopying(true);
    try {
      const { data } = await apiClient.post(`/sessions/${sessionId}/copy`);
      const newId = data.session?._id || data._id;
      setMsg({ severity: 'success', text: 'Session copied' });
      if (newId) {
        navigate(
          `/manage/course/${courseId}/session/${newId}?returnTab=${returnTab}`,
          { state: { returnTab } }
        );
      }
    } catch {
      setMsg({ severity: 'error', text: 'Failed to copy session' });
    } finally {
      setCopying(false);
    }
  };

  const upsertQuestionLocally = useCallback((savedQuestion, orderedIds = null) => {
    setQuestions((prev) => {
      const existingIdx = prev.findIndex(q => q._id === savedQuestion._id);
      const mergedQuestion = existingIdx === -1 ? savedQuestion : { ...prev[existingIdx], ...savedQuestion };

      let next = existingIdx === -1
        ? [...prev, mergedQuestion]
        : prev.map((q, idx) => (idx === existingIdx ? mergedQuestion : q));

      if (Array.isArray(orderedIds)) {
        const byId = new Map(next.map(q => [q._id, q]));
        next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      }

      return next;
    });

    setSession((prev) => {
      if (!prev) return prev;

      if (Array.isArray(orderedIds)) {
        return { ...prev, questions: orderedIds };
      }

      const ids = prev.questions || [];
      if (ids.includes(savedQuestion._id)) return prev;
      return { ...prev, questions: [...ids, savedQuestion._id] };
    });
  }, []);

  const applyQuestionOrderLocally = useCallback((orderedIds) => {
    setQuestions((prev) => {
      const byId = new Map(prev.map(q => [q._id, q]));
      return orderedIds.map((id) => byId.get(id)).filter(Boolean);
    });
    setSession((prev) => (prev ? { ...prev, questions: orderedIds } : prev));
  }, []);

  const openInsertEditorAt = (index) => {
    if (inlineEditor) {
      setMsg({ severity: 'info', text: 'Close the current question editor before opening another.' });
      return;
    }
    setInlineEditor({ mode: 'insert', index, key: Date.now() });
  };

  const openEditEditor = (questionId) => {
    if (inlineEditor) {
      if (inlineEditor.mode === 'edit' && inlineEditor.questionId === questionId) return;
      setMsg({ severity: 'info', text: 'Close the current question editor before opening another.' });
      return;
    }
    setInlineEditor({ mode: 'edit', questionId, key: Date.now() });
  };

  const shiftInsertEditor = (direction) => {
    setInlineEditor((prev) => {
      if (!prev || prev.mode !== 'insert') return prev;
      const nextIndex = Math.max(0, Math.min(questions.length, prev.index + direction));
      if (nextIndex === prev.index) return prev;
      return { ...prev, index: nextIndex };
    });
  };

  const closeInlineEditor = async ({ persistedQuestionId } = {}) => {
    setInlineEditor(null);

    if (persistedQuestionId) {
      try {
        const { data } = await apiClient.get(`/questions/${persistedQuestionId}`);
        const refreshed = data.question || data;
        upsertQuestionLocally(refreshed);
      } catch {
        // Keep local state if refresh fails.
      }
    }
  };

  const handleAutoSaveQuestion = async (payload, questionId) => {
    try {
      if (questionId) {
        const { data } = await apiClient.patch(`/questions/${questionId}`, payload);
        const updated = data.question || data;
        upsertQuestionLocally(updated);
        return updated;
      }

      const insertIndex = inlineEditor?.mode === 'insert' ? inlineEditor.index : questions.length;
      const { data } = await apiClient.post('/questions', { ...payload, sessionId, courseId });
      const created = data.question || data;
      await apiClient.post(`/sessions/${sessionId}/questions`, { questionId: created._id });

      const currentIds = (session?.questions || questions.map(q => q._id)).filter((id) => id !== created._id);
      const orderedIds = [...currentIds];
      const clampedIndex = Math.max(0, Math.min(insertIndex, orderedIds.length));
      orderedIds.splice(clampedIndex, 0, created._id);

      await apiClient.patch(`/sessions/${sessionId}/questions/order`, { questions: orderedIds });
      upsertQuestionLocally(created, orderedIds);

      setInlineEditor((prev) => {
        if (!prev || prev.mode !== 'insert') return prev;
        return { mode: 'edit', questionId: created._id, key: prev.key };
      });

      return created;
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to auto-save question' });
      throw err;
    }
  };

  // Delete question
  const handleDeleteQuestion = async (qId) => {
    try {
      await apiClient.delete(`/sessions/${sessionId}/questions/${qId}`);
      await apiClient.delete(`/questions/${qId}`);
      setInlineEditor((prev) => {
        if (!prev) return prev;
        if (prev.mode === 'edit' && prev.questionId === qId) return null;
        return prev;
      });
      setDeleteQTarget(null);
      fetchSession();
      setMsg({ severity: 'success', text: 'Question deleted' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to delete question' });
    }
  };

  // Move question (reorder)
  const handleMove = async (idx, direction) => {
    const ids = questions.map(q => q._id);
    const target = idx + direction;
    if (target < 0 || target >= ids.length) return;
    const orderedIds = ids.slice();
    [orderedIds[idx], orderedIds[target]] = [orderedIds[target], orderedIds[idx]];

    applyQuestionOrderLocally(orderedIds);
    try {
      await apiClient.patch(`/sessions/${sessionId}/questions/order`, { questions: orderedIds });
    } catch {
      fetchSession();
      setMsg({ severity: 'error', text: 'Failed to reorder questions' });
    }
  };

  const toggleQuestionExpanded = (questionId) => {
    setExpandedQuestions((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const editingQuestionId = inlineEditor?.mode === 'edit' ? inlineEditor.questionId : null;
  const insertingAtIndex = inlineEditor?.mode === 'insert' ? inlineEditor.index : -1;

  const renderInlineEditorCard = ({ key, index, initialQuestion = null }) => (
    <Card key={key} variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Tooltip title={initialQuestion ? 'Move up' : 'Move insertion up'}>
            <span>
              <IconButton
                size="small"
                disabled={index === 0}
                onClick={() => {
                  if (initialQuestion) handleMove(index, -1);
                  else shiftInsertEditor(-1);
                }}
              >
                <UpIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={initialQuestion ? 'Move down' : 'Move insertion down'}>
            <span>
              <IconButton
                size="small"
                disabled={index >= questions.length - (initialQuestion ? 1 : 0)}
                onClick={() => {
                  if (initialQuestion) handleMove(index, 1);
                  else shiftInsertEditor(1);
                }}
              >
                <DownIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Box sx={{ minWidth: 28, pt: 0.75 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {index + 1}.
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }}>
          <QuestionEditor
            key={`inline-editor-${inlineEditor?.key}-${initialQuestion?._id || 'new'}`}
            inline
            open
            onClose={closeInlineEditor}
            onAutoSave={handleAutoSaveQuestion}
            initial={initialQuestion}
          />
        </Box>

        {initialQuestion ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => setDeleteQTarget(initialQuestion)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!session) return <Box sx={{ p: 3 }}><Alert severity="error">Session not found</Alert></Box>;

  return (
    <Box sx={{ p: 2, maxWidth: 980, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate(courseBackLink)}><BackIcon /></IconButton>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>{session.name}</Typography>
        <Chip label={STATUS_LABELS[status] || status} color={STATUS_COLORS[status] || 'default'} size="small" />
      </Box>

      {/* Session Properties */}
      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Session Settings</Typography>
        <AutoSaveStatus status={savingSession ? 'saving' : sessionSaveStatus} errorText={sessionSaveError} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Name" fullWidth value={editFields.name}
            onChange={e => setEditFields({ ...editFields, name: e.target.value })}
            onBlur={() => {
              if (editFields.name !== (session.name || '')) {
                saveSessionPatch({ name: editFields.name });
              }
            }}
            disabled={savingSession}
          />
          <TextField
            label="Description" fullWidth multiline minRows={2} value={editFields.description}
            onChange={e => setEditFields({ ...editFields, description: e.target.value })}
            onBlur={() => {
              if (editFields.description !== (session.description || '')) {
                saveSessionPatch({ description: editFields.description });
              }
            }}
            disabled={savingSession}
          />

          <FormControl sx={{ maxWidth: 280 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={savingSession}
            >
              <MenuItem value="hidden">Draft</MenuItem>
              <MenuItem value="visible">Upcoming</MenuItem>
              <MenuItem value="running">Live</MenuItem>
              <MenuItem value="done">Ended</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={(
                <Switch
                  checked={quiz}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setQuiz(checked);
                    saveSessionPatch({ quiz: checked });
                  }}
                  disabled={savingSession}
                />
              )}
              label="Quiz"
            />
            <FormControlLabel
              control={(
                <Switch
                  checked={practiceQuiz}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPracticeQuiz(checked);
                    saveSessionPatch({ practiceQuiz: checked });
                  }}
                  disabled={savingSession}
                />
              )}
              label="Practice Quiz"
            />
            <FormControlLabel
              control={(
                <Switch
                  checked={reviewable}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setReviewable(checked);
                    saveSessionPatch({ reviewable: checked });
                  }}
                  disabled={savingSession}
                />
              )}
              label="Reviewable"
            />
          </Box>

          {(quiz || practiceQuiz) && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Quiz Start" type="datetime-local" fullWidth
                InputLabelProps={{ shrink: true }}
                value={quizStart}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuizStart(val);
                  const iso = toIsoIfValid(val);
                  if (iso) saveSessionPatch({ quizStart: iso });
                }}
                disabled={savingSession}
              />
              <TextField
                label="Quiz End" type="datetime-local" fullWidth
                InputLabelProps={{ shrink: true }}
                value={quizEnd}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuizEnd(val);
                  const iso = toIsoIfValid(val);
                  if (iso) saveSessionPatch({ quizEnd: iso });
                }}
                disabled={savingSession}
              />
            </Box>
          )}

          {!(quiz || practiceQuiz) && (
            <TextField
              label="Session Date"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={sessionDate}
              onChange={(e) => {
                const val = e.target.value;
                setSessionDate(val);
                const iso = toIsoIfValid(val);
                if (iso) saveSessionPatch({ date: iso });
              }}
              sx={{ maxWidth: 360 }}
              disabled={savingSession}
            />
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button startIcon={<CopyIcon />} onClick={handleCopySession} disabled={copying}>
              {copying ? 'Copying…' : 'Copy Session'}
            </Button>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)}>
              Delete Session
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Questions */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Questions ({questions.length})</Typography>

        {questions.length === 0 && (
          <Typography color="text.secondary" sx={{ pb: 1.5, textAlign: 'center' }}>
            No questions yet. Use the button below to add one.
          </Typography>
        )}

        {[...Array(questions.length + 1).keys()].map((slotIdx) => {
          const slotKey = `slot-${slotIdx}`;
          const currentQuestion = questions[slotIdx];

          return (
            <Box key={slotKey}>
              {insertingAtIndex === slotIdx ? (
                renderInlineEditorCard({
                  key: `insert-editor-${inlineEditor?.key}-${slotIdx}`,
                  index: slotIdx,
                  initialQuestion: null,
                })
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => openInsertEditorAt(slotIdx)}
                  >
                    Add Question
                  </Button>
                </Box>
              )}

              {currentQuestion ? (
                editingQuestionId === currentQuestion._id ? (
                  renderInlineEditorCard({
                    key: `edit-editor-${currentQuestion._id}-${inlineEditor?.key}`,
                    index: slotIdx,
                    initialQuestion: currentQuestion,
                  })
                ) : (
                  <Card key={currentQuestion._id} variant="outlined" sx={{ mb: 1.5 }}>
                    <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Tooltip title="Move up">
                          <span>
                            <IconButton size="small" disabled={slotIdx === 0} onClick={() => handleMove(slotIdx, -1)}>
                              <UpIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move down">
                          <span>
                            <IconButton size="small" disabled={slotIdx === questions.length - 1} onClick={() => handleMove(slotIdx, 1)}>
                              <DownIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>

                      <Box sx={{ minWidth: 28, pt: 0.75 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {slotIdx + 1}.
                        </Typography>
                      </Box>

                      <Box sx={{ flexGrow: 1 }}>
                        <Box
                          sx={{
                            maxHeight: expandedQuestions[currentQuestion._id] ? 'none' : 120,
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <QuestionDisplay question={currentQuestion} />
                          {!expandedQuestions[currentQuestion._id] && (
                            <Box
                              sx={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                height: 36,
                                background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
                              }}
                            />
                          )}
                        </Box>
                        <Button
                          size="small"
                          endIcon={expandedQuestions[currentQuestion._id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          onClick={() => toggleQuestionExpanded(currentQuestion._id)}
                          sx={{ mt: 0.5 }}
                        >
                          {expandedQuestions[currentQuestion._id] ? 'Show less' : 'Show more'}
                        </Button>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEditEditor(currentQuestion._id)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteQTarget(currentQuestion)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </CardContent>
                  </Card>
                )
              ) : null}
            </Box>
          );
        })}
      </Paper>

      {/* Delete Session Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Session?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete &quot;{session.name}&quot; and all its questions. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteSession} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Go Live Confirmation */}
      <Dialog open={confirmGoLiveOpen} onClose={() => setConfirmGoLiveOpen(false)}>
        <DialogTitle>Go live now?</DialogTitle>
        <DialogContent>
          <Typography>
            Changing status to Live will immediately make this session available to students.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmGoLiveOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={confirmGoLive}>
            Go Live
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Question Confirmation */}
      <Dialog open={!!deleteQTarget} onClose={() => setDeleteQTarget(null)}>
        <DialogTitle>Delete Question?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently remove this question from the session.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteQTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleDeleteQuestion(deleteQTarget._id)}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
