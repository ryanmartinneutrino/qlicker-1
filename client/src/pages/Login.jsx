import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Tab, Tabs, Alert, Divider,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';

export default function Login() {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const { login, register } = useAuth();

  useEffect(() => {
    apiClient.get('/settings/public').then(({ data }) => {
      if (data.SSO_enabled) setSsoEnabled(true);
    }).catch(() => { /* ignore */ });
  }, []);
  const navigate = useNavigate();
  const location = useLocation();

  const getDashboard = (user) => {
    const roles = user?.profile?.roles || [];
    if (roles.includes('admin')) return '/admin';
    if (roles.includes('professor')) return '/manage';
    return '/student';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      const from = location.state?.from?.pathname || getDashboard(user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register(email, password, firstname, lastname);
      navigate(getDashboard(user), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <Card sx={{ maxWidth: 450, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h4" textAlign="center" color="primary" gutterBottom>
            Qlicker
          </Typography>
          <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); }} centered sx={{ mb: 2 }}>
            <Tab label="Login" />
            <Tab label="Register" />
          </Tabs>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {tab === 0 ? (
            <Box component="form" onSubmit={handleLogin}>
              <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required margin="normal" />
              <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required margin="normal" />
              <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ mt: 2 }}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
              {ssoEnabled && (
                <>
                  <Divider sx={{ my: 2 }}>or</Divider>
                  <Button
                    fullWidth
                    variant="outlined"
                    // Full page redirect required — SSO login is an external IdP redirect, not an API call
                    onClick={() => { window.location.href = '/api/v1/auth/sso/login'; }}
                  >
                    Login with SSO
                  </Button>
                </>
              )}
            </Box>
          ) : (
            <Box component="form" onSubmit={handleRegister}>
              <TextField fullWidth label="First Name" value={firstname} onChange={(e) => setFirstname(e.target.value)} required margin="normal" />
              <TextField fullWidth label="Last Name" value={lastname} onChange={(e) => setLastname(e.target.value)} required margin="normal" />
              <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required margin="normal" />
              <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required margin="normal" />
              <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ mt: 2 }}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
