import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  Box, Typography, Button, TextField, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar,
  CircularProgress, Chip, InputAdornment, Select, MenuItem, Autocomplete,
  FormControl, InputLabel,
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, ContentCopy as CopyIcon,
  School as SchoolIcon, PlayCircle as LiveIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import {
  SEMESTER_OPTIONS,
  formatSemester,
  getYearOptions,
} from '../../utils/courseSemester';
import { buildCourseTitle } from '../../utils/courseTitle';
import { fetchAllCourses } from '../../utils/fetchAllCourses';
import SessionListCard from '../../components/common/SessionListCard';

const COMPACT_CHIP_SX = {
  borderRadius: 1.4,
  '& .MuiChip-label': {
    px: 1.15,
  },
};

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

function getSuggestedSemester() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  if (month >= 10 || month <= 1) {
    // November-February → Winter
    return { season: 'Winter', year: String(month >= 10 ? year + 1 : year) };
  }
  if (month <= 6) {
    // March-July → Summer
    return { season: 'Summer', year: String(year) };
  }
  // August-October → Fall
  return { season: 'Fall', year: String(year) };
}

export default function ProfDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState(null);

  // Create course dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const suggested = getSuggestedSemester();
  const yearOptions = getYearOptions();
  const [newCourse, setNewCourse] = useState({
    name: '', deptCode: '', courseNumber: '', section: '', season: suggested.season, year: suggested.year,
  });

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesRes, liveRes] = await Promise.all([
        fetchAllCourses(apiClient, { view: 'instructor' }),
        apiClient.get('/sessions/live', { params: { view: 'instructor' } }).catch(() => ({ data: { liveSessions: [] } })),
      ]);
      setCourses(coursesRes);
      setLiveSessions(liveRes.data.liveSessions || []);
    } catch {
      setMsg({ severity: 'error', text: t('professor.dashboard.failedLoadCourses') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { season, year, ...rest } = newCourse;
      const semester = formatSemester(season, year);
      if (!semester) {
        setMsg({ severity: 'error', text: t('professor.dashboard.semesterYearRequired', 'Semester and year are required.') });
        return;
      }
      await apiClient.post('/courses', { ...rest, semester });
      setCreateOpen(false);
      const s = getSuggestedSemester();
      setNewCourse({ name: '', deptCode: '', courseNumber: '', section: '', season: s.season, year: s.year });
      fetchCourses();
      setMsg({ severity: 'success', text: t('professor.dashboard.courseCreated') });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || t('professor.dashboard.failedCreateCourse') });
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setMsg({ severity: 'success', text: t('professor.dashboard.enrollmentCodeCopied') });
  };

  const canCreateCourses = user?.profile?.roles?.includes('professor') || user?.profile?.roles?.includes('admin');

  const filtered = courses.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const searchable = [
      buildCourseTitle(c, 'short'),
      buildCourseTitle(c, 'medium'),
      buildCourseTitle(c, 'long'),
      c.section,
    ]
      .map((entry) => String(entry || '').trim())
      .join(' ')
      .toLowerCase();
    return searchable.includes(q);
  }).sort((a, b) => {
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
        <Typography variant="h4">{t('professor.dashboard.myCourses')}</Typography>
        {canCreateCourses ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            {t('professor.dashboard.createCourse')}
          </Button>
        ) : null}
      </Box>

      <TextField
        size="small"
        placeholder={t('professor.dashboard.searchCourses')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        sx={{ mb: 3, minWidth: 300 }}
      />

      {liveSessions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            <LiveIcon sx={{ verticalAlign: 'middle', mr: 0.5, color: 'success.main' }} />
            {t('dashboard.liveSessions')}
          </Typography>
          <Box sx={LIVE_SESSION_GRID_SX}>
            {liveSessions.map((ls) => (
              <SessionListCard
                key={ls._id}
                highlighted
                onClick={() => navigate(
                  ls.quiz || ls.practiceQuiz
                    ? `/prof/course/${ls.courseId}/session/${ls._id}/review`
                    : `/prof/course/${ls.courseId}/session/${ls._id}/live`
                )}
                title={ls.name}
                subtitle={ls.courseName}
              />
            ))}
          </Box>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {search ? t('professor.dashboard.noCoursesMatch') : t('professor.dashboard.noCoursesYet')}
          </Typography>
          {!search && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('professor.dashboard.createFirstCourse')}
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            {t('dashboard.courses')}
          </Typography>
          <Box sx={COURSE_GRID_SX}>
            {filtered.map((course) => (
              <Box key={course._id}>
                <Card
                  variant="outlined"
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                  onClick={() => navigate(`/prof/course/${course._id}`)}
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
                        {t('professor.dashboard.section', { section: course.section })}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
                      <Chip
                        label={course.inactive ? t('professor.dashboard.inactive') : t('professor.dashboard.active')}
                        color={course.inactive ? 'default' : 'success'}
                        size="small"
                        sx={COMPACT_CHIP_SX}
                      />
                    </Box>
                    {course.enrollmentCode && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">{t('professor.dashboard.code')}</Typography>
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
                </Card>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Create Course Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('professor.dashboard.createCourse')}</DialogTitle>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            <TextField label={t('professor.dashboard.courseName')} placeholder={t('professor.dashboard.courseNamePlaceholder')} required value={newCourse.name} onChange={(e) => setNewCourse((s) => ({ ...s, name: e.target.value }))} />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label={t('professor.dashboard.deptCode')} placeholder={t('professor.dashboard.deptCodePlaceholder')} value={newCourse.deptCode} onChange={(e) => setNewCourse((s) => ({ ...s, deptCode: e.target.value }))} sx={{ flex: 1 }} />
              <TextField label={t('professor.dashboard.courseNumber')} placeholder={t('professor.dashboard.courseNumberPlaceholder')} value={newCourse.courseNumber} onChange={(e) => setNewCourse((s) => ({ ...s, courseNumber: e.target.value }))} sx={{ flex: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label={t('professor.dashboard.sectionLabel')} placeholder={t('professor.dashboard.sectionPlaceholder')} value={newCourse.section} onChange={(e) => setNewCourse((s) => ({ ...s, section: e.target.value }))} sx={{ flex: 1 }} />
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>{t('professor.dashboard.semester')}</InputLabel>
                <Select
                  label={t('professor.dashboard.semester')}
                  value={newCourse.season}
                  onChange={(e) => setNewCourse((s) => ({ ...s, season: e.target.value }))}
                >
                  {SEMESTER_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Autocomplete
                freeSolo
                options={yearOptions}
                value={newCourse.year}
                onChange={(_, value) => {
                  setNewCourse((s) => ({ ...s, year: String(value || '').trim() }));
                }}
                onInputChange={(_, value) => {
                  setNewCourse((s) => ({ ...s, year: value }));
                }}
                sx={{ flex: 1 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('professor.dashboard.year')}
                    placeholder={t('professor.dashboard.yearPlaceholder')}
                    helperText={t('professor.dashboard.yearHelp')}
                  />
                )}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" disabled={creating || !newCourse.name || !newCourse.season || !newCourse.year}>
              {creating ? t('professor.dashboard.creating') : t('common.create')}
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
