import { FastifyInstance } from 'fastify';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { createStorageProvider } from '../integrations/storage/storage.provider';

const ticketFields = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
});

async function createTicketNumber() {
  for (;;) {
    const ticketNumber = `GF-${randomInt(10000, 100000)}`;
    const existing = await prisma.supportTicket.findUnique({ where: { ticketNumber }, select: { id: true } });
    if (!existing) return ticketNumber;
  }
}

export default async function supportRoutes(app: FastifyInstance) {
  app.post('/tickets', async (request, reply) => {
    try {
      const fields: Record<string, string> = {};
      let attachmentUrl: string | undefined;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'attachment' || !part.mimetype.startsWith('image/')) {
            return reply.code(415).send({ message: 'Only an optional image attachment is supported' });
          }
          const storage = createStorageProvider(config.storage.provider, config.storage.local.path, '/uploads', config.storage.s3);
          const uploaded = await storage.upload(await part.toBuffer(), 'support', `${Date.now()}-${part.filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
          attachmentUrl = uploaded.url;
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
      const parsed = ticketFields.safeParse(fields);
      if (!parsed.success) return reply.code(422).send({ message: 'Please complete all support ticket fields' });
      const { name, email, subject, message } = parsed.data;
      if (!name || !email || !subject || !message) {
        return reply.code(422).send({ message: 'Please complete all support ticket fields' });
      }
      const ticketId = await createTicketNumber();
      await prisma.supportTicket.create({ data: { name, email, subject, message, ticketNumber: ticketId, attachmentUrl } });
      return reply.code(201).send({ data: { ticketId }, message: 'Support ticket submitted' });
    } catch (error) {
      request.log.error({ error }, 'Support ticket submission failed');
      return reply.code(500).send({ message: 'Unable to submit support ticket' });
    }
  });
}
