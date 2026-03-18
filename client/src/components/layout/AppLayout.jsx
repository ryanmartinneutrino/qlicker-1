import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, IconButton, Menu, MenuItem, Avatar, Box, Container, Button,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import ConnectionStatus from '../common/ConnectionStatus';

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const mainContentRef = useRef(null);
  const roles = user?.profile?.roles || [];
  const isAdmin = roles.includes('admin');

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleMenuClose();
    let ssoLogoutUrl = '';
    if (user?.lastAuthProvider === 'sso') {
      try {
        const { data } = await apiClient.get('/auth/sso/logout-url');
        ssoLogoutUrl = data?.url || '';
      } catch {
        ssoLogoutUrl = '';
      }
    }

    await logout();
    if (ssoLogoutUrl) {
      window.location.assign(ssoLogoutUrl);
      return;
    }
    navigate('/login', { replace: true });
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
    if (roles.includes('admin')) return '/admin';
    if (roles.includes('professor')) return '/manage';
    return '/student';
  };

  const currentPath = location.pathname;
  const dashboardPath = getDashboardPath();
  const isOnCourseList = currentPath === '/manage';

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      mainContentRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [currentPath]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 'auto',
          zIndex: 1500,
          px: 1.25,
          py: 0.75,
          borderRadius: 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          border: '1px solid',
          borderColor: 'divider',
          '&:focus': {
            left: 12,
            top: 12,
          },
        }}
      >
        {t('nav.skipToMain')}
      </Box>
      <ConnectionStatus />
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              color="inherit"
              onClick={() => navigate(dashboardPath)}
              aria-label={t('nav.goToDashboard')}
              sx={{
                p: 0,
                minWidth: 0,
                textTransform: 'none',
                '&:hover': { backgroundColor: 'transparent' },
              }}
            >
              <Typography variant="h4" sx={{ fontWeight: 500 }}>
                {t('common.appName')}
              </Typography>
            </Button>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={handleMenuOpen} color="inherit" aria-label={t('nav.openAccountMenu')}>
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
              <MenuItem onClick={() => { handleMenuClose(); navigate(dashboardPath); }}>{t('nav.dashboard')}</MenuItem>
            )}
            {currentPath !== '/profile' && (
              <MenuItem onClick={handleProfile}>{t('nav.profile')}</MenuItem>
            )}
            {isAdmin && !isOnCourseList && (
              <MenuItem onClick={() => { handleMenuClose(); navigate('/manage'); }}>{t('nav.courses')}</MenuItem>
            )}
            <MenuItem onClick={handleLogout}>{t('nav.logout')}</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container
        component="main"
        id="main-content"
        ref={mainContentRef}
        tabIndex={-1}
        maxWidth="lg"
        sx={{ flex: 1, py: 3, outline: 'none' }}
      >
        <Outlet />
      </Container>
    </Box>
  );
}
