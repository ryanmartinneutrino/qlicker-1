import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, IconButton, Menu, MenuItem, Avatar, Box, Container, Button,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import ConnectionStatus from '../common/ConnectionStatus';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  const handleProfile = () => {
    handleMenuClose();
    navigate('/profile');
  };

  const getInitials = () => {
    if (!user?.profile) return '?';
    const f = user.profile.firstname?.[0] || '';
    const l = user.profile.lastname?.[0] || '';
    return (f + l).toUpperCase() || '?';
  };

  const getDashboardPath = () => {
    const roles = user?.profile?.roles || [];
    if (roles.includes('admin')) return '/admin';
    if (roles.includes('professor')) return '/manage';
    return '/student';
  };

  const currentPath = location.pathname;
  const dashboardPath = getDashboardPath();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ConnectionStatus />
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography
              variant="h4"
              sx={{ cursor: 'pointer', fontWeight: 500 }}
              onClick={() => navigate(dashboardPath)}
            >
              Qlicker
            </Typography>
            <Button
              color="inherit"
              size="large"
              onClick={() => navigate(dashboardPath)}
              sx={{ ml: 2, px: 2.25, fontSize: '1.05rem', fontWeight: 600 }}
            >
              Dashboard
            </Button>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={handleMenuOpen} color="inherit">
            <Avatar
              src={user?.profile?.profileImage}
              sx={{ width: 40, height: 40, bgcolor: 'secondary.main', fontSize: '1rem' }}
            >
              {getInitials()}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <MenuItem disabled>
              {user?.profile?.firstname} {user?.profile?.lastname}
            </MenuItem>
            {currentPath !== dashboardPath && (
              <MenuItem onClick={() => { handleMenuClose(); navigate(dashboardPath); }}>Dashboard</MenuItem>
            )}
            {currentPath !== '/profile' && (
              <MenuItem onClick={handleProfile}>Profile</MenuItem>
            )}
            {user?.profile?.roles?.includes('admin') && currentPath !== '/admin' && (
              <MenuItem onClick={() => { handleMenuClose(); navigate('/admin'); }}>Admin Panel</MenuItem>
            )}
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ flex: 1, py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
