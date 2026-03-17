import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from '../helpers.js';

let app;
let baseUrl;

function once(target, event) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.off?.(event, handleEvent);
      target.off?.('error', handleError);
    };
    const handleEvent = (...args) => {
      cleanup();
      resolve(args);
    };
    const handleError = (err) => {
      cleanup();
      reject(err);
    };

    target.once(event, handleEvent);
    target.once('error', handleError);
  });
}

beforeEach(async () => {
  app = await createApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  baseUrl = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('WebSocket hardening', () => {
  it('closes connections that exceed the message rate limit', async () => {
    const token = app.jwt.sign({ userId: 'ws-user-1', roles: ['student'] }, { expiresIn: '15m' });
    const socket = new WebSocket(`${baseUrl}/ws?token=${encodeURIComponent(token)}`);

    await once(socket, 'open');

    const closePromise = once(socket, 'close');
    for (let index = 0; index < 61; index += 1) {
      socket.send(JSON.stringify({ event: 'ping', data: { index } }));
    }

    const [code] = await closePromise;
    expect(code).toBe(4408);
  });
});
