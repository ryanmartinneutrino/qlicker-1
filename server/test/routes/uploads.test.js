import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../helpers.js';

let app;

beforeEach(async (ctx) => {
  if (mongoose.connection.readyState !== 1) {
    ctx.skip();
    return;
  }
  app = await createApp();
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('GET /uploads/*', () => {
  it('serves a proxied upload using the decoded storage key', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const getFileObject = vi.fn(async (key) => ({
      buffer: Buffer.from('image-bytes'),
      contentType: 'image/png',
    }));
    app.getFileObject = getFileObject;

    const res = await app.inject({
      method: 'GET',
      url: '/uploads/legacy-folder/my%20image.png',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(getFileObject).toHaveBeenCalledWith('legacy-folder/my image.png');
  });

  it('rejects traversal-style keys', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const res = await app.inject({
      method: 'GET',
      url: '/uploads/%2E%2E%2Fsecret.png',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the storage backend reports a missing object', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    app.getFileObject = vi.fn(async () => {
      const err = new Error('Not found');
      err.name = 'NoSuchKey';
      throw err;
    });

    const res = await app.inject({
      method: 'GET',
      url: '/uploads/missing.png',
    });

    expect(res.statusCode).toBe(404);
  });
});
