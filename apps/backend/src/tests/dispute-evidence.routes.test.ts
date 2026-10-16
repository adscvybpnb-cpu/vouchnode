import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disputeFindUnique: vi.fn(),
  evidenceCreate: vi.fn(),
  storageUpload: vi.fn(),
  storageDelete: vi.fn(),
  userId: 'buyer-1',
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    dispute: { findUnique: mocks.disputeFindUnique },
    disputeEvidence: { create: mocks.evidenceCreate },
  },
}));

vi.mock('../middleware/auth.middleware', () => ({
  authenticate: async (request: { user?: { id: string } }) => {
    request.user = { id: mocks.userId };
  },
}));

vi.mock('../services/dispute.service', () => ({
  DisputeService: { escalateDispute: vi.fn() },
}));

vi.mock('../repositories/dispute.repository', () => ({
  DisputeRepository: { findForUser: vi.fn(), findById: vi.fn() },
}));

vi.mock('../integrations/storage/storage.provider', () => ({
  createStorageProvider: vi.fn(() => ({
    upload: mocks.storageUpload,
    delete: mocks.storageDelete,
  })),
}));

import disputeRoutes from '../routes/dispute.routes';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nXcAAAAASUVORK5CYII=',
  'base64',
);

function multipartPayload(fields: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }>) {
  const boundary = 'dispute-evidence-test-boundary';
  const chunks: Buffer[] = [];
  for (const field of fields) {
    const disposition = field.filename
      ? `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\nContent-Type: ${field.contentType || 'application/octet-stream'}\r\n\r\n`
      : `Content-Disposition: form-data; name="${field.name}"\r\n\r\n`;
    chunks.push(Buffer.from(`--${boundary}\r\n${disposition}`));
    chunks.push(Buffer.isBuffer(field.value) ? field.value : Buffer.from(field.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    boundary,
    payload: Buffer.concat(chunks),
  };
}

describe('dispute evidence upload route', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.userId = 'buyer-1';
    mocks.disputeFindUnique.mockResolvedValue({
      id: 'dispute-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
    });
    mocks.storageUpload.mockResolvedValue({
      url: 'https://media.example.test/disputes/evidence.png',
      key: 'disputes/dispute-1/evidence.png',
    });
    mocks.storageDelete.mockResolvedValue(undefined);
    mocks.evidenceCreate.mockResolvedValue({
      id: 'evidence-1',
      disputeId: 'dispute-1',
      uploadedBy: 'buyer-1',
      fileUrl: 'https://media.example.test/disputes/evidence.png',
      fileName: 'proof.png',
      fileType: 'image/png',
      fileSize: image.length,
      description: 'Order proof',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    app = Fastify();
    await app.register(multipart);
    await app.register(disputeRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it('stores and returns a valid evidence image for a dispute participant', async () => {
    const { boundary, payload } = multipartPayload([
      { name: 'file', value: image, filename: 'proof.png', contentType: 'image/png' },
      { name: 'description', value: 'Order proof' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/dispute-1/evidence',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      id: 'evidence-1',
      disputeId: 'dispute-1',
      fileUrl: 'https://media.example.test/disputes/evidence.png',
    });
    expect(mocks.storageUpload).toHaveBeenCalledWith(
      image,
      'disputes/dispute-1',
      expect.stringMatching(/proof\.png$/),
    );
    expect(mocks.evidenceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        disputeId: 'dispute-1',
        uploadedBy: 'buyer-1',
        fileType: 'image/png',
        description: 'Order proof',
      }),
    });
  });

  it('does not allow users outside the dispute to upload evidence', async () => {
    mocks.userId = 'unrelated-user';
    const { boundary, payload } = multipartPayload([
      { name: 'file', value: image, filename: 'proof.png', contentType: 'image/png' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/dispute-1/evidence',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(mocks.evidenceCreate).not.toHaveBeenCalled();
  });

  it('removes the uploaded object and returns a service error if saving evidence fails', async () => {
    mocks.evidenceCreate.mockRejectedValue(new Error('Database unavailable'));
    const { boundary, payload } = multipartPayload([
      { name: 'file', value: image, filename: 'proof.png', contentType: 'image/png' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/dispute-1/evidence',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(503);
    expect(mocks.storageDelete).toHaveBeenCalledWith('disputes/dispute-1/evidence.png');
  });
});
