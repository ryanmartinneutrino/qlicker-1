import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import BackLinkButton from '../../components/common/BackLinkButton';
import QuestionDisplay from '../../components/questions/QuestionDisplay';
import QuestionEditor from '../../components/questions/QuestionEditor';
import QuestionLibraryPanel from '../../components/questions/QuestionLibraryPanel';
import { buildCourseTitle } from '../../utils/courseTitle';

function normalizeQuestionId(questionOrId) {
  return String(questionOrId?._id || questionOrId || '').trim();
}

function insertQuestionsAtIndex(existingQuestions, incomingQuestions, insertAtIndex) {
  const normalizedInsertAtIndex = Math.max(0, Math.min(Number(insertAtIndex) || 0, existingQuestions.length));
  const existingIds = new Set(existingQuestions.map((question) => normalizeQuestionId(question)).filter(Boolean));
  const uniqueIncomingQuestions = (incomingQuestions || []).filter((question) => {
    const questionId = normalizeQuestionId(question);
    if (!questionId || existingIds.has(questionId)) return false;
    existingIds.add(questionId);
    return true;
  });

  return [
    ...existingQuestions.slice(0, normalizedInsertAtIndex),
    ...uniqueIncomingQuestions,
    ...existingQuestions.slice(normalizedInsertAtIndex),
  ];
}

export default function PracticeSessionEditor() {
  const { t } = useTranslation();
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const libraryPanelRef = useRef(null);
  const [course, setCourse] = useState(null);
  const [session, setSession] = useState(null);
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  const [librarySelectionCount, setLibrarySelectionCount] = useState(0);
  const [randomAddCount, setRandomAddCount] = useState(10);

  const selectedQuestionIds = useMemo(
    () => selectedQuestions.map((question) => normalizeQuestionId(question)).filter(Boolean),
    [selectedQuestions]
  );

  const loadSelectedQuestions = useCallback(async (questionIds = []) => {
    const normalizedIds = [...new Set((questionIds || []).map((questionId) => normalizeQuestionId(questionId)).filter(Boolean))];
    if (normalizedIds.length === 0) {
      setSelectedQuestions([]);
      return;
    }

    const loadedQuestions = await Promise.all(
      normalizedIds.map((questionId) => (
        apiClient.get(`/questions/${questionId}`)
          .then(({ data }) => data.question || data)
          .catch(() => null)
      ))
    );
    const questionById = new Map(
      loadedQuestions
        .filter(Boolean)
        .map((question) => [normalizeQuestionId(question), question])
    );
    setSelectedQuestions(normalizedIds.map((questionId) => questionById.get(questionId)).filter(Boolean));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [courseRes, sessionRes] = await Promise.all([
        apiClient.get(`/courses/${courseId}`),
        sessionId ? apiClient.get(`/sessions/${sessionId}`) : Promise.resolve(null),
      ]);

      const nextCourse = courseRes?.data?.course || courseRes?.data || null;
      const nextSession = sessionRes?.data?.session || sessionRes?.data || null;

      setCourse(nextCourse);
      setSession(nextSession);
      setName(nextSession?.name || '');
      await loadSelectedQuestions(nextSession?.questions || []);
      setMessage(null);
    } catch (err) {
      setMessage({
        severity: 'error',
        text: err.response?.data?.message || t('student.course.failedLoadPracticeEditor', { defaultValue: 'Failed to load the practice session editor.' }),
      });
    } finally {
      setLoading(false);
    }
  }, [courseId, loadSelectedQuestions, sessionId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const removeSelectedQuestion = (questionId) => {
    const normalizedId = normalizeQuestionId(questionId);
    setSelectedQuestions((previous) => previous.filter((question) => normalizeQuestionId(question) !== normalizedId));
  };

  const openAddQuestionDialog = (nextInsertIndex = selectedQuestions.length) => {
    setInsertAtIndex(nextInsertIndex);
    setAddDialogOpen(true);
  };

  const closeAddQuestionFlow = () => {
    setAddDialogOpen(false);
    setLibraryDialogOpen(false);
    setCreatingQuestion(false);
    setInsertAtIndex(null);
    setLibrarySelectionCount(0);
  };

  const handleQuestionSave = async (payload) => {
    const { data } = await apiClient.post('/questions', {
      ...payload,
      courseId,
    });
    return data.question || data;
  };

  const handleAddLibraryQuestions = useCallback(async (questionIds) => {
    if (!questionIds.length) return;

    const uniqueIds = [...new Set([...selectedQuestionIds, ...questionIds.map((questionId) => String(questionId))])];
    const missingIds = uniqueIds.filter((questionId) => !selectedQuestionIds.includes(questionId));
    if (missingIds.length > 0) {
      const loadedQuestions = await Promise.all(
        missingIds.map((questionId) => (
          apiClient.get(`/questions/${questionId}`)
            .then(({ data }) => data.question || data)
            .catch(() => null)
        ))
      );
      const nextQuestionById = new Map(selectedQuestions.map((question) => [normalizeQuestionId(question), question]));
      loadedQuestions.filter(Boolean).forEach((question) => {
        nextQuestionById.set(normalizeQuestionId(question), question);
      });
      const incomingQuestions = questionIds
        .map((questionId) => nextQuestionById.get(String(questionId)))
        .filter(Boolean);
      setSelectedQuestions((previous) => (
        insertQuestionsAtIndex(previous, incomingQuestions, insertAtIndex ?? previous.length)
      ));
    }
    setInsertAtIndex(null);
    setLibrarySelectionCount(0);
    setLibraryDialogOpen(false);
    setAddDialogOpen(false);
  }, [insertAtIndex, selectedQuestionIds, selectedQuestions]);

  const handleSave = async () => {
    if (!name.trim()) {
      setMessage({
        severity: 'error',
        text: t('student.course.practiceNameRequired', { defaultValue: 'Practice session name is required.' }),
      });
      return;
    }

    setSaving(true);
    try {
      let practiceSessionId = sessionId;
      if (!practiceSessionId) {
        const { data } = await apiClient.post(`/courses/${courseId}/sessions`, {
          name: name.trim(),
          practiceQuiz: true,
        });
        practiceSessionId = data?.session?._id;
      } else {
        await apiClient.patch(`/sessions/${practiceSessionId}`, { name: name.trim() });
      }

      await apiClient.patch(`/sessions/${practiceSessionId}/practice-questions`, {
        questionIds: selectedQuestionIds,
      });

      navigate(`/student/course/${courseId}/session/${practiceSessionId}/review?returnTab=2`);
    } catch (err) {
      setMessage({
        severity: 'error',
        text: err.response?.data?.message || t('student.course.failedSavePracticeSession', { defaultValue: 'Failed to save the practice session.' }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 2.5, maxWidth: 1040, mx: 'auto' }}>
      <Box sx={{ mb: 1.5 }}>
        <BackLinkButton
          variant="outlined"
          label={t('student.course.backToPracticeSessions', { defaultValue: 'Back to practice sessions' })}
          onClick={() => navigate(`/student/course/${courseId}?tab=2`)}
        />
      </Box>

      {message ? (
        <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}

      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {course ? buildCourseTitle(course, 'long') : t('student.course.practiceSessions', { defaultValue: 'Practice Sessions' })}
      </Typography>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {sessionId
          ? t('student.course.editPracticeSession', { defaultValue: 'Edit practice session' })
          : t('student.course.newPracticeSession', { defaultValue: 'New practice session' })}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <TextField
            label={t('student.course.practiceSessionName', { defaultValue: 'Practice session name' })}
            value={name}
            onChange={(event) => setName(event.target.value)}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => openAddQuestionDialog()}>
              {t('student.course.addQuestion', { defaultValue: 'Add question' })}
            </Button>
            {selectedQuestionIds.length > 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {t('student.course.selectedPracticeQuestions', {
                  count: selectedQuestionIds.length,
                  defaultValue: selectedQuestionIds.length === 1 ? '1 question selected' : `${selectedQuestionIds.length} questions selected`,
                })}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Paper>

      {creatingQuestion ? (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <QuestionEditor
              open
              inline
              initial={null}
              tagSuggestions={course?.tags || []}
              showVisibilityControls={false}
              allowCustomTags={false}
              onAutoSave={handleQuestionSave}
              onClose={async ({ persistedQuestionId } = {}) => {
                setCreatingQuestion(false);
                setAddDialogOpen(false);
                if (persistedQuestionId) {
                  try {
                    const { data } = await apiClient.get(`/questions/${persistedQuestionId}`);
                    const savedQuestion = data.question || data;
                    setSelectedQuestions((previous) => (
                      insertQuestionsAtIndex(previous, [savedQuestion], insertAtIndex ?? previous.length)
                    ));
                  } catch {
                    await fetchData();
                  }
                }
                setInsertAtIndex(null);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle2" color="text.secondary">
            {t('student.course.practiceSessionQuestions', { defaultValue: 'Questions in this practice session' })}
          </Typography>
          {selectedQuestions.length === 0 ? (
            <Alert severity="info">
              {t('student.course.noPracticeQuestionsSelected', {
                defaultValue: 'Add or create questions to build this practice session.',
              })}
            </Alert>
          ) : (
            [...Array(selectedQuestions.length + 1).keys()].map((slotIndex) => {
              const question = selectedQuestions[slotIndex];
              const isEdgeInsertSlot = slotIndex === 0 || slotIndex === selectedQuestions.length;
              const questionId = normalizeQuestionId(question);

              return (
                <Box key={`practice-slot-${slotIndex}`}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                    {isEdgeInsertSlot ? (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => openAddQuestionDialog(slotIndex)}
                      >
                        {t('student.course.addQuestion', { defaultValue: 'Add question' })}
                      </Button>
                    ) : (
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => openAddQuestionDialog(slotIndex)}
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
                          {t('common.add')}
                        </Typography>
                      </Button>
                    )}
                  </Box>

                  {question ? (
                    <Card variant="outlined" sx={{ mb: 1.5 }}>
                      <CardContent sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <QuestionDisplay question={question} />
                        </Box>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => removeSelectedQuestion(questionId)}
                        >
                          {t('common.remove', { defaultValue: 'Remove' })}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}
                </Box>
              );
            })
          )}
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving
            ? t('common.saving', { defaultValue: 'Saving…' })
            : t('student.course.saveAndStartPractice', { defaultValue: 'Save and start practice' })}
        </Button>
        <Button variant="outlined" onClick={() => navigate(`/student/course/${courseId}?tab=2`)}>
          {t('common.cancel')}
        </Button>
      </Box>

      <Dialog open={addDialogOpen} onClose={closeAddQuestionFlow} maxWidth="xs" fullWidth>
        <DialogTitle>{t('student.course.addQuestion', { defaultValue: 'Add question' })}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setCreatingQuestion(true);
                setLibraryDialogOpen(false);
                setAddDialogOpen(false);
              }}
            >
              {t('student.course.createNewQuestion', { defaultValue: 'Create New' })}
            </Button>
            <Button
              variant="outlined"
              startIcon={<CopyIcon />}
              onClick={() => {
                setLibraryDialogOpen(true);
                setAddDialogOpen(false);
              }}
            >
              {t('student.course.copyFromQuestionLibrary', { defaultValue: 'Copy from Question Library' })}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddQuestionFlow}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={libraryDialogOpen}
        onClose={closeAddQuestionFlow}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>{t('student.course.copyFromQuestionLibrary', { defaultValue: 'Copy from Question Library' })}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ p: 2 }}>
            <QuestionLibraryPanel
              ref={libraryPanelRef}
              courseId={courseId}
              currentCourse={course}
              availableSessions={[]}
              allowQuestionCreate={false}
              selectionAction={{
                buttonLabel: t('questionLibrary.bulk.addSelectedToPracticeSession', { defaultValue: 'Add selected questions to practice session' }),
                onSubmit: handleAddLibraryQuestions,
                onSelectionChange: (questionIds) => setLibrarySelectionCount(questionIds.length),
                hideInlineRandomSelectionControls: true,
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
            <TextField
              size="small"
              type="number"
              label={t('questionLibrary.bulk.randomCount', { defaultValue: 'Random count' })}
              value={randomAddCount}
              inputProps={{ min: 1 }}
              onChange={(event) => setRandomAddCount(Math.max(1, Number(event.target.value) || 1))}
              sx={{ width: { xs: '100%', sm: 140 } }}
            />
            <Button
              variant="outlined"
              onClick={async () => {
                await libraryPanelRef.current?.submitRandomFilteredQuestions(randomAddCount);
              }}
            >
              {t('questionLibrary.bulk.randomAddToPracticeSession', {
                count: Math.max(1, Number(randomAddCount) || 1),
                defaultValue: `Randomly add ${Math.max(1, Number(randomAddCount) || 1)} questions from the list`,
              })}
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              disabled={librarySelectionCount === 0}
              onClick={async () => {
                await libraryPanelRef.current?.submitSelectedQuestions();
              }}
            >
              {t('questionLibrary.bulk.addSelectedToPracticeSession', { defaultValue: 'Add selected questions to practice session' })}
            </Button>
            <Button onClick={closeAddQuestionFlow}>{t('common.close')}</Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
