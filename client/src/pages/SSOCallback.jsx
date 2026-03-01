import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function SSOCallback() {
  const [searchParams] = useSearchParams();
  const { loadUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No authentication token received');
      return;
    }

    localStorage.setItem('token', token);

    loadUser().then(() => {
      const stored = localStorage.getItem('token');
      if (!stored) {
        setError('Authentication failed');
      }
      // Navigation is handled by the separate useEffect watching `user`.
    }).catch(() => {
      setError('Failed to load user profile');
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
