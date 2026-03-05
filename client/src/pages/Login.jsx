import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Tab, Tabs, Alert, Divider, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
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
  const [ssoInstitutionName, setSsoInstitutionName] = useState('SSO');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const {
    user,
    loading: authLoading,
    login,
    register,
  } = useAuth();

  useEffect(() => {
    let active = true;

    apiClient.get('/settings/public').then(({ data }) => {
      if (!active) return;
      const enabled = !!data.SSO_enabled;
      setSsoEnabled(enabled);
      const institution = (data.SSO_institutionName || '').trim();
      setSsoInstitutionName(institution || 'SSO');
      setShowEmailLogin(!enabled);
    }).catch(() => {
      if (!active) return;
      setSsoEnabled(false);
      setSsoInstitutionName('SSO');
      setShowEmailLogin(true);
    });

    return () => {
      active = false;
    };
  }, []);
  const navigate = useNavigate();

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
      navigate(getDashboard(user), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotMsg(null);
    setForgotLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: forgotEmail });
      setForgotMsg({ severity: 'success', text: 'If that email is registered, a reset link has been sent. Please check your spam/junk folder if you don\u2019t see it in your inbox.' });
      setTimeout(() => setForgotOpen(false), 5000);
    } catch {
      setForgotMsg({ severity: 'error', text: 'Failed to send reset email. Please try again.' });
    } finally {
      setForgotLoading(false);
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

  const renderEmailLoginForm = ({ showBackToSso = false } = {}) => (
    <Box component="form" onSubmit={handleLogin}>
      <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required margin="normal" />
      <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required margin="normal" />
      <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ mt: 2 }}>
        {loading ? 'Logging in...' : 'Login'}
      </Button>
      <Button type="button" size="small" sx={{ mt: 1 }} onClick={() => { setForgotOpen(true); setForgotMsg(null); setForgotEmail(''); }}>
        Forgot Password?
      </Button>
      {showBackToSso && (
        <Button type="button" size="small" sx={{ mt: 1 }} onClick={() => { setShowEmailLogin(false); setError(''); }}>
          Back to SSO login
        </Button>
      )}
    </Box>
  );

  if (authLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (user) {
    return <Navigate to={getDashboard(user)} replace />;
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <Card sx={{ maxWidth: 450, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h4" textAlign="center" color="primary" gutterBottom>
            Qlicker
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {ssoEnabled ? (
            <>
              <Button
                fullWidth
                variant="contained"
                size="large"
                // Full page redirect required — SSO login is an external IdP redirect, not an API call
                onClick={() => { window.location.href = '/api/v1/auth/sso/login'; }}
                sx={{ py: 1.6, mt: 1, fontWeight: 700 }}
              >
                Login through {ssoInstitutionName || 'SSO'}
              </Button>
              {!showEmailLogin ? (
                <Box textAlign="center" sx={{ mt: 1.5 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => { setShowEmailLogin(true); setError(''); }}
                    sx={{ textTransform: 'none', minHeight: 'unset', p: 0, fontSize: '0.8rem' }}
                  >
                    Have an email-based account
                  </Button>
                </Box>
              ) : (
                <>
                  <Divider sx={{ my: 2 }}>or</Divider>
                  {renderEmailLoginForm({ showBackToSso: true })}
                </>
              )}
            </>
          ) : (
            <>
              <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); }} centered sx={{ mb: 2 }}>
                <Tab label="Login" />
                <Tab label="Register" />
              </Tabs>
              {tab === 0 ? (
                renderEmailLoginForm()
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
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Forgot Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Enter your email address and we&apos;ll send you a link to reset your password.
          </Typography>
          <TextField fullWidth label="Email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} margin="normal" />
          {forgotMsg && <Alert severity={forgotMsg.severity} sx={{ mt: 1 }}>{forgotMsg.text}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleForgotPassword} disabled={forgotLoading || !forgotEmail}>
            {forgotLoading ? 'Sending…' : 'Send Reset Link'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
