import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fs from 'fs';
import path from 'path';
import config from './config/index.js';
import dbPlugin from './plugins/db.js';
import uploadPlugin from './plugins/upload.js';
import samlPlugin from './plugins/saml.js';
import redisPlugin from './plugins/redis.js';
import websocketPlugin from './plugins/websocket.js';
import { authenticate, requireRole } from './middleware/auth.js';
import authRoutes, { legacySamlRoutes } from './routes/auth.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import imageRoutes from './routes/images.js';
import courseRoutes from './routes/courses.js';
import sessionRoutes from './routes/sessions.js';
import questionRoutes from './routes/questions.js';
import gradeRoutes from './routes/grades.js';
import groupRoutes from './routes/groups.js';
import videoRoutes from './routes/video.js';
import { transformApiDocs } from './utils/apiDocs.js';

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : true,
    ...opts,
  });

  // Config
  app.decorate('config', { ...config, ...opts.config });

  // Plugins
  await app.register(cors, {
    origin: app.config.rootUrl,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });
  await app.register(formbody);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP managed by the frontend reverse-proxy / nginx
  });
  await app.register(rateLimit, {
    global: false, // only apply to routes that opt-in
  });
  await app.register(jwt, {
    secret: app.config.jwtSecret,
    sign: { expiresIn: '15m' },
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Qlicker API',
        description: 'Fastify API for the Qlicker migration project.',
        version: '1.0.0',
      },
      servers: [
        { url: app.config.rootUrl },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    transform: ({ schema, url, route }) => ({
      schema: transformApiDocs({ schema, url, route }),
      url,
    }),
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Auth decorators
  app.decorate('authenticate', authenticate);
  app.decorate('requireRole', requireRole);

  // CSRF protection: Require X-Requested-With header on state-changing requests.
  // CORS blocks cross-origin requests from setting custom headers, so this prevents
  // cross-site request forgery. Exempt paths that receive external form posts
  // (SAML callbacks, file uploads via multipart that may lack the header on preflight).
  const CSRF_EXEMPT_PATHS = [
    '/api/v1/auth/sso/callback',
    '/api/v1/auth/sso/logout',
    '/SSO/SAML2',
  ];
  app.addHook('onRequest', async (request, reply) => {
    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (CSRF_EXEMPT_PATHS.some(p => request.url.startsWith(p))) return;
    if (request.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Missing CSRF header' });
    }
  });

  // Database (skip in test if opts.skipDb)
  if (!opts.skipDb) {
    await app.register(dbPlugin, { uri: app.config.mongoUri });
  }

  // Upload plugin
  await app.register(uploadPlugin);

  // SAML SSO plugin
  await app.register(samlPlugin);

  // Redis pub/sub (skip in test if opts.skipRedis, no-op when REDIS_URL is unset)
  if (!opts.skipRedis) {
    await app.register(redisPlugin);
  }

  // WebSocket plugin (skip in test if opts.skipWs)
  if (!opts.skipWs) {
    await app.register(websocketPlugin);
  }

  // Health check
  app.get('/api/v1/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            websocket: { type: 'boolean' },
            redis: { type: 'boolean' },
          },
        },
      },
    },
  }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: typeof app.wsSendToUser === 'function',
    redis: typeof app.redis !== 'undefined' && app.redis !== null,
  }));

  // Serve local uploads as static files
  app.get('/uploads/:filename', {
    config: {
      rateLimit: { max: 120, timeWindow: '1 minute' },
    },
    schema: {
      params: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
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
  await app.register(legacySamlRoutes);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });
  await app.register(imageRoutes, { prefix: '/api/v1/images' });
  await app.register(courseRoutes, { prefix: '/api/v1/courses' });
  await app.register(sessionRoutes, { prefix: '/api/v1' });
  await app.register(questionRoutes, { prefix: '/api/v1' });
  await app.register(gradeRoutes, { prefix: '/api/v1' });
  await app.register(groupRoutes, { prefix: '/api/v1/courses' });
  await app.register(videoRoutes, { prefix: '/api/v1/courses' });

  return app;
}
