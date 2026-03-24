import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildApp } from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateFile = process.env.QCLICKER_E2E_STATE_FILE || '/tmp/qlicker-e2e-state.json';

let app;
let mongoServer;

async function writeStateFile(payload) {
  await fs.writeFile(stateFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function cleanup(exitCode = 0) {
  await fs.rm(stateFile, { force: true }).catch(() => {});
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
  if (mongoServer) {
    await mongoServer.stop().catch(() => {});
    mongoServer = null;
  }
  process.exit(exitCode);
}

async function start() {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  const port = Number.parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '127.0.0.1';
  const rootUrl = process.env.ROOT_URL || 'http://127.0.0.1:3000';

  app = await buildApp({
    logger: false,
    config: {
      mongoUri,
      port,
      host,
      rootUrl,
      nodeEnv: 'test',
      disableRateLimits: true,
      jwtSecret: process.env.JWT_SECRET || 'e2e-secret',
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret',
    },
  });

  await app.listen({ port, host });

  await writeStateFile({
    mongoUri,
    serverBaseUrl: `http://${host}:${port}`,
    docsUrl: `http://${host}:${port}/docs`,
    uploadsDir: app.uploadsDir,
    rootUrl,
  });

  console.log(`Qlicker E2E server ready at http://${host}:${port}`);
}

process.on('SIGINT', () => { cleanup(0); });
process.on('SIGTERM', () => { cleanup(0); });
process.on('uncaughtException', async (err) => {
  console.error(err);
  await cleanup(1);
});
process.on('unhandledRejection', async (err) => {
  console.error(err);
  await cleanup(1);
});

start().catch(async (err) => {
  console.error(err);
  await cleanup(1);
});
