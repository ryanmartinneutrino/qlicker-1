import User from '../models/User.js';
import { generateMeteorId } from '../utils/meteorId.js';

function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.services;
  return obj;
}

export default async function userRoutes(app) {
  const { authenticate, requireRole } = app;

  // GET /me
  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await User.findById(request.user.userId);
    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }
    return { user: sanitizeUser(user) };
  });

  // PATCH /me
  app.patch('/me', { preHandler: authenticate }, async (request, reply) => {
    const allowed = ['firstname', 'lastname', 'studentNumber'];
    const updates = {};
    for (const key of allowed) {
      if (request.body?.[key] !== undefined) {
        updates[`profile.${key}`] = request.body[key];
      }
    }

    const user = await User.findByIdAndUpdate(
      request.user.userId,
      { $set: updates },
      { new: true }
    );
    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }
    return sanitizeUser(user);
  });

  // PATCH /me/password
  app.patch(
    '/me/password',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;

      const user = await User.findById(request.user.userId);
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }

      const valid = await user.verifyPassword(currentPassword);
      if (!valid) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Current password is incorrect' });
      }

      const hashed = await User.hashPassword(newPassword);
      user.services.password.bcrypt = hashed;
      await user.save();

      return { success: true };
    }
  );

  // GET / (admin only - paginated user list)
  app.get(
    '/',
    { preHandler: requireRole(['admin']) },
    async (request, reply) => {
      const { search, role, page: pageParam, limit: limitParam } = request.query;
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20));

      const filter = {};
      if (search) {
        const regex = new RegExp(search, 'i');
        filter.$or = [
          { 'profile.firstname': regex },
          { 'profile.lastname': regex },
          { 'emails.address': regex },
        ];
      }
      if (role) {
        filter['profile.roles'] = role;
      }

      const [users, total] = await Promise.all([
        User.find(filter)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
      ]);

      // Remove services from each user
      const sanitized = users.map((u) => {
        delete u.services;
        return u;
      });

      return {
        users: sanitized,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    }
  );

  // GET /:id (admin only)
  app.get(
    '/:id',
    { preHandler: requireRole(['admin']) },
    async (request, reply) => {
      const user = await User.findById(request.params.id);
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      return sanitizeUser(user);
    }
  );

  // PATCH /:id/role (admin or canPromote professor)
  app.patch(
    '/:id/role',
    { preHandler: authenticate },
    async (request, reply) => {
      const { role } = request.body || {};
      if (!role) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Role is required' });
      }

      const callerRoles = request.user.roles || [];
      const isAdmin = callerRoles.includes('admin');

      if (!isAdmin) {
        // Check if caller is a professor with canPromote
        const caller = await User.findById(request.user.userId);
        if (!caller || !callerRoles.includes('professor') || !caller.profile?.canPromote) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
        }
      }

      const user = await User.findByIdAndUpdate(
        request.params.id,
        { $set: { 'profile.roles': [role] } },
        { new: true }
      );
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      return sanitizeUser(user);
    }
  );

  // DELETE /:id (admin only)
  app.delete(
    '/:id',
    { preHandler: requireRole(['admin']) },
    async (request, reply) => {
      const user = await User.findByIdAndDelete(request.params.id);
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      return { success: true };
    }
  );

  // POST / (admin only - create user)
  app.post(
    '/',
    {
      preHandler: requireRole(['admin']),
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'firstname', 'lastname'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            firstname: { type: 'string', minLength: 1 },
            lastname: { type: 'string', minLength: 1 },
            role: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password, firstname, lastname, role } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      const existing = await User.findOne({ 'emails.address': normalizedEmail });
      if (existing) {
        return reply.code(409).send({ error: 'Conflict', message: 'Email already registered' });
      }

      const hashedPassword = await User.hashPassword(password);
      const user = await User.create({
        _id: generateMeteorId(),
        emails: [{ address: normalizedEmail, verified: false }],
        services: {
          password: { bcrypt: hashedPassword },
        },
        profile: {
          firstname,
          lastname,
          roles: [role || 'student'],
        },
        createdAt: new Date(),
      });

      return reply.code(201).send(sanitizeUser(user));
    }
  );
}
