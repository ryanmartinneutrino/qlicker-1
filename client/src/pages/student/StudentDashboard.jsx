import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Grid,
} from '@mui/material';
import { Add as AddIcon, School as SchoolIcon } from '@mui/icons-material';
import apiClient from '../../api/client';

export default function StudentDashboard() {
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
      setMsg({ severity: 'error', text: 'Failed to load courses' });
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
      setMsg({ severity: 'success', text: 'Successfully enrolled in course' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to enroll' });
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">My Courses</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
          Enroll in Course
        </Button>
      </Box>

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
        <Grid container spacing={2}>
          {courses.map((course) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={course._id}>
              <Card
                variant="outlined"
                sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                onClick={() => navigate(`/student/course/${course._id}`)}
              >
                <CardContent sx={{ flexGrow: 1, minHeight: 140 }}>
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
            </Grid>
          ))}
        </Grid>
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
