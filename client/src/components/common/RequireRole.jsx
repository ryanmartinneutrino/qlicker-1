import { useAuth } from '../../contexts/AuthContext';
import { Typography, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function RequireRole({ role, children }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = user?.profile?.roles || [];

  if (!roles.includes(role) && !roles.includes('admin')) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h5" color="error">{t('accessDenied.title')}</Typography>
        <Typography>{t('accessDenied.message')}</Typography>
      </Box>
    );
  }

  return children;
}
