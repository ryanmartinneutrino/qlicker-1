import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
  Box, Avatar, Divider, CircularProgress,
} from '@mui/material';
import apiClient from '../../api/client';

/**
 * StudentInfoModal — shows student details (name, email, avatar, average participation)
 * and provides a "remove from course" action (with confirmation).
 *
 * @param {boolean}  open           – dialog open state
 * @param {Function} onClose        – close handler
 * @param {Object}   student        – student user object ({ _id, profile, emails })
 * @param {string}   courseId       – course _id (for participation stats + removal)
 * @param {Function} [onRemoved]    – callback after student is removed from course
 */
export default function StudentInfoModal({ open, onClose, student, courseId, onRemoved }) {
  const { t } = useTranslation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const firstname = student?.profile?.firstname || '';
  const lastname = student?.profile?.lastname || '';
  const displayName = `${firstname} ${lastname}`.trim() || 'Unknown';
  const email = student?.emails?.[0]?.address || student?.email || '';
  const avatarSrc = student?.profile?.profileImage || student?.profile?.profileThumbnail || '';

  const fetchStats = useCallback(async () => {
    if (!open || !student?._id || !courseId) return;
    setLoadingStats(true);
    try {
      const { data } = await apiClient.get(`/courses/${courseId}/grades`, {
        params: { studentId: student._id },
      });
      // Compute average participation from grades data
      const sessions = data.sessions || [];
      if (sessions.length > 0) {
        let totalParticipation = 0;
        let sessionCount = 0;
        for (const sess of sessions) {
          if (sess.participation !== undefined && sess.participation !== null) {
            totalParticipation += Number(sess.participation) || 0;
            sessionCount++;
          }
        }
        setStats({
          avgParticipation: sessionCount > 0 ? Math.round(totalParticipation / sessionCount) : null,
          sessionCount: sessions.length,
        });
      } else {
        setStats({ avgParticipation: null, sessionCount: 0 });
      }
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, [open, student?._id, courseId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!open) {
      setConfirmRemove(false);
      setRemoving(false);
    }
  }, [open]);

  const handleRemove = async () => {
    if (!student?._id || !courseId) return;
    setRemoving(true);
    try {
      await apiClient.delete(`/courses/${courseId}/students/${student._id}`);
      onRemoved?.();
      onClose();
    } catch {
      // handled silently
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('groups.studentInfo')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Avatar
            src={avatarSrc}
            sx={{ width: 64, height: 64 }}
          >
            {(firstname?.[0] || '').toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h6">{displayName}</Typography>
            <Typography variant="body2" color="text.secondary">{email}</Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {loadingStats ? (
          <CircularProgress size={20} />
        ) : stats ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2">
              {t('groups.sessionsEnrolled', { count: stats.sessionCount })}
            </Typography>
            {stats.avgParticipation !== null && (
              <Typography variant="body2">
                {t('groups.avgParticipation', { value: stats.avgParticipation })}
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('groups.noStatsAvailable')}
          </Typography>
        )}

        <Divider sx={{ mb: 2 }} />

        {confirmRemove ? (
          <Box>
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              {t('professor.course.removeStudentConfirm', { name: displayName })}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" color="error" onClick={handleRemove} disabled={removing}>
                {removing ? t('common.loading') : t('groups.confirmRemove')}
              </Button>
              <Button onClick={() => setConfirmRemove(false)}>{t('common.cancel')}</Button>
            </Box>
          </Box>
        ) : (
          <Button variant="outlined" color="error" onClick={() => setConfirmRemove(true)}>
            {t('groups.removeFromCourse')}
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
