import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
} from '@mui/material';
import apiClient from '../api/client';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== confirmPassword) {
      setMsg({ severity: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 6) {
      setMsg({ severity: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword });
      setMsg({ severity: 'success', text: 'Password has been reset. You can now log in.' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || 'Invalid or expired reset link' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <Card sx={{ maxWidth: 450, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h4" textAlign="center" color="primary" gutterBottom>
            Reset Password
          </Typography>
          {msg && <Alert severity={msg.severity} sx={{ mb: 2 }}>{msg.text}</Alert>}
          {msg?.severity === 'success' ? (
            <Button fullWidth variant="contained" onClick={() => navigate('/login')}>
              Go to Login
            </Button>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField fullWidth label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required margin="normal" />
              <TextField fullWidth label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required margin="normal" />
              <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ mt: 2 }}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
