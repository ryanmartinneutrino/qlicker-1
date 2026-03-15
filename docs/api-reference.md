# API Reference

Qlicker exposes interactive API documentation from the Fastify server.

## Local access

- Swagger UI: `/docs`
- OpenAPI JSON: `/docs/json`

When running the application locally:

1. Start the backend server.
2. Start the Vite frontend.
3. Open `http://localhost:3001/docs` for the backend-hosted API explorer.

## How the docs are generated

- `@fastify/swagger` generates the OpenAPI document.
- `@fastify/swagger-ui` serves the interactive explorer.
- Route JSON Schema definitions provide request/query/body documentation.
- Shared API-doc transforms infer common tags, auth metadata, and path parameters for existing routes.

## Updating docs with new routes

When adding or changing routes:

1. Add or update Fastify JSON Schema for request bodies and query strings.
2. Keep path parameters named in the route path (for example `/:id`).
3. Verify the result in `/docs` or `/docs/json`.
