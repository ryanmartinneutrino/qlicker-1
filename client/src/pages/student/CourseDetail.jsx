import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, Snackbar, CircularProgress, Chip,
  List, ListItem, ListItemText, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import { formatDisplayDate } from '../../utils/date';
import { buildCourseTitle } from '../../utils/courseTitle';
import SessionStatusChip from '../../components/common/SessionStatusChip';
import CourseGradesPanel from '../../components/grades/CourseGradesPanel';

function getSessionSortTime(session) {
  return new Date(session.date || session.quizStart || session.createdAt || 0).getTime();
}

function sortSessions(items) {
  return [...items].sort((a, b) => {
    const aRunning = a.status === 'running' ? 0 : 1;
    const bRunning = b.status === 'running' ? 0 : 1;
    if (aRunning !== bRunning) return aRunning - bRunning;
    return getSessionSortTime(b) - getSessionSortTime(a);
  });
}

function isQuizSession(session) {
  return !!(session.quiz || session.practiceQuiz);
}

const MAX_STUDENT_TAB_INDEX = 3;

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

  const fetchCourse = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/courses/${id}`);
      setCourse(data.course || data);
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load course' });
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
          if (String(message?.data?.courseId || '') !== String(id)) return;
          fetchSessions();
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
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to unenroll' });
      setUnenrolling(false);
      setUnenrollOpen(false);
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!course) return <Box sx={{ p: 3 }}><Alert severity="error">Course not found</Alert></Box>;
  const sortedSessions = sortSessions(sessions);
  const interactiveSessions = sortedSessions.filter((s) => !isQuizSession(s));
  const quizSessions = sortedSessions.filter(isQuizSession);
  const headerTitle = buildCourseTitle(course, 'long');
  const headerSection = String(course.section || '').trim();

  const renderSessionList = (sessionItems, emptyText, listTabIndex = 0) => {
    if (sessionsLoading) return <CircularProgress size={24} />;
    if (sessionItems.length === 0) {
      return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
    }
    return (
      <Paper variant="outlined">
        <List disablePadding>
          {sessionItems.map((s, i) => (
            <Box key={s._id}>
              {i > 0 && <Divider />}
              <ListItem
                sx={{
                  alignItems: 'flex-start',
                  flexWrap: { xs: 'wrap', sm: 'nowrap' },
                  gap: 1,
                }}
              >
                <ListItemText
                  primary={(
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                      <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>
                        {s.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                        <SessionStatusChip status={s.status} />
                        {s.status === 'done' && (
                          <Chip
                            label={s.reviewable ? 'Reviewable' : 'Not Reviewable'}
                            size="small"
                            variant="outlined"
                            color={s.reviewable ? 'success' : 'default'}
                            sx={COMPACT_CHIP_SX}
                          />
                        )}
                        {s.practiceQuiz && <Chip label="Practice" size="small" variant="outlined" sx={COMPACT_CHIP_SX} />}
                      </Box>
                    </Box>
                  )}
                  secondary={(
                    <>
                      {(s.questions || []).length} question{(s.questions || []).length === 1 ? '' : 's'}
                      {getSessionSortTime(s) > 0 ? ` · ${formatDisplayDate(getSessionSortTime(s))}` : ''}
                    </>
                  )}
                />
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                    width: { xs: '100%', sm: 'auto' },
                    justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                  }}
                >
                  {isQuizSession(s) && s.quizSubmittedByCurrentUser && !s.practiceQuiz && (
                    <Button size="small" variant="outlined" disabled>
                      Submitted
                    </Button>
                  )}
                  {s.status === 'running' && !isQuizSession(s) && (
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={() => navigate(`/student/course/${id}/session/${s._id}/live`)}
                      aria-label={`Join live session ${s.name}`}
                    >
                      Join
                    </Button>
                  )}
                  {isQuizSession(s) && s.status === 'running' && !(s.quizSubmittedByCurrentUser && !s.practiceQuiz) && (
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={() => navigate(`/student/course/${id}/session/${s._id}/quiz`)}
                    >
                      Start Quiz
                    </Button>
                  )}
                  {isQuizSession(s) && s.status === 'visible' && (
                    <Button size="small" variant="outlined" disabled>Upcoming</Button>
                  )}
                  {s.status === 'done' && (
                    <Button
                      size="small"
                      variant="text"
                      disabled={!s.reviewable}
                      onClick={() => navigate(`/student/course/${id}/session/${s._id}/review?returnTab=${listTabIndex}`)}
                    >
                      Review
                    </Button>
                  )}
                </Box>
              </ListItem>
            </Box>
          ))}
        </List>
      </Paper>
    );
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
              Section {headerSection}
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
        <Tab label={`Lectures (${interactiveSessions.length})`} />
        <Tab label={`Quizzes (${quizSessions.length})`} />
        <Tab label="Grades" />
        <Tab label="Settings" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <Typography variant="h6" sx={{ mb: 2 }}>Lectures</Typography>
        {renderSessionList(interactiveSessions, 'No lectures available.', 0)}
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Typography variant="h6" sx={{ mb: 2 }}>Quizzes</Typography>
        {renderSessionList(quizSessions, 'No quizzes available.', 1)}
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Grades</Typography>
        <CourseGradesPanel
          courseId={id}
          instructorView={false}
          onOpenSession={(sessionReviewId) => navigate(`/student/course/${id}/session/${sessionReviewId}/review?returnTab=2`)}
        />
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Course Settings</Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            Manage your enrollment for this course.
          </Typography>
          <Button variant="outlined" color="error" onClick={() => setUnenrollOpen(true)}>
            Unenroll from Course
          </Button>
        </Paper>
      </TabPanel>

      {/* Unenroll Confirmation */}
      <Dialog open={unenrollOpen} onClose={() => setUnenrollOpen(false)}>
        <DialogTitle>Unenroll from Course</DialogTitle>
        <DialogContent>
          Are you sure you want to unenroll from <strong>{course.name}</strong>?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnenrollOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleUnenroll} disabled={unenrolling}>
            {unenrolling ? 'Unenrolling…' : 'Unenroll'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
