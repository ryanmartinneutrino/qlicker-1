import fp from 'fastify-plugin';
import { WebSocket } from 'ws';

const WS_MESSAGE_RATE_LIMIT_MAX = 60;
const WS_MESSAGE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const REDIS_CHANNEL = 'qlicker:ws';

async function websocketPlugin(fastify) {
  await fastify.register(import('@fastify/websocket'));

  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const wsClients = new Map();

  const useRedis = typeof fastify.redis !== 'undefined' && fastify.redis !== null;

  // ── Local delivery helpers (send to sockets on THIS instance only) ──

  function localBroadcast(message) {
    for (const connections of wsClients.values()) {
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  }

  function localSendToUser(userId, message) {
    const connections = wsClients.get(userId);
    if (!connections) return;
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  function localSendToUsers(userIds, message) {
    for (const userId of userIds) {
      const connections = wsClients.get(userId);
      if (!connections) continue;
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  }

  // ── Redis subscriber (if enabled) ──

  if (useRedis) {
    fastify.redisSub.subscribe(REDIS_CHANNEL, (err) => {
      if (err) {
        fastify.log.error({ err }, 'Failed to subscribe to Redis channel');
      } else {
        fastify.log.info({ channel: REDIS_CHANNEL }, 'Subscribed to Redis pub/sub channel');
      }
    });

    fastify.redisSub.on('message', (_channel, raw) => {
      try {
        const envelope = JSON.parse(raw);
        const { type, userIds, message } = envelope;
        if (type === 'broadcast') {
          localBroadcast(message);
        } else if (type === 'users') {
          localSendToUsers(userIds, message);
        }
      } catch {
        fastify.log.warn('Ignoring malformed Redis pub/sub message');
      }
    });
  }

  // ── Public broadcast functions (same API as before) ──

  function wsBroadcast(event, data) {
    const message = JSON.stringify({ event, data });
    if (useRedis) {
      fastify.redis.publish(REDIS_CHANNEL, JSON.stringify({ type: 'broadcast', message }));
    } else {
      localBroadcast(message);
    }
  }

  function wsSendToUser(userId, event, data) {
    const message = JSON.stringify({ event, data });
    if (useRedis) {
      fastify.redis.publish(REDIS_CHANNEL, JSON.stringify({ type: 'users', userIds: [userId], message }));
    } else {
      localSendToUser(userId, message);
    }
  }

  /**
   * Send the same event to multiple users, serializing the JSON payload only once.
   * This is significantly more efficient than calling wsSendToUser() in a loop
   * when broadcasting to large courses (200+ members).
   */
  function wsSendToUsers(userIds, event, data) {
    if (!userIds || userIds.length === 0) return;
    const message = JSON.stringify({ event, data });
    if (useRedis) {
      fastify.redis.publish(REDIS_CHANNEL, JSON.stringify({ type: 'users', userIds, message }));
    } else {
      localSendToUsers(userIds, message);
    }
  }

  fastify.decorate('wsClients', wsClients);
  fastify.decorate('wsBroadcast', wsBroadcast);
  fastify.decorate('wsSendToUser', wsSendToUser);
  fastify.decorate('wsSendToUsers', wsSendToUsers);

  fastify.register(async function wsRoutes(app) {
    // Token is passed via query parameter because the browser WebSocket API
    // does not support custom headers. This is the standard approach.
    app.get('/ws', { websocket: true }, (socket, req) => {
      const token = req.query.token;
      let userId;
      const messageTimestamps = [];

      try {
        const decoded = fastify.jwt.verify(token);
        userId = decoded.userId;
      } catch {
        socket.close(4401, 'Authentication failed');
        return;
      }

      if (!wsClients.has(userId)) {
        wsClients.set(userId, new Set());
      }
      wsClients.get(userId).add(socket);

      fastify.log.info({ userId }, 'WebSocket client connected');

      // Keepalive: respond to pings from the client
      socket.on('ping', () => {
        socket.pong();
      });

      socket.on('message', (raw) => {
        const now = Date.now();
        messageTimestamps.push(now);
        while (messageTimestamps.length > 0 && (now - messageTimestamps[0]) > WS_MESSAGE_RATE_LIMIT_WINDOW_MS) {
          messageTimestamps.shift();
        }

        if (messageTimestamps.length > WS_MESSAGE_RATE_LIMIT_MAX) {
          fastify.log.warn({ userId }, 'WebSocket rate limit exceeded');
          socket.close(4408, 'Rate limit exceeded');
          return;
        }

        try {
          const { event } = JSON.parse(raw.toString());
          if (event === 'ping') {
            socket.send(JSON.stringify({ event: 'pong', data: null }));
          }
        } catch {
          // Ignore malformed messages
        }
      });

      socket.on('close', () => {
        const connections = wsClients.get(userId);
        if (connections) {
          connections.delete(socket);
          if (connections.size === 0) {
            wsClients.delete(userId);
          }
        }
        fastify.log.info({ userId }, 'WebSocket client disconnected');
      });
    });
  });
}

export default fp(websocketPlugin, { name: 'websocket', dependencies: [] });
