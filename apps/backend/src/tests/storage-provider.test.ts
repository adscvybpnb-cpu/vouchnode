import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStorageProvider, LocalStorageProvider, S3StorageProvider } from '../integrations/storage/storage.provider';

describe('LocalStorageProvider', () => {
  let rootPath: string | undefined;

  afterEach(async () => {
    if (rootPath) await rm(rootPath, { recursive: true, force: true });
    rootPath = undefined;
  });

  it('creates a missing upload directory and removes an uploaded file', async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'vouchnode-avatar-'));
    const storage = new LocalStorageProvider(rootPath);
    const uploaded = await storage.upload(Buffer.from('avatar'), 'avatars/user-1', 'avatar.png');

    await expect(readFile(path.join(rootPath, uploaded.key))).resolves.toEqual(Buffer.from('avatar'));
    await storage.delete(uploaded.key);
    await expect(readFile(path.join(rootPath, uploaded.key))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects deleting files outside the storage root', async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'vouchnode-avatar-'));
    const storage = new LocalStorageProvider(rootPath);

    await expect(storage.delete('..\\outside.png')).rejects.toThrow('Invalid storage key');
  });
});

describe('S3StorageProvider', () => {
  let server: Server;
  let endpoint: string;
  const requests: Array<{ method?: string; url?: string; contentType?: string }> = [];

  beforeEach(async () => {
    requests.length = 0;
    server = createServer((request, response) => {
      requests.push({
        method: request.method,
        url: request.url,
        contentType: request.headers['content-type'],
      });
      if (request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/pdf' });
        response.end(Buffer.from('private document'));
      } else {
        request.resume();
        request.on('end', () => {
          response.writeHead(request.method === 'DELETE' ? 204 : 200);
          response.end();
        });
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('stores public assets and private KYC documents in separate buckets', async () => {
    const storage = new S3StorageProvider({
      endpoint,
      region: 'us-east-1',
      bucket: 'public-media',
      kycBucket: 'private-kyc',
      accessKey: 'test-access',
      secretKey: 'test-secret',
      publicUrl: 'https://cdn.example.test',
    }, '/api/v1/sellers/kyc-documents');

    const image = await storage.upload(Buffer.from('image'), 'products/user-1', 'listing.png');
    expect(image.url).toMatch(/^https:\/\/cdn\.example\.test\/products\/user-1\/.+-listing\.png$/);
    expect(requests[0].url).toContain('/public-media/products/user-1/');
    expect(requests[0].contentType).toBe('image/png');

    const kyc = await storage.upload(Buffer.from('document'), 'kyc/user-1', 'front.pdf');
    expect(kyc.url).toMatch(/^\/api\/v1\/sellers\/kyc-documents\/kyc\/user-1\/.+-front\.pdf$/);
    expect(requests[1].url).toContain('/private-kyc/kyc/user-1/');
    expect(requests[1].contentType).toBe('application/pdf');

    await expect(storage.read(kyc.key)).resolves.toEqual({
      file: Buffer.from('private document'),
      contentType: 'application/pdf',
    });
    expect(requests[2].url).toContain('/private-kyc/kyc/user-1/');

    await storage.delete(kyc.key);
    expect(requests[3].method).toBe('DELETE');
    expect(requests[3].url).toContain('/private-kyc/kyc/user-1/');
  });

  it('requires all S3 settings instead of silently falling back to local disk', () => {
    expect(() => createStorageProvider('s3')).toThrow('S3 storage configuration was not provided');
    expect(() => createStorageProvider('s3', undefined, undefined, {
      bucket: 'public-media',
    })).toThrow('S3 storage is missing required configuration');
  });
});
