import { useAuth } from '../../contexts/AuthContext';
import { Typography, Box } from '@mui/material';

export default function RequireRole({ role, children }) {
  const { user } = useAuth();
  const roles = user?.profile?.roles || [];

  if (!roles.includes(role) && !roles.includes('admin')) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h5" color="error">Access Denied</Typography>
        <Typography>You do not have permission to view this page.</Typography>
      </Box>
    );
  }

  return children;
}
