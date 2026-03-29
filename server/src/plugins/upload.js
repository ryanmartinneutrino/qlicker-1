import fp from 'fastify-plugin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMeteorId } from '../utils/meteorId.js';
import { guessImageContentTypeFromKey, toUploadsUrl } from '../utils/storageUrls.js';
import { getOrCreateSettingsDocument } from '../utils/settingsSingleton.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const IMAGE_EXTENSIONS_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

async function uploadPlugin(fastify) {
  await fastify.register(import('@fastify/multipart'), {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // Ensure uploads directory exists for local storage
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  let s3ModulePromise = null;
  let azureModulePromise = null;

  function asBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return fallback;
  }

  function normalizeStorageType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 's3' || normalized === 'azure' || normalized === 'local') {
      return normalized;
    }
    return 'local';
  }

  function getFileExtension(filename, mimetype) {
    const fromName = path.extname(filename || '').toLowerCase();
    if (fromName && fromName.length <= 8) return fromName;
    return IMAGE_EXTENSIONS_BY_TYPE[mimetype] || '';
  }

  function createStorageConfigError(message) {
    const err = new Error(message);
    err.code = 'UPLOAD_CONFIG_ERROR';
    return err;
  }

  async function streamToBuffer(body) {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body.transformToByteArray === 'function') {
      return Buffer.from(await body.transformToByteArray());
    }

    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  function ensureRequired(value, message) {
    if (!value || String(value).trim().length === 0) {
      throw createStorageConfigError(message);
    }
  }

  async function getStorageConfig() {
    const settings = await getOrCreateSettingsDocument({ lean: true });
    const storageType = normalizeStorageType(
      settings?.storageType || 'local'
    );
    const awsEndpoint = settings?.AWS_endpoint || settings?.S3_endpoint || '';
    const rawForcePathStyle = settings?.AWS_forcePathStyle
      ?? settings?.S3_forcePathStyle
      ?? undefined;
    const defaultPathStyleForEndpoint = Boolean(awsEndpoint);
    const awsForcePathStyle = rawForcePathStyle === undefined
      || rawForcePathStyle === null
      || (typeof rawForcePathStyle === 'string' && rawForcePathStyle.trim() === '')
      ? defaultPathStyleForEndpoint
      : asBool(rawForcePathStyle, defaultPathStyleForEndpoint);

    return {
      storageType,
      AWS_bucket: settings?.AWS_bucket || '',
      AWS_region: settings?.AWS_region || 'us-east-1',
      AWS_accessKeyId: settings?.AWS_accessKeyId
        || settings?.AWS_accessKey
        || '',
      AWS_secretAccessKey: settings?.AWS_secretAccessKey
        || settings?.AWS_secret
        || '',
      AWS_endpoint: awsEndpoint,
      AWS_forcePathStyle: awsForcePathStyle,
      Azure_storageAccount: settings?.Azure_storageAccount
        || settings?.Azure_accountName
        || '',
      Azure_storageAccessKey: settings?.Azure_storageAccessKey
        || settings?.Azure_accountKey
        || '',
      Azure_storageContainer: settings?.Azure_storageContainer
        || settings?.Azure_containerName
        || '',
    };
  }

  async function loadS3Module() {
    if (!s3ModulePromise) {
      s3ModulePromise = import('@aws-sdk/client-s3');
    }
    return s3ModulePromise;
  }

  async function loadAzureModule() {
    if (!azureModulePromise) {
      azureModulePromise = import('@azure/storage-blob');
    }
    return azureModulePromise;
  }

  async function uploadFile(fileBuffer, filename, mimetype) {
    const config = await getStorageConfig();
    const ext = getFileExtension(filename, mimetype);
    const key = `${generateMeteorId()}${ext}`;

    switch (config.storageType) {
      case 'local': {
        const filePath = path.join(UPLOADS_DIR, key);
        await fs.promises.writeFile(filePath, fileBuffer);
        const url = toUploadsUrl(key);
        return { url, key };
      }
      case 's3': {
        ensureRequired(config.AWS_bucket, 'S3 storage requires AWS bucket.');
        ensureRequired(config.AWS_accessKeyId, 'S3 storage requires AWS access key ID.');
        ensureRequired(config.AWS_secretAccessKey, 'S3 storage requires AWS secret access key.');

        const { S3Client, PutObjectCommand } = await loadS3Module();
        const client = new S3Client({
          region: config.AWS_region || 'us-east-1',
          credentials: {
            accessKeyId: config.AWS_accessKeyId,
            secretAccessKey: config.AWS_secretAccessKey,
          },
          endpoint: config.AWS_endpoint || undefined,
          forcePathStyle: config.AWS_forcePathStyle,
        });
        await client.send(new PutObjectCommand({
          Bucket: config.AWS_bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: mimetype,
        }));

        const url = toUploadsUrl(key);
        return { url, key };
      }
      case 'azure': {
        ensureRequired(config.Azure_storageAccount, 'Azure storage requires account name.');
        ensureRequired(config.Azure_storageAccessKey, 'Azure storage requires account key.');
        ensureRequired(config.Azure_storageContainer, 'Azure storage requires container.');

        const { StorageSharedKeyCredential, BlobServiceClient } = await loadAzureModule();
        const credential = new StorageSharedKeyCredential(
          config.Azure_storageAccount,
          config.Azure_storageAccessKey
        );
        const blobServiceClient = new BlobServiceClient(
          `https://${config.Azure_storageAccount}.blob.core.windows.net`,
          credential
        );
        const containerClient = blobServiceClient.getContainerClient(config.Azure_storageContainer);
        await containerClient.createIfNotExists();

        const blockBlobClient = containerClient.getBlockBlobClient(key);
        await blockBlobClient.uploadData(fileBuffer, {
          blobHTTPHeaders: {
            blobContentType: mimetype,
          },
        });

        return { url: toUploadsUrl(key), key };
      }
      default:
        throw createStorageConfigError(`Unknown storage type: ${config.storageType}`);
    }
  }

  async function deleteFile(key) {
    if (!key) return;

    const config = await getStorageConfig();
    switch (config.storageType) {
      case 'local': {
        const filePath = path.join(UPLOADS_DIR, key);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
        return;
      }
      case 's3': {
        ensureRequired(config.AWS_bucket, 'S3 storage requires AWS bucket.');
        ensureRequired(config.AWS_accessKeyId, 'S3 storage requires AWS access key ID.');
        ensureRequired(config.AWS_secretAccessKey, 'S3 storage requires AWS secret access key.');

        const { S3Client, DeleteObjectCommand } = await loadS3Module();
        const client = new S3Client({
          region: config.AWS_region || 'us-east-1',
          credentials: {
            accessKeyId: config.AWS_accessKeyId,
            secretAccessKey: config.AWS_secretAccessKey,
          },
          endpoint: config.AWS_endpoint || undefined,
          forcePathStyle: config.AWS_forcePathStyle,
        });
        await client.send(new DeleteObjectCommand({
          Bucket: config.AWS_bucket,
          Key: key,
        }));
        return;
      }
      case 'azure': {
        ensureRequired(config.Azure_storageAccount, 'Azure storage requires account name.');
        ensureRequired(config.Azure_storageAccessKey, 'Azure storage requires account key.');
        ensureRequired(config.Azure_storageContainer, 'Azure storage requires container.');

        const { StorageSharedKeyCredential, BlobServiceClient } = await loadAzureModule();
        const credential = new StorageSharedKeyCredential(
          config.Azure_storageAccount,
          config.Azure_storageAccessKey
        );
        const blobServiceClient = new BlobServiceClient(
          `https://${config.Azure_storageAccount}.blob.core.windows.net`,
          credential
        );
        const containerClient = blobServiceClient.getContainerClient(config.Azure_storageContainer);
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        await blockBlobClient.deleteIfExists();
        return;
      }
      default:
        throw createStorageConfigError(`Unknown storage type: ${config.storageType}`);
    }
  }

  async function getFileObject(key) {
    if (!key) {
      throw createStorageConfigError('File key is required.');
    }

    const config = await getStorageConfig();
    switch (config.storageType) {
      case 'local': {
        const filePath = path.join(UPLOADS_DIR, key);
        const buffer = await fs.promises.readFile(filePath);
        return {
          buffer,
          contentType: guessImageContentTypeFromKey(key),
        };
      }
      case 's3': {
        ensureRequired(config.AWS_bucket, 'S3 storage requires AWS bucket.');
        ensureRequired(config.AWS_accessKeyId, 'S3 storage requires AWS access key ID.');
        ensureRequired(config.AWS_secretAccessKey, 'S3 storage requires AWS secret access key.');

        const { S3Client, GetObjectCommand } = await loadS3Module();
        const client = new S3Client({
          region: config.AWS_region || 'us-east-1',
          credentials: {
            accessKeyId: config.AWS_accessKeyId,
            secretAccessKey: config.AWS_secretAccessKey,
          },
          endpoint: config.AWS_endpoint || undefined,
          forcePathStyle: config.AWS_forcePathStyle,
        });
        const response = await client.send(new GetObjectCommand({
          Bucket: config.AWS_bucket,
          Key: key,
        }));
        return {
          buffer: await streamToBuffer(response.Body),
          contentType: response.ContentType || guessImageContentTypeFromKey(key),
        };
      }
      case 'azure': {
        ensureRequired(config.Azure_storageAccount, 'Azure storage requires account name.');
        ensureRequired(config.Azure_storageAccessKey, 'Azure storage requires account key.');
        ensureRequired(config.Azure_storageContainer, 'Azure storage requires container.');

        const { StorageSharedKeyCredential, BlobServiceClient } = await loadAzureModule();
        const credential = new StorageSharedKeyCredential(
          config.Azure_storageAccount,
          config.Azure_storageAccessKey
        );
        const blobServiceClient = new BlobServiceClient(
          `https://${config.Azure_storageAccount}.blob.core.windows.net`,
          credential
        );
        const containerClient = blobServiceClient.getContainerClient(config.Azure_storageContainer);
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        const response = await blockBlobClient.download();
        return {
          buffer: await streamToBuffer(response.readableStreamBody),
          contentType: response.contentType || guessImageContentTypeFromKey(key),
        };
      }
      default:
        throw createStorageConfigError(`Unknown storage type: ${config.storageType}`);
    }
  }

  async function getFileBuffer(key) {
    const { buffer } = await getFileObject(key);
    return buffer;
  }

  fastify.decorate('uploadFile', uploadFile);
  fastify.decorate('deleteFile', deleteFile);
  fastify.decorate('getFileObject', getFileObject);
  fastify.decorate('getFileBuffer', getFileBuffer);
  fastify.decorate('uploadsDir', UPLOADS_DIR);
}

export default fp(uploadPlugin, { name: 'upload' });
