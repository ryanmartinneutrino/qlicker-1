import { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, Snackbar, CircularProgress, Chip,
  List, ListItem, ListItemButton, ListItemText, Divider, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import apiClient, { getAccessToken } from '../../api/client';
import { formatDisplayDate } from '../../utils/date';
import { buildCourseTitle } from '../../utils/courseTitle';
import {
  getSessionSortTime,
  getStudentSessionAction,
  isQuizSession,
  isSubmittedLiveQuiz,
  sortStudentSessions,
} from '../../utils/studentSessions';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import SessionStatusChip from '../../components/common/SessionStatusChip';
import SessionListCard from '../../components/common/SessionListCard';
import { useTranslation } from 'react-i18next';
import CourseGradesPanel from '../../components/grades/CourseGradesPanel';
import VideoChatPanel from '../../components/video/VideoChatPanel';
export { getStudentSessionAction, sortStudentSessions as sortSessions };

const QuestionLibraryPanel = lazy(() => import('../../components/questions/QuestionLibraryPanel'));

const MAX_STUDENT_TAB_INDEX = 6;

function parseCourseTab(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < 0 || parsed > MAX_STUDENT_TAB_INDEX) return 0;
  return parsed;
}

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': {
    px: 1.15,
  },
};

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

export default function StudentCourseDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [unenrollOpen, setUnenrollOpen] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [tab, setTab] = useState(() => parseCourseTab(searchParams.get('tab')));

  // Video chat availability
  const [videoEnabled, setVideoEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient.get(`/settings/jitsi-course/${id}`).then(({ data }) => {
      if (mounted) setVideoEnabled(!!data.enabled);
    }).catch(() => {
      if (mounted) setVideoEnabled(false);
    });
    return () => { mounted = false; };
  }, [id]);

  const fetchCourse = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/courses/${id}`);
      setCourse(data.course || data);
    } catch {
      setMsg({ severity: 'error', text: t('student.course.failedLoadCourse') });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const fetchSessions = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/courses/${id}/sessions`);
      setSessions(data.sessions || []);
    } catch {
      /* silently fail */
    } finally {
      setSessionsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const urlTab = parseCourseTab(searchParams.get('tab'));
    setTab((currentTab) => (currentTab === urlTab ? currentTab : urlTab));
  }, [searchParams]);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let pollingTimer = null;
    let closed = false;

    const refreshSessions = () => {
      if (document.visibilityState !== 'visible') return;
      fetchSessions();
    };

    const startPolling = () => {
      if (pollingTimer || closed) return;
      pollingTimer = setInterval(refreshSessions, 4000);
    };

    const stopPolling = () => {
      if (!pollingTimer) return;
      clearInterval(pollingTimer);
      pollingTimer = null;
    };

    const connect = () => {
      if (closed) return;
      const latestToken = getAccessToken();
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
          const evt = message?.event;
          const d = message?.data;
          if (String(d?.courseId || '') !== String(id)) return;
          // React to granular delta events and generic fallback
          if (evt === 'session:updated' || evt === 'session:status-changed'
            || evt === 'session:question-changed' || evt === 'session:visibility-changed') {
            fetchSessions();
          }
          if (evt === 'video:updated') {
            fetchCourse();
          }
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

    const handleVisibilityChange = () => refreshSessions();
    window.addEventListener('focus', refreshSessions);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      window.removeEventListener('focus', refreshSessions);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchSessions, id]);

  const handleUnenroll = async () => {
    setUnenrolling(true);
    try {
      await apiClient.delete(`/courses/${id}/students/${user._id}`);
      navigate('/student');
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || t('student.course.failedUnenroll') });
      setUnenrolling(false);
      setUnenrollOpen(false);
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!course) return <Box sx={{ p: 3 }}><Alert severity="error">{t('student.course.courseNotFound')}</Alert></Box>;
  const sortedSessions = sortStudentSessions(sessions);
  const practiceSessions = sortedSessions.filter((session) => !!session.studentCreated && !!session.practiceQuiz);
  const interactiveSessions = sortedSessions.filter((session) => !isQuizSession(session) && !session.studentCreated);
  const quizSessions = sortedSessions.filter((session) => isQuizSession(session) && !session.studentCreated);
  const headerTitle = buildCourseTitle(course, 'long');
  const headerSection = String(course.section || '').trim();
  const practiceTabIndex = 2;
  const questionLibraryTabIndex = 3;
  const gradesTabIndex = 4;

  const renderSessionList = (sessionItems, emptyText, listTabIndex = 0) => {
    if (sessionsLoading) return <CircularProgress size={24} />;
    if (sessionItems.length === 0) {
      return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {sessionItems.map((s) => {
          const action = getStudentSessionAction(s, id, listTabIndex);
          const clickable = action.clickable && !!action.path;
          const submittedLiveQuiz = isSubmittedLiveQuiz(s);
          return (
            <SessionListCard
              key={s._id}
              highlighted={s.status === 'running' && !submittedLiveQuiz}
              onClick={clickable ? () => navigate(action.path) : undefined}
              disabled={!clickable}
              sx={submittedLiveQuiz ? {
                bgcolor: 'action.disabledBackground',
                borderColor: 'divider',
                opacity: 0.76,
                '&:hover': {
                  bgcolor: 'action.disabledBackground',
                },
              } : undefined}
              title={s.name}
              badges={(
                <>
                  <SessionStatusChip status={s.status} />
                  {s.hasNewFeedback && (
                    <Chip
                      label={t('student.course.newFeedback')}
                      size="small"
                      color="warning"
                      variant="filled"
                      sx={COMPACT_CHIP_SX}
                    />
                  )}
                  {s.status === 'done' && !s.reviewable && (
                    <Chip
                      label={t('student.course.notReviewable')}
                      size="small"
                      variant="outlined"
                      color="default"
                      sx={COMPACT_CHIP_SX}
                    />
                  )}
                  {s.practiceQuiz && <Chip label={t('student.course.practice')} size="small" variant="outlined" sx={COMPACT_CHIP_SX} />}
                  {action.label && (
                    <Chip
                      label={t(action.label)}
                      size="small"
                      color={action.chipColor}
                      variant={action.chipVariant}
                      sx={COMPACT_CHIP_SX}
                    />
                  )}
                </>
              )}
              subtitle={`${t('student.course.questionCount', { count: (s.questions || []).length })}${getSessionSortTime(s) > 0 ? ` · ${formatDisplayDate(getSessionSortTime(s))}` : ''}`}
            />
          );
        })}
      </Box>
    );
  };

  // Determine if video is available for this course based on course data
  const courseHasVideo = videoEnabled && !!(
    (course?.videoChatOptions && course.videoChatOptions.urlId) ||
    (course?.groupCategories || []).some((cat) => cat.catVideoChatOptions && cat.catVideoChatOptions.urlId)
  );

  const videoTabIndex = courseHasVideo ? 5 : -1;
  const settingsTabIndex = courseHasVideo ? 6 : 5;

  const deletePracticeSession = async (sessionId) => {
    if (!window.confirm(t('student.course.deletePracticeSessionConfirm', { defaultValue: 'Delete this practice session?' }))) {
      return;
    }
    try {
      await apiClient.delete(`/sessions/${sessionId}`);
      await fetchSessions();
    } catch (err) {
      setMsg({
        severity: 'error',
        text: err.response?.data?.message || t('student.course.failedDeletePracticeSession', { defaultValue: 'Failed to delete practice session.' }),
      });
    }
  };

  return (
    <Box sx={{ p: 2.5, maxWidth: 980 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {headerTitle}
          </Typography>
          {headerSection && (
            <Typography variant="caption" color="text.secondary">
              {t('student.course.sectionHeader', { section: headerSection })}
            </Typography>
          )}
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, nextTab) => {
          setTab(nextTab);
          const nextParams = new URLSearchParams(searchParams);
          if (nextTab === 0) {
            nextParams.delete('tab');
          } else {
            nextParams.set('tab', String(nextTab));
          }
          setSearchParams(nextParams, { replace: true });
        }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab label={`${t('student.course.lectures')} (${interactiveSessions.length})`} />
        <Tab label={`${t('student.course.quizzes')} (${quizSessions.length})`} />
        <Tab label={`${t('student.course.practiceSessions', { defaultValue: 'Practice Sessions' })} (${practiceSessions.length})`} />
        <Tab label={t('questionLibrary.title', { defaultValue: 'Question Library' })} />
        <Tab label={t('student.course.grades')} />
        {courseHasVideo && <Tab label={t('student.course.video')} />}
        <Tab label={t('student.course.settings')} />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('student.course.lectures')}</Typography>
        {renderSessionList(interactiveSessions, t('student.course.noLectures'), 0)}
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('student.course.quizzes')}</Typography>
        {renderSessionList(quizSessions, t('student.course.noQuizzes'), 1)}
      </TabPanel>

      <TabPanel value={tab} index={practiceTabIndex}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Typography variant="h6">{t('student.course.practiceSessions', { defaultValue: 'Practice Sessions' })}</Typography>
          <Button variant="contained" onClick={() => navigate(`/student/course/${id}/practice-sessions/new`)}>
            {t('student.course.newPracticeSession', { defaultValue: 'New practice session' })}
          </Button>
        </Box>
        {sessionsLoading ? <CircularProgress size={24} /> : practiceSessions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('student.course.noPracticeSessions', { defaultValue: 'No practice sessions yet.' })}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {practiceSessions.map((session) => {
              const action = getStudentSessionAction(session, id, practiceTabIndex);
              return (
                <SessionListCard
                  key={session._id}
                  title={session.name}
                  onClick={action.path ? () => navigate(action.path) : undefined}
                  subtitle={t('student.course.questionCount', { count: (session.questions || []).length })}
                  badges={(
                    <>
                      <Chip label={t('student.course.practice', { defaultValue: 'Practice' })} size="small" variant="outlined" sx={COMPACT_CHIP_SX} />
                      {action.label ? (
                        <Chip
                          label={t(action.label)}
                          size="small"
                          color={action.chipColor}
                          variant={action.chipVariant}
                          sx={COMPACT_CHIP_SX}
                        />
                      ) : null}
                    </>
                  )}
                  actions={(
                    <>
                      <Tooltip title={t('common.edit')}>
                        <span>
                          <IconButton
                            size="small"
                            aria-label={t('common.edit')}
                            onClick={() => navigate(`/student/course/${id}/practice-sessions/${session._id}`)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={t('common.delete')}
                            onClick={() => deletePracticeSession(session._id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </>
                  )}
                />
              );
            })}
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tab} index={questionLibraryTabIndex}>
        <Suspense fallback={<Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}>
          <QuestionLibraryPanel
            courseId={id}
            currentCourse={course}
            availableSessions={sortedSessions}
            allowQuestionCreate={!!course.allowStudentQuestions}
            permissionMode="student"
          />
        </Suspense>
      </TabPanel>

      <TabPanel value={tab} index={gradesTabIndex}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{t('student.course.grades')}</Typography>
        <CourseGradesPanel
          courseId={id}
          instructorView={false}
          onOpenSession={(sessionReviewId) => navigate(`/student/course/${id}/session/${sessionReviewId}/review?returnTab=${gradesTabIndex}`)}
        />
      </TabPanel>

      {courseHasVideo && (
        <TabPanel value={tab} index={videoTabIndex}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>{t('video.title')}</Typography>
          <VideoChatPanel
            courseId={id}
            course={course}
            isStudent
            onCourseRefresh={fetchCourse}
          />
        </TabPanel>
      )}

      <TabPanel value={tab} index={settingsTabIndex}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{t('student.course.courseSettings')}</Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            {t('student.course.manageEnrollment')}
          </Typography>
          <Button variant="outlined" color="error" onClick={() => setUnenrollOpen(true)}>
            {t('student.course.unenroll')}
          </Button>
        </Paper>
      </TabPanel>

      {/* Unenroll Confirmation */}
      <Dialog open={unenrollOpen} onClose={() => setUnenrollOpen(false)}>
        <DialogTitle>{t('student.course.unenrollConfirm')}</DialogTitle>
        <DialogContent>
          {t('student.course.unenrollMessage', { name: course.name })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnenrollOpen(false)}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleUnenroll} disabled={unenrolling}>
            {unenrolling ? t('student.course.unenrolling') : t('student.course.unenroll')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
