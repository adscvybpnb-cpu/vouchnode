import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageProvider {
  upload(file: Buffer, folder: string, filename: string): Promise<{ url: string; key: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string): Promise<string>;
  read(key: string): Promise<{ file: Buffer; contentType: string }>;
}

export interface S3StorageOptions {
  bucket: string;
  kycBucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
  endpoint?: string;
  region?: string;
}

export interface CloudinaryStorageOptions {
  url: string;
}

interface CloudinaryStorageKey {
  publicId: string;
  resourceType: 'image' | 'raw' | 'video';
  deliveryType: 'upload' | 'authenticated';
  format: string;
  contentType: string;
}

function parseCloudinaryUrl(cloudinaryUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(cloudinaryUrl);
    const cloudName = parsed.hostname;
    const apiKey = decodeURIComponent(parsed.username);
    const apiSecret = decodeURIComponent(parsed.password);
    if (
      parsed.protocol !== 'cloudinary:' ||
      !cloudName ||
      !apiKey ||
      !apiSecret ||
      parsed.pathname !== '' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error('CLOUDINARY_URL must include only Cloudinary server credentials');
    }
    return { cloudName, apiKey, apiSecret };
  } catch {
    throw new Error('CLOUDINARY_URL is invalid or incomplete');
  }
}

function encodeCloudinaryKey(key: CloudinaryStorageKey) {
  return `cld1.${Buffer.from(JSON.stringify(key)).toString('base64url')}`;
}

function decodeCloudinaryKey(key: string): CloudinaryStorageKey {
  if (!key.startsWith('cld1.') || key.length > 4096) throw new Error('Invalid Cloudinary storage key');
  try {
    const value = JSON.parse(Buffer.from(key.slice(5), 'base64url').toString('utf8')) as Partial<CloudinaryStorageKey>;
    if (
      typeof value.publicId !== 'string' || !value.publicId ||
      !['image', 'raw', 'video'].includes(value.resourceType || '') ||
      !['upload', 'authenticated'].includes(value.deliveryType || '') ||
      (value.deliveryType === 'authenticated' && !value.publicId.startsWith('kyc/')) ||
      typeof value.format !== 'string' || !value.format ||
      typeof value.contentType !== 'string' || !value.contentType
    ) {
      throw new Error('Invalid Cloudinary storage key');
    }
    return value as CloudinaryStorageKey;
  } catch {
    throw new Error('Invalid Cloudinary storage key');
  }
}

function contentTypeForFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.pdf': 'application/pdf',
  };
  return types[extension] || 'application/octet-stream';
}

export class CloudinaryStorageProvider implements StorageProvider {
  constructor(private readonly options: CloudinaryStorageOptions, private readonly urlPrefix = '/uploads') {
    const credentials = parseCloudinaryUrl(options.url);
    cloudinary.config({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      secure: true,
    });
  }

  async upload(file: Buffer, folder: string, filename: string) {
    const safeFolder = folder.split(/[\\/]/).map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
    const isKyc = safeFolder[0] === 'kyc';
    const contentType = contentTypeForFilename(filename);
    const resourceType = contentType === 'application/pdf' ? 'raw'
      : contentType.startsWith('video/') ? 'video' : 'image';
    const assetName = `${randomUUID()}-${path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const publicId = safeFolder.length ? path.posix.join(...safeFolder, assetName) : assetName;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        public_id: publicId,
        resource_type: resourceType,
        type: isKyc ? 'authenticated' : 'upload',
        overwrite: false,
        unique_filename: false,
        use_filename: false,
        discard_original_filename: true,
      }, (error, uploaded) => {
        if (error) reject(error);
        else if (!uploaded) reject(new Error('Cloudinary upload returned no result'));
        else resolve(uploaded);
      });
      Readable.from(file).pipe(stream);
    });

    const key = encodeCloudinaryKey({
      publicId: result.public_id,
      resourceType: result.resource_type as CloudinaryStorageKey['resourceType'],
      deliveryType: isKyc ? 'authenticated' : 'upload',
      format: result.format,
      contentType,
    });
    const url = isKyc
      ? `${this.urlPrefix.replace(/\/$/, '')}/${encodeURIComponent(key)}`
      : result.secure_url;
    return { url, key };
  }

  async delete(key: string) {
    const asset = decodeCloudinaryKey(key);
    const result = await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      type: asset.deliveryType,
      invalidate: true,
    });
    if (!['ok', 'not found'].includes(result.result)) {
      throw new Error(`Cloudinary delete failed: ${result.result}`);
    }
  }

  async getSignedUrl(key: string) {
    const asset = decodeCloudinaryKey(key);
    return cloudinary.utils.private_download_url(asset.publicId, asset.format, {
      resource_type: asset.resourceType,
      type: asset.deliveryType,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
  }

  async read(key: string) {
    const asset = decodeCloudinaryKey(key);
    if (asset.deliveryType !== 'authenticated') {
      throw new Error('Only private Cloudinary assets can be read through storage');
    }
    const response = await fetch(await this.getSignedUrl(key), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Cloudinary read failed with HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 50 * 1024 * 1024) {
      throw new Error('Cloudinary asset exceeds the maximum allowed read size');
    }
    const file = Buffer.from(await response.arrayBuffer());
    if (file.length > 50 * 1024 * 1024) throw new Error('Cloudinary asset exceeds the maximum allowed read size');
    return { file, contentType: asset.contentType };
  }
}

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootPath: string, private readonly urlPrefix = '/uploads') {}

  async upload(file: Buffer, folder: string, filename: string) {
    const safeFolder = folder.split('/').map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
    const safeFilename = `${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const directory = path.resolve(this.rootPath, ...safeFolder);
    await fs.promises.mkdir(directory, { recursive: true });
    const key = path.join(...safeFolder, safeFilename).replace(/\\/g, '/');
    const filePath = path.join(directory, safeFilename);
    try {
      await fs.promises.writeFile(filePath, file, { flag: 'wx' });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        await fs.promises.rm(filePath, { force: true });
      }
      throw error;
    }
    return { url: `${this.urlPrefix}/${key}`, key };
  }

  async delete(key: string) {
    const resolvedRoot = path.resolve(this.rootPath);
    const resolvedFile = path.resolve(resolvedRoot, key);
    if (resolvedFile === resolvedRoot || !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error('Invalid storage key');
    }
    await fs.promises.rm(resolvedFile, { force: true });
  }

  async getSignedUrl(key: string) {
    return `${this.urlPrefix}/${key}`;
  }

  async read(key: string) {
    const resolvedRoot = path.resolve(this.rootPath);
    const resolvedFile = path.resolve(resolvedRoot, key);
    if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error('Invalid storage key');
    }
    const extension = path.extname(resolvedFile).toLowerCase();
    const contentType = extension === '.pdf' ? 'application/pdf'
      : extension === '.png' ? 'image/png'
        : extension === '.webp' ? 'image/webp'
          : 'image/jpeg';
    return { file: fs.readFileSync(resolvedFile), contentType };
  }
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions, private readonly privateUrlPrefix = '/uploads') {
    this.client = new S3Client({
      endpoint: options.endpoint || undefined,
      region: options.region || 'us-east-1',
      forcePathStyle: Boolean(options.endpoint),
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    });
  }

  private isPrivateKey(key: string) {
    return key === 'kyc' || key.startsWith('kyc/');
  }

  private bucketForKey(key: string) {
    return this.isPrivateKey(key) ? this.options.kycBucket : this.options.bucket;
  }

  private normalizeKey(key: string) {
    const normalized = path.posix.normalize(key.replace(/\\/g, '/')).replace(/^\/+/, '');
    if (!normalized || normalized === '.' || normalized.startsWith('../')) {
      throw new Error('Invalid storage key');
    }
    return normalized;
  }

  async upload(file: Buffer, folder: string, filename: string) {
    const safeFolder = folder.split(/[\\/]/).map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
    const safeFilename = `${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const key = this.normalizeKey(path.posix.join(...safeFolder, safeFilename));
    const extension = path.extname(safeFilename).toLowerCase();
    const contentType = extension === '.pdf' ? 'application/pdf'
      : extension === '.png' ? 'image/png'
        : extension === '.webp' ? 'image/webp'
          : extension === '.gif' ? 'image/gif'
            : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
              : 'application/octet-stream';

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketForKey(key),
      Key: key,
      Body: file,
      ContentType: contentType,
    }));

    const url = this.isPrivateKey(key)
      ? `${this.privateUrlPrefix.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
      : `${this.options.publicUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    return { url, key };
  }

  async delete(key: string) {
    const safeKey = this.normalizeKey(key);
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucketForKey(safeKey),
      Key: safeKey,
    }));
  }

  async getSignedUrl(key: string) {
    const safeKey = this.normalizeKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucketForKey(safeKey),
      Key: safeKey,
    }), { expiresIn: 300 });
  }

  async read(key: string) {
    const safeKey = this.normalizeKey(key);
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.bucketForKey(safeKey),
      Key: safeKey,
    }));
    if (!result.Body) throw new Error('Stored object has no content');
    return {
      file: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType || 'application/octet-stream',
    };
  }
}

export function createStorageProvider(
  provider: string,
  localPath = './public/uploads',
  urlPrefix = '/uploads',
  s3Options?: Partial<S3StorageOptions>,
  cloudinaryOptions?: Partial<CloudinaryStorageOptions>,
): StorageProvider {
  if (provider === 'local') return new LocalStorageProvider(localPath, urlPrefix);

  if (provider === 'cloudinary') {
    if (!cloudinaryOptions?.url) throw new Error('Cloudinary storage configuration was not provided');
    return new CloudinaryStorageProvider({ url: cloudinaryOptions.url }, urlPrefix);
  }

  if (provider === 's3') {
    if (!s3Options) throw new Error('S3 storage configuration was not provided');

    const missing = [
      ['S3_BUCKET', s3Options.bucket],
      ['S3_KYC_BUCKET', s3Options.kycBucket],
      ['S3_ACCESS_KEY', s3Options.accessKey],
      ['S3_SECRET_KEY', s3Options.secretKey],
      ['S3_PUBLIC_URL', s3Options.publicUrl],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`S3 storage is missing required configuration: ${missing.join(', ')}`);
    }

    const { bucket, kycBucket, accessKey, secretKey, publicUrl } = s3Options;
    if (!bucket || !kycBucket || !accessKey || !secretKey || !publicUrl) {
      throw new Error('S3 storage configuration is incomplete');
    }

    return new S3StorageProvider({
      bucket,
      kycBucket,
      accessKey,
      secretKey,
      publicUrl,
      endpoint: s3Options.endpoint,
      region: s3Options.region,
    }, urlPrefix);
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}
