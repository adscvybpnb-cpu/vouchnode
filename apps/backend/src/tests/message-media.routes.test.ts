import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canAccessConversation: vi.fn(),
  storageUpload: vi.fn(),
  userId: 'buyer-1',
}));

vi.mock('../services/message.service', () => ({
  MessageService: {
    getConversations: vi.fn(),
    startConversation: vi.fn(),
    getMessages: vi.fn(),
    canAccessConversation: mocks.canAccessConversation,
    sendMessage: vi.fn(),
    markRead: vi.fn(),
  },
}));

vi.mock('../middleware/auth.middleware', () => ({
  authenticate: async (request: { user?: { id: string } }) => {
    request.user = { id: mocks.userId };
  },
}));

vi.mock('../integrations/storage/storage.provider', () => ({
  createStorageProvider: vi.fn(() => ({
    upload: mocks.storageUpload,
  })),
}));

import messageRoutes from '../routes/message.routes';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nXcAAAAASUVORK5CYII=',
  'base64',
);

function multipartPayload() {
  const boundary = 'chat-media-test-boundary';
  return {
    boundary,
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.png"\r\nContent-Type: image/png\r\n\r\n`),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

describe('chat media upload route', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.userId = 'buyer-1';
    mocks.canAccessConversation.mockResolvedValue(true);
    mocks.storageUpload.mockResolvedValue({
      url: 'https://media.example.test/chat-evidence/proof.png',
      key: 'chat-evidence/buyer-1/proof.png',
    });

    app = Fastify();
    await app.register(multipart);
    await app.register(messageRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it('uploads valid media and preserves ADMIN_ONLY visibility', async () => {
    const { boundary, payload } = multipartPayload();
    const response = await app.inject({
      method: 'POST',
      url: '/conversations/conversation-1/media?visibility=ADMIN_ONLY',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      fileUrl: 'https://media.example.test/chat-evidence/proof.png',
      messageType: 'IMAGE',
      visibility: 'ADMIN_ONLY',
    });
    expect(mocks.storageUpload).toHaveBeenCalledWith(
      image,
      'chat-evidence/buyer-1',
      expect.stringMatching(/proof\.png$/),
    );
  });

  it('returns a service error rather than an unhandled 500 when storage fails', async () => {
    mocks.storageUpload.mockRejectedValue(new Error('Storage provider unavailable'));
    const { boundary, payload } = multipartPayload();

    const response = await app.inject({
      method: 'POST',
      url: '/conversations/conversation-1/media?visibility=ADMIN_ONLY',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().message).toBe('Media upload is temporarily unavailable. Please try again.');
  });

  it('rejects invalid image bytes despite an image content type', async () => {
    const boundary = 'chat-media-test-boundary';
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake.png"\r\nContent-Type: image/png\r\n\r\nnot an image\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/conversations/conversation-1/media',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(415);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });
});
