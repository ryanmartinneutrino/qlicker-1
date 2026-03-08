import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Paper,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, Snackbar, Switch, FormControlLabel, CircularProgress,
  Card, CardContent, Tooltip, FormControl, InputLabel, Select, MenuItem,
  Menu, Autocomplete,
} from '@mui/material';
import {
  ArrowBack as BackIcon, ContentCopy as CopyIcon, Delete as DeleteIcon,
  Add as AddIcon, Edit as EditIcon,
  Close as CloseIcon,
  KeyboardArrowUp as UpIcon, KeyboardArrowDown as DownIcon,
  ExpandMore as ExpandMoreIcon,
  MoreVert as MoreIcon,
  PlayArrow as LaunchIcon, Login as JoinIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import QuestionEditor from '../../components/questions/QuestionEditor';
import QuestionDisplay from '../../components/questions/QuestionDisplay';
import AutoSaveStatus from '../../components/common/AutoSaveStatus';
import SessionStatusChip from '../../components/common/SessionStatusChip';

const PAGE_SECTION_GAP = 1.5;
const SETTINGS_STACK_GAP = 1.5;

const MAX_COURSE_TAB_INDEX = 4;

function parseCourseTab(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < 0 || parsed > MAX_COURSE_TAB_INDEX) return 0;
  return parsed;
}

function toDateTimeLocalString(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 16);
}

function formatStudentLabel(student) {
  const first = String(student?.profile?.firstname || '').trim();
  const last = String(student?.profile?.lastname || '').trim();
  const email = String(student?.emails?.[0]?.address || student?.email || '').trim();
  const fullName = `${first} ${last}`.trim();
  if (fullName && email) return `${fullName} (${email})`;
  return fullName || email || 'Unknown Student';
}

function compareStudentsByLastName(a, b) {
  const aLast = String(a?.profile?.lastname || '').trim();
  const bLast = String(b?.profile?.lastname || '').trim();
  const lastCmp = aLast.localeCompare(bLast);
  if (lastCmp !== 0) return lastCmp;
  const aFirst = String(a?.profile?.firstname || '').trim();
  const bFirst = String(b?.profile?.firstname || '').trim();
  const firstCmp = aFirst.localeCompare(bFirst);
  if (firstCmp !== 0) return firstCmp;
  const aEmail = String(a?.emails?.[0]?.address || a?.email || '').trim();
  const bEmail = String(b?.emails?.[0]?.address || b?.email || '').trim();
  return aEmail.localeCompare(bEmail);
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

  // Join code settings
  const [joinCodeEnabled, setJoinCodeEnabled] = useState(false);
  const [joinCodeInterval, setJoinCodeInterval] = useState(10);

  // Quiz extensions
  const [courseStudents, setCourseStudents] = useState([]);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [extensionDrafts, setExtensionDrafts] = useState([]);
  const [extensionStudent, setExtensionStudent] = useState(null);
  const [savingExtensions, setSavingExtensions] = useState(false);

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
  const [questionActions, setQuestionActions] = useState({ anchorEl: null, context: null });
  const [responseBackedQuestionIds, setResponseBackedQuestionIds] = useState(new Set());
  const [unlockEndedEditing, setUnlockEndedEditing] = useState(false);

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
      setJoinCodeEnabled(!!s.joinCodeEnabled);
      setJoinCodeInterval(s.joinCodeInterval || 10);
      setExtensionDrafts((s.quizExtensions || []).map((extension) => ({
        userId: extension.userId,
        quizStart: toDateTimeLocalString(extension.quizStart),
        quizEnd: toDateTimeLocalString(extension.quizEnd),
      })));
      setUnlockEndedEditing((prev) => (s.status === 'done' ? prev : true));

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

      // Identify questions that already have response data attached.
      try {
        const { data: resultsData } = await apiClient.get(`/sessions/${sessionId}/results`);
        const backedIds = new Set();
        (resultsData?.studentResults || []).forEach((studentResult) => {
          (studentResult?.questionResults || []).forEach((questionResult) => {
            if ((questionResult?.responses || []).length > 0) {
              backedIds.add(String(questionResult.questionId));
            }
          });
        });
        setResponseBackedQuestionIds(backedIds);
      } catch {
        setResponseBackedQuestionIds(new Set());
      }

      try {
        const { data: courseData } = await apiClient.get(`/courses/${courseId}`);
        const students = (courseData?.course?.students || []).slice().sort(compareStudentsByLastName);
        setCourseStudents(students);
      } catch {
        setCourseStudents([]);
      }
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load session' });
    } finally {
      setLoading(false);
    }
  }, [courseId, sessionId]);

  useEffect(() => {
    if (status === 'done') {
      setUnlockEndedEditing(false);
      return;
    }
    setUnlockEndedEditing(true);
  }, [status]);

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

  const confirmGoLive = async () => {
    setConfirmGoLiveOpen(false);
    try {
      await apiClient.post(`/sessions/${sessionId}/start`);
      navigate(`/manage/course/${courseId}/session/${sessionId}/live`);
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to launch session' });
    }
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

  const cloneQuestionForBaseline = (question) => {
    if (!question) return null;
    return JSON.parse(JSON.stringify(question));
  };

  const hasResponseDataForQuestion = useCallback(
    (questionId) => responseBackedQuestionIds.has(String(questionId)),
    [responseBackedQuestionIds]
  );
  const questionsEditingLocked = status === 'done' && !unlockEndedEditing;

  const openInsertEditorAt = (index) => {
    if (questionsEditingLocked) {
      setMsg({ severity: 'warning', text: 'Unlock editing before adding or changing questions in an ended session.' });
      return;
    }
    setInlineEditor((prev) => {
      if (prev?.mode === 'insert' && prev.index === index) return prev;
      return { mode: 'insert', index, key: Date.now() };
    });
  };

  const openEditEditor = (questionId) => {
    if (questionsEditingLocked) {
      setMsg({ severity: 'warning', text: 'Unlock editing before changing questions in an ended session.' });
      return;
    }
    const baselineQuestion = questions.find((q) => q._id === questionId) || null;
    setInlineEditor((prev) => {
      if (prev?.mode === 'edit' && prev.questionId === questionId) return prev;
      return {
        mode: 'edit',
        questionId,
        key: Date.now(),
        baselineQuestion: cloneQuestionForBaseline(baselineQuestion),
      };
    });
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

      upsertQuestionLocally(created, orderedIds);
      await apiClient.patch(`/sessions/${sessionId}/questions/order`, { questions: orderedIds });

      setInlineEditor((prev) => {
        if (!prev || prev.mode !== 'insert') return prev;
        return {
          mode: 'edit',
          questionId: created._id,
          key: prev.key,
          baselineQuestion: cloneQuestionForBaseline(created),
        };
      });

      return created;
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to auto-save question' });
      throw err;
    }
  };

  // Delete question
  const handleDeleteQuestion = async (qId) => {
    if (questionsEditingLocked) {
      setMsg({ severity: 'warning', text: 'Unlock editing before deleting questions in an ended session.' });
      return;
    }
    if (hasResponseDataForQuestion(qId)) {
      setDeleteQTarget(null);
      setMsg({ severity: 'warning', text: 'Questions with response data cannot be deleted.' });
      return;
    }
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
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to delete question' });
    }
  };

  // Move question (reorder)
  const handleMove = async (idx, direction) => {
    if (questionsEditingLocked) {
      setMsg({ severity: 'warning', text: 'Unlock editing before reordering questions in an ended session.' });
      return;
    }
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

  const getQuestionArrayIndex = (questionId) => questions.findIndex((q) => q._id === questionId);

  const getQuestionVisualIndex = (questionId) => {
    const questionIndex = getQuestionArrayIndex(questionId);
    if (questionIndex === -1) return -1;

    if (inlineEditor?.mode === 'insert' && questionIndex >= inlineEditor.index) {
      return questionIndex + 1;
    }

    return questionIndex;
  };

  const canMoveQuestionById = (questionId, direction) => {
    const visualIndex = getQuestionVisualIndex(questionId);
    if (visualIndex === -1) return false;
    if (direction < 0) return visualIndex > 0;

    const maxVisualIndex = inlineEditor?.mode === 'insert'
      ? questions.length
      : questions.length - 1;
    return visualIndex < maxVisualIndex;
  };

  const moveQuestionByQuestionId = (questionId, direction) => {
    const idx = questions.findIndex((q) => q._id === questionId);
    if (idx === -1) return;

    if (inlineEditor?.mode === 'insert') {
      const insertIdx = inlineEditor.index;
      const visualIndex = idx >= insertIdx ? idx + 1 : idx;
      const targetVisualIndex = visualIndex + direction;
      if (targetVisualIndex < 0 || targetVisualIndex > questions.length) return;

      if (targetVisualIndex === insertIdx) {
        shiftInsertEditor(direction > 0 ? -1 : 1);
        return;
      }
    }

    handleMove(idx, direction);
  };

  const toggleQuestionExpanded = (questionId) => {
    setExpandedQuestions((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const handleQuestionPreviewKeyDown = (event, questionId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleQuestionExpanded(questionId);
  };

  const openQuestionActions = (event, context) => {
    event.stopPropagation();
    setQuestionActions({ anchorEl: event.currentTarget, context });
  };

  const closeQuestionActions = () => {
    setQuestionActions({ anchorEl: null, context: null });
  };

  const runQuestionAction = (action) => {
    const context = questionActions.context;
    closeQuestionActions();
    if (!context) return;
    if (questionsEditingLocked) {
      setMsg({ severity: 'warning', text: 'Unlock editing before changing questions in an ended session.' });
      return;
    }

    if (action === 'move-up') {
      if (context.mode === 'insert') {
        shiftInsertEditor(-1);
      } else {
        const questionId = context.question?._id;
        if (questionId) moveQuestionByQuestionId(questionId, -1);
      }
      return;
    }

    if (action === 'move-down') {
      if (context.mode === 'insert') {
        shiftInsertEditor(1);
      } else {
        const questionId = context.question?._id;
        if (questionId) moveQuestionByQuestionId(questionId, 1);
      }
      return;
    }

    if (action === 'edit' && context.question?._id) {
      openEditEditor(context.question._id);
      return;
    }

    if (action === 'delete' && context.question) {
      if (hasResponseDataForQuestion(context.question._id)) {
        setMsg({ severity: 'warning', text: 'Questions with response data cannot be deleted.' });
        return;
      }
      setDeleteQTarget(context.question);
    }
  };

  const editingQuestionId = inlineEditor?.mode === 'edit' ? inlineEditor.questionId : null;
  const insertingAtIndex = inlineEditor?.mode === 'insert' ? inlineEditor.index : -1;
  const editingQuestionIndex = editingQuestionId
    ? questions.findIndex((q) => q._id === editingQuestionId)
    : -1;
  const activeEditorSlotIndex = inlineEditor
    ? (inlineEditor.mode === 'insert' ? inlineEditor.index : editingQuestionIndex)
    : -1;
  const actionContext = questionActions.context;
  const actionContextQuestionIndex = actionContext?.question?._id
    ? getQuestionVisualIndex(actionContext.question._id)
    : -1;
  const actionContextIndex = actionContext?.mode === 'insert'
    ? actionContext.index
    : actionContextQuestionIndex;
  const actionContextMaxIndex = actionContext
    ? (actionContext.mode === 'insert'
      ? questions.length
      : (insertingAtIndex !== -1 ? questions.length : questions.length - 1))
    : -1;
  const actionCanMoveUp = !questionsEditingLocked && !!actionContext && actionContextIndex > 0;
  const actionCanMoveDown = !!actionContext
    && !questionsEditingLocked
    && actionContextIndex >= 0
    && actionContextIndex < actionContextMaxIndex;
  const actionContextQuestionHasResponses = actionContext?.question?._id
    ? hasResponseDataForQuestion(actionContext.question._id)
    : false;
  const deleteTargetHasResponses = deleteQTarget?._id
    ? hasResponseDataForQuestion(deleteQTarget._id)
    : false;
  const studentById = useMemo(
    () => new Map(courseStudents.map((student) => [String(student._id), student])),
    [courseStudents]
  );
  const availableExtensionStudents = useMemo(
    () => courseStudents.filter(
      (student) => !extensionDrafts.some((extension) => String(extension.userId) === String(student._id))
    ),
    [courseStudents, extensionDrafts]
  );

  const openExtensionsDialog = () => {
    setExtensionStudent(null);
    setExtensionsOpen(true);
  };

  const addExtensionStudent = () => {
    if (!extensionStudent?._id) return;
    const userId = String(extensionStudent._id);
    if (extensionDrafts.some((extension) => String(extension.userId) === userId)) {
      return;
    }

    const defaultStart = quizStart || toDateTimeLocalString(session?.quizStart) || '';
    const defaultEnd = quizEnd || toDateTimeLocalString(session?.quizEnd) || '';

    setExtensionDrafts((prev) => [...prev, {
      userId,
      quizStart: defaultStart,
      quizEnd: defaultEnd,
    }]);
    setExtensionStudent(null);
  };

  const updateExtensionDraft = (userId, field, value) => {
    setExtensionDrafts((prev) => prev.map((extension) => (
      String(extension.userId) === String(userId)
        ? { ...extension, [field]: value }
        : extension
    )));
  };

  const removeExtensionDraft = (userId) => {
    setExtensionDrafts((prev) => prev.filter((extension) => String(extension.userId) !== String(userId)));
  };

  const saveExtensions = async () => {
    setSavingExtensions(true);
    try {
      const payloadExtensions = extensionDrafts.map((extension) => {
        const isoStart = toIsoIfValid(extension.quizStart);
        const isoEnd = toIsoIfValid(extension.quizEnd);
        if (!isoStart || !isoEnd) {
          throw new Error('Each extension requires valid start and end times.');
        }
        if (new Date(isoEnd).getTime() <= new Date(isoStart).getTime()) {
          throw new Error('Each extension end time must be later than start time.');
        }
        return {
          userId: extension.userId,
          quizStart: isoStart,
          quizEnd: isoEnd,
        };
      });

      const { data } = await apiClient.patch(`/sessions/${sessionId}/extensions`, {
        extensions: payloadExtensions,
      });
      const updatedSession = data.session || data;
      setSession(updatedSession);
      setExtensionDrafts((updatedSession.quizExtensions || []).map((extension) => ({
        userId: extension.userId,
        quizStart: toDateTimeLocalString(extension.quizStart),
        quizEnd: toDateTimeLocalString(extension.quizEnd),
      })));
      setExtensionsOpen(false);
      setMsg({ severity: 'success', text: 'Quiz extensions updated' });
    } catch (err) {
      const fallbackMessage = err.message || 'Failed to update quiz extensions';
      setMsg({ severity: 'error', text: err.response?.data?.message || fallbackMessage });
    } finally {
      setSavingExtensions(false);
    }
  };

  const renderInlineEditorCard = ({
    key,
    index,
    initialQuestion = null,
    baselineQuestion = null,
  }) => {
    const questionHasResponses = initialQuestion?._id
      ? hasResponseDataForQuestion(initialQuestion._id)
      : false;
    const resolvedQuestionIndex = initialQuestion?._id
      ? getQuestionVisualIndex(initialQuestion._id)
      : -1;
    const currentIndex = resolvedQuestionIndex >= 0 ? resolvedQuestionIndex : index;
    const canMoveUp = !questionsEditingLocked && (initialQuestion?._id
      ? canMoveQuestionById(initialQuestion._id, -1)
      : currentIndex > 0);
    const canMoveDown = !questionsEditingLocked && (initialQuestion?._id
      ? canMoveQuestionById(initialQuestion._id, 1)
      : currentIndex < questions.length);

    return (
    <Card key={key} variant="outlined" sx={{ mb: PAGE_SECTION_GAP }}>
      <CardContent
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1, sm: 1.5 },
          alignItems: 'flex-start',
          minWidth: 0,
          overflow: 'hidden',
          '&:last-child': { pb: 2 },
        }}
      >
        <Box
          sx={{
            display: { xs: 'flex', sm: 'none' },
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            {initialQuestion ? `Question ${currentIndex + 1}` : `Insert at ${index + 1}`}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <Tooltip title="Close editor">
              <IconButton size="small" onClick={() => closeInlineEditor()}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={(event) => openQuestionActions(event, {
                mode: initialQuestion ? 'edit' : 'insert',
                index,
                question: initialQuestion || null,
              })}
            >
              <MoreIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 34,
            flexShrink: 0,
          }}
        >
          <Tooltip title="Close editor">
            <IconButton size="small" onClick={() => closeInlineEditor()}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={initialQuestion ? 'Move up' : 'Move insertion up'}>
            <span>
              <IconButton
                size="small"
                disabled={!canMoveUp}
                onClick={() => {
                  if (initialQuestion?._id) moveQuestionByQuestionId(initialQuestion._id, -1);
                  else shiftInsertEditor(-1);
                }}
              >
                <UpIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="subtitle2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            {currentIndex + 1}.
          </Typography>
          <Tooltip title={initialQuestion ? 'Move down' : 'Move insertion down'}>
            <span>
              <IconButton
                size="small"
                disabled={!canMoveDown}
                onClick={() => {
                  if (initialQuestion?._id) moveQuestionByQuestionId(initialQuestion._id, 1);
                  else shiftInsertEditor(1);
                }}
              >
                <DownIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {initialQuestion ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 0.5 }}>
              <Tooltip title={questionHasResponses ? 'Cannot delete: this question has response data' : 'Delete'}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={questionsEditingLocked || questionHasResponses}
                    onClick={() => setDeleteQTarget(initialQuestion)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ) : null}
        </Box>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <QuestionEditor
            key={`inline-editor-${inlineEditor?.key}`}
            inline
            open
            onClose={closeInlineEditor}
            onAutoSave={handleAutoSaveQuestion}
            initial={initialQuestion}
            initialBaseline={baselineQuestion}
            disableTypeSelection={questionHasResponses}
            typeSelectionLockReason="Question type is locked because this question has response data."
          />
        </Box>

      </CardContent>
    </Card>
    );
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!session) return <Box sx={{ p: 3 }}><Alert severity="error">Session not found</Alert></Box>;

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2 }, pt: 1.25, pb: 2, maxWidth: 980, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: PAGE_SECTION_GAP }}>
        <IconButton onClick={() => navigate(courseBackLink)}><BackIcon /></IconButton>
        <Typography variant="h5" sx={{ flexGrow: 1, lineHeight: 1.15 }}>{session.name}</Typography>
        <SessionStatusChip status={status} />
        {!session.quiz && status !== 'running' && status !== 'done' && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<LaunchIcon />}
            onClick={() => setConfirmGoLiveOpen(true)}
            size="small"
            aria-label="Launch session"
          >
            Launch
          </Button>
        )}
        {!session.quiz && status === 'running' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<JoinIcon />}
            onClick={() => navigate(`/manage/course/${courseId}/session/${sessionId}/live`)}
            size="small"
            aria-label="Join live session"
          >
            Join Session
          </Button>
        )}
      </Box>

      {/* Session Properties */}
      <Paper sx={{ p: { xs: 2, sm: 2.25 }, mb: PAGE_SECTION_GAP }}>
        <Typography variant="h6" sx={{ mb: SETTINGS_STACK_GAP }}>Session Settings</Typography>
        <AutoSaveStatus status={sessionSaveStatus} errorText={sessionSaveError} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_STACK_GAP }}>
          <TextField
            label="Name"
            fullWidth
            size="small"
            value={editFields.name}
            onChange={e => setEditFields({ ...editFields, name: e.target.value })}
            onBlur={() => {
              if (editFields.name !== (session.name || '')) {
                saveSessionPatch({ name: editFields.name });
              }
            }}
            disabled={savingSession}
            sx={{
              '& .MuiInputBase-input': {
                py: 1.05,
              },
            }}
          />
          <TextField
            label="Description"
            fullWidth
            size="small"
            value={editFields.description}
            onChange={e => setEditFields({ ...editFields, description: e.target.value })}
            onBlur={() => {
              if (editFields.description !== (session.description || '')) {
                saveSessionPatch({ description: editFields.description });
              }
            }}
            disabled={savingSession}
            sx={{ '& .MuiInputBase-input': { py: 1.05 } }}
          />

          <FormControl size="small" sx={{ maxWidth: 280 }}>
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

          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={(
                <Switch
                  checked={quiz}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const shouldDisablePractice = !checked && practiceQuiz;
                    setQuiz(checked);
                    if (shouldDisablePractice) {
                      setPracticeQuiz(false);
                    }
                    saveSessionPatch(
                      shouldDisablePractice
                        ? { quiz: checked, practiceQuiz: false }
                        : { quiz: checked }
                    );
                  }}
                  disabled={savingSession}
                />
              )}
              label={(
                <Tooltip title="Enable quiz mode with quiz dates and quiz-specific student behavior." arrow>
                  <span>Quiz</span>
                </Tooltip>
              )}
            />
            <FormControlLabel
              control={(
                <Switch
                  checked={practiceQuiz}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPracticeQuiz(checked);
                    if (checked && !quiz) {
                      setQuiz(true);
                      saveSessionPatch({ quiz: true, practiceQuiz: true });
                      return;
                    }
                    saveSessionPatch({ practiceQuiz: checked });
                  }}
                  disabled={savingSession}
                />
              )}
              label={(
                <Tooltip title="Practice quizzes still use quiz flow but are intended for low-stakes use." arrow>
                  <span>Practice Quiz</span>
                </Tooltip>
              )}
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
              label={(
                <Tooltip title="Students can open review mode after the session has ended." arrow>
                  <span>Reviewable</span>
                </Tooltip>
              )}
            />
          </Box>

          {/* Join code settings (for interactive sessions only) */}
          {!quiz && (
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: SETTINGS_STACK_GAP, alignItems: { sm: 'center' } }}>
                <FormControlLabel
                control={(
                  <Switch
                    checked={joinCodeEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setJoinCodeEnabled(checked);
                      saveSessionPatch({ joinCodeEnabled: checked });
                    }}
                    disabled={savingSession}
                  />
                )}
                label={(
                  <Tooltip title="Students have to enter a passcode to enter." arrow>
                    <span>Require Passcode</span>
                  </Tooltip>
                )}
              />
              {joinCodeEnabled && (
                <Tooltip title="How often the passcode rotates while the join period is open." arrow>
                  <span>
                    <TextField
                      label="Code refresh interval (seconds)"
                      size="small"
                      type="number"
                      inputProps={{ min: 5, max: 120 }}
                      value={joinCodeInterval}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 5 && val <= 120) {
                          setJoinCodeInterval(val);
                          saveSessionPatch({ joinCodeInterval: val });
                        }
                      }}
                      disabled={savingSession}
                      sx={{ maxWidth: 220 }}
                    />
                  </span>
                </Tooltip>
              )}
            </Box>
          )}

          {(quiz || practiceQuiz) && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_STACK_GAP }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: SETTINGS_STACK_GAP }}>
                <TextField
                  label="Quiz Start"
                  size="small"
                  type="datetime-local"
                  fullWidth
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
                  label="Quiz End"
                  size="small"
                  type="datetime-local"
                  fullWidth
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Quiz extensions: {extensionDrafts.length} student{extensionDrafts.length === 1 ? '' : 's'}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={openExtensionsDialog}
                  disabled={savingSession}
                >
                  Manage Extensions
                </Button>
              </Box>
            </Box>
          )}

          {!(quiz || practiceQuiz) && (
            <TextField
              label="Session Date"
              size="small"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={sessionDate}
              onChange={(e) => {
                const val = e.target.value;
                setSessionDate(val);
                const iso = toIsoIfValid(val);
                if (iso) saveSessionPatch({ date: iso });
              }}
              sx={{ maxWidth: { xs: '100%', sm: 360 } }}
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
      <Paper sx={{ p: { xs: 2, sm: 2.25 } }}>
        <Typography variant="h6" sx={{ mb: SETTINGS_STACK_GAP }}>Questions ({questions.length})</Typography>

        {status === 'done' && questionsEditingLocked && (
          <Alert
            severity="warning"
            sx={{ mb: SETTINGS_STACK_GAP }}
            action={(
              <Button
                color="inherit"
                size="small"
                onClick={() => setUnlockEndedEditing(true)}
                aria-label="Unlock question editing"
              >
                Unlock Editing
              </Button>
            )}
          >
            This session is ended. Unlock editing to modify the question list. Questions with response data still cannot be deleted or have their type changed.
          </Alert>
        )}
        {status === 'done' && !questionsEditingLocked && (
          <Alert severity="warning" sx={{ mb: SETTINGS_STACK_GAP }}>
            Editing is unlocked for this ended session. Questions with response data are protected from delete and type-change actions.
          </Alert>
        )}

        <Box
          sx={{
            opacity: questionsEditingLocked ? 0.42 : 1,
            transition: 'opacity 0.2s ease',
            pointerEvents: questionsEditingLocked ? 'none' : 'auto',
          }}
          aria-disabled={questionsEditingLocked}
        >
          {questions.length === 0 && (
            <Typography color="text.secondary" sx={{ pb: 1.5, textAlign: 'center' }}>
              No questions yet. Use the button below to add one.
            </Typography>
          )}

          {[...Array(questions.length + 1).keys()].map((slotIdx) => {
          const slotKey = `slot-${slotIdx}`;
          const currentQuestion = questions[slotIdx];
          const isQuestionExpanded = currentQuestion
            ? !!expandedQuestions[currentQuestion._id]
            : false;
          const isEdgeInsertSlot = slotIdx === 0 || slotIdx === questions.length;
          const activeBaseline = inlineEditor?.mode === 'edit' && currentQuestion?._id === inlineEditor.questionId
            ? inlineEditor.baselineQuestion
            : null;
          const insertionNumberOffset = insertingAtIndex !== -1 && slotIdx >= insertingAtIndex ? 1 : 0;
          const displayedQuestionNumber = slotIdx + 1 + insertionNumberOffset;
          const questionHasResponses = currentQuestion?._id
            ? hasResponseDataForQuestion(currentQuestion._id)
            : false;
          const canMoveCurrentQuestionUp = currentQuestion?._id
            ? !questionsEditingLocked && canMoveQuestionById(currentQuestion._id, -1)
            : false;
          const canMoveCurrentQuestionDown = currentQuestion?._id
            ? !questionsEditingLocked && canMoveQuestionById(currentQuestion._id, 1)
            : false;

            return (
            <Box key={slotKey}>
              {activeEditorSlotIndex === slotIdx ? (
                renderInlineEditorCard({
                  key: `inline-editor-${inlineEditor?.key}`,
                  index: slotIdx,
                  initialQuestion: inlineEditor?.mode === 'edit' ? currentQuestion : null,
                  baselineQuestion: inlineEditor?.mode === 'edit' ? activeBaseline : null,
                })
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: PAGE_SECTION_GAP }}>
                  {isEdgeInsertSlot ? (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => openInsertEditorAt(slotIdx)}
                      disabled={questionsEditingLocked}
                      aria-label={`Add question at position ${slotIdx + 1}`}
                    >
                      Add Question
                    </Button>
                  ) : (
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => openInsertEditorAt(slotIdx)}
                      disabled={questionsEditingLocked}
                      aria-label={`Add question at position ${slotIdx + 1}`}
                      sx={{
                        width: '100%',
                        minWidth: 0,
                        maxWidth: { xs: '100%', sm: 620 },
                        px: 0.5,
                        py: 0.35,
                        borderRadius: 1.5,
                        color: 'text.secondary',
                        justifyContent: 'flex-end',
                        textTransform: 'none',
                        '& .insert-question-line': {
                          flexGrow: 1,
                          borderTop: '3px solid',
                          borderColor: 'divider',
                          borderRadius: 999,
                          mr: 0.9,
                          transition: 'border-color 0.2s ease',
                        },
                        '&:hover .insert-question-line': {
                          borderColor: 'text.secondary',
                        },
                      }}
                    >
                      <Box className="insert-question-line" />
                      <AddIcon fontSize="small" />
                      <Typography variant="caption" sx={{ ml: 0.2, display: { xs: 'none', sm: 'inline' } }}>
                        Add
                      </Typography>
                    </Button>
                  )}
                </Box>
              )}

              {currentQuestion && slotIdx !== editingQuestionIndex ? (
                  <Card key={currentQuestion._id} variant="outlined" sx={{ mb: PAGE_SECTION_GAP }}>
                    <CardContent
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: { xs: 1, sm: 1.5 },
                        alignItems: 'flex-start',
                        minWidth: 0,
                        overflow: 'hidden',
                        '&:last-child': { pb: 2 },
                      }}
                    >
                      <Box
                        sx={{
                          display: { xs: 'flex', sm: 'none' },
                          width: '100%',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Typography variant="subtitle2" color="text.secondary">
                          Question {displayedQuestionNumber}
                        </Typography>
                        <IconButton
                          size="small"
                          disabled={questionsEditingLocked}
                          onClick={(event) => openQuestionActions(event, {
                            mode: 'view',
                            index: slotIdx,
                            question: currentQuestion,
                          })}
                        >
                          <MoreIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      <Box
                        sx={{
                          display: { xs: 'none', sm: 'flex' },
                          flexDirection: 'column',
                          alignItems: 'center',
                          minWidth: 34,
                          flexShrink: 0,
                        }}
                      >
                        <Tooltip title="Edit">
                          <span>
                            <IconButton
                              size="small"
                              disabled={questionsEditingLocked}
                              onClick={() => openEditEditor(currentQuestion._id)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move up">
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canMoveCurrentQuestionUp}
                              onClick={() => moveQuestionByQuestionId(currentQuestion._id, -1)}
                            >
                              <UpIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                          {displayedQuestionNumber}.
                        </Typography>
                        <Tooltip title="Move down">
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canMoveCurrentQuestionDown}
                              onClick={() => moveQuestionByQuestionId(currentQuestion._id, 1)}
                            >
                              <DownIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={questionHasResponses ? 'Cannot delete: this question has response data' : 'Delete'}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={questionsEditingLocked || questionHasResponses}
                              onClick={() => setDeleteQTarget(currentQuestion)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>

                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: 1,
                            px: { xs: 0.2, sm: 0.35 },
                            py: 0.2,
                            '&:hover': {
                              backgroundColor: 'action.hover',
                            },
                          }}
                          onClick={() => toggleQuestionExpanded(currentQuestion._id)}
                          onKeyDown={(event) => handleQuestionPreviewKeyDown(event, currentQuestion._id)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isQuestionExpanded}
                          aria-label={isQuestionExpanded
                            ? `Collapse question ${displayedQuestionNumber}`
                            : `Expand question ${displayedQuestionNumber}`}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: { xs: 0.25, sm: 0.5 },
                              pb: 0.5,
                            }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              {isQuestionExpanded ? 'Tap to collapse' : 'Tap to expand'}
                            </Typography>
                            <ExpandMoreIcon
                              fontSize="small"
                              sx={{
                                transform: isQuestionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                                color: 'text.secondary',
                              }}
                            />
                          </Box>
                          <Box
                            sx={{
                              maxHeight: isQuestionExpanded ? 'none' : { xs: 180, sm: 210 },
                              overflow: 'hidden',
                              position: 'relative',
                            }}
                          >
                            <QuestionDisplay question={currentQuestion} />
                            {!isQuestionExpanded && (
                              <Box
                                sx={{
                                  position: 'absolute',
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  height: 40,
                                  background: theme => `linear-gradient(to bottom, rgba(255,255,255,0), ${theme.palette.background.paper})`,
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                
              ) : null}
            </Box>
            );
          })}
        </Box>
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
          <Typography>
            {deleteTargetHasResponses
              ? 'This question has response data and cannot be deleted.'
              : 'This will permanently remove this question from the session.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteQTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteTargetHasResponses || questionsEditingLocked}
            onClick={() => handleDeleteQuestion(deleteQTarget._id)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={questionActions.anchorEl}
        open={Boolean(questionActions.anchorEl)}
        onClose={closeQuestionActions}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => runQuestionAction('move-up')} disabled={!actionCanMoveUp}>
          Move up
        </MenuItem>
        <MenuItem onClick={() => runQuestionAction('move-down')} disabled={!actionCanMoveDown}>
          Move down
        </MenuItem>
        {actionContext?.mode === 'view' && (
          <MenuItem onClick={() => runQuestionAction('edit')} disabled={questionsEditingLocked}>
            Edit
          </MenuItem>
        )}
        {(actionContext?.mode === 'view' || actionContext?.mode === 'edit') && (
          <MenuItem
            onClick={() => runQuestionAction('delete')}
            disabled={questionsEditingLocked || actionContextQuestionHasResponses}
            sx={{ color: 'error.main' }}
          >
            Delete
          </MenuItem>
        )}
      </Menu>

      <Dialog
        open={extensionsOpen}
        onClose={() => {
          if (!savingExtensions) setExtensionsOpen(false);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Quiz Extensions</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Add students who should receive custom quiz access windows.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Autocomplete
              options={availableExtensionStudents}
              value={extensionStudent}
              onChange={(_, value) => setExtensionStudent(value)}
              getOptionLabel={formatStudentLabel}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Select student"
                  placeholder="Search by name or email"
                />
              )}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={addExtensionStudent}
              disabled={!extensionStudent?._id}
            >
              Add
            </Button>
          </Box>

          {extensionDrafts.length === 0 ? (
            <Alert severity="info">No student extensions configured.</Alert>
          ) : (
            extensionDrafts.map((extension) => {
              const student = studentById.get(String(extension.userId));
              return (
                <Paper key={extension.userId} variant="outlined" sx={{ p: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2">
                      {student ? formatStudentLabel(student) : extension.userId}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeExtensionDraft(extension.userId)}
                      aria-label="Remove extension"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
                    <TextField
                      size="small"
                      label="Start"
                      type="datetime-local"
                      InputLabelProps={{ shrink: true }}
                      value={extension.quizStart || ''}
                      onChange={(event) => updateExtensionDraft(extension.userId, 'quizStart', event.target.value)}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="End"
                      type="datetime-local"
                      InputLabelProps={{ shrink: true }}
                      value={extension.quizEnd || ''}
                      onChange={(event) => updateExtensionDraft(extension.userId, 'quizEnd', event.target.value)}
                      fullWidth
                    />
                  </Box>
                </Paper>
              );
            })
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtensionsOpen(false)} disabled={savingExtensions}>Cancel</Button>
          <Button variant="contained" onClick={saveExtensions} disabled={savingExtensions}>
            {savingExtensions ? 'Saving...' : 'Save Extensions'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
