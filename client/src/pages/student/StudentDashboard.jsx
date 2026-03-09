import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Paper, Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  School as SchoolIcon,
  Quiz as QuizIcon,
  Login as JoinIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';

function getSessionSortTime(session) {
  return new Date(session.quizStart || session.date || session.createdAt || 0).getTime();
}

function sortLiveSessions(items = []) {
  return [...items].sort((a, b) => getSessionSortTime(b) - getSessionSortTime(a));
}

function isQuizSession(session) {
  return !!(session?.quiz || session?.practiceQuiz);
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveSessionsLoading, setLiveSessionsLoading] = useState(false);
  const [liveSessions, setLiveSessions] = useState([]);
  const [msg, setMsg] = useState(null);

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/courses');
      setCourses(data.courses || []);
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load courses' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const fetchLiveSessions = useCallback(async (courseList) => {
    const activeCourses = (courseList || []).filter((course) => !course.inactive);
    if (activeCourses.length === 0) {
      setLiveSessions([]);
      setLiveSessionsLoading(false);
      return;
    }

    setLiveSessionsLoading(true);
    try {
      const sessionResults = await Promise.all(
        activeCourses.map(async (course) => {
          try {
            const { data } = await apiClient.get(`/courses/${course._id}/sessions`);
            const running = (data.sessions || []).filter((session) => session.status === 'running');
            return running.map((session) => ({
              ...session,
              courseId: course._id,
              courseName: course.name,
              courseCode: `${course.deptCode || ''} ${course.courseNumber || ''}`.trim(),
            }));
          } catch {
            return [];
          }
        })
      );
      setLiveSessions(sortLiveSessions(sessionResults.flat()));
    } finally {
      setLiveSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveSessions(courses);
  }, [courses, fetchLiveSessions]);

  const handleEnroll = async () => {
    if (!enrollCode.trim()) return;
    setEnrolling(true);
    try {
      await apiClient.post('/courses/enroll', { enrollmentCode: enrollCode.trim() });
      setEnrollOpen(false);
      setEnrollCode('');
      fetchCourses();
      setMsg({ severity: 'success', text: 'Successfully enrolled in course' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to enroll' });
    } finally {
      setEnrolling(false);
    }
  };

  const sortedCourses = [...courses].sort((a, b) => {
    const aActive = a.inactive ? 1 : 0;
    const bActive = b.inactive ? 1 : 0;
    if (aActive !== bActive) return aActive - bActive;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">My Courses</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
          Enroll in Course
        </Button>
      </Box>

      {(liveSessionsLoading || liveSessions.length > 0) && (
        <Paper
          variant="outlined"
          sx={{
            mb: 3,
            p: 2,
            borderColor: liveSessions.length > 0 ? 'success.main' : 'divider',
            bgcolor: liveSessions.length > 0 ? 'success.50' : 'background.paper',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Live now
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Active sessions in your current courses.
          </Typography>
          {liveSessionsLoading ? (
            <CircularProgress size={20} />
          ) : (
            <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fill, minmax(250px, 1fr))' } }}>
              {liveSessions.map((session) => {
                const quizLike = isQuizSession(session);
                const actionLabel = quizLike ? 'Join Quiz' : 'Join Session';
                const target = quizLike
                  ? `/student/course/${session.courseId}/session/${session._id}/quiz`
                  : `/student/course/${session.courseId}/session/${session._id}/live`;

                return (
                  <Card
                    key={session._id}
                    variant="outlined"
                    onClick={() => navigate(target)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { boxShadow: 2, borderColor: 'primary.main' },
                    }}
                  >
                    <CardContent sx={{ '&:last-child': { pb: 1.5 }, py: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0, flexGrow: 1 }}>
                          {session.name}
                        </Typography>
                        <Chip label="Live" size="small" color="success" />
                        {quizLike && <Chip icon={<QuizIcon />} label="Quiz" size="small" variant="outlined" />}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {`${session.courseCode || session.courseName || 'Course'}${session.courseName ? ` · ${session.courseName}` : ''}`}
                      </Typography>
                      <Typography variant="caption" color="primary.main" sx={{ mt: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <JoinIcon sx={{ fontSize: 14 }} />
                        {actionLabel}
                      </Typography>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </Paper>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : courses.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No courses yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use an enrollment code from your instructor to join a course.
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
            Enroll in Course
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 280px))',
          }}
        >
          {sortedCourses.map((course) => (
            <Box key={course._id}>
              <Card
                variant="outlined"
                sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                onClick={() => navigate(`/student/course/${course._id}`)}
              >
                <CardContent sx={{ flexGrow: 1, minHeight: 160 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
                    {course.deptCode} {course.courseNumber}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {course.semester}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {course.name}
                  </Typography>
                  {course.section && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Section: {course.section}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      )}

      {/* Enroll Dialog */}
      <Dialog open={enrollOpen} onClose={() => setEnrollOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Enroll in Course</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the enrollment code provided by your instructor.
          </Typography>
          <TextField
            label="Enrollment Code"
            value={enrollCode}
            onChange={(e) => setEnrollCode(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEnroll} disabled={enrolling || !enrollCode.trim()}>
            {enrolling ? 'Enrolling…' : 'Enroll'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
