import User from '../models/User.js';

export async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
    const user = await User.findById(request.user?.userId)
      .select('_id disabled')
      .lean();
    if (!user || user.disabled === true) {
      reply.code(403).send({
        error: 'Forbidden',
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled. Please contact an administrator.',
      });
    }
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
  }
}

export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return async function checkRole(request, reply) {
    // authenticate first
    await authenticate(request, reply);
    if (reply.sent) return;

    const userRoles = request.user?.roles || [];
    const hasRole = allowed.some((r) => userRoles.includes(r));
    if (!hasRole) {
      reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
  };
}
