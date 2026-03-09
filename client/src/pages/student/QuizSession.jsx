import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Button,
  Chip,
  FormControlLabel,
  Switch,
  TextField,
  Radio,
  RadioGroup,
  Checkbox,
  FormGroup,
  Divider,
} from '@mui/material';
import { CheckCircle as CorrectIcon } from '@mui/icons-material';
import apiClient from '../../api/client';
import StudentRichTextEditor from '../../components/questions/StudentRichTextEditor';
import {
  QUESTION_TYPES,
  TYPE_LABELS,
  TYPE_COLORS,
  normalizeQuestionType,
} from '../../components/questions/constants';
import { prepareRichTextInput, renderKatexInElement } from '../../components/questions/richTextUtils';

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

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function optionId(option, index) {
  return String(option?._id ?? index);
}

function parseMultiSelectAnswer(answer) {
  if (Array.isArray(answer)) return answer.map((entry) => String(entry));
  if (answer === undefined || answer === null || answer === '') return [];
  if (typeof answer === 'string' && answer.includes(',')) {
    return answer.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [String(answer)];
}

function hasAnswerForDraft(question, draft) {
  const qType = normalizeQuestionType(question);
  if (qType === QUESTION_TYPES.MULTI_SELECT) {
    return Array.isArray(draft?.answer) && draft.answer.length > 0;
  }
  if (qType === QUESTION_TYPES.SHORT_ANSWER) {
    return normalizeValue(draft?.answer).length > 0;
  }
  return draft?.answer !== undefined && draft?.answer !== null && String(draft.answer) !== '';
}

function getDraftForQuestion(question, response) {
  const qType = normalizeQuestionType(question);

  if (qType === QUESTION_TYPES.MULTI_SELECT) {
    return {
      answer: parseMultiSelectAnswer(response?.answer),
      answerWysiwyg: normalizeValue(response?.answerWysiwyg),
    };
  }

  if (qType === QUESTION_TYPES.SHORT_ANSWER) {
    return {
      answer: normalizeValue(response?.answer),
      answerWysiwyg: normalizeValue(response?.answerWysiwyg),
    };
  }

  return {
    answer: response?.answer === undefined || response?.answer === null ? '' : String(response.answer),
    answerWysiwyg: normalizeValue(response?.answerWysiwyg),
  };
}

function optionDisplayHtml(option) {
  return option?.content || option?.plainText || option?.answer || '';
}

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

function isClosedOrUnavailableQuizMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('quiz is closed')
    || normalized.includes('not open yet')
    || normalized.includes('not available')
    || normalized.includes('already submitted')
  );
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveNumericalAnswer(question) {
  const candidates = [
    question?.correctNumerical,
    question?.correctAnswer,
    question?.answerKey,
    question?.numericalAnswer,
  ];
  for (const candidate of candidates) {
    const parsed = parseOptionalNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function resolveNumericalTolerance(question) {
  const candidates = [
    question?.toleranceNumerical,
    question?.tolerance,
  ];
  for (const candidate of candidates) {
    const parsed = parseOptionalNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function resolveSolutionContent(question) {
  return {
    html: question?.solution || question?.solutionHtml || '',
    plainText: question?.solution_plainText || question?.solutionPlainText || question?.solutionText || '',
  };
}

function hasCorrectOption(options = []) {
  return options.some((option) => !!option?.correct);
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

export default function QuizSession() {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const courseQuizTabLink = `/student/course/${courseId}?tab=1`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responsesByQuestion, setResponsesByQuestion] = useState({});
  const [draftByQuestion, setDraftByQuestion] = useState({});
  const [autosaveStateByQuestion, setAutosaveStateByQuestion] = useState({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [singleQuestionMode, setSingleQuestionMode] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showSolutionByQuestion, setShowSolutionByQuestion] = useState({});
  const [lockingQuestionId, setLockingQuestionId] = useState('');

  const autosaveTimersRef = useRef(new Map());

  const hydrateFromPayload = useCallback((payload, { preserveDrafts = false } = {}) => {
    const nextSession = payload?.session || null;
    const nextQuestions = payload?.questions || [];
    const nextResponses = payload?.responses || {};

    setSession(nextSession);
    setQuestions(nextQuestions);
    setResponsesByQuestion(nextResponses);
    setShowSolutionByQuestion((prev) => {
      const next = {};
      nextQuestions.forEach((question) => {
        const qId = String(question._id);
        if (prev[qId]) next[qId] = true;
      });
      return next;
    });

    setDraftByQuestion((previousDrafts) => {
      const nextDrafts = {};
      nextQuestions.forEach((question) => {
        const qId = String(question._id);
        const response = nextResponses[qId];
        const locked = !!response && response.editable === false;
        const baselineDraft = getDraftForQuestion(question, response);
        if (preserveDrafts && previousDrafts[qId] && !locked) {
          nextDrafts[qId] = previousDrafts[qId];
          return;
        }
        nextDrafts[qId] = baselineDraft;
      });
      return nextDrafts;
    });
  }, []);

  const fetchQuiz = useCallback(async ({ background = false } = {}) => {
    try {
      const { data } = await apiClient.get(`/sessions/${sessionId}/quiz`);
      hydrateFromPayload(data, { preserveDrafts: background });
      setError('');
      return true;
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Failed to load quiz';
      if (status === 403 && isClosedOrUnavailableQuizMessage(message)) {
        navigate(courseQuizTabLink, { replace: true });
        return false;
      }
      if (!background) setError(message);
      return false;
    } finally {
      if (!background) setLoading(false);
    }
  }, [courseQuizTabLink, hydrateFromPayload, navigate, sessionId]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let pollingTimer = null;
    let closed = false;

    const refreshQuiz = () => {
      if (document.visibilityState !== 'visible') return;
      fetchQuiz({ background: true });
    };

    const startPolling = () => {
      if (pollingTimer || closed) return;
      pollingTimer = setInterval(refreshQuiz, 4000);
    };

    const stopPolling = () => {
      if (!pollingTimer) return;
      clearInterval(pollingTimer);
      pollingTimer = null;
    };

    const connect = () => {
      if (closed) return;
      const latestToken = localStorage.getItem('token');
      if (!latestToken) return;

      try {
        ws = new WebSocket(buildWebsocketUrl(latestToken));
      } catch {
        startPolling();
        reconnectTimer = setTimeout(connect, 2500);
        return;
      }

      ws.onopen = () => {
        stopPolling();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message?.event !== 'session:updated') return;
          if (String(message?.data?.sessionId || '') !== String(sessionId)) return;
          refreshQuiz();
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      ws.onclose = () => {
        if (closed) return;
        startPolling();
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    const initializeTransport = async () => {
      try {
        const { data } = await apiClient.get('/health');
        const websocketAvailable = data?.websocket === true;
        if (!websocketAvailable) {
          startPolling();
          return;
        }
        connect();
      } catch {
        startPolling();
      }
    };

    initializeTransport();

    const handleVisibilityChange = () => refreshQuiz();
    window.addEventListener('focus', refreshQuiz);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      window.removeEventListener('focus', refreshQuiz);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchQuiz, sessionId]);

  useEffect(() => () => {
    autosaveTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    autosaveTimersRef.current.clear();
  }, []);

  useEffect(() => {
    setCurrentQuestionIndex((previous) => Math.min(previous, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  useEffect(() => {
    if (questions.length <= 1) {
      setSingleQuestionMode(false);
    }
  }, [questions.length]);

  const saveDraftNow = useCallback(async (questionId, draft) => {
    if (!draft) return null;
    setAutosaveStateByQuestion((prev) => ({ ...prev, [questionId]: 'saving' }));
    try {
      const payload = {
        questionId,
        answer: draft.answer,
      };
      if (draft.answerWysiwyg) payload.answerWysiwyg = draft.answerWysiwyg;
      const { data } = await apiClient.patch(`/sessions/${sessionId}/quiz-response`, payload);
      const response = data?.response;
      if (response) {
        setResponsesByQuestion((prev) => ({ ...prev, [questionId]: response }));
      }
      setAutosaveStateByQuestion((prev) => ({ ...prev, [questionId]: 'saved' }));
      return response || null;
    } catch (err) {
      setAutosaveStateByQuestion((prev) => ({ ...prev, [questionId]: 'error' }));
      return null;
    }
  }, [sessionId]);

  const queueAutosave = useCallback((questionId, draft) => {
    const timers = autosaveTimersRef.current;
    const currentTimer = timers.get(questionId);
    if (currentTimer) clearTimeout(currentTimer);

    const timerId = setTimeout(() => {
      saveDraftNow(questionId, draft);
      timers.delete(questionId);
    }, 450);

    timers.set(questionId, timerId);
  }, [saveDraftNow]);

  const updateDraft = useCallback((question, updater) => {
    const qId = String(question._id);
    const response = responsesByQuestion[qId];
    if (response && response.editable === false) return;

    setDraftByQuestion((prev) => {
      const current = prev[qId] || getDraftForQuestion(question, response);
      const next = typeof updater === 'function' ? updater(current) : updater;
      queueAutosave(qId, next);
      return { ...prev, [qId]: next };
    });
  }, [queueAutosave, responsesByQuestion]);

  const flushAutosaves = useCallback(async () => {
    const pendingEntries = [...autosaveTimersRef.current.entries()];
    pendingEntries.forEach(([, timerId]) => clearTimeout(timerId));
    autosaveTimersRef.current.clear();

    if (!pendingEntries.length) return;

    await Promise.all(
      pendingEntries.map(([questionId]) => saveDraftNow(questionId, draftByQuestion[questionId]))
    );
  }, [draftByQuestion, saveDraftNow]);

  const handleSubmitQuiz = useCallback(async () => {
    setSubmittingQuiz(true);
    setSubmitError('');
    try {
      await flushAutosaves();
      await apiClient.post(`/sessions/${sessionId}/submit`);
      navigate(courseQuizTabLink);
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit quiz');
    } finally {
      setSubmittingQuiz(false);
    }
  }, [courseQuizTabLink, flushAutosaves, navigate, sessionId]);

  const handleSubmitPracticeQuestion = useCallback(async (questionId) => {
    const question = questions.find((entry) => String(entry._id) === String(questionId));
    if (!question) return;

    setLockingQuestionId(questionId);
    setSubmitError('');
    try {
      await saveDraftNow(questionId, draftByQuestion[questionId] || getDraftForQuestion(question, responsesByQuestion[questionId]));
      await apiClient.post(`/sessions/${sessionId}/quiz-question-submit`, { questionId });
      await fetchQuiz();
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit this question');
    } finally {
      setLockingQuestionId('');
    }
  }, [draftByQuestion, fetchQuiz, questions, responsesByQuestion, saveDraftNow, sessionId]);

  const practiceQuiz = !!session?.practiceQuiz;

  const answeredCount = useMemo(() => {
    return questions.reduce((count, question) => {
      const qId = String(question._id);
      const response = responsesByQuestion[qId];
      const draft = draftByQuestion[qId] || getDraftForQuestion(question, response);
      return count + (hasAnswerForDraft(question, draft) ? 1 : 0);
    }, 0);
  }, [draftByQuestion, questions, responsesByQuestion]);

  const canSubmitQuiz = useMemo(() => {
    if (practiceQuiz || submittingQuiz) return false;
    if (!questions.length) return false;
    return questions.every((question) => {
      const qId = String(question._id);
      const response = responsesByQuestion[qId];
      const draft = draftByQuestion[qId] || getDraftForQuestion(question, response);
      return hasAnswerForDraft(question, draft);
    });
  }, [draftByQuestion, practiceQuiz, questions, responsesByQuestion, submittingQuiz]);

  const questionsToRender = useMemo(() => {
    if (!singleQuestionMode) return questions;
    if (!questions.length) return [];
    return [questions[currentQuestionIndex]];
  }, [currentQuestionIndex, questions, singleQuestionMode]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress aria-label="Loading quiz" />
      </Box>
    );
  }

  if (error || !session) {
    return (
      <Box sx={{ p: 3, maxWidth: 760, mx: 'auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error || 'Quiz not found'}</Alert>
        <Button variant="outlined" onClick={() => navigate(courseQuizTabLink)}>
          Back to course
        </Button>
      </Box>
    );
  }

  if (session.status === 'done') {
    return (
      <Box sx={{ p: 3, maxWidth: 760, mx: 'auto' }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          This quiz is closed.
        </Alert>
        <Button variant="outlined" onClick={() => navigate(courseQuizTabLink)}>
          Back to course
        </Button>
      </Box>
    );
  }

  if (session.quizSubmittedByCurrentUser && !practiceQuiz) {
    return (
      <Box sx={{ p: 3, maxWidth: 760, mx: 'auto' }}>
        <Alert severity="success" sx={{ mb: 2 }}>
          You have already submitted this quiz.
        </Alert>
        <Button variant="outlined" onClick={() => navigate(courseQuizTabLink)}>
          Back to course
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 860, mx: 'auto' }}>
      <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {session.name || 'Quiz'}
        </Typography>
        <Chip label={practiceQuiz ? 'Practice Quiz' : 'Quiz'} color={practiceQuiz ? 'info' : 'primary'} size="small" />
        <Chip label={`${answeredCount}/${questions.length} answered`} variant="outlined" size="small" />
      </Box>

      {practiceQuiz && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Practice mode: submit each question to unlock solutions immediately.
        </Alert>
      )}

      {questions.length > 1 && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <FormControlLabel
            control={(
              <Switch
                checked={singleQuestionMode}
                onChange={(event) => setSingleQuestionMode(event.target.checked)}
              />
            )}
            label="One question at a time"
          />

          {singleQuestionMode && questions.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
                disabled={currentQuestionIndex <= 0}
              >
                Previous
              </Button>
              <Chip label={`Question ${currentQuestionIndex + 1}/${questions.length}`} size="small" variant="outlined" />
              <Button
                size="small"
                variant="outlined"
                onClick={() => setCurrentQuestionIndex((index) => Math.min(questions.length - 1, index + 1))}
                disabled={currentQuestionIndex >= questions.length - 1}
              >
                Next
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}

      {questionsToRender.map((question) => {
        const qId = String(question._id);
        const qType = normalizeQuestionType(question);
        const response = responsesByQuestion[qId];
        const draft = draftByQuestion[qId] || getDraftForQuestion(question, response);
        const locked = !!response && response.editable === false;
        const autosaveState = autosaveStateByQuestion[qId] || 'idle';
        const showSolution = !!showSolutionByQuestion[qId] && locked;
        const showCorrectForQuestion = showSolution && practiceQuiz;
        const numericalSolution = resolveNumericalAnswer(question);
        const numericalTolerance = resolveNumericalTolerance(question);
        const solutionContent = resolveSolutionContent(question);
        const questionHasRevealableSolution = !!(
          solutionContent.html
          || solutionContent.plainText
          || (qType === QUESTION_TYPES.NUMERICAL && numericalSolution != null)
          || hasCorrectOption(question.options)
        );
        const optionAnswers = qType === QUESTION_TYPES.MULTI_SELECT
          ? (Array.isArray(draft.answer) ? draft.answer : [])
          : [];

        return (
          <Paper key={qId} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Question {questions.findIndex((entry) => String(entry._id) === qId) + 1}
              </Typography>
              <Chip label={TYPE_LABELS[qType] || 'Question'} color={TYPE_COLORS[qType] || 'default'} size="small" />
              {locked && <Chip label="Submitted" color="success" size="small" variant="outlined" />}
              {!locked && autosaveState === 'saving' && <Chip label="Saving..." size="small" variant="outlined" />}
              {!locked && autosaveState === 'saved' && <Chip label="Saved" size="small" variant="outlined" />}
              {!locked && autosaveState === 'error' && <Chip label="Save failed" color="error" size="small" variant="outlined" />}
            </Box>

            <Box sx={{ mb: 2 }}>
              <RichContent html={question.content} fallback={question.plainText} />
            </Box>

            {(qType === QUESTION_TYPES.MULTIPLE_CHOICE || qType === QUESTION_TYPES.TRUE_FALSE) && (
              <RadioGroup
                value={draft.answer ?? ''}
                onChange={(event) => {
                  updateDraft(question, (current) => ({
                    ...current,
                    answer: event.target.value,
                  }));
                }}
              >
                {(question.options || []).map((option, index) => {
                  const value = optionId(option, index);
                  const selected = String(draft.answer || '') === value;
                  const isCorrect = showCorrectForQuestion && !!option.correct;
                  const selectedIncorrect = showCorrectForQuestion && selected && !isCorrect;
                  return (
                    <Paper
                      key={value}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        mb: 0.75,
                        borderColor: isCorrect
                          ? 'success.main'
                          : selectedIncorrect
                            ? 'error.main'
                            : selected
                              ? 'primary.main'
                              : 'divider',
                        bgcolor: isCorrect ? 'success.50' : selectedIncorrect ? 'error.50' : 'transparent',
                        boxShadow: isCorrect ? '0 0 0 1px rgba(46, 125, 50, 0.22) inset' : 'none',
                        opacity: locked ? 0.85 : 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '34px 30px minmax(0, 1fr) 20px',
                          columnGap: 1,
                          alignItems: 'start',
                        }}
                      >
                        <FormControlLabel
                          value={value}
                          control={<Radio disabled={locked} sx={{ p: 0.5 }} onClick={(e) => e.stopPropagation()} />}
                          label=""
                          sx={{ m: 0, mr: 0, width: 34, alignSelf: 'start' }}
                        />
                        <Chip
                          label={OPTION_LETTERS[index]}
                          size="small"
                          color={isCorrect ? 'success' : 'default'}
                          sx={{ fontWeight: 700, minWidth: 28, mt: 0.25, justifySelf: 'start' }}
                        />
                        <Box sx={{ minWidth: 0, pt: 0.25 }}>
                          <RichContent html={optionDisplayHtml(option)} />
                        </Box>
                        <Box sx={{ pt: 0.35, justifySelf: 'end' }}>
                          {isCorrect ? <CorrectIcon fontSize="small" color="success" /> : null}
                        </Box>
                      </Box>
                    </Paper>
                  );
                })}
              </RadioGroup>
            )}

            {qType === QUESTION_TYPES.MULTI_SELECT && (
              <FormGroup>
                {(question.options || []).map((option, index) => {
                  const value = optionId(option, index);
                  const checked = optionAnswers.includes(value);
                  const isCorrect = showCorrectForQuestion && !!option.correct;
                  const checkedIncorrect = showCorrectForQuestion && checked && !isCorrect;
                  return (
                    <Paper
                      key={value}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        mb: 0.75,
                        borderColor: isCorrect
                          ? 'success.main'
                          : checkedIncorrect
                            ? 'error.main'
                            : checked
                              ? 'primary.main'
                              : 'divider',
                        bgcolor: isCorrect ? 'success.50' : checkedIncorrect ? 'error.50' : 'transparent',
                        boxShadow: isCorrect ? '0 0 0 1px rgba(46, 125, 50, 0.22) inset' : 'none',
                        opacity: locked ? 0.85 : 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '34px 30px minmax(0, 1fr) 20px',
                          columnGap: 1,
                          alignItems: 'start',
                        }}
                      >
                        <FormControlLabel
                          control={(
                            <Checkbox
                              checked={checked}
                              disabled={locked}
                              sx={{ p: 0.5 }}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => {
                                updateDraft(question, (current) => {
                                  const currentValues = Array.isArray(current.answer) ? [...current.answer] : [];
                                  return {
                                    ...current,
                                    answer: currentValues.includes(value)
                                      ? currentValues.filter((entry) => entry !== value)
                                      : [...currentValues, value],
                                  };
                                });
                              }}
                            />
                          )}
                          label=""
                          sx={{ m: 0, mr: 0, width: 34, alignSelf: 'start' }}
                        />
                        <Chip
                          label={OPTION_LETTERS[index]}
                          size="small"
                          color={isCorrect ? 'success' : 'default'}
                          sx={{ fontWeight: 700, minWidth: 28, mt: 0.25, justifySelf: 'start' }}
                        />
                        <Box sx={{ minWidth: 0, pt: 0.25 }}>
                          <RichContent html={optionDisplayHtml(option)} />
                        </Box>
                        <Box sx={{ pt: 0.35, justifySelf: 'end' }}>
                          {isCorrect ? <CorrectIcon fontSize="small" color="success" /> : null}
                        </Box>
                      </Box>
                    </Paper>
                  );
                })}
              </FormGroup>
            )}

            {qType === QUESTION_TYPES.SHORT_ANSWER && (
              <Box>
                {locked ? (
                  <Paper variant="outlined" sx={{ p: 1.25, opacity: 0.85 }}>
                    {response?.answerWysiwyg ? (
                      <RichContent html={response.answerWysiwyg} />
                    ) : (
                      <Typography variant="body2">{normalizeValue(response?.answer) || '(no answer)'}</Typography>
                    )}
                  </Paper>
                ) : (
                  <StudentRichTextEditor
                    value={draft.answerWysiwyg || ''}
                    onChange={({ html, plainText }) => {
                      updateDraft(question, (current) => ({
                        ...current,
                        answerWysiwyg: html,
                        answer: plainText,
                      }));
                    }}
                    placeholder="Type your answer..."
                    disabled={locked}
                  />
                )}
              </Box>
            )}

            {qType === QUESTION_TYPES.NUMERICAL && (
              <TextField
                value={draft.answer ?? ''}
                onChange={(event) => {
                  updateDraft(question, (current) => ({
                    ...current,
                    answer: event.target.value,
                  }));
                }}
                disabled={locked}
                type="number"
                fullWidth
                placeholder="Enter a number"
              />
            )}

            {practiceQuiz && (
              <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {!locked && (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => handleSubmitPracticeQuestion(qId)}
                    disabled={!hasAnswerForDraft(question, draft) || lockingQuestionId === qId}
                  >
                    {lockingQuestionId === qId ? 'Submitting...' : 'Submit Question'}
                  </Button>
                )}
                {!locked && questionHasRevealableSolution && (
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    Solution available after submit.
                  </Typography>
                )}

                {locked && questionHasRevealableSolution && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setShowSolutionByQuestion((prev) => ({ ...prev, [qId]: !prev[qId] }))}
                  >
                    {showSolution ? 'Hide Solution' : 'Show Solution'}
                  </Button>
                )}
              </Box>
            )}

            {showCorrectForQuestion && qType === QUESTION_TYPES.NUMERICAL && numericalSolution != null && (
              <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, borderColor: 'success.main' }}>
                <Typography variant="body2">
                  Correct answer: {numericalSolution}
                  {numericalTolerance != null ? ` +/- ${numericalTolerance}` : ''}
                </Typography>
              </Paper>
            )}

            {showCorrectForQuestion && (solutionContent.html || solutionContent.plainText) && (
              <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, borderColor: 'success.main' }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'success.main', fontWeight: 700 }}>
                  Solution
                </Typography>
                <RichContent html={solutionContent.html} fallback={solutionContent.plainText} />
              </Paper>
            )}
          </Paper>
        );
      })}

      {!practiceQuiz && (
        <>
          <Divider sx={{ my: 2 }} />
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSubmitQuiz}
            disabled={!canSubmitQuiz}
          >
            {submittingQuiz ? 'Submitting...' : 'Submit Quiz'}
          </Button>
          {!canSubmitQuiz && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              Answer every question before submitting.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
