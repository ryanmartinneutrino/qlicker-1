import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Divider, Paper,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

export default function Profile() {
  const { user, loadUser } = useAuth();
  const [profile, setProfile] = useState({ firstname: '', lastname: '', studentNumber: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const isStaff = user?.profile?.roles?.some((r) => r === 'admin' || r === 'professor');
  const numberLabel = isStaff ? 'Employee Number' : 'Student Number';

  useEffect(() => {
    apiClient.get('/users/me').then(({ data }) => {
      const u = data.user || data;
      setProfile({
        firstname: u.profile?.firstname ?? '',
        lastname: u.profile?.lastname ?? '',
        studentNumber: u.profile?.studentNumber ?? '',
      });
    }).catch(() => setMsg({ severity: 'error', text: 'Failed to load profile' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.patch('/users/me', profile);
      await loadUser();
      setMsg({ severity: 'success', text: 'Profile updated' });
    } catch {
      setMsg({ severity: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwMsg({ severity: 'error', text: 'New passwords do not match' });
      return;
    }
    if (passwords.newPassword.length < 6) {
      setPwMsg({ severity: 'error', text: 'New password must be at least 6 characters' });
      return;
    }
    setChangingPw(true);
    try {
      await apiClient.patch('/users/me/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwMsg({ severity: 'success', text: 'Password changed' });
    } catch (err) {
      setPwMsg({ severity: 'error', text: err.response?.data?.error || 'Failed to change password' });
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h4" gutterBottom>Profile</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {user?.email} &middot; {user?.role}
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Personal Information</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="First Name" value={profile.firstname} onChange={(e) => setProfile((s) => ({ ...s, firstname: e.target.value }))} fullWidth />
          <TextField label="Last Name" value={profile.lastname} onChange={(e) => setProfile((s) => ({ ...s, lastname: e.target.value }))} fullWidth />
          <TextField label={numberLabel} value={profile.studentNumber} onChange={(e) => setProfile((s) => ({ ...s, studentNumber: e.target.value }))} fullWidth />
          <Button variant="contained" onClick={handleSaveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
          {msg && <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Change Password</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Current Password" type="password" value={passwords.currentPassword} onChange={(e) => setPasswords((s) => ({ ...s, currentPassword: e.target.value }))} fullWidth />
          <TextField label="New Password" type="password" value={passwords.newPassword} onChange={(e) => setPasswords((s) => ({ ...s, newPassword: e.target.value }))} fullWidth />
          <TextField label="Confirm New Password" type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords((s) => ({ ...s, confirmPassword: e.target.value }))} fullWidth />
          <Button variant="contained" onClick={handleChangePassword} disabled={changingPw}>
            {changingPw ? 'Changing…' : 'Change Password'}
          </Button>
          {pwMsg && <Alert severity={pwMsg.severity} onClose={() => setPwMsg(null)}>{pwMsg.text}</Alert>}
        </Box>
      </Paper>
    </Box>
  );
}
