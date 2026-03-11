import fp from 'fastify-plugin';
import { WebSocket } from 'ws';

async function websocketPlugin(fastify) {
  await fastify.register(import('@fastify/websocket'));

  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const wsClients = new Map();

  function wsBroadcast(event, data) {
    const message = JSON.stringify({ event, data });
    for (const connections of wsClients.values()) {
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  }

  function wsSendToUser(userId, event, data) {
    const connections = wsClients.get(userId);
    if (!connections) return;
    const message = JSON.stringify({ event, data });
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
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
        try {
          const { event, data } = JSON.parse(raw.toString());
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

export default fp(websocketPlugin, { name: 'websocket' });
