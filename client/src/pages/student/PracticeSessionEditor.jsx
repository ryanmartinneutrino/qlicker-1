import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import BackLinkButton from '../../components/common/BackLinkButton';
import QuestionDisplay from '../../components/questions/QuestionDisplay';
import { buildCourseTitle } from '../../utils/courseTitle';

export default function PracticeSessionEditor() {
  const { t } = useTranslation();
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [name, setName] = useState('');
  const [contentFilter, setContentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [courseRes, questionRes, sessionRes] = await Promise.all([
        apiClient.get(`/courses/${courseId}`),
        apiClient.get(`/courses/${courseId}/questions?limit=500`),
        sessionId ? apiClient.get(`/sessions/${sessionId}`) : Promise.resolve(null),
      ]);

      const nextCourse = courseRes?.data?.course || courseRes?.data || null;
      const nextQuestions = questionRes?.data?.questions || [];
      const nextSession = sessionRes?.data?.session || sessionRes?.data || null;

      setCourse(nextCourse);
      setQuestions(nextQuestions);
      setSession(nextSession);
      setName(nextSession?.name || '');
      setSelectedQuestionIds((nextSession?.questions || []).map((questionId) => String(questionId)));
      setMessage(null);
    } catch (err) {
      setMessage({
        severity: 'error',
        text: err.response?.data?.message || t('student.course.failedLoadPracticeEditor', { defaultValue: 'Failed to load the practice session editor.' }),
      });
    } finally {
      setLoading(false);
    }
  }, [courseId, sessionId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredQuestions = useMemo(() => {
    const search = contentFilter.trim().toLowerCase();
    if (!search) return questions;
    return questions.filter((question) => String(question?.plainText || question?.content || '').toLowerCase().includes(search));
  }, [contentFilter, questions]);

  const toggleQuestion = (questionId) => {
    const normalizedId = String(questionId);
    setSelectedQuestionIds((previous) => (
      previous.includes(normalizedId)
        ? previous.filter((id) => id !== normalizedId)
        : [...previous, normalizedId]
    ));
  };

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

      navigate(`/student/course/${courseId}/session/${practiceSessionId}/quiz`);
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
    <Box sx={{ p: 2.5, maxWidth: 980, mx: 'auto' }}>
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
          <TextField
            label={t('student.course.filterPracticeQuestions', { defaultValue: 'Filter questions' })}
            value={contentFilter}
            onChange={(event) => setContentFilter(event.target.value)}
            fullWidth
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('student.course.selectedPracticeQuestions', {
            count: selectedQuestionIds.length,
            defaultValue: selectedQuestionIds.length === 1 ? '1 question selected' : `${selectedQuestionIds.length} questions selected`,
          })}
        </Typography>
        <Stack spacing={1.5}>
          {filteredQuestions.map((question) => {
            const questionId = String(question._id);
            const checked = selectedQuestionIds.includes(questionId);
            return (
              <Card key={questionId} variant="outlined">
                <CardContent sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                  <Checkbox checked={checked} onChange={() => toggleQuestion(questionId)} />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <QuestionDisplay question={question} />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
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
    </Box>
  );
}
