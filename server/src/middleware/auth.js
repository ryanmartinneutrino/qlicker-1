export async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
    // request.user is set by @fastify/jwt from the token payload
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
