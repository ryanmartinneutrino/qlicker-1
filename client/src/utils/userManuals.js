export const USER_MANUAL_ROLES = ['admin', 'professor', 'student'];

export function getPreferredManualRole(roles = []) {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('professor')) return 'professor';
  return 'student';
}

export function getManualPath(role) {
  return `/manual/${role}`;
}

export function canAccessManualRole(roles = [], manualRole) {
  if (!USER_MANUAL_ROLES.includes(manualRole)) return false;
  if (roles.includes('admin')) return true;
  if (manualRole === 'student') return roles.includes('student') || roles.includes('professor');
  if (manualRole === 'professor') return roles.includes('professor');
  return false;
}

export function getAvailableManualRoles(roles = []) {
  return USER_MANUAL_ROLES.filter((manualRole) => canAccessManualRole(roles, manualRole));
}
