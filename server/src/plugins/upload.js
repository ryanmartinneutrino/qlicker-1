import fp from 'fastify-plugin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMeteorId } from '../utils/meteorId.js';
import Settings from '../models/Settings.js';

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

  function ensureRequired(value, message) {
    if (!value || String(value).trim().length === 0) {
      throw createStorageConfigError(message);
    }
  }

  async function getStorageConfig() {
    const settings = await Settings.findOne();
    const storageType = normalizeStorageType(
      settings?.storageType || process.env.STORAGE_TYPE || fastify.config.storageType || 'local'
    );
    const awsEndpoint = settings?.AWS_endpoint
      || settings?.S3_endpoint
      || process.env.AWS_ENDPOINT
      || process.env.S3_ENDPOINT
      || '';
    const rawForcePathStyle = settings?.AWS_forcePathStyle
      ?? settings?.S3_forcePathStyle
      ?? process.env.AWS_FORCE_PATH_STYLE
      ?? process.env.S3_FORCE_PATH_STYLE;
    const defaultPathStyleForEndpoint = Boolean(awsEndpoint);
    const awsForcePathStyle = rawForcePathStyle === undefined
      || rawForcePathStyle === null
      || (typeof rawForcePathStyle === 'string' && rawForcePathStyle.trim() === '')
      ? defaultPathStyleForEndpoint
      : asBool(rawForcePathStyle, defaultPathStyleForEndpoint);

    return {
      storageType,
      AWS_bucket: settings?.AWS_bucket || process.env.AWS_BUCKET || '',
      AWS_region: settings?.AWS_region || process.env.AWS_REGION || 'us-east-1',
      AWS_accessKeyId: settings?.AWS_accessKeyId
        || settings?.AWS_accessKey
        || process.env.AWS_ACCESS_KEY_ID
        || process.env.AWS_ACCESS_KEY
        || '',
      AWS_secretAccessKey: settings?.AWS_secretAccessKey
        || settings?.AWS_secret
        || process.env.AWS_SECRET_ACCESS_KEY
        || process.env.AWS_SECRET
        || '',
      AWS_endpoint: awsEndpoint,
      AWS_forcePathStyle: awsForcePathStyle,
      Azure_storageAccount: settings?.Azure_storageAccount
        || settings?.Azure_accountName
        || process.env.AZURE_STORAGE_ACCOUNT
        || process.env.AZURE_ACCOUNT_NAME
        || '',
      Azure_storageAccessKey: settings?.Azure_storageAccessKey
        || settings?.Azure_accountKey
        || process.env.AZURE_STORAGE_ACCESS_KEY
        || process.env.AZURE_ACCOUNT_KEY
        || '',
      Azure_storageContainer: settings?.Azure_storageContainer
        || settings?.Azure_containerName
        || process.env.AZURE_STORAGE_CONTAINER
        || process.env.AZURE_CONTAINER_NAME
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

  function toS3ObjectUrl({
    bucket,
    region,
    key,
    endpoint,
    forcePathStyle,
  }) {
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    if (endpoint) {
      const baseEndpoint = endpoint.replace(/\/+$/, '');
      if (forcePathStyle) {
        return `${baseEndpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
      }
      const endpointUrl = new URL(baseEndpoint);
      const host = endpointUrl.host;
      const protocol = endpointUrl.protocol;
      return `${protocol}//${bucket}.${host}/${encodedKey}`;
    }

    return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
  }

  async function uploadFile(fileBuffer, filename, mimetype) {
    const config = await getStorageConfig();
    const ext = getFileExtension(filename, mimetype);
    const key = `${generateMeteorId()}${ext}`;

    switch (config.storageType) {
      case 'local': {
        const filePath = path.join(UPLOADS_DIR, key);
        await fs.promises.writeFile(filePath, fileBuffer);
        const url = `/uploads/${key}`;
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
          // Match legacy Meteor Slingshot behavior (acl: 'public-read').
          ACL: 'public-read',
        }));

        const url = toS3ObjectUrl({
          bucket: config.AWS_bucket,
          region: config.AWS_region || 'us-east-1',
          key,
          endpoint: config.AWS_endpoint,
          forcePathStyle: config.AWS_forcePathStyle,
        });
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

        return { url: blockBlobClient.url, key };
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

  fastify.decorate('uploadFile', uploadFile);
  fastify.decorate('deleteFile', deleteFile);
  fastify.decorate('uploadsDir', UPLOADS_DIR);
}

export default fp(uploadPlugin, { name: 'upload' });
