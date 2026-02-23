import { randomBytes } from 'crypto'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { BlobServiceClient } from '@azure/storage-blob'
import type { Settings } from '@qlicker/shared'

const LOCAL_PREFIX = 'local:'
const AWS_PREFIX = 'aws:'
const AZURE_PREFIX = 'azure:'

function getSafeExtension(filename: string): string {
  const ext = path.extname(filename || '').toLowerCase()
  if (!ext || ext.length > 8) return ''
  return ext.replace(/[^a-z0-9.]/g, '')
}

function makeObjectId(originalName: string): string {
  const extension = getSafeExtension(originalName)
  return `${Date.now()}-${randomBytes(8).toString('hex')}${extension}`
}

export function resolveUploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')
}

async function storeLocal(buffer: Buffer, objectName: string): Promise<{ uid: string; url: string }> {
  const uploadsDir = resolveUploadsDir()
  await mkdir(uploadsDir, { recursive: true })
  const diskPath = path.join(uploadsDir, objectName)
  await writeFile(diskPath, buffer)
  return {
    uid: `${LOCAL_PREFIX}${objectName}`,
    url: `/uploads/${objectName}`,
  }
}

async function storeAws(buffer: Buffer, objectName: string, settings: Settings): Promise<{ uid: string; url: string }> {
  if (!settings.AWS_bucket || !settings.AWS_region || !settings.AWS_accessKey || !settings.AWS_secret) {
    throw new Error('AWS storage is enabled but AWS settings are incomplete.')
  }

  const client = new S3Client({
    region: settings.AWS_region,
    credentials: {
      accessKeyId: settings.AWS_accessKey,
      secretAccessKey: settings.AWS_secret,
    },
  })

  const key = `qlicker/images/${objectName}`
  await client.send(
    new PutObjectCommand({
      Bucket: settings.AWS_bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/octet-stream',
      ACL: 'public-read',
    })
  )

  return {
    uid: `${AWS_PREFIX}${key}`,
    url: `https://${settings.AWS_bucket}.s3.${settings.AWS_region}.amazonaws.com/${key}`,
  }
}

async function storeAzure(buffer: Buffer, objectName: string, settings: Settings): Promise<{ uid: string; url: string }> {
  if (!settings.Azure_accountName || !settings.Azure_accountKey || !settings.Azure_containerName) {
    throw new Error('Azure storage is enabled but Azure settings are incomplete.')
  }

  const connectionString =
    `DefaultEndpointsProtocol=https;AccountName=${settings.Azure_accountName};` +
    `AccountKey=${settings.Azure_accountKey};EndpointSuffix=core.windows.net`
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(settings.Azure_containerName)
  await containerClient.createIfNotExists({ access: 'blob' })

  const blobName = `qlicker/images/${objectName}`
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
  })

  return {
    uid: `${AZURE_PREFIX}${blobName}`,
    url: blockBlobClient.url,
  }
}

export async function storeImage(
  file: { buffer: Buffer; originalname: string },
  settings: Settings | null
): Promise<{ uid: string; url: string }> {
  const objectName = makeObjectId(file.originalname)
  const storageType = (settings?.storageType || 'Local').toLowerCase()

  if (storageType === 'aws') return storeAws(file.buffer, objectName, settings as Settings)
  if (storageType === 'azure') return storeAzure(file.buffer, objectName, settings as Settings)
  return storeLocal(file.buffer, objectName)
}

export async function deleteStoredImage(uid: string, settings: Settings | null): Promise<void> {
  if (!uid) return

  if (uid.startsWith(LOCAL_PREFIX)) {
    const uploadsDir = resolveUploadsDir()
    const objectName = uid.slice(LOCAL_PREFIX.length)
    const diskPath = path.join(uploadsDir, objectName)
    await unlink(diskPath).catch(() => undefined)
    return
  }

  if (uid.startsWith(AWS_PREFIX)) {
    if (!settings?.AWS_bucket || !settings.AWS_region || !settings.AWS_accessKey || !settings.AWS_secret) return
    const key = uid.slice(AWS_PREFIX.length)
    const client = new S3Client({
      region: settings.AWS_region,
      credentials: {
        accessKeyId: settings.AWS_accessKey,
        secretAccessKey: settings.AWS_secret,
      },
    })
    await client.send(new DeleteObjectCommand({ Bucket: settings.AWS_bucket, Key: key }))
    return
  }

  if (uid.startsWith(AZURE_PREFIX)) {
    if (!settings?.Azure_accountName || !settings.Azure_accountKey || !settings.Azure_containerName) return
    const blobName = uid.slice(AZURE_PREFIX.length)
    const connectionString =
      `DefaultEndpointsProtocol=https;AccountName=${settings.Azure_accountName};` +
      `AccountKey=${settings.Azure_accountKey};EndpointSuffix=core.windows.net`
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
    const containerClient = blobServiceClient.getContainerClient(settings.Azure_containerName)
    await containerClient.deleteBlob(blobName).catch(() => undefined)
  }
}
