import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Divider, Paper, Avatar,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { PhotoCamera as PhotoCameraIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import i18n, { SUPPORTED_LOCALES } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';
import AutoSaveStatus from '../components/common/AutoSaveStatus';

const AUTO_SAVE_DELAY_MS = 600;

function normalizeProfile(source = {}) {
  return {
    firstname: source.firstname ?? '',
    lastname: source.lastname ?? '',
    studentNumber: source.studentNumber ?? '',
  };
}

function diffProfile(previousProfile, nextProfile) {
  const patchPayload = {};
  if (previousProfile.firstname !== nextProfile.firstname) patchPayload.firstname = nextProfile.firstname;
  if (previousProfile.lastname !== nextProfile.lastname) patchPayload.lastname = nextProfile.lastname;
  if (previousProfile.studentNumber !== nextProfile.studentNumber) patchPayload.studentNumber = nextProfile.studentNumber;
  return patchPayload;
}

export default function Profile() {
  const { t } = useTranslation();
  const { user, loadUser } = useAuth();
  const [profile, setProfile] = useState({ firstname: '', lastname: '', studentNumber: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [profileSaveStatus, setProfileSaveStatus] = useState('idle');
  const [profileSaveError, setProfileSaveError] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userLocale, setUserLocale] = useState('');
  const fileInputRef = useRef(null);
  const profileHydratedRef = useRef(false);
  const profileSaveInFlightRef = useRef(false);
  const queuedProfileRef = useRef(null);
  const lastSavedProfileRef = useRef(normalizeProfile());

  const isStaff = user?.profile?.roles?.some((r) => r === 'admin' || r === 'professor');
  const numberLabel = isStaff ? t('profile.employeeNumber') : t('profile.studentNumber');

  useEffect(() => {
    apiClient.get('/users/me').then(({ data }) => {
      const u = data.user || data;
      const normalizedProfile = normalizeProfile(u.profile);
      setProfile(normalizedProfile);
      lastSavedProfileRef.current = normalizedProfile;
      profileHydratedRef.current = true;
      // Load per-user locale preference (empty = use app default)
      const savedLocale = u.locale || '';
      setUserLocale(savedLocale);
      if (savedLocale) {
        i18n.changeLanguage(savedLocale);
        localStorage.setItem('qlicker_locale', savedLocale);
      }
    }).catch(() => setMsg({ severity: 'error', text: t('profile.profileFailed') }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => {
    profileHydratedRef.current = false;
    profileSaveInFlightRef.current = false;
    queuedProfileRef.current = null;
  }, []);

  const persistProfile = useCallback(async (nextProfile) => {
    const runSave = async (pendingProfile) => {
      if (profileSaveInFlightRef.current) {
        queuedProfileRef.current = pendingProfile;
        return;
      }

      const patchPayload = diffProfile(lastSavedProfileRef.current, pendingProfile);
      if (Object.keys(patchPayload).length === 0) {
        setProfileSaveStatus('success');
        return;
      }

      profileSaveInFlightRef.current = true;
      setProfileSaveStatus('saving');
      setProfileSaveError('');
      const requestedHash = JSON.stringify(pendingProfile);

      try {
        const { data } = await apiClient.patch('/users/me', patchPayload);
        const savedProfile = normalizeProfile(data?.profile);

        lastSavedProfileRef.current = savedProfile;
        setProfile((currentProfile) => (
          JSON.stringify(currentProfile) === requestedHash ? savedProfile : currentProfile
        ));
        setProfileSaveStatus('success');
        await loadUser();
      } catch (err) {
        setProfileSaveStatus('error');
        const message = err.response?.data?.message || t('profile.profileFailed');
        setProfileSaveError(`${message} ${t('profile.lastChangeNotRecorded')}`);
      } finally {
        profileSaveInFlightRef.current = false;

        if (queuedProfileRef.current) {
          const queuedProfile = queuedProfileRef.current;
          queuedProfileRef.current = null;
          const queuedPatch = diffProfile(lastSavedProfileRef.current, queuedProfile);
          if (Object.keys(queuedPatch).length > 0) {
            await runSave(queuedProfile);
          }
        }
      }
    };

    await runSave(nextProfile);
  }, [loadUser]);

  useEffect(() => {
    if (loading) return;
    if (!profileHydratedRef.current) return;

    const pendingChanges = diffProfile(lastSavedProfileRef.current, profile);
    if (Object.keys(pendingChanges).length === 0) return;

    const saveTimer = setTimeout(() => {
      persistProfile(profile);
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(saveTimer);
  }, [profile, loading, persistProfile]);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwMsg({ severity: 'error', text: t('profile.passwordsNoMatch') });
      return;
    }
    if (passwords.newPassword.length < 6) {
      setPwMsg({ severity: 'error', text: t('profile.passwordTooShort') });
      return;
    }
    setChangingPw(true);
    try {
      await apiClient.patch('/users/me/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwMsg({ severity: 'success', text: t('profile.passwordChanged') });
    } catch (err) {
      setPwMsg({ severity: 'error', text: err.response?.data?.error || 'Failed to change password' });
    } finally {
      setChangingPw(false);
    }
  };

  const initials = `${user?.profile?.firstname?.[0] ?? ''}${user?.profile?.lastname?.[0] ?? ''}`.toUpperCase();

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post('/images', formData);
      await apiClient.patch('/users/me/image', { profileImage: data.image.url });
      await loadUser();
      setMsg({ severity: 'success', text: t('profile.photoUpdated') });
    } catch {
      setMsg({ severity: 'error', text: t('profile.photoFailed') });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLocaleChange = async (e) => {
    const newLocale = e.target.value;
    setUserLocale(newLocale);
    // Apply immediately
    const effectiveLocale = newLocale || 'en';
    i18n.changeLanguage(effectiveLocale);
    localStorage.setItem('qlicker_locale', effectiveLocale);
    // Persist to server
    try {
      await apiClient.patch('/users/me', { locale: newLocale });
    } catch {
      // Best-effort; locale is also stored in localStorage
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h4" gutterBottom>{t('profile.title')}</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {user?.email} &middot; {user?.role}
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.photo')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            src={user?.profile?.profileImage}
            sx={{ width: 80, height: 80, fontSize: 32 }}
          >
            {initials}
          </Avatar>
          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
            <Button
              variant="outlined"
              startIcon={uploading ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t('profile.uploading') : t('profile.uploadPhoto')}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.personalInfo')}</Typography>
        <AutoSaveStatus status={profileSaveStatus} errorText={profileSaveError} />
        {user?.isSSOUser && (
          <Alert severity="info" sx={{ mb: 2 }}>{t('profile.ssoManagedNote')}</Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label={t('profile.firstName')} value={profile.firstname} onChange={(e) => setProfile((s) => ({ ...s, firstname: e.target.value }))} fullWidth disabled={!!user?.isSSOUser} />
          <TextField label={t('profile.lastName')} value={profile.lastname} onChange={(e) => setProfile((s) => ({ ...s, lastname: e.target.value }))} fullWidth disabled={!!user?.isSSOUser} />
          <TextField label={numberLabel} value={profile.studentNumber} onChange={(e) => setProfile((s) => ({ ...s, studentNumber: e.target.value }))} fullWidth />
          {msg && <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.changePassword')}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label={t('profile.currentPassword')} type="password" value={passwords.currentPassword} onChange={(e) => setPasswords((s) => ({ ...s, currentPassword: e.target.value }))} fullWidth />
          <TextField label={t('profile.newPassword')} type="password" value={passwords.newPassword} onChange={(e) => setPasswords((s) => ({ ...s, newPassword: e.target.value }))} fullWidth />
          <TextField label={t('profile.confirmNewPassword')} type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords((s) => ({ ...s, confirmPassword: e.target.value }))} fullWidth />
          <Button variant="contained" onClick={handleChangePassword} disabled={changingPw}>
            {changingPw ? t('profile.changingPassword') : t('profile.changePassword')}
          </Button>
          {pwMsg && <Alert severity={pwMsg.severity} onClose={() => setPwMsg(null)}>{pwMsg.text}</Alert>}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.language')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('profile.languageHelp')}
        </Typography>
        <FormControl fullWidth>
          <InputLabel id="profile-locale-label">{t('profile.language')}</InputLabel>
          <Select
            labelId="profile-locale-label"
            value={userLocale}
            label={t('profile.language')}
            onChange={handleLocaleChange}
          >
            <MenuItem value="">{t('profile.useAppDefault')}</MenuItem>
            {SUPPORTED_LOCALES.map((loc) => (
              <MenuItem key={loc.code} value={loc.code}>{loc.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>
    </Box>
  );
}
