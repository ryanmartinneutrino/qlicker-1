import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Card, CardContent, CardActions,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Chip, InputAdornment, Grid,
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, ContentCopy as CopyIcon,
  School as SchoolIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';

export default function ProfDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState(null);

  // Create course dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCourse, setNewCourse] = useState({
    name: '', deptCode: '', courseNumber: '', section: '', semester: '',
  });

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

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiClient.post('/courses', newCourse);
      setCreateOpen(false);
      setNewCourse({ name: '', deptCode: '', courseNumber: '', section: '', semester: '' });
      fetchCourses();
      setMsg({ severity: 'success', text: 'Course created' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.error || 'Failed to create course' });
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setMsg({ severity: 'success', text: 'Enrollment code copied' });
  };

  const filtered = courses.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const searchable = `${c.name} ${c.deptCode} ${c.courseNumber} ${c.section} ${c.semester}`.toLowerCase();
    return searchable.includes(q);
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">My Courses</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Create Course
        </Button>
      </Box>

      <TextField
        size="small"
        placeholder="Search courses…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        sx={{ mb: 3, minWidth: 300 }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {search ? 'No courses match your search' : 'No courses yet'}
          </Typography>
          {!search && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create your first course to get started.
            </Typography>
          )}
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((course) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={course._id}>
              <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" gutterBottom noWrap>{course.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {course.deptCode} {course.courseNumber}{course.section ? ` – ${course.section}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {course.semester}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <Chip
                      label={course.inactive ? 'Inactive' : 'Active'}
                      color={course.inactive ? 'default' : 'success'}
                      size="small"
                    />
                  </Box>
                  {course.enrollmentCode && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Code:</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {course.enrollmentCode}
                      </Typography>
                      <CopyIcon
                        fontSize="small"
                        sx={{ cursor: 'pointer', color: 'action.active', '&:hover': { color: 'primary.main' } }}
                        onClick={(e) => { e.stopPropagation(); copyCode(course.enrollmentCode); }}
                      />
                    </Box>
                  )}
                </CardContent>
                <CardActions>
                  <Button size="small" onClick={() => navigate(`/manage/course/${course._id}`)}>
                    Manage
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Course Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Course</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="Course Name" required value={newCourse.name} onChange={(e) => setNewCourse((s) => ({ ...s, name: e.target.value }))} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Dept Code" value={newCourse.deptCode} onChange={(e) => setNewCourse((s) => ({ ...s, deptCode: e.target.value }))} sx={{ flex: 1 }} />
            <TextField label="Course Number" value={newCourse.courseNumber} onChange={(e) => setNewCourse((s) => ({ ...s, courseNumber: e.target.value }))} sx={{ flex: 1 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Section" value={newCourse.section} onChange={(e) => setNewCourse((s) => ({ ...s, section: e.target.value }))} sx={{ flex: 1 }} />
            <TextField label="Semester" placeholder="e.g. Fall 2025" value={newCourse.semester} onChange={(e) => setNewCourse((s) => ({ ...s, semester: e.target.value }))} sx={{ flex: 1 }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating || !newCourse.name}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
