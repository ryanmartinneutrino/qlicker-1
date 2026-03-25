import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const runtimeJwtSecret = crypto.randomBytes(32).toString('hex');
const runtimeJwtRefreshSecret = crypto.randomBytes(32).toString('hex');
const jwtSecret = process.env.JWT_SECRET || runtimeJwtSecret;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || runtimeJwtRefreshSecret;

function parseBooleanEnv(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

if (nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
  }
}

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/qlicker',
  jwtSecret,
  jwtRefreshSecret,
  rootUrl: process.env.ROOT_URL || 'http://localhost:3000',
  mailUrl: process.env.MAIL_URL || '',
  storageType: process.env.STORAGE_TYPE || 'local',
  redisUrl: process.env.REDIS_URL || '',
  nodeEnv,
  disableRateLimits: parseBooleanEnv(process.env.DISABLE_RATE_LIMITS)
    || parseBooleanEnv(process.env.RATE_LIMIT_DISABLED),
};
