import { useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useLocation,
} from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme/index';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './components/common/RequireAuth';
import RequireRole from './components/common/RequireRole';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import SSOCallback from './pages/SSOCallback';
import Profile from './pages/Profile';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProfDashboard from './pages/professor/ProfDashboard';
import ProfCourseDetail from './pages/professor/CourseDetail';
import SessionEditor from './pages/professor/SessionEditor';
import ProfLiveSession from './pages/professor/LiveSession';
import SecondDesktop from './pages/professor/SecondDesktop';
import ProfSessionReview from './pages/professor/SessionReview';
import StudentDashboard from './pages/student/StudentDashboard';
import StudentCourseDetail from './pages/student/CourseDetail';
import SessionReview from './pages/student/SessionReview';
import StudentLiveSession from './pages/student/LiveSession';
import StudentQuizSession from './pages/student/QuizSession';

function getPageTitle(pathname) {
  const routes = [
    [/^\/$/, 'Home'],
    [/^\/login$/, 'Login'],
    [/^\/sso-callback$/, 'Signing In'],
    [/^\/reset\/[^/]+$/, 'Reset Password'],
    [/^\/verify-email\/[^/]+$/, 'Verify Email'],
    [/^\/profile$/, 'Profile'],
    [/^\/admin$/, 'Admin Dashboard'],
    [/^\/manage$/, 'Professor Dashboard'],
    [/^\/manage\/course\/[^/]+$/, 'Course Details'],
    [/^\/manage\/course\/[^/]+\/session\/[^/]+$/, 'Session Editor'],
    [/^\/manage\/course\/[^/]+\/session\/[^/]+\/live$/, 'Live Session'],
    [/^\/manage\/course\/[^/]+\/session\/[^/]+\/review$/, 'Session Review'],
    [/^\/manage\/course\/[^/]+\/session\/[^/]+\/present$/, 'Presentation View'],
    [/^\/student$/, 'Student Dashboard'],
    [/^\/student\/course\/[^/]+$/, 'Course'],
    [/^\/student\/course\/[^/]+\/session\/[^/]+\/review$/, 'Session Review'],
    [/^\/student\/course\/[^/]+\/session\/[^/]+\/live$/, 'Live Session'],
    [/^\/student\/course\/[^/]+\/session\/[^/]+\/quiz$/, 'Quiz'],
  ];

  const match = routes.find(([pattern]) => pattern.test(pathname));
  if (!match) return 'Qlicker';
  return `${match[1]} | Qlicker`;
}

function RouteAccessibility() {
  const location = useLocation();

  useEffect(() => {
    document.title = getPageTitle(location.pathname);

    const rafId = window.requestAnimationFrame(() => {
      const mainContent = document.getElementById('main-content');
      if (mainContent) return;

      const heading = document.querySelector('h1, h2, [role="heading"]');
      if (!(heading instanceof HTMLElement)) return;
      const hadTabIndex = heading.hasAttribute('tabindex');
      if (!hadTabIndex) heading.setAttribute('tabindex', '-1');
      heading.focus();
      if (!hadTabIndex) {
        heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [location.pathname]);

  return null;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <RouteAccessibility />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/sso-callback" element={<SSOCallback />} />
            <Route path="/reset/:token" element={<ResetPassword />} />
            <Route path="/verify-email/:token" element={<VerifyEmail />} />
            {/* Second desktop route outside AppLayout (no appbar/avatar) */}
            <Route element={<RequireAuth />}>
              <Route path="/manage/course/:courseId/session/:sessionId/present" element={<RequireRole role="professor"><SecondDesktop /></RequireRole>} />
            </Route>
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
              <Route path="/manage" element={<RequireRole role="professor"><ProfDashboard /></RequireRole>} />
              <Route path="/manage/course/:id" element={<RequireRole role="professor"><ProfCourseDetail /></RequireRole>} />
              <Route path="/manage/course/:courseId/session/:sessionId" element={<RequireRole role="professor"><SessionEditor /></RequireRole>} />
              <Route path="/manage/course/:courseId/session/:sessionId/live" element={<RequireRole role="professor"><ProfLiveSession /></RequireRole>} />
              <Route path="/manage/course/:courseId/session/:sessionId/review" element={<RequireRole role="professor"><ProfSessionReview /></RequireRole>} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/course/:id" element={<StudentCourseDetail />} />
              <Route path="/student/course/:courseId/session/:sessionId/review" element={<SessionReview />} />
              <Route path="/student/course/:courseId/session/:sessionId/live" element={<StudentLiveSession />} />
              <Route path="/student/course/:courseId/session/:sessionId/quiz" element={<StudentQuizSession />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
