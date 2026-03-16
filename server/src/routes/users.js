import User from '../models/User.js';
import { generateMeteorId } from '../utils/meteorId.js';
import { emailRegex } from '../utils/email.js';
import { escapeForRegex } from '../utils/regex.js';
import { stringParamsSchema } from '../utils/apiDocs.js';

function canUseEmailLogin(user = {}) {
  if (!user.ssoCreated) return true;
  return user.allowEmailLogin === true;
}

function hasOnlyStudentRole(roles = []) {
  return roles.includes('student') && !roles.includes('professor') && !roles.includes('admin');
}

function sanitizeUser(user) {
  const obj = user.toObject();
  obj.isSSOUser = !!user.services?.sso?.id;
  obj.isSSOCreatedUser = !!user.ssoCreated;
  obj.allowEmailLogin = canUseEmailLogin(user);
  obj.lastAuthProvider = user.lastAuthProvider || '';
  delete obj.services;
  return obj;
}

function sanitizeRawUser(user = {}) {
  return {
    ...user,
    isSSOUser: !!user.services?.sso?.id,
    isSSOCreatedUser: !!user.ssoCreated,
    allowEmailLogin: canUseEmailLogin(user),
    lastAuthProvider: user.lastAuthProvider || '',
    services: undefined,
  };
}

const updateProfileSchema = {
  body: {
    type: 'object',
    properties: {
      firstname: { type: 'string', minLength: 1 },
      lastname: { type: 'string', minLength: 1 },
      studentNumber: { type: 'string' },
      locale: { type: 'string' },
    },
    additionalProperties: false,
  },
};

const updateProfileImageSchema = {
  body: {
    type: 'object',
    required: ['profileImage'],
    properties: {
      profileImage: { type: 'string', minLength: 1 },
      profileThumbnail: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

const listUsersSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
      role: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
};

const userIdParamsSchema = {
  params: stringParamsSchema(['id']),
};

const updateRoleSchema = {
  ...userIdParamsSchema,
  body: {
    type: 'object',
    required: ['role'],
    properties: {
      role: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

const updateUserPropertiesSchema = {
  ...userIdParamsSchema,
  body: {
    type: 'object',
    properties: {
      canPromote: { type: 'boolean' },
      allowEmailLogin: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

export default async function userRoutes(app) {
  const { authenticate, requireRole } = app;
  const userMutationRateLimit = {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  };

  // GET /me
  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await User.findById(request.user.userId);
    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }
    return { user: sanitizeUser(user) };
  });

  // PATCH /me
  app.patch('/me', { preHandler: authenticate, schema: updateProfileSchema, ...userMutationRateLimit }, async (request, reply) => {
    const profileAllowed = ['firstname', 'lastname', 'studentNumber'];
    const updates = {};

    const user = await User.findById(request.user.userId);
    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }

    const isSSONameLocked = !!user.ssoCreated || !!user.services?.sso?.id || user.lastAuthProvider === 'sso';

    for (const key of profileAllowed) {
      if (request.body?.[key] !== undefined) {
        if (isSSONameLocked && (key === 'firstname' || key === 'lastname')) {
          continue; // SSO users cannot change name fields
        }
        updates[`profile.${key}`] = request.body[key];
      }
    }

    // Per-user locale preference
    if (request.body?.locale !== undefined) {
      updates.locale = request.body.locale;
    }

    const updated = await User.findByIdAndUpdate(
      request.user.userId,
      { $set: updates },
      { new: true }
    );
    if (!updated) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }
    return sanitizeUser(updated);
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
            newPassword: { type: 'string', minLength: 8 },
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

      if (user.lastAuthProvider === 'sso' || user.ssoCreated || user.services?.sso?.id) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'SSO_PASSWORD_CHANGE_DISABLED',
          message: 'Password changes are unavailable while signed in through SSO.',
        });
      }

      const valid = await user.verifyPassword(currentPassword);
      if (!valid) {
        if (user.passwordResetRequired()) {
          const reason = user.passwordResetReason();
          const message = reason === 'no_local_password'
            ? 'No local password is set for this account. Please reset your password.'
            : 'This account uses a legacy password format. Please reset your password.';
          return reply.code(403).send({
            error: 'Forbidden',
            code: 'PASSWORD_RESET_REQUIRED',
            requiresPasswordReset: true,
            reason,
            message,
          });
        }
        return reply.code(401).send({ error: 'Unauthorized', message: 'Current password is incorrect' });
      }

      const hashed = await User.hashPassword(newPassword);
      if (!user.services.password) user.services.password = {};
      user.services.password.hash = hashed;
      user.services.password.bcrypt = undefined;
      await user.save();

      return { success: true };
    }
  );

  // PATCH /me/image — Update profile image
  app.patch('/me/image', { preHandler: authenticate, schema: updateProfileImageSchema, ...userMutationRateLimit }, async (request, reply) => {
    const { profileImage, profileThumbnail } = request.body || {};
    if (typeof profileImage !== 'string') {
      return reply.code(400).send({ error: 'Bad Request', message: 'profileImage URL string is required' });
    }
    if (profileThumbnail !== undefined && typeof profileThumbnail !== 'string') {
      return reply.code(400).send({ error: 'Bad Request', message: 'profileThumbnail must be a URL string when provided' });
    }

    const resolvedThumbnail = profileThumbnail ?? profileImage;

    const user = await User.findByIdAndUpdate(
      request.user.userId,
      {
        $set: {
          'profile.profileImage': profileImage,
          'profile.profileThumbnail': resolvedThumbnail,
        },
      },
      { new: true }
    );
    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }
    return sanitizeUser(user);
  });

  // GET / (admin only - paginated user list)
  app.get(
    '/',
    { preHandler: requireRole(['admin']), schema: listUsersSchema },
    async (request, reply) => {
      const { search, role, page: pageParam, limit: limitParam } = request.query;
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20));

      const filter = {};
      if (search) {
        const regex = new RegExp(escapeForRegex(search), 'i');
        filter.$or = [
          { 'profile.firstname': regex },
          { 'profile.lastname': regex },
          { 'emails.address': regex },
          { 'profile.studentNumber': regex },
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
        return sanitizeRawUser(u);
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
      { preHandler: requireRole(['admin']), schema: userIdParamsSchema },
    async (request, reply) => {
      const user = await User.findById(request.params.id);
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      return sanitizeUser(user);
    }
  );

  // PATCH /:id/properties (admin only)
  app.patch(
    '/:id/properties',
    {
      preHandler: requireRole(['admin']),
      schema: updateUserPropertiesSchema,
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const existingUser = await User.findById(request.params.id);
      if (!existingUser) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }

      const setUpdates = {};
      const unsetUpdates = {};
      const existingRoles = existingUser.profile?.roles || [];
      const targetIsStudentOnly = hasOnlyStudentRole(existingRoles);

      if (targetIsStudentOnly) {
        setUpdates['profile.canPromote'] = false;
      } else if (request.body?.canPromote !== undefined) {
        setUpdates['profile.canPromote'] = !!request.body.canPromote;
      }
      if (request.body?.allowEmailLogin !== undefined) {
        setUpdates.allowEmailLogin = !!request.body.allowEmailLogin;
        if (request.body.allowEmailLogin === false) {
          unsetUpdates['services.resetPassword'] = 1;
        }
      }

      const updateDoc = {};
      if (Object.keys(setUpdates).length > 0) {
        updateDoc.$set = setUpdates;
      }
      if (Object.keys(unsetUpdates).length > 0) {
        updateDoc.$unset = unsetUpdates;
      }

      const user = await User.findByIdAndUpdate(
        request.params.id,
        updateDoc,
        { new: true }
      );
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      return sanitizeUser(user);
    }
  );

  // PATCH /:id/role (admin or canPromote professor)
  app.patch(
    '/:id/role',
      { preHandler: authenticate, schema: updateRoleSchema },
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

      // Admins cannot change their own role to prevent losing all admin access
      if (isAdmin && request.params.id === request.user.userId) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Admins cannot change their own role' });
      }

      const roleUpdates = { 'profile.roles': [role] };
      if (role === 'student') {
        roleUpdates['profile.canPromote'] = false;
      }

      const user = await User.findByIdAndUpdate(
        request.params.id,
        { $set: roleUpdates },
        { new: true }
      );
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      return sanitizeUser(user);
    }
  );

  // PATCH /:id/verify-email (admin only)
  app.patch(
    '/:id/verify-email',
      { preHandler: requireRole(['admin']), schema: userIdParamsSchema },
    async (request, reply) => {
      const user = await User.findById(request.params.id);
      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      }
      if (user.emails && user.emails.length > 0) {
        user.emails[0].verified = true;
        await user.save();
      }
      return sanitizeUser(user);
    }
  );

  // DELETE /:id (admin only)
  app.delete(
    '/:id',
    { preHandler: requireRole(['admin']), schema: userIdParamsSchema },
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
            password: { type: 'string', minLength: 8 },
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

      const existing = await User.findOne({ 'emails.address': emailRegex(normalizedEmail) });
      if (existing) {
        return reply.code(409).send({ error: 'Conflict', message: 'Email already registered' });
      }

      const hashedPassword = await User.hashPassword(password);
      const user = await User.create({
        _id: generateMeteorId(),
        emails: [{ address: normalizedEmail, verified: false }],
        services: {
          password: { hash: hashedPassword },
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
