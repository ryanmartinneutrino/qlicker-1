import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, School as SchoolIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import { buildCourseTitle } from '../../utils/courseTitle';

export default function StudentDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
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
      setMsg({ severity: 'error', text: t('student.dashboard.failedLoadCourses') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleEnroll = async () => {
    if (!enrollCode.trim()) return;
    setEnrolling(true);
    try {
      await apiClient.post('/courses/enroll', { enrollmentCode: enrollCode.trim() });
      setEnrollOpen(false);
      setEnrollCode('');
      fetchCourses();
      setMsg({ severity: 'success', text: t('student.dashboard.enrollSuccess') });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || t('student.dashboard.failedEnroll') });
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
        <Typography variant="h4">{t('student.dashboard.myCourses')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
          {t('student.dashboard.enrollInCourse')}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : courses.length === 0 ? (
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
                    {buildCourseTitle(course, 'short')}
                  </Typography>
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
          ))}
        </Box>
      )}

      {/* Enroll Dialog */}
      <Dialog open={enrollOpen} onClose={() => setEnrollOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('student.dashboard.enrollInCourse')}</DialogTitle>
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
          <Button variant="contained" onClick={handleEnroll} disabled={enrolling || !enrollCode.trim()}>
            {enrolling ? t('student.dashboard.enrolling') : t('student.dashboard.enroll')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
