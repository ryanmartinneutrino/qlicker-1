import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

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
  nodeEnv,
};
