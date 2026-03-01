import fp from 'fastify-plugin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMeteorId } from '../utils/meteorId.js';
import Settings from '../models/Settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

async function uploadPlugin(fastify) {
  await fastify.register(import('@fastify/multipart'), {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // Ensure uploads directory exists for local storage
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  let cachedConfig = null;
  let cacheTime = 0;
  const CACHE_TTL_MS = 30000; // 30 seconds

  async function getStorageConfig() {
    const now = Date.now();
    if (cachedConfig && (now - cacheTime) < CACHE_TTL_MS) {
      return cachedConfig;
    }
    const settings = await Settings.findOne();
    cachedConfig = {
      storageType: settings?.storageType || 'local',
      AWS_bucket: settings?.AWS_bucket || '',
      AWS_region: settings?.AWS_region || '',
      AWS_accessKeyId: settings?.AWS_accessKeyId || '',
      AWS_secretAccessKey: settings?.AWS_secretAccessKey || '',
      Azure_storageAccount: settings?.Azure_storageAccount || '',
      Azure_storageAccessKey: settings?.Azure_storageAccessKey || '',
      Azure_storageContainer: settings?.Azure_storageContainer || '',
    };
    cacheTime = now;
    return cachedConfig;
  }

  async function uploadFile(fileBuffer, filename, mimetype) {
    const config = await getStorageConfig();
    switch (config.storageType) {
      case 'local': {
        const ext = path.extname(filename);
        const key = `${generateMeteorId()}${ext}`;
        const filePath = path.join(UPLOADS_DIR, key);
        await fs.promises.writeFile(filePath, fileBuffer);
        const url = `/uploads/${key}`;
        return { url, key };
      }
      case 's3':
        // TODO: Implement S3 upload using @aws-sdk/client-s3
        throw new Error('S3 storage not yet implemented. Install @aws-sdk/client-s3 and implement S3 upload logic.');
      case 'azure':
        // TODO: Implement Azure Blob upload using @azure/storage-blob
        throw new Error('Azure storage not yet implemented. Install @azure/storage-blob and implement Azure upload logic.');
      default:
        throw new Error(`Unknown storage type: ${config.storageType}`);
    }
  }

  async function deleteFile(key) {
    const config = await getStorageConfig();
    switch (config.storageType) {
      case 'local': {
        const filePath = path.join(UPLOADS_DIR, key);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
        return;
      }
      case 's3':
        throw new Error('S3 storage not yet implemented. Install @aws-sdk/client-s3 and implement S3 deletion logic.');
      case 'azure':
        throw new Error('Azure storage not yet implemented. Install @azure/storage-blob and implement Azure deletion logic.');
      default:
        throw new Error(`Unknown storage type: ${config.storageType}`);
    }
  }

  fastify.decorate('uploadFile', uploadFile);
  fastify.decorate('deleteFile', deleteFile);
  fastify.decorate('uploadsDir', UPLOADS_DIR);
}

export default fp(uploadPlugin, { name: 'upload' });
