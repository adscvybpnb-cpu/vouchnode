import { FastifyInstance } from 'fastify';
import { MessageService } from '../services/message.service';
import { authenticate } from '../middleware/auth.middleware';
import { config } from '../config';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { detectImageMimeType } from '../lib/image-signature';

const maxMediaSize = 50 * 1024 * 1024;

export default async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/conversations', async (req: any, res) => {
    return res.send(await MessageService.getConversations(req.user.id));
  });

  app.post('/conversations', async (req: any, res) => {
    const sellerId = typeof req.body?.sellerId === 'string' ? req.body.sellerId.trim() : '';
    if (!sellerId) return res.status(400).send({ message: 'Seller ID is required' });
    return res.status(201).send(await MessageService.startConversation(req.user.id, sellerId));
  });

  app.get('/conversations/:id/messages', async (req: any, res) => {
    try {
      return res.send(await MessageService.getMessages(req.params.id, req.user.id, req.user.adminAuth === true));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load messages';
      if (message === 'Conversation not found') return res.status(404).send({ message });
      if (message === 'Unauthorized') return res.status(403).send({ message });
      req.log.error({ error, conversationId: req.params.id }, 'Unable to load conversation messages');
      return res.status(503).send({ message: 'Chat history is temporarily unavailable. Please retry shortly.' });
    }
  });

  app.post('/conversations/:id/messages', async (req: any, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).send({ message: 'Message content is required' });
    const messageType = req.body?.messageType === undefined ? 'TEXT' : req.body.messageType;
    const visibility = req.body?.visibility === undefined ? 'EVERYONE' : req.body.visibility;
    const fileUrl = req.body?.fileUrl;
    if (!['TEXT', 'IMAGE', 'VIDEO'].includes(messageType)) {
      return res.status(400).send({ message: 'Invalid message type' });
    }
    if (!['EVERYONE', 'ADMIN_ONLY'].includes(visibility)) {
      return res.status(400).send({ message: 'Invalid message visibility' });
    }
    if (messageType !== 'TEXT' && (typeof fileUrl !== 'string' || !fileUrl.trim())) {
      return res.status(400).send({ message: 'A file URL is required for media messages' });
    }
    const message = await MessageService.sendMessage(
      req.params.id,
      req.user.id,
      content,
      messageType === 'TEXT' ? undefined : { messageType, fileUrl, visibility },
      visibility
    );
    return res.status(201).send(message);
  });

  app.post('/conversations/:id/media', async (req: any, res) => {
    if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) {
      return res.status(415).send({ message: 'Multipart media upload is required' });
    }
    let canAccessConversation: boolean;
    try {
      canAccessConversation = await MessageService.canAccessConversation(String(req.params.id), req.user.id);
    } catch (error) {
      req.log.error({ error, conversationId: req.params.id, userId: req.user.id }, 'Unable to authorize chat media upload');
      return res.status(503).send({ message: 'Chat is temporarily unavailable. Please try again.' });
    }
    if (!canAccessConversation) {
      return res.status(403).send({ message: 'Unauthorized conversation' });
    }

    let part;
    let buffer: Buffer;
    try {
      part = await req.file({ limits: { fileSize: maxMediaSize, files: 1 } });
      if (!part) return res.status(400).send({ message: 'A media file is required' });
      buffer = await part.toBuffer();
    } catch (error) {
      const code = error instanceof Error && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return res.status(413).send({ message: 'Media must be 50MB or smaller' });
      }
      req.log.warn({ error, conversationId: req.params.id }, 'Unable to read chat media upload');
      return res.status(400).send({ message: 'Unable to read the uploaded media' });
    }

    if (!part || part.fieldname !== 'file') return res.status(400).send({ message: 'A media file is required' });
    const allowed: Record<string, 'IMAGE' | 'VIDEO'> = {
      'image/png': 'IMAGE',
      'image/jpeg': 'IMAGE',
      'video/mp4': 'VIDEO',
      'video/quicktime': 'VIDEO'
    };
    const messageType = allowed[part.mimetype];
    if (!messageType) return res.status(415).send({ message: 'Only PNG, JPG, MP4, and MOV files are supported' });
    if (!buffer.length) {
      return res.status(400).send({ message: 'The uploaded media file is empty' });
    }
    if (messageType === 'IMAGE' && detectImageMimeType(buffer) !== part.mimetype) {
      return res.status(415).send({ message: 'The uploaded file is not a valid supported image' });
    }
    const visibilityValue = typeof req.query?.visibility === 'string' ? req.query.visibility : 'EVERYONE';
    if (!['EVERYONE', 'ADMIN_ONLY'].includes(visibilityValue)) {
      return res.status(400).send({ message: 'Invalid media visibility' });
    }

    try {
      const safeFilename = part.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storage = createStorageProvider(
        config.storage.provider,
        config.storage.local.path,
        '/uploads',
        config.storage.s3,
        config.storage.cloudinary,
      );
      const uploaded = await storage.upload(buffer, `chat-evidence/${req.user.id}`, `${Date.now()}-${safeFilename}`);
      const fileUrl = uploaded.url.startsWith('http')
        ? uploaded.url
        : `${config.app.apiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')}${uploaded.url}`;
      return res.status(201).send({ fileUrl, messageType, visibility: visibilityValue });
    } catch (error) {
      req.log.error({ error, conversationId: req.params.id, userId: req.user.id }, 'Chat media storage upload failed');
      return res.status(503).send({ message: 'Media upload is temporarily unavailable. Please try again.' });
    }
  });

  app.patch('/conversations/:id/read', async (req: any, res) => {
    await MessageService.markRead(req.params.id, req.user.id);
    return res.send({ status: 'ok' });
  });
}
