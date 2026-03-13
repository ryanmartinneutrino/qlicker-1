import { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useLocation,
} from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import PageLoadFallback from './components/common/PageLoadFallback';

const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ProfDashboard = lazy(() => import('./pages/professor/ProfDashboard'));
const ProfCourseDetail = lazy(() => import('./pages/professor/CourseDetail'));
const SessionEditor = lazy(() => import('./pages/professor/SessionEditor'));
const ProfLiveSession = lazy(() => import('./pages/professor/LiveSession'));
const PresentationWindow = lazy(() => import('./pages/professor/SecondDesktop'));
const ProfSessionReview = lazy(() => import('./pages/professor/SessionReview'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentCourseDetail = lazy(() => import('./pages/student/CourseDetail'));
const SessionReview = lazy(() => import('./pages/student/SessionReview'));
const StudentLiveSession = lazy(() => import('./pages/student/LiveSession'));
const StudentQuizSession = lazy(() => import('./pages/student/QuizSession'));
const JitsiWindow = lazy(() => import('./pages/JitsiWindow'));

function RouteAccessibility() {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const routes = [
      [/^\/$/, t('pageTitles.home')],
      [/^\/login$/, t('pageTitles.login')],
      [/^\/sso-callback$/, t('pageTitles.signingIn')],
      [/^\/reset\/[^/]+$/, t('pageTitles.resetPassword')],
      [/^\/verify-email\/[^/]+$/, t('pageTitles.verifyEmail')],
      [/^\/profile$/, t('pageTitles.profile')],
      [/^\/admin$/, t('pageTitles.adminDashboard')],
      [/^\/manage$/, t('pageTitles.professorDashboard')],
      [/^\/manage\/course\/[^/]+$/, t('pageTitles.courseDetails')],
      [/^\/manage\/course\/[^/]+\/session\/[^/]+$/, t('pageTitles.sessionEditor')],
      [/^\/manage\/course\/[^/]+\/session\/[^/]+\/live$/, t('pageTitles.liveSession')],
      [/^\/manage\/course\/[^/]+\/session\/[^/]+\/review$/, t('pageTitles.sessionReview')],
      [/^\/manage\/course\/[^/]+\/session\/[^/]+\/present$/, t('pageTitles.presentationView')],
      [/^\/student$/, t('pageTitles.studentDashboard')],
      [/^\/student\/course\/[^/]+$/, t('pageTitles.course')],
      [/^\/student\/course\/[^/]+\/session\/[^/]+\/review$/, t('pageTitles.sessionReview')],
      [/^\/student\/course\/[^/]+\/session\/[^/]+\/live$/, t('pageTitles.liveSession')],
      [/^\/student\/course\/[^/]+\/session\/[^/]+\/quiz$/, t('pageTitles.quiz')],
    ];

    const appName = t('common.appName');
    const match = routes.find(([pattern]) => pattern.test(location.pathname));
    document.title = match ? `${match[1]} | ${appName}` : appName;

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
  }, [location.pathname, t]);

  return null;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <RouteAccessibility />
          <Suspense fallback={<PageLoadFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/sso-callback" element={<SSOCallback />} />
              <Route path="/reset/:token" element={<ResetPassword />} />
              <Route path="/verify-email/:token" element={<VerifyEmail />} />
              {/* Presentation window route outside AppLayout (no appbar/avatar) */}
              <Route element={<RequireAuth />}>
                <Route path="/manage/course/:courseId/session/:sessionId/present" element={<RequireRole role="professor"><PresentationWindow /></RequireRole>} />
                <Route path="/video/:courseId" element={<JitsiWindow />} />
                <Route path="/video/:courseId/category/:catNum/group/:groupIdx" element={<JitsiWindow />} />
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
