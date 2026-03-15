import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../helpers.js';

let app;

beforeEach(async () => {
  app = await createApp();
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('API documentation', () => {
  it('serves the generated OpenAPI document with inferred route metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs/json',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths['/api/v1/health']).toBeDefined();
    expect(body.paths['/api/v1/users/me'].patch.requestBody).toBeDefined();
    expect(body.paths['/api/v1/courses/'].get.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'search', in: 'query' }),
      expect.objectContaining({ name: 'page', in: 'query' }),
    ]));
    expect(body.paths['/api/v1/images/'].post.requestBody).toBeDefined();
    expect(body.paths['/api/v1/courses/{id}/video/api-options'].patch.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'id', in: 'path' }),
    ]));
    expect(body.paths['/api/v1/courses/{id}/video/api-options'].patch.tags).toContain('Video');
  });
});
