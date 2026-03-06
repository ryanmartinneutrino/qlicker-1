import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Tabs, Tab, Paper, Chip,
  List, ListItem, ListItemAvatar, ListItemText, ListItemButton, ListItemSecondaryAction, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Divider, Switch, FormControlLabel, Tooltip, Avatar, MenuItem,
} from '@mui/material';
import {
  ContentCopy as CopyIcon, Delete as DeleteIcon,
  Add as AddIcon, Refresh as RefreshIcon, PersonRemove as PersonRemoveIcon,
  Quiz as QuizIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import { formatDisplayDate } from '../../utils/date';
import AutoSaveStatus from '../../components/common/AutoSaveStatus';
import SessionStatusChip from '../../components/common/SessionStatusChip';

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

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

const MAX_COURSE_TAB_INDEX = 4;

function parseCourseTab(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < 0 || parsed > MAX_COURSE_TAB_INDEX) return 0;
  return parsed;
}

function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function getCourseEditFields(course = {}) {
  return {
    name: toText(course.name),
    deptCode: toText(course.deptCode),
    courseNumber: toText(course.courseNumber),
    section: toText(course.section),
    semester: toText(course.semester),
  };
}

const EMPTY_COURSE_EDIT_FIELDS = {
  name: '',
  deptCode: '',
  courseNumber: '',
  section: '',
  semester: '',
};
const EMPTY_COURSE_EDIT_FIELDS_HASH = JSON.stringify(EMPTY_COURSE_EDIT_FIELDS);
const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': {
    px: 1.15,
  },
};

function parseFieldsHash(hashValue) {
  if (!hashValue) return { ...EMPTY_COURSE_EDIT_FIELDS };
  try {
    const parsed = JSON.parse(hashValue);
    return {
      name: toText(parsed.name),
      deptCode: toText(parsed.deptCode),
      courseNumber: toText(parsed.courseNumber),
      section: toText(parsed.section),
      semester: toText(parsed.semester),
    };
  } catch {
    return { ...EMPTY_COURSE_EDIT_FIELDS };
  }
}

function diffCourseEditFields(previousFields, nextFields) {
  const updates = {};
  const keys = Object.keys(nextFields);
  for (const key of keys) {
    if (nextFields[key] !== previousFields[key]) {
      updates[key] = nextFields[key];
    }
  }
  return updates;
}

function hasAllCourseEditFields(fields) {
  return Object.values(fields).every((value) => String(value || '').trim().length > 0);
}

function isEmptyField(value) {
  return String(value || '').trim().length === 0;
}

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => parseCourseTab(searchParams.get('tab')));
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

  // Confirm removal dialogs
  const [removeStudentTarget, setRemoveStudentTarget] = useState(null);
  const [removeInstructorTarget, setRemoveInstructorTarget] = useState(null);

  // Full-size image viewer
  const [imageViewUrl, setImageViewUrl] = useState(null);

  // Settings
  const [editFields, setEditFields] = useState(EMPTY_COURSE_EDIT_FIELDS);
  const [settingsAutoSaveStatus, setSettingsAutoSaveStatus] = useState('idle');
  const [settingsAutoSaveError, setSettingsAutoSaveError] = useState('');

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDesc, setNewSessionDesc] = useState('');
  const [creatingSess, setCreatingSess] = useState(false);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState(null);
  const [sessionUpdatesInFlight, setSessionUpdatesInFlight] = useState({});

  // Polling ref for auto-refresh
  const pollingRef = useRef(null);
  const settingsHydratedRef = useRef(false);
  const lastSavedEditFieldsHashRef = useRef('');
  const settingsSaveInFlightRef = useRef(false);
  const queuedSettingsFieldsRef = useRef(null);

  const fetchSessions = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/courses/${id}/sessions`);
      setSessions(data.sessions || []);
    } catch {
      /* silently fail – sessions tab will show empty */
    } finally {
      setSessionsLoading(false);
    }
  }, [id]);

  const fetchCourse = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/courses/${id}`);
      const c = data.course || data;
      const nextEditFields = getCourseEditFields(c);
      const nextHash = JSON.stringify(nextEditFields);
      setCourse(c);
      setEditFields((previousFields) => {
        const previousHash = JSON.stringify(previousFields);
        const shouldHydrate = !settingsHydratedRef.current
          || previousHash === EMPTY_COURSE_EDIT_FIELDS_HASH
          || previousHash === lastSavedEditFieldsHashRef.current;

        if (shouldHydrate) {
          settingsHydratedRef.current = true;
          lastSavedEditFieldsHashRef.current = nextHash;
          return nextEditFields;
        }

        return previousFields;
      });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to load course' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    settingsHydratedRef.current = false;
    lastSavedEditFieldsHashRef.current = '';
    settingsSaveInFlightRef.current = false;
    queuedSettingsFieldsRef.current = null;
    setSettingsAutoSaveStatus('idle');
    setSettingsAutoSaveError('');
  }, [id]);

  useEffect(() => { fetchCourse(); fetchSessions(); }, [fetchCourse, fetchSessions]);

  // Poll for updates every 15 seconds (reactive student/instructor list)
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchCourse();
    }, 15000);
    return () => clearInterval(pollingRef.current);
  }, [fetchCourse]);

  useEffect(() => {
    const urlTab = parseCourseTab(searchParams.get('tab'));
    setTab((currentTab) => (currentTab === urlTab ? currentTab : urlTab));
  }, [searchParams]);

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
      setRemoveStudentTarget(null);
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
      setRemoveInstructorTarget(null);
      fetchCourse();
      setMsg({ severity: 'success', text: 'Instructor removed' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to remove instructor' });
    }
  };

  // Settings actions
  const markSettingAutoSaveInProgress = () => {
    setSettingsAutoSaveStatus('saving');
    setSettingsAutoSaveError('');
  };

  const markSettingAutoSaveError = (err, fallbackMessage) => {
    setSettingsAutoSaveStatus('error');
    const message = err.response?.data?.message || fallbackMessage;
    setSettingsAutoSaveError(`${message} Your last change was not recorded.`);
  };

  const persistCourseEditFields = useCallback(async (fieldsToPersist) => {
    const runSave = async (pendingFields) => {
      if (settingsSaveInFlightRef.current) {
        queuedSettingsFieldsRef.current = pendingFields;
        return;
      }

      settingsSaveInFlightRef.current = true;
      setSettingsAutoSaveStatus('saving');
      setSettingsAutoSaveError('');
      const requestedHash = JSON.stringify(pendingFields);
      const lastSavedFields = parseFieldsHash(lastSavedEditFieldsHashRef.current);
      const patchPayload = diffCourseEditFields(lastSavedFields, pendingFields);

      if (Object.keys(patchPayload).length === 0) {
        settingsSaveInFlightRef.current = false;
        setSettingsAutoSaveStatus('success');
        return;
      }

      try {
        const { data } = await apiClient.patch(`/courses/${id}`, patchPayload);
        const savedCourse = data.course || data;
        const savedFields = getCourseEditFields(savedCourse);
        const savedHash = JSON.stringify(savedFields);

        lastSavedEditFieldsHashRef.current = savedHash;
        setCourse((previousCourse) => (previousCourse ? { ...previousCourse, ...savedFields } : previousCourse));
        setEditFields((currentFields) => (
          JSON.stringify(currentFields) === requestedHash ? savedFields : currentFields
        ));
        setSettingsAutoSaveStatus('success');
      } catch (err) {
        const message = err.response?.data?.message || 'Failed to update course.';
        setSettingsAutoSaveStatus('error');
        setSettingsAutoSaveError(`${message} Your last change was not recorded.`);
      } finally {
        settingsSaveInFlightRef.current = false;

        if (queuedSettingsFieldsRef.current) {
          const queuedFields = queuedSettingsFieldsRef.current;
          queuedSettingsFieldsRef.current = null;
          const queuedHash = JSON.stringify(queuedFields);
          if (queuedHash !== lastSavedEditFieldsHashRef.current) {
            await runSave(queuedFields);
          }
        }
      }
    };

    await runSave(fieldsToPersist);
  }, [id]);

  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    if (!hasAllCourseEditFields(editFields)) return;

    const fieldsHash = JSON.stringify(editFields);
    if (fieldsHash === lastSavedEditFieldsHashRef.current) return;

    const autosaveTimer = setTimeout(() => {
      persistCourseEditFields(editFields);
    }, 700);

    return () => clearTimeout(autosaveTimer);
  }, [editFields, persistCourseEditFields]);

  const handleToggleActive = async () => {
    markSettingAutoSaveInProgress();
    try {
      await apiClient.patch(`/courses/${id}/active`, { inactive: !course.inactive });
      fetchCourse();
      setSettingsAutoSaveStatus('success');
      setMsg({ severity: 'success', text: `Course ${course.inactive ? 'activated' : 'deactivated'}` });
    } catch (err) {
      markSettingAutoSaveError(err, 'Failed to update course setting.');
    }
  };

  const handleToggleRequireVerified = async () => {
    markSettingAutoSaveInProgress();
    try {
      await apiClient.patch(`/courses/${id}`, { requireVerified: !course.requireVerified });
      fetchCourse();
      setSettingsAutoSaveStatus('success');
    } catch (err) {
      markSettingAutoSaveError(err, 'Failed to update setting.');
    }
  };

  const handleToggleAllowStudentQuestions = async () => {
    markSettingAutoSaveInProgress();
    try {
      await apiClient.patch(`/courses/${id}`, { allowStudentQuestions: !course.allowStudentQuestions });
      fetchCourse();
      setSettingsAutoSaveStatus('success');
    } catch (err) {
      markSettingAutoSaveError(err, 'Failed to update setting.');
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

  // Session actions
  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    setCreatingSess(true);
    try {
      const body = { name: newSessionName.trim() };
      if (newSessionDesc.trim()) body.description = newSessionDesc.trim();
      await apiClient.post(`/courses/${id}/sessions`, body);
      setCreateSessionOpen(false);
      setNewSessionName('');
      setNewSessionDesc('');
      fetchSessions();
      setMsg({ severity: 'success', text: 'Session created' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to create session' });
    } finally {
      setCreatingSess(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await apiClient.delete(`/sessions/${sessionId}`);
      setDeleteSessionTarget(null);
      fetchSessions();
      setMsg({ severity: 'success', text: 'Session deleted' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to delete session' });
    }
  };

  const handleCopySession = async (sessionId) => {
    try {
      await apiClient.post(`/sessions/${sessionId}/copy`);
      fetchSessions();
      setMsg({ severity: 'success', text: 'Session copied' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to copy session' });
    }
  };

  const patchSessionFromList = async (sessionId, updates) => {
    setSessionUpdatesInFlight((prev) => ({ ...prev, [sessionId]: true }));
    try {
      const { data } = await apiClient.patch(`/sessions/${sessionId}`, updates);
      const updated = data.session || data;
      setSessions((prev) => prev.map((session) => (session._id === sessionId ? { ...session, ...updated } : session)));
      setMsg({ severity: 'success', text: 'Session updated' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Failed to update session' });
      fetchSessions();
    } finally {
      setSessionUpdatesInFlight((prev) => ({ ...prev, [sessionId]: false }));
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (!course) return <Box sx={{ p: 3 }}><Alert severity="error">Course not found</Alert></Box>;

  const students = course.students || [];
  const instructors = course.instructors || [];
  const sortedSessions = sortSessions(sessions);
  const interactiveSessions = sortedSessions.filter((s) => !s.quiz);
  const quizSessions = sortedSessions.filter((s) => !!s.quiz);
  const hasMissingCourseProperties = !hasAllCourseEditFields(editFields);
  const headerCourseName = settingsHydratedRef.current ? editFields.name : toText(course.name);
  const headerDeptCode = settingsHydratedRef.current ? editFields.deptCode : toText(course.deptCode);
  const headerCourseNumber = settingsHydratedRef.current ? editFields.courseNumber : toText(course.courseNumber);
  const headerSection = settingsHydratedRef.current ? editFields.section : toText(course.section);
  const headerSemester = settingsHydratedRef.current ? editFields.semester : toText(course.semester);

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
                disablePadding
                sx={{
                  alignItems: 'stretch',
                  flexWrap: { xs: 'wrap', md: 'nowrap' },
                }}
              >
                <ListItemButton
                  onClick={() => navigate(
                    `/manage/course/${id}/session/${s._id}?returnTab=${tab}`,
                    { state: { returnTab: tab } }
                  )}
                  sx={{ minWidth: 0 }}
                >
                  <ListItemText
                    primary={(
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {s.name}
                        <SessionStatusChip status={s.status} />
                        {(s.quiz || s.practiceQuiz) && <Chip icon={<QuizIcon />} label="Quiz" size="small" variant="outlined" sx={COMPACT_CHIP_SX} />}
                      </Box>
                    )}
                    secondary={(
                      <>
                        {(s.questions || []).length} question{(s.questions || []).length === 1 ? '' : 's'}
                        {getSessionSortTime(s) > 0 ? ` · ${formatDisplayDate(getSessionSortTime(s))}` : ''}
                      </>
                    )}
                  />
                </ListItemButton>

                <Box
                  onClick={(event) => event.stopPropagation()}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                    px: 1,
                    py: { xs: 0.5, md: 0 },
                    width: { xs: '100%', md: 'auto' },
                    justifyContent: { xs: 'flex-start', md: 'flex-end' },
                    borderTop: { xs: '1px solid', md: 'none' },
                    borderColor: { xs: 'divider', md: 'transparent' },
                  }}
                >
                  <TextField
                    select
                    size="small"
                    label="Status"
                    value={s.status || 'hidden'}
                    onChange={(event) => patchSessionFromList(s._id, { status: event.target.value })}
                    disabled={!!sessionUpdatesInFlight[s._id]}
                    sx={{ minWidth: 122 }}
                  >
                    <MenuItem value="hidden">Draft</MenuItem>
                    <MenuItem value="visible">Upcoming</MenuItem>
                    <MenuItem value="running">Live</MenuItem>
                    <MenuItem value="done">Ended</MenuItem>
                  </TextField>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={(
                      <Switch
                        size="small"
                        checked={!!s.reviewable}
                        onChange={(event) => patchSessionFromList(s._id, { reviewable: event.target.checked })}
                        disabled={!!sessionUpdatesInFlight[s._id]}
                      />
                    )}
                    label={<Typography variant="caption">Reviewable</Typography>}
                  />
                  <Tooltip title="Copy session">
                    <IconButton size="small" onClick={() => handleCopySession(s._id)} disabled={!!sessionUpdatesInFlight[s._id]}>
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete session">
                    <IconButton size="small" color="error" onClick={() => setDeleteSessionTarget(s)} disabled={!!sessionUpdatesInFlight[s._id]}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {`${headerDeptCode || ''} ${headerCourseNumber || ''}`.trim()}: {headerCourseName} ({headerSemester})
          </Typography>
          {headerSection && (
            <Typography variant="caption" color="text.secondary">
              Section {headerSection}
            </Typography>
          )}
        </Box>
        <Chip label={course.inactive ? 'Inactive' : 'Active'} color={course.inactive ? 'default' : 'success'} sx={COMPACT_CHIP_SX} />
      </Box>

      {/* Tabs */}
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
        <Tab label={`Interactive Sessions (${interactiveSessions.length})`} />
        <Tab label={`Quizzes (${quizSessions.length})`} />
        <Tab label={`Students (${students.length})`} />
        <Tab label={`Instructors (${instructors.length})`} />
        <Tab label="Settings" />
      </Tabs>

      {/* Interactive Sessions Tab */}
      <TabPanel value={tab} index={0}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Interactive Sessions</Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateSessionOpen(true)}>
            Create Session
          </Button>
        </Box>
        {renderSessionList(interactiveSessions, 'No interactive sessions yet.')}
      </TabPanel>

      {/* Quizzes Tab */}
      <TabPanel value={tab} index={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Quizzes</Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateSessionOpen(true)}>
            Create Session
          </Button>
        </Box>
        {renderSessionList(quizSessions, 'No quizzes yet.')}
      </TabPanel>

      {/* Students Tab */}
      <TabPanel value={tab} index={2}>
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
                    <ListItemAvatar>
                      <Avatar
                        src={s.profile?.profileImage || s.profile?.profileThumbnail || ''}
                        sx={{ width: 36, height: 36, cursor: (s.profile?.profileImage) ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (s.profile?.profileImage) setImageViewUrl(s.profile.profileImage);
                        }}
                      >
                        {(s.profile?.firstname?.[0] || '').toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${s.profile?.firstname || ''} ${s.profile?.lastname || ''}`.trim() || 'Unknown'}
                      secondary={s.emails?.[0]?.address || s.email || ''}
                    />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" color="error" size="small" onClick={() => setRemoveStudentTarget(s)}>
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
      <TabPanel value={tab} index={3}>
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
                    <ListItemAvatar>
                      <Avatar
                        src={inst.profile?.profileImage || inst.profile?.profileThumbnail || ''}
                        sx={{ width: 36, height: 36, cursor: (inst.profile?.profileImage) ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (inst.profile?.profileImage) setImageViewUrl(inst.profile.profileImage);
                        }}
                      >
                        {(inst.profile?.firstname?.[0] || '').toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
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
                            onClick={() => setRemoveInstructorTarget(inst)}
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
      <TabPanel value={tab} index={4}>
        <Box sx={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <AutoSaveStatus status={settingsAutoSaveStatus} errorText={settingsAutoSaveError} />
          {hasMissingCourseProperties && (
            <Alert severity="warning">
              All course property fields are required. Autosave resumes once all fields are filled.
            </Alert>
          )}
          <FormControlLabel
            control={<Switch checked={!course.inactive} onChange={handleToggleActive} />}
            label={course.inactive ? 'Course is inactive' : 'Course is active'}
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!course.requireVerified}
                onChange={handleToggleRequireVerified}
              />
            }
            label="Require verified email to enroll"
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!course.allowStudentQuestions}
                onChange={handleToggleAllowStudentQuestions}
              />
            }
            label="Allow students to submit questions"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">Enrollment Code: <strong>{course.enrollmentCode}</strong></Typography>
            <Button size="small" startIcon={<CopyIcon />} onClick={copyCode}>
              Copy
            </Button>
            <Button size="small" startIcon={<RefreshIcon />} onClick={handleRegenerateCode}>
              Regenerate
            </Button>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Typography variant="h6">Course Properties</Typography>
          <TextField
            label="Course Name"
            value={editFields.name}
            onChange={(e) => setEditFields((s) => ({ ...s, name: e.target.value }))}
            error={isEmptyField(editFields.name)}
            helperText={isEmptyField(editFields.name) ? 'Course name is required.' : undefined}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Dept Code"
              value={editFields.deptCode}
              onChange={(e) => setEditFields((s) => ({ ...s, deptCode: e.target.value }))}
              error={isEmptyField(editFields.deptCode)}
              helperText={isEmptyField(editFields.deptCode) ? 'Dept code is required.' : undefined}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Course Number"
              value={editFields.courseNumber}
              onChange={(e) => setEditFields((s) => ({ ...s, courseNumber: e.target.value }))}
              error={isEmptyField(editFields.courseNumber)}
              helperText={isEmptyField(editFields.courseNumber) ? 'Course number is required.' : undefined}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Section"
              value={editFields.section}
              onChange={(e) => setEditFields((s) => ({ ...s, section: e.target.value }))}
              error={isEmptyField(editFields.section)}
              helperText={isEmptyField(editFields.section) ? 'Section is required.' : undefined}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Semester"
              value={editFields.semester}
              onChange={(e) => setEditFields((s) => ({ ...s, semester: e.target.value }))}
              error={isEmptyField(editFields.semester)}
              helperText={isEmptyField(editFields.semester) ? 'Semester is required.' : 'Stored exactly as entered (legacy-compatible)'}
              sx={{ flex: 1 }}
            />
          </Box>
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

      {/* Confirm Remove Student */}
      <Dialog open={!!removeStudentTarget} onClose={() => setRemoveStudentTarget(null)}>
        <DialogTitle>Remove Student</DialogTitle>
        <DialogContent>
          Are you sure you want to remove <strong>{removeStudentTarget?.profile?.firstname} {removeStudentTarget?.profile?.lastname}</strong> from this course?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveStudentTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleRemoveStudent(removeStudentTarget?._id)}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Remove Instructor */}
      <Dialog open={!!removeInstructorTarget} onClose={() => setRemoveInstructorTarget(null)}>
        <DialogTitle>Remove Instructor</DialogTitle>
        <DialogContent>
          Are you sure you want to remove <strong>{removeInstructorTarget?.profile?.firstname} {removeInstructorTarget?.profile?.lastname}</strong> from this course?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveInstructorTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleRemoveInstructor(removeInstructorTarget?._id)}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full-size image viewer */}
      <Dialog open={!!imageViewUrl} onClose={() => setImageViewUrl(null)} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: 'center', p: 2 }}>
          <img src={imageViewUrl} alt="Profile" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageViewUrl(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create Session Dialog */}
      <Dialog open={createSessionOpen} onClose={() => setCreateSessionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Session</DialogTitle>
        <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Session Name" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} fullWidth autoFocus />
          <TextField label="Description (optional)" value={newSessionDesc} onChange={(e) => setNewSessionDesc(e.target.value)} fullWidth multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateSessionOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateSession} disabled={creatingSess || !newSessionName.trim()}>
            {creatingSess ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Session Confirmation */}
      <Dialog open={!!deleteSessionTarget} onClose={() => setDeleteSessionTarget(null)}>
        <DialogTitle>Delete Session</DialogTitle>
        <DialogContent>
          Are you sure you want to delete <strong>{deleteSessionTarget?.name}</strong>? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSessionTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleDeleteSession(deleteSessionTarget?._id)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
