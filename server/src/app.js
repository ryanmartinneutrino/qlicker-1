import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import config from './config/index.js';
import dbPlugin from './plugins/db.js';
import { authenticate, requireRole } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : true,
    ...opts,
  });

  // Config
  app.decorate('config', { ...config, ...opts.config });

  // Plugins
  await app.register(cors, { origin: app.config.rootUrl, credentials: true });
  await app.register(formbody);
  await app.register(cookie);
  await app.register(jwt, {
    secret: app.config.jwtSecret,
    sign: { expiresIn: '15m' },
  });

  // Auth decorators
  app.decorate('authenticate', authenticate);
  app.decorate('requireRole', requireRole);

  // Database (skip in test if opts.skipDb)
  if (!opts.skipDb) {
    await app.register(dbPlugin, { uri: app.config.mongoUri });
  }

  // Health check
  app.get('/api/v1/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });

  return app;
}
