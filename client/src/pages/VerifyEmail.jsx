import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Button, Typography, Alert, CircularProgress,
} from '@mui/material';
import apiClient from '../api/client';

export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const verify = async () => {
      try {
        await apiClient.post('/auth/verify-email', { token });
      } catch {
        setError('Invalid or expired verification link');
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [token]);

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <Card sx={{ maxWidth: 450, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h4" textAlign="center" color="primary" gutterBottom>
            Email Verification
          </Typography>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>Email verified! You can now log in.</Alert>
              <Button fullWidth variant="contained" onClick={() => navigate('/login')}>
                Go to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
