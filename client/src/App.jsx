import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme/index';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './components/common/RequireAuth';
import RequireRole from './components/common/RequireRole';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import SSOCallback from './pages/SSOCallback';
import Profile from './pages/Profile';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProfDashboard from './pages/professor/ProfDashboard';
import ProfCourseDetail from './pages/professor/CourseDetail';
import StudentDashboard from './pages/student/StudentDashboard';
import StudentCourseDetail from './pages/student/CourseDetail';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/sso-callback" element={<SSOCallback />} />
            <Route path="/reset/:token" element={<ResetPassword />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
              <Route path="/manage" element={<RequireRole role="professor"><ProfDashboard /></RequireRole>} />
              <Route path="/manage/course/:id" element={<RequireRole role="professor"><ProfCourseDetail /></RequireRole>} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/course/:id" element={<StudentCourseDetail />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
