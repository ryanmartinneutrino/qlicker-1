import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fs from 'fs';
import path from 'path';
import config from './config/index.js';
import dbPlugin from './plugins/db.js';
import uploadPlugin from './plugins/upload.js';
import samlPlugin from './plugins/saml.js';
import websocketPlugin from './plugins/websocket.js';
import { authenticate, requireRole } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import imageRoutes from './routes/images.js';
import courseRoutes from './routes/courses.js';
import sessionRoutes from './routes/sessions.js';
import questionRoutes from './routes/questions.js';

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

  // Upload plugin
  await app.register(uploadPlugin);

  // SAML SSO plugin
  await app.register(samlPlugin);

  // WebSocket plugin (skip in test if opts.skipWs)
  if (!opts.skipWs) {
    await app.register(websocketPlugin);
  }

  // Health check
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: typeof app.wsSendToUser === 'function',
  }));

  // Serve local uploads as static files
  app.get('/uploads/:filename', async (request, reply) => {
    const filename = request.params.filename;
    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid filename' });
    }
    const filePath = path.resolve(app.uploadsDir, filename);
    // Ensure resolved path is still within uploads directory (prevents symlink attacks)
    if (!filePath.startsWith(path.resolve(app.uploadsDir))) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid filename' });
    }
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Not Found', message: 'File not found' });
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    return reply.type(contentType).send(stream);
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });
  await app.register(imageRoutes, { prefix: '/api/v1/images' });
  await app.register(courseRoutes, { prefix: '/api/v1/courses' });
  await app.register(sessionRoutes, { prefix: '/api/v1' });
  await app.register(questionRoutes, { prefix: '/api/v1' });

  return app;
}
