import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { generateMeteorId } from '../utils/meteorId.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';

function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.services;
  return obj;
}

function signAccessToken(app, user) {
  return app.jwt.sign(
    { userId: user._id, roles: user.profile?.roles || [] },
    { expiresIn: '15m' }
  );
}

function signRefreshToken(config, user) {
  return jwt.sign(
    { userId: user._id, type: 'refresh' },
    config.jwtRefreshSecret,
    { expiresIn: '7d' }
  );
}

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'firstname', 'lastname'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 6 },
      firstname: { type: 'string', minLength: 1 },
      lastname: { type: 'string', minLength: 1 },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string' },
      password: { type: 'string' },
    },
  },
};

export default async function authRoutes(app) {
  // POST /register
  app.post('/register', { schema: registerSchema }, async (request, reply) => {
    const { email, password, firstname, lastname } = request.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check domain restrictions
    const settings = await Settings.findOne();
    if (settings?.restrictDomain && settings.allowedDomains?.length > 0) {
      const domain = normalizedEmail.split('@')[1];
      if (!settings.allowedDomains.includes(domain)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Email domain not allowed' });
      }
    }

    // Check if user already exists
    const existing = await User.findOne({ 'emails.address': normalizedEmail });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email already registered' });
    }

    // First user becomes admin
    const userCount = await User.countDocuments();
    const roles = userCount === 0 ? ['admin'] : ['student'];

    const hashedPassword = await User.hashPassword(password);
    const userId = generateMeteorId();

    const user = await User.create({
      _id: userId,
      emails: [{ address: normalizedEmail, verified: false }],
      services: {
        password: { bcrypt: hashedPassword },
      },
      profile: {
        firstname,
        lastname,
        roles,
      },
      createdAt: new Date(),
    });

    const token = signAccessToken(app, user);
    const refreshToken = signRefreshToken(app.config, user);

    reply.setCookie('refreshToken', refreshToken, {
      path: '/',
      httpOnly: true,
      secure: app.config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return reply.code(201).send({ token, user: sanitizeUser(user) });
  });

  // POST /login
  app.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ 'emails.address': normalizedEmail });
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const token = signAccessToken(app, user);
    const refreshToken = signRefreshToken(app.config, user);

    reply.setCookie('refreshToken', refreshToken, {
      path: '/',
      httpOnly: true,
      secure: app.config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { token, user: sanitizeUser(user) };
  });

  // POST /logout
  app.post('/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  });

  // POST /refresh
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'No refresh token' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, app.config.jwtRefreshSecret);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }

    if (payload.type !== 'refresh') {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token type' });
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
    }

    const token = signAccessToken(app, user);
    return { token };
  });

  // POST /forgot-password
  app.post(
    '/forgot-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      // Always return success to avoid user enumeration
      const user = await User.findOne({ 'emails.address': normalizedEmail });
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        user.services.resetPassword = {
          token,
          email: normalizedEmail,
          when: new Date(),
          reason: 'reset',
        };
        await user.save();

        try {
          await sendPasswordResetEmail(user, token);
        } catch (err) {
          request.log.error('Failed to send password reset email:', err);
        }
      }

      return { success: true };
    }
  );

  // POST /reset-password
  app.post(
    '/reset-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const { token, newPassword } = request.body;

      const user = await User.findOne({ 'services.resetPassword.token': token });
      if (!user) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Invalid or expired token' });
      }

      const hashedPassword = await User.hashPassword(newPassword);
      user.services.password.bcrypt = hashedPassword;
      user.services.resetPassword = undefined;
      await user.save();

      return { success: true };
    }
  );

  // POST /verify-email
  app.post(
    '/verify-email',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.body;

      const user = await User.findOne({ 'services.email.verificationTokens.token': token });
      if (!user) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Invalid or expired token' });
      }

      // Find the token entry to get the address
      const tokenEntry = user.services.email.verificationTokens.find((t) => t.token === token);
      if (tokenEntry) {
        const emailEntry = user.emails.find((e) => e.address === tokenEntry.address);
        if (emailEntry) {
          emailEntry.verified = true;
        }
      }

      // Remove used token
      user.services.email.verificationTokens = user.services.email.verificationTokens.filter(
        (t) => t.token !== token
      );
      await user.save();

      return { success: true };
    }
  );
}
