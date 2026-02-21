import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { RealtimeProvider } from './contexts/RealtimeContext'
import { useAuth } from './hooks/useAuth'

// Pages — stubs for now, migrate from imports/ui/pages/
import Home from './pages/Home'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Professor from './pages/Professor'
import Student from './pages/Student'
import Course from './pages/Course'
import Session from './pages/Session'
import ManageSession from './pages/ManageSession'
import RunSession from './pages/RunSession'
import ReplaySession from './pages/ReplaySession'
import SessionResults from './pages/SessionResults'
import GradeSession from './pages/GradeSession'
import CourseGrades from './pages/CourseGrades'
import QuestionsLibrary from './pages/QuestionsLibrary'
import ManageCourses from './pages/ManageCourses'
import ManageCourseGroups from './pages/ManageCourseGroups'
import ResultsOverview from './pages/ResultsOverview'
import ResetPassword from './pages/ResetPassword'

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.some((r) => user.profile.roles.includes(r))) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/login/email" element={<Login allowEmail />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/reset/:token" element={<ResetPassword />} />

            {/* Authenticated routes — migrated from imports/startup/client/routes.jsx */}
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute>} />

            {/* Professor */}
            <Route path="/manage" element={<ProtectedRoute roles={['professor', 'admin']}><Professor /></ProtectedRoute>} />
            <Route path="/courses" element={<ProtectedRoute roles={['professor', 'admin']}><ManageCourses /></ProtectedRoute>} />
            <Route path="/courses/results" element={<ProtectedRoute roles={['professor', 'admin']}><ResultsOverview /></ProtectedRoute>} />

            {/* Course */}
            <Route path="/course/:courseId" element={<ProtectedRoute><Course /></ProtectedRoute>} />
            <Route path="/course/:courseId/groups" element={<ProtectedRoute><ManageCourseGroups /></ProtectedRoute>} />
            <Route path="/course/:courseId/grades" element={<ProtectedRoute><CourseGrades /></ProtectedRoute>} />
            <Route path="/course/:courseId/questions" element={<ProtectedRoute><QuestionsLibrary /></ProtectedRoute>} />

            {/* Session management */}
            <Route path="/course/:courseId/session/edit/:sessionId" element={<ProtectedRoute roles={['professor', 'admin']}><ManageSession /></ProtectedRoute>} />
            <Route path="/course/:courseId/session/run/:sessionId" element={<ProtectedRoute roles={['professor', 'admin']}><RunSession /></ProtectedRoute>} />
            <Route path="/course/:courseId/session/replay/:sessionId" element={<ProtectedRoute roles={['professor', 'admin']}><ReplaySession /></ProtectedRoute>} />
            <Route path="/course/:courseId/session/:sessionId/grade" element={<ProtectedRoute roles={['professor', 'admin']}><GradeSession /></ProtectedRoute>} />
            <Route path="/course/:courseId/session/:sessionId/results" element={<ProtectedRoute><SessionResults /></ProtectedRoute>} />
            <Route path="/course/:courseId/session/present/:sessionId" element={<ProtectedRoute><Session /></ProtectedRoute>} />

            {/* Student */}
            <Route path="/student" element={<ProtectedRoute roles={['student', 'professor', 'admin']}><Student /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RealtimeProvider>
    </AuthProvider>
  )
}
