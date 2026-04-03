import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Chip,
} from '@mui/material';
import { Add as AddIcon, School as SchoolIcon, PlayCircle as LiveIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiClient, { getAccessToken } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { buildCourseTitle } from '../../utils/courseTitle';
import { fetchAllCourses } from '../../utils/fetchAllCourses';
import {
  getStudentSessionAction,
  isSubmittedLiveQuiz,
  sortStudentSessions,
} from '../../utils/studentSessions';
import SessionListCard from '../../components/common/SessionListCard';

const INACTIVE_COURSE_ERROR_CODE = 'COURSE_INACTIVE';

const LIVE_SESSION_GRID_SX = {
  display: 'grid',
  gap: 1.25,
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
};

const COURSE_GRID_SX = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
};

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

function isInactiveCourseEnrollError(error) {
  const response = error?.response;
  const payload = response?.data || {};
  if (payload.code === INACTIVE_COURSE_ERROR_CODE) return true;
  if (response?.status !== 403) return false;
  return String(payload.message || '').toLowerCase().includes('inactive');
}

export default function StudentDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [taCourses, setTaCourses] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const fetchLiveSessions = useCallback(async () => {
    try {
      const liveRes = await apiClient.get('/sessions/live', { params: { view: 'student' } });
      setLiveSessions(liveRes.data.liveSessions || []);
    } catch {
      setLiveSessions([]);
    }
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const nextCourses = await fetchAllCourses(apiClient, { view: 'student' });
      setCourses(nextCourses);
    } catch {
      setMsg({ severity: 'error', text: t('student.dashboard.failedLoadCourses') });
    }
  }, [t]);

  const fetchTaCourses = useCallback(async () => {
    if (!user?.hasInstructorCourses) {
      setTaCourses([]);
      return;
    }
    try {
      const nextCourses = await fetchAllCourses(apiClient, { view: 'instructor' });
      setTaCourses(nextCourses);
    } catch {
      setTaCourses([]);
    }
  }, [user?.hasInstructorCourses]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await Promise.all([
        fetchCourses(),
        fetchTaCourses(),
        fetchLiveSessions(),
      ]);
      if (!cancelled) {
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCourses, fetchTaCourses, fetchLiveSessions]);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let pollingTimer = null;
    let closed = false;

    const refreshLiveSessions = () => {
      if (document.visibilityState !== 'visible') return;
      fetchLiveSessions();
    };

    const startPolling = () => {
      if (pollingTimer || closed) return;
      pollingTimer = setInterval(refreshLiveSessions, 6000);
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
          if (evt === 'session:status-changed'
            || evt === 'session:question-changed'
            || evt === 'session:visibility-changed'
            || evt === 'session:attempt-changed'
            || evt === 'session:quiz-submitted') {
            refreshLiveSessions();
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
        if (data?.websocket === true) {
          connect();
          return;
        }
        startPolling();
      } catch {
        startPolling();
      }
    };

    initializeTransport();

    window.addEventListener('focus', refreshLiveSessions);
    document.addEventListener('visibilitychange', refreshLiveSessions);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      window.removeEventListener('focus', refreshLiveSessions);
      document.removeEventListener('visibilitychange', refreshLiveSessions);
    };
  }, [fetchLiveSessions]);

  const handleEnroll = async () => {
    if (!enrollCode.trim()) return;
    setEnrolling(true);
    try {
      await apiClient.post('/courses/enroll', { enrollmentCode: enrollCode.trim() });
      setEnrollOpen(false);
      setEnrollCode('');
      await Promise.all([fetchCourses(), fetchTaCourses(), fetchLiveSessions()]);
      setMsg({ severity: 'success', text: t('student.dashboard.enrollSuccess') });
    } catch (err) {
      if (isInactiveCourseEnrollError(err)) {
        setEnrollOpen(false);
        setEnrollCode('');
        setMsg({
          severity: 'warning',
          text: t('student.dashboard.inactiveCourseCannotEnroll'),
        });
      } else {
        setMsg({ severity: 'error', text: err.response?.data?.message || t('student.dashboard.failedEnroll') });
      }
    } finally {
      setEnrolling(false);
    }
  };

  const sortCourses = useCallback((items) => [...items].sort((a, b) => {
    const aActive = a.inactive ? 1 : 0;
    const bActive = b.inactive ? 1 : 0;
    if (aActive !== bActive) return aActive - bActive;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  }), []);
  const taCourseIds = useMemo(
    () => new Set(taCourses.map((course) => String(course._id))),
    [taCourses],
  );
  const taOnlyCourses = useMemo(
    () => sortCourses(taCourses),
    [sortCourses, taCourses],
  );
  const studentOnlyCourses = useMemo(() => (
    sortCourses(courses.filter((course) => !taCourseIds.has(String(course._id))))
  ), [courses, sortCourses, taCourseIds]);
  const hasAnyCourses = taOnlyCourses.length > 0 || studentOnlyCourses.length > 0;
  const courseById = useMemo(
    () => new Map([...taOnlyCourses, ...studentOnlyCourses].map((course) => [String(course._id), course])),
    [studentOnlyCourses, taOnlyCourses]
  );
  const visibleLiveSessions = useMemo(
    () => sortStudentSessions(liveSessions).filter((session) => !isSubmittedLiveQuiz(session)),
    [liveSessions]
  );

  const renderCourseSection = (sectionTitle, sectionCourses, { showTaChip = false } = {}) => (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        {sectionTitle}
      </Typography>
      <Box
        sx={COURSE_GRID_SX}
      >
        {sectionCourses.map((course) => {
          const isTa = taCourseIds.has(String(course._id));
          const coursePath = isTa
            ? `/prof/course/${course._id}`
            : `/student/course/${course._id}`;
          return (
            <Box key={course._id}>
              <Card
                variant="outlined"
                sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                onClick={() => navigate(coursePath)}
              >
                <CardContent sx={{ flexGrow: 1, minHeight: 160 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }} noWrap>
                      {buildCourseTitle(course, 'short')}
                    </Typography>
                    {showTaChip && (
                      <Chip label={t('common.ta')} size="small" color="info" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {course.semester}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {buildCourseTitle(course, 'medium')}
                  </Typography>
                  {course.section && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {t('student.dashboard.section', { section: course.section })}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">{t('student.dashboard.myCourses')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
          {t('student.dashboard.enrollInCourse')}
        </Button>
      </Box>

      {visibleLiveSessions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            <LiveIcon sx={{ verticalAlign: 'middle', mr: 0.5, color: 'success.main' }} />
            {t('dashboard.liveSessions')}
          </Typography>
          <Box sx={LIVE_SESSION_GRID_SX}>
            {visibleLiveSessions.map((ls) => {
              const matchedCourse = courseById.get(String(ls.courseId));
              const action = getStudentSessionAction(ls, ls.courseId, 0);
              const subtitle = matchedCourse
                ? `${buildCourseTitle(matchedCourse, 'long')}${matchedCourse.section ? ` · ${t('student.dashboard.section', { section: matchedCourse.section })}` : ''}`
                : ls.courseName;

              return (
                <SessionListCard
                  key={ls._id}
                  highlighted
                  onClick={action.clickable ? () => navigate(action.path) : undefined}
                  title={ls.name}
                  subtitle={subtitle}
                  badges={action.label ? (
                    <Chip
                      label={t(action.label)}
                      size="small"
                      color={action.chipColor}
                      variant={action.chipVariant}
                    />
                  ) : null}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : !hasAnyCourses ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">{t('student.dashboard.noCoursesYet')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('student.dashboard.enrollMessage')}
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
            {t('student.dashboard.enrollInCourse')}
          </Button>
        </Box>
      ) : (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            {t('dashboard.courses')}
          </Typography>
          {taOnlyCourses.length > 0
            ? renderCourseSection(t('student.dashboard.taCourses', { defaultValue: 'TA Courses' }), taOnlyCourses, { showTaChip: true })
            : null}
          {studentOnlyCourses.length > 0
            ? renderCourseSection(t('student.dashboard.studentCourses', { defaultValue: 'Student Courses' }), studentOnlyCourses)
            : null}
        </>
      )}

      {/* Enroll Dialog */}
      <Dialog open={enrollOpen} onClose={() => setEnrollOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('student.dashboard.enrollInCourse')}</DialogTitle>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            handleEnroll();
          }}
        >
          <DialogContent sx={{ pt: '8px !important' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('student.dashboard.enrollmentCodeMessage')}
            </Typography>
            <TextField
              label={t('student.dashboard.enrollmentCode')}
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value)}
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEnrollOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" disabled={enrolling || !enrollCode.trim()}>
              {enrolling ? t('student.dashboard.enrolling') : t('student.dashboard.enroll')}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
