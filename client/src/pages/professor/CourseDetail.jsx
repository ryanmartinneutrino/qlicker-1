import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Tabs, Tab, Paper, Chip,
  List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Divider, Switch, FormControlLabel, Tooltip,
} from '@mui/material';
import {
  ArrowBack as BackIcon, ContentCopy as CopyIcon, Delete as DeleteIcon,
  Add as AddIcon, Refresh as RefreshIcon, PersonRemove as PersonRemoveIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState(null);

  // Dialogs
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [studentEmail, setStudentEmail] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [instructorUserId, setInstructorUserId] = useState('');
  const [addingInstructor, setAddingInstructor] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Settings
  const [editFields, setEditFields] = useState({ name: '', deptCode: '', courseNumber: '', section: '', semester: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchCourse = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/courses/${id}`);
      const c = data.course || data;
      setCourse(c);
      setEditFields({
        name: c.name || '',
        deptCode: c.deptCode || '',
        courseNumber: c.courseNumber || '',
        section: c.section || '',
        semester: c.semester || '',
      });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load course' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const copyCode = () => {
    if (course?.enrollmentCode) {
      navigator.clipboard.writeText(course.enrollmentCode);
      setMsg({ severity: 'success', text: 'Enrollment code copied' });
    }
  };

  // Student actions
  const handleAddStudent = async () => {
    if (!studentEmail.trim()) return;
    setAddingStudent(true);
    try {
      await apiClient.post(`/courses/${id}/students`, { email: studentEmail.trim() });
      setAddStudentOpen(false);
      setStudentEmail('');
      fetchCourse();
      setMsg({ severity: 'success', text: 'Student added' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to add student' });
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId) => {
    try {
      await apiClient.delete(`/courses/${id}/students/${studentId}`);
      fetchCourse();
      setMsg({ severity: 'success', text: 'Student removed' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to remove student' });
    }
  };

  // Instructor actions
  const handleAddInstructor = async () => {
    if (!instructorUserId.trim()) return;
    setAddingInstructor(true);
    try {
      await apiClient.post(`/courses/${id}/instructors`, { userId: instructorUserId.trim() });
      setAddInstructorOpen(false);
      setInstructorUserId('');
      fetchCourse();
      setMsg({ severity: 'success', text: 'Instructor added' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to add instructor' });
    } finally {
      setAddingInstructor(false);
    }
  };

  const handleRemoveInstructor = async (instructorId) => {
    const instructors = course?.instructors || [];
    if (instructors.length <= 1) {
      setMsg({ severity: 'warning', text: 'Cannot remove the last instructor' });
      return;
    }
    try {
      await apiClient.delete(`/courses/${id}/instructors/${instructorId}`);
      fetchCourse();
      setMsg({ severity: 'success', text: 'Instructor removed' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to remove instructor' });
    }
  };

  // Settings actions
  const handleToggleActive = async () => {
    try {
      await apiClient.patch(`/courses/${id}/active`, { inactive: !course.inactive });
      fetchCourse();
      setMsg({ severity: 'success', text: `Course ${course.inactive ? 'activated' : 'deactivated'}` });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to toggle course status' });
    }
  };

  const handleRegenerateCode = async () => {
    try {
      await apiClient.post(`/courses/${id}/regenerate-code`);
      fetchCourse();
      setMsg({ severity: 'success', text: 'Enrollment code regenerated' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to regenerate code' });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiClient.patch(`/courses/${id}`, editFields);
      fetchCourse();
      setMsg({ severity: 'success', text: 'Course updated' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to update course' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/courses/${id}`);
      navigate('/manage');
    } catch {
      setMsg({ severity: 'error', text: 'Failed to delete course' });
      setDeleting(false);
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!course) return <Box sx={{ p: 3 }}><Alert severity="error">Course not found</Alert></Box>;

  const students = course.students || [];
  const instructors = course.instructors || [];

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      {/* Header */}
      <Button startIcon={<BackIcon />} onClick={() => navigate('/manage')} sx={{ mb: 2 }}>
        Back to Courses
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4">{course.name}</Typography>
          <Typography variant="body1" color="text.secondary">
            {course.deptCode} {course.courseNumber}{course.section ? ` – ${course.section}` : ''} &middot; {course.semester}
          </Typography>
        </Box>
        <Chip label={course.inactive ? 'Inactive' : 'Active'} color={course.inactive ? 'default' : 'success'} />
      </Box>

      {/* Enrollment code */}
      {course.enrollmentCode && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">Enrollment Code:</Typography>
          <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>
            {course.enrollmentCode}
          </Typography>
          <Tooltip title="Copy code">
            <IconButton size="small" onClick={copyCode}><CopyIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Paper>
      )}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={`Students (${students.length})`} />
        <Tab label={`Instructors (${instructors.length})`} />
        <Tab label="Settings" />
      </Tabs>

      {/* Students Tab */}
      <TabPanel value={tab} index={0}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Students</Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddStudentOpen(true)}>
            Add Student
          </Button>
        </Box>
        {students.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No students enrolled yet.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {students.map((s, i) => (
                <Box key={s._id || i}>
                  {i > 0 && <Divider />}
                  <ListItem>
                    <ListItemText
                      primary={`${s.profile?.firstname || ''} ${s.profile?.lastname || ''}`.trim() || 'Unknown'}
                      secondary={s.emails?.[0]?.address || s.email || ''}
                    />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" color="error" size="small" onClick={() => handleRemoveStudent(s._id)}>
                        <PersonRemoveIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              ))}
            </List>
          </Paper>
        )}
      </TabPanel>

      {/* Instructors Tab */}
      <TabPanel value={tab} index={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Instructors</Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddInstructorOpen(true)}>
            Add Instructor
          </Button>
        </Box>
        {instructors.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No instructors assigned.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {instructors.map((inst, i) => (
                <Box key={inst._id || i}>
                  {i > 0 && <Divider />}
                  <ListItem>
                    <ListItemText
                      primary={`${inst.profile?.firstname || ''} ${inst.profile?.lastname || ''}`.trim() || 'Unknown'}
                      secondary={inst.emails?.[0]?.address || inst.email || ''}
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title={instructors.length <= 1 ? 'Cannot remove the last instructor' : 'Remove instructor'}>
                        <span>
                          <IconButton
                            edge="end"
                            color="error"
                            size="small"
                            disabled={instructors.length <= 1}
                            onClick={() => handleRemoveInstructor(inst._id)}
                          >
                            <PersonRemoveIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              ))}
            </List>
          </Paper>
        )}
      </TabPanel>

      {/* Settings Tab */}
      <TabPanel value={tab} index={2}>
        <Box sx={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControlLabel
            control={<Switch checked={!course.inactive} onChange={handleToggleActive} />}
            label={course.inactive ? 'Course is inactive' : 'Course is active'}
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!course.requireVerified}
                onChange={async () => {
                  try {
                    await apiClient.patch(`/courses/${id}`, { requireVerified: !course.requireVerified });
                    fetchCourse();
                  } catch {
                    setMsg({ severity: 'error', text: 'Failed to update setting' });
                  }
                }}
              />
            }
            label="Require verified email to enroll"
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!course.allowStudentQuestions}
                onChange={async () => {
                  try {
                    await apiClient.patch(`/courses/${id}`, { allowStudentQuestions: !course.allowStudentQuestions });
                    fetchCourse();
                  } catch {
                    setMsg({ severity: 'error', text: 'Failed to update setting' });
                  }
                }}
              />
            }
            label="Allow students to submit questions"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">Enrollment Code: <strong>{course.enrollmentCode}</strong></Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={handleRegenerateCode}>
              Regenerate
            </Button>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Typography variant="h6">Course Properties</Typography>
          <TextField label="Course Name" value={editFields.name} onChange={(e) => setEditFields((s) => ({ ...s, name: e.target.value }))} fullWidth />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Dept Code" value={editFields.deptCode} onChange={(e) => setEditFields((s) => ({ ...s, deptCode: e.target.value }))} sx={{ flex: 1 }} />
            <TextField label="Course Number" value={editFields.courseNumber} onChange={(e) => setEditFields((s) => ({ ...s, courseNumber: e.target.value }))} sx={{ flex: 1 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Section" value={editFields.section} onChange={(e) => setEditFields((s) => ({ ...s, section: e.target.value }))} sx={{ flex: 1 }} />
            <TextField label="Semester" value={editFields.semester} onChange={(e) => setEditFields((s) => ({ ...s, semester: e.target.value }))} sx={{ flex: 1 }} />
          </Box>
          <Button variant="contained" onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? 'Saving…' : 'Save Changes'}
          </Button>
          <Divider sx={{ my: 1 }} />
          <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)}>
            Delete Course
          </Button>
        </Box>
      </TabPanel>

      {/* Add Student Dialog */}
      <Dialog open={addStudentOpen} onClose={() => setAddStudentOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Student</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            label="Student Email"
            type="email"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddStudentOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddStudent} disabled={addingStudent || !studentEmail.trim()}>
            {addingStudent ? 'Adding…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Instructor Dialog */}
      <Dialog open={addInstructorOpen} onClose={() => setAddInstructorOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Instructor</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            label="User ID"
            value={instructorUserId}
            onChange={(e) => setInstructorUserId(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddInstructorOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddInstructor} disabled={addingInstructor || !instructorUserId.trim()}>
            {addingInstructor ? 'Adding…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Course</DialogTitle>
        <DialogContent>
          Are you sure you want to delete <strong>{course.name}</strong>? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
