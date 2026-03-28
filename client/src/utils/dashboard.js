export function getDashboardPath(user = null) {
  const roles = user?.profile?.roles || [];
  if (roles.includes('admin')) return '/admin';
  if (roles.includes('student')) return '/student';
  if (roles.includes('professor') || user?.canAccessProfessorDashboard) return '/prof';
  return '/student';
}
