import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { setAccessToken, getAccessToken } from '../api/client';

export default function SSOCallback() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { loadUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError(t('ssoCallback.noToken'));
      return;
    }

    setAccessToken(token);

    loadUser().then(() => {
      const stored = getAccessToken();
      if (!stored) {
        setError(t('ssoCallback.authFailed'));
      }
      // Navigation is handled by the separate useEffect watching `user`.
    }).catch(() => {
      setError(t('ssoCallback.profileFailed'));
    });
  }, [searchParams, loadUser, navigate]);

  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const roles = user.profile?.roles || [];
    if (roles.includes('admin')) navigate('/admin', { replace: true });
    else if (roles.includes('professor')) navigate('/manage', { replace: true });
    else navigate('/student', { replace: true });
  }, [user, navigate]);

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  );
}
