import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, IconButton, Menu, MenuItem, Avatar, Box, Container,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            sx={{ flexGrow: 1, cursor: 'pointer' }}
            onClick={() => navigate(getDashboardPath())}
          >
            Qlicker
          </Typography>
          <IconButton onClick={handleMenuOpen} color="inherit">
            <Avatar
              src={user?.profile?.profileImage}
              sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}
            >
              {getInitials()}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <MenuItem disabled>
              {user?.profile?.firstname} {user?.profile?.lastname}
            </MenuItem>
            <MenuItem onClick={handleProfile}>Profile</MenuItem>
            {user?.profile?.roles?.includes('admin') && (
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
