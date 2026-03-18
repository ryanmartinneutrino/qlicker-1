import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { generateMeteorId } from '../utils/meteorId.js';
import { emailRegex } from '../utils/email.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';
import { normalizeCertificatePem } from '../utils/certificate.js';

const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const LEGACY_REFRESH_VERSION_QUERY = {
  $or: [
    { refreshTokenVersion: { $exists: false } },
    { refreshTokenVersion: null },
    { refreshTokenVersion: 0 },
  ],
};

function getAttr(profile, key) {
  if (!key || !profile) return '';
  const val = profile[key];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

function sanitizeUser(user) {
  const obj = user.toObject();
  obj.isSSOUser = user.isSSOLinked();
  obj.isSSOCreatedUser = user.isSSOCreatedUser();
  obj.allowEmailLogin = user.canUseEmailLogin();
  obj.lastAuthProvider = user.lastAuthProvider || '';
  delete obj.services;
  return obj;
}

// Cache token expiry setting to avoid DB query on every token generation.
// Refreshes every 60 seconds.
let _cachedTokenExpiryMinutes = null;
let _cacheExpiry = 0;

async function getTokenExpiryMinutes() {
  const now = Date.now();
  if (_cachedTokenExpiryMinutes != null && now < _cacheExpiry) {
    return _cachedTokenExpiryMinutes;
  }
  const settings = await Settings.findOne();
  const mins = settings?.tokenExpiryMinutes;
  _cachedTokenExpiryMinutes = (typeof mins === 'number' && mins > 0) ? mins : 120;
  _cacheExpiry = now + 60_000; // refresh cache every 60 seconds
  return _cachedTokenExpiryMinutes;
}

async function signAccessToken(app, user) {
  const mins = await getTokenExpiryMinutes();
  return app.jwt.sign(
    { userId: user._id, roles: user.profile?.roles || [] },
    { expiresIn: `${mins}m` }
  );
}

function getRefreshTokenVersion(user) {
  return Math.max(0, Number(user?.refreshTokenVersion) || 0);
}

function signRefreshToken(config, user, version = getRefreshTokenVersion(user)) {
  return jwt.sign(
    { userId: user._id, type: 'refresh', version },
    config.jwtRefreshSecret,
    { expiresIn: '7d' }
  );
}

function setRefreshTokenCookie(reply, app, refreshToken) {
  reply.setCookie('refreshToken', refreshToken, {
    path: '/',
    httpOnly: true,
    secure: app.config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

function clearRefreshTokenCookie(reply) {
  reply.clearCookie('refreshToken', { path: '/' });
}

function isLoginLocked(user) {
  const lockedUntil = user?.loginLockedUntil ? new Date(user.loginLockedUntil) : null;
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

function prepareLoginLockoutReset(user) {
  if (!user) return;
  user.failedLoginAttempts = 0;
  user.loginLockedUntil = null;
}

async function recordFailedLoginAttempt(user) {
  if (!user) return false;

  const attempts = (Number(user.failedLoginAttempts) || 0) + 1;
  user.failedLoginAttempts = attempts;
  if (attempts >= LOGIN_LOCKOUT_THRESHOLD) {
    user.loginLockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS);
  }
  await user.save();
  return isLoginLocked(user);
}

async function consumeRefreshTokenVersion(userId, version) {
  if (Number.isInteger(version) && version >= 0) {
    return User.findOneAndUpdate(
      { _id: userId, refreshTokenVersion: version },
      { $inc: { refreshTokenVersion: 1 } },
      { new: true }
    );
  }

  // Backward-compatible path for pre-rotation tokens that had no version claim.
  return User.findOneAndUpdate(
    { _id: userId, ...LEGACY_REFRESH_VERSION_QUERY },
    { $set: { refreshTokenVersion: 1 } },
    { new: true }
  );
}

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'firstname', 'lastname'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
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
  app.post('/register', {
    schema: registerSchema,
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
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

    // Check if user already exists (case-insensitive for legacy DB compatibility)
    const existing = await User.findOne({ 'emails.address': emailRegex(normalizedEmail) });
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
        password: { hash: hashedPassword },
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

    const token = await signAccessToken(app, user);
    const refreshToken = signRefreshToken(app.config, user);

    setRefreshTokenCookie(reply, app, refreshToken);

    return reply.code(201).send({ token, user: sanitizeUser(user) });
  });

  // POST /login
  app.post('/login', {
    schema: loginSchema,
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Case-insensitive lookup for legacy DB compatibility
    const user = await User.findOne({ 'emails.address': emailRegex(normalizedEmail) });
    if (!user) {
      request.log.warn({ email: normalizedEmail }, 'Login failed: unknown email');
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    if (!user.canUseEmailLogin()) {
      request.log.warn({ email: normalizedEmail, userId: user._id }, 'Login blocked: SSO-only account');
      return reply.code(403).send({
        error: 'Forbidden',
        code: 'SSO_EMAIL_LOGIN_DISABLED',
        message: 'This account must sign in through SSO until email login is approved by an administrator.',
      });
    }

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

    if (isLoginLocked(user)) {
      return reply.code(423).send({
        error: 'Locked',
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed login attempts. Please try again later.',
      });
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      request.log.warn({ email: normalizedEmail, userId: user._id }, 'Login failed: invalid password');
      const locked = await recordFailedLoginAttempt(user);
      if (locked) {
        return reply.code(423).send({
          error: 'Locked',
          code: 'ACCOUNT_LOCKED',
          message: 'Too many failed login attempts. Please try again later.',
        });
      }
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    prepareLoginLockoutReset(user);
    user.lastLogin = new Date();
    user.lastAuthProvider = 'password';
    user.refreshTokenVersion = getRefreshTokenVersion(user) + 1;
    await user.save();

    const token = await signAccessToken(app, user);
    const refreshToken = signRefreshToken(app.config, user);

    setRefreshTokenCookie(reply, app, refreshToken);

    return { token, user: sanitizeUser(user) };
  });

  // POST /logout
  app.post('/logout', {
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken;

    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, app.config.jwtRefreshSecret);
        if (payload?.type === 'refresh' && payload.userId) {
          if (Number.isInteger(payload.version) && payload.version >= 0) {
            await User.updateOne(
              { _id: payload.userId, refreshTokenVersion: payload.version },
              { $inc: { refreshTokenVersion: 1 } }
            );
          } else {
            await User.updateOne(
              { _id: payload.userId, ...LEGACY_REFRESH_VERSION_QUERY },
              { $set: { refreshTokenVersion: 1 } }
            );
          }
        }
      } catch {
        // Ignore invalid refresh tokens during logout and still clear the cookie.
      }
    }

    clearRefreshTokenCookie(reply);
    return { success: true };
  });

  // POST /refresh
  app.post('/refresh', {
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
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

    if (!payload.userId) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }

    const user = await consumeRefreshTokenVersion(payload.userId, payload.version);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }

    const token = await signAccessToken(app, user);
    const nextRefreshToken = signRefreshToken(app.config, user);
    setRefreshTokenCookie(reply, app, nextRefreshToken);
    return { token };
  });

  // POST /forgot-password
  app.post(
    '/forgot-password',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
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
      const user = await User.findOne({ 'emails.address': emailRegex(normalizedEmail) });
      if (user && user.canUseEmailLogin()) {
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
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
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

      if (!user.canUseEmailLogin()) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'SSO_EMAIL_LOGIN_DISABLED',
          message: 'This account must sign in through SSO until email login is approved by an administrator.',
        });
      }

      const hashedPassword = await User.hashPassword(newPassword);
      if (!user.services.password) user.services.password = {};
      user.services.password.hash = hashedPassword;
      user.services.password.bcrypt = undefined;
      user.services.resetPassword = undefined;
      user.refreshTokenVersion = getRefreshTokenVersion(user) + 1;
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

    const url = await saml.getAuthorizeUrlAsync('', request.id, {});
    return reply.redirect(url);
  });

  // POST /sso/callback — SAML assertion consumer (IdP → SP login)
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
    const sessionIndex = profile.sessionIndex || '';

    let user = await User.findOne({ 'emails.address': emailRegex(email) });

    if (!user) {
      // New user via SSO
      const isProfessor = settings.SSO_roleProfName && roleValue === settings.SSO_roleProfName;
      const roles = isProfessor ? ['professor'] : ['student'];

      user = await User.create({
        _id: generateMeteorId(),
        emails: [{ address: email, verified: true }],
        services: {
          password: { hash: await User.hashPassword(crypto.randomBytes(32).toString('hex')) },
          sso: {
            id: profile.nameID,
            nameID: profile.nameID,
            nameIDFormat: profile.nameIDFormat || '',
            email,
            SSORole: roleValue,
            studentNumber,
            sessions: [],
          },
        },
        profile: {
          firstname,
          lastname,
          roles,
          studentNumber,
        },
        ssoCreated: true,
        allowEmailLogin: false,
        lastAuthProvider: 'sso',
        createdAt: new Date(),
      });
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Existing user — update profile from SSO attributes
      if (firstname) user.profile.firstname = firstname;
      if (lastname) user.profile.lastname = lastname;
      if (studentNumber) user.profile.studentNumber = studentNumber;

      // Only upgrade to professor, never downgrade (preserves admin or manually set roles)
      if (settings.SSO_roleProfName && roleValue === settings.SSO_roleProfName
          && !user.profile.roles.includes('professor') && !user.profile.roles.includes('admin')) {
        user.profile.roles = ['professor'];
      }

      if (!user.services) user.services = {};
      if (!user.services.sso) user.services.sso = {};
      user.services.sso.id = profile.nameID;
      user.services.sso.nameID = profile.nameID;
      user.services.sso.nameIDFormat = profile.nameIDFormat || '';
      user.services.sso.email = email;
      user.services.sso.SSORole = roleValue;
      user.services.sso.studentNumber = studentNumber;

      // SSO users should have verified emails
      const emailEntry = user.emails.find(e => e.address === email);
      if (emailEntry && !emailEntry.verified) {
        emailEntry.verified = true;
      }

      user.lastLogin = new Date();
      user.lastAuthProvider = 'sso';
      user.refreshTokenVersion = getRefreshTokenVersion(user) + 1;
      await user.save();
    }

    // Track SSO session index for proper logout
    if (sessionIndex) {
      if (!user.services.sso.sessions) user.services.sso.sessions = [];
      user.services.sso.sessions.push({ sessionIndex });
      await user.save();
    }

    const token = await signAccessToken(app, user);
    const refreshToken = signRefreshToken(app.config, user);

    setRefreshTokenCookie(reply, app, refreshToken);

    return reply.redirect(`${app.config.rootUrl}/sso-callback?token=${encodeURIComponent(token)}`);
  });

  // GET /sso/logout — Handle GET logout callback from IdP
  // Some IdPs (e.g. Azure AD) respond with a GET to confirm logout
  app.get('/sso/logout', async (request, reply) => {
    return reply.redirect(`${app.config.rootUrl}/login`);
  });

  // POST /sso/logout — Handle IdP-initiated logout (POST with SAMLRequest)
  // Attempts cryptographic validation via node-saml's validatePostRequestAsync first.
  // Falls back to manual XML session index extraction if validation fails (e.g.
  // encrypted or non-standard logout requests, matching the original MeteorJS behavior).
  app.post('/sso/logout', async (request, reply) => {
    try {
      const samlRequest = request.body?.SAMLRequest;
      if (!samlRequest) {
        return reply.redirect(`${app.config.rootUrl}/login`);
      }

      request.log.info('SSO logout POST received from %s', request.ip);

      let sessionIndex = null;

      // Attempt cryptographic validation via node-saml
      const saml = await app.getSamlProvider();
      if (saml) {
        try {
          const result = await saml.validatePostRequestAsync(request.body);
          const profile = result?.profile;
          if (profile?.sessionIndex) {
            sessionIndex = profile.sessionIndex;
            request.log.info('SSO logout validated cryptographically, sessionIndex=%s', sessionIndex);
          }
        } catch (validationErr) {
          request.log.warn(
            { err: validationErr },
            'SSO logout crypto validation failed, falling back to manual XML extraction'
          );
        }
      }

      // Fallback: manually extract sessionIndex from base64 XML
      if (!sessionIndex) {
        const xml = Buffer.from(samlRequest, 'base64').toString('utf8');
        const sessionIndexPatterns = [
          /<saml2p:SessionIndex[^>]*>([^<]+)<\/saml2p:SessionIndex>/,
          /<samlp:SessionIndex[^>]*>([^<]+)<\/samlp:SessionIndex>/,
          /<SessionIndex[^>]*>([^<]+)<\/SessionIndex>/,
        ];
        for (const pattern of sessionIndexPatterns) {
          const match = xml.match(pattern);
          if (match) {
            sessionIndex = match[1];
            request.log.warn('SSO logout using unvalidated session index from XML fallback');
            break;
          }
        }
      }

      if (sessionIndex) {
        const user = await User.findOne({ 'services.sso.sessions.sessionIndex': sessionIndex });
        if (user && user.services?.sso?.sessions) {
          user.services.sso.sessions = user.services.sso.sessions.filter(
            (s) => s.sessionIndex !== sessionIndex
          );
          await user.save();
        }
      }
    } catch (err) {
      request.log.error('SSO logout error:', err);
    }

    return reply.redirect(`${app.config.rootUrl}/login`);
  });

  // GET /sso/logout-url — Get the SSO logout URL for SP-initiated logout
  app.get('/sso/logout-url', { preHandler: app.authenticate }, async (request, reply) => {
    const saml = await app.getSamlProvider();
    if (!saml) {
      return { url: null };
    }

    const user = await User.findById(request.user.userId);
    if (!user?.services?.sso?.sessions?.length) {
      return { url: null };
    }

    const settings = await Settings.findOne();
    if (!settings?.SSO_logoutUrl) {
      return { url: null };
    }

    // Use the most recent SSO session
    const session = user.services.sso.sessions[user.services.sso.sessions.length - 1];
    try {
      const logoutUrl = await saml.getLogoutUrlAsync(
        {
          nameID: user.services.sso.nameID,
          nameIDFormat: user.services.sso.nameIDFormat,
          sessionIndex: session.sessionIndex,
        },
        '',
        {}
      );
      return { url: logoutUrl };
    } catch (err) {
      request.log.error('Failed to generate SSO logout URL:', err);
      return { url: null };
    }
  });

  // GET /sso/metadata
  app.get('/sso/metadata', async (request, reply) => {
    const saml = await app.getSamlProvider();
    if (!saml) {
      return reply.code(400).send({ error: 'Bad Request', message: 'SSO is not configured' });
    }

    const settings = saml._qlickerSettings || await Settings.findOne();
    const decryptionCert = normalizeCertificatePem(settings.SSO_privCert || '') || null;
    const signingCert = normalizeCertificatePem(settings.SSO_privCert || '') || null;
    const metadata = saml.generateServiceProviderMetadata(decryptionCert, signingCert);
    return reply.type('application/xml').send(metadata);
  });
}
