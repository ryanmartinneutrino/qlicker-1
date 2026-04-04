# Developer Documentation

This section collects the developer-facing documentation needed for phase 8.

## Core guides

- [Application architecture overview](architecture.md)
- [Database and data model](data-model.md)
- [Development guide](development-guide.md)
- [Grading developer notes](grading.md)
- [API reference and OpenAPI workflow](../api-reference.md)
- [LLM and MCP integration notes](llm-mcp-integration.md)

## Also important

- [Repository README](../../README.md)
- [Coding standards](../../CODING_STANDARDS.md)
- [Migration plan and phase checklist](../../MIGRATION.md)
- [Legacy DB compatibility notes](../../LEGACY_DB.md)
- [Production deployment guide](../../production_setup/README.md)

## Verified build and test commands

```bash
cd server && npm test
cd client && npm test
cd client && npm run build
```

The repository also includes Playwright E2E coverage via `./scripts/qlicker.sh e2e` or `cd client && npm run test:e2e`.
