import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { generateMeteorId } from '../utils/meteorId.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';

function getAttr(profile, key) {
  if (!key || !profile) return '';
  const val = profile[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

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

    // Send verification email
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.services.email.verificationTokens.push({
      token: verificationToken,
      address: normalizedEmail,
      when: new Date(),
    });
    await user.save();

    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (err) {
      request.log.error('Failed to send verification email:', err);
    }

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

  // GET /sso/login
  app.get('/sso/login', async (request, reply) => {
    const saml = await app.getSamlProvider();
    if (!saml) {
      return reply.code(400).send({ error: 'Bad Request', message: 'SSO is not configured' });
    }

    // Relay state is not needed; the callback handles redirect
    const url = await saml.getAuthorizeUrlAsync('', request.id, {});
    return reply.redirect(url);
  });

  // POST /sso/callback
  app.post('/sso/callback', async (request, reply) => {
    const saml = await app.getSamlProvider();
    if (!saml) {
      return reply.code(400).send({ error: 'Bad Request', message: 'SSO is not configured' });
    }

    let profile;
    try {
      const result = await saml.validatePostResponseAsync(request.body);
      profile = result.profile;
    } catch (err) {
      request.log.error('SAML validation error:', err);
      return reply.code(401).send({ error: 'Unauthorized', message: 'SAML validation failed' });
    }

    if (!profile) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'No profile returned from IdP' });
    }

    const settings = await Settings.findOne();
    const attrs = profile.attributes || profile;

    const email = (getAttr(attrs, settings.SSO_emailIdentifier) || profile.nameID || '').toLowerCase().trim();
    if (!email) {
      return reply.code(400).send({ error: 'Bad Request', message: 'No email in SAML response' });
    }

    const firstname = getAttr(attrs, settings.SSO_firstNameIdentifier);
    const lastname = getAttr(attrs, settings.SSO_lastNameIdentifier);
    const studentNumber = getAttr(attrs, settings.SSO_studentNumberIdentifier);
    const roleValue = getAttr(attrs, settings.SSO_roleIdentifier);

    let user = await User.findOne({ 'emails.address': email });

    if (!user) {
      const isProfessor = settings.SSO_roleProfName && roleValue === settings.SSO_roleProfName;
      const roles = isProfessor ? ['professor'] : ['student'];

      user = await User.create({
        _id: generateMeteorId(),
        emails: [{ address: email, verified: true }],
        services: { sso: { nameID: profile.nameID } },
        profile: {
          firstname,
          lastname,
          roles,
          studentNumber,
        },
        createdAt: new Date(),
      });
    } else {
      if (firstname) user.profile.firstname = firstname;
      if (lastname) user.profile.lastname = lastname;
      if (studentNumber) user.profile.studentNumber = studentNumber;
      if (!user.services) user.services = {};
      user.services.sso = { nameID: profile.nameID };
      await user.save();
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

    return reply.redirect(`${app.config.rootUrl}/sso-callback?token=${encodeURIComponent(token)}`);
  });

  // GET /sso/metadata
  app.get('/sso/metadata', async (request, reply) => {
    const saml = await app.getSamlProvider();
    if (!saml) {
      return reply.code(400).send({ error: 'Bad Request', message: 'SSO is not configured' });
    }

    const settings = await Settings.findOne();
    const callbackUrl = `${app.config.rootUrl}/api/v1/auth/sso/callback`;
    // No decryption/signing certs needed for basic SP metadata
    const metadata = saml.generateServiceProviderMetadata(null, null, settings.SSO_EntityId, callbackUrl);
    return reply.type('application/xml').send(metadata);
  });
}
