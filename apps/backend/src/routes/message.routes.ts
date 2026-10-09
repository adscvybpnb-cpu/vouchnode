import { FastifyInstance } from 'fastify';
import { MessageService } from '../services/message.service';
import { authenticate } from '../middleware/auth.middleware';
import { config } from '../config';
import { createStorageProvider } from '../integrations/storage/storage.provider';

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
    if (!(await MessageService.canAccessConversation(String(req.params.id), req.user.id))) {
      return res.status(403).send({ message: 'Unauthorized conversation' });
    }
    const part = await req.file();
    if (!part || part.fieldname !== 'file') return res.status(400).send({ message: 'A media file is required' });
    const allowed: Record<string, 'IMAGE' | 'VIDEO'> = {
      'image/png': 'IMAGE',
      'image/jpeg': 'IMAGE',
      'video/mp4': 'VIDEO',
      'video/quicktime': 'VIDEO'
    };
    const messageType = allowed[part.mimetype];
    if (!messageType) return res.status(415).send({ message: 'Only PNG, JPG, MP4, and MOV files are supported' });
    const buffer = await part.toBuffer();
    if (!buffer.length || buffer.length > 50 * 1024 * 1024) {
      return res.status(413).send({ message: 'Media must be between 1 byte and 50MB' });
    }
    const safeFilename = part.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storage = createStorageProvider(config.storage.provider, config.storage.local.path, '/uploads', config.storage.s3);
    const uploaded = await storage.upload(buffer, `chat-evidence/${req.user.id}`, `${Date.now()}-${safeFilename}`);
    const fileUrl = uploaded.url.startsWith('http')
      ? uploaded.url
      : `${config.app.apiUrl.replace(/\/api\/v1\/?$/, '')}${uploaded.url}`;
    const visibility = req.query?.visibility === 'ADMIN_ONLY' ? 'ADMIN_ONLY' : 'EVERYONE';
    return res.status(201).send({ fileUrl, messageType, visibility });
  });

  app.patch('/conversations/:id/read', async (req: any, res) => {
    await MessageService.markRead(req.params.id, req.user.id);
    return res.send({ status: 'ok' });
  });
}
