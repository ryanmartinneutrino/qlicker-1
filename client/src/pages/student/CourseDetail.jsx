import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, Snackbar, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { ArrowBack as BackIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/client';

export default function StudentCourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [unenrollOpen, setUnenrollOpen] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

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

  const handleUnenroll = async () => {
    setUnenrolling(true);
    try {
      await apiClient.delete(`/courses/${id}/students/${user._id}`);
      navigate('/student');
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.error || 'Failed to unenroll' });
      setUnenrolling(false);
      setUnenrollOpen(false);
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!course) return <Box sx={{ p: 3 }}><Alert severity="error">Course not found</Alert></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 700 }}>
      <Button startIcon={<BackIcon />} onClick={() => navigate('/student')} sx={{ mb: 2 }}>
        Back to Courses
      </Button>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>{course.name}</Typography>
        <Typography variant="body1" color="text.secondary">
          {course.deptCode} {course.courseNumber}{course.section ? ` – ${course.section}` : ''}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {course.semester}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sessions and other course content will appear here.
        </Typography>
      </Paper>

      <Button variant="outlined" color="error" onClick={() => setUnenrollOpen(true)}>
        Unenroll from Course
      </Button>

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
