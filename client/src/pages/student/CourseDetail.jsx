import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, Snackbar, CircularProgress, Chip,
  List, ListItem, ListItemText, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab,
} from '@mui/material';
import { Quiz as QuizIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import { formatDisplayDate } from '../../utils/date';

const STATUS_COLORS = { hidden: 'default', visible: 'info', running: 'success', done: 'warning' };
const STATUS_LABELS = { hidden: 'Draft', visible: 'Upcoming', running: 'Live', done: 'Ended' };

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

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

export default function StudentCourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [unenrollOpen, setUnenrollOpen] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [tab, setTab] = useState(0);

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
  const headerCourseName = String(course.name || '').trim() || 'Course';
  const headerDeptCode = String(course.deptCode || '').trim();
  const headerCourseNumber = String(course.courseNumber || '').trim();
  const headerSection = String(course.section || '').trim();
  const headerSemester = String(course.semester || '').trim();
  const headerCode = `${headerDeptCode} ${headerCourseNumber}`.trim();
  const headerTitle = `${headerCode ? `${headerCode}: ` : ''}${headerCourseName}${headerSemester ? ` (${headerSemester})` : ''}`;

  const renderSessionList = (sessionItems, emptyText) => {
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      {s.name}
                      <Chip
                        label={STATUS_LABELS[s.status] || s.status}
                        color={STATUS_COLORS[s.status] || 'default'}
                        size="small"
                      />
                      {isQuizSession(s) && <Chip icon={<QuizIcon />} label="Quiz" size="small" variant="outlined" />}
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
                    width: { xs: '100%', sm: 'auto' },
                    justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                  }}
                >
                  {s.status === 'running' && (
                    <Button size="small" variant="outlined" disabled>Join</Button>
                  )}
                  {isQuizSession(s) && s.status !== 'done' && (
                    <Button size="small" variant="outlined" disabled>Start Quiz</Button>
                  )}
                  {s.status === 'done' && (
                    <Button size="small" variant="text" disabled>Review</Button>
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
        onChange={(_, nextTab) => setTab(nextTab)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab label={`Lectures (${interactiveSessions.length})`} />
        <Tab label={`Quizzes (${quizSessions.length})`} />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <Typography variant="h6" sx={{ mb: 2 }}>Lectures</Typography>
        {renderSessionList(interactiveSessions, 'No lectures available.')}
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Typography variant="h6" sx={{ mb: 2 }}>Quizzes</Typography>
        {renderSessionList(quizSessions, 'No quizzes available.')}
      </TabPanel>

      <Box sx={{ mt: 3 }}>
        <Button variant="outlined" color="error" onClick={() => setUnenrollOpen(true)}>
          Unenroll from Course
        </Button>
      </Box>

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
