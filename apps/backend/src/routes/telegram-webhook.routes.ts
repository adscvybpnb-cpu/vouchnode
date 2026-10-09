import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { TelegramBotService } from '../integrations/telegram/telegram.bot';

interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number };
  };
}

export default async function telegramWebhookRoutes(app: FastifyInstance) {
  if (!config.telegram.webhookUrl || !config.telegram.webhookSecret) return;

  app.post('/*', async (request, reply) => {
    const requestPath = new URL(request.raw.url || '/', 'http://localhost').pathname;
    if (!TelegramBotService.isWebhookRequestPath(requestPath)) {
      return reply.status(404).send({ message: 'Not Found' });
    }
    if (!TelegramBotService.isValidWebhookSecret(request.headers['x-telegram-bot-api-secret-token'])) {
      return reply.status(401).send({ message: 'Invalid Telegram webhook secret.' });
    }

    const update = request.body as Partial<TelegramWebhookUpdate> | null;
    if (!update || !Number.isInteger(update.update_id)) {
      return reply.status(400).send({ message: 'Invalid Telegram update.' });
    }

    try {
      await TelegramBotService.handleWebhookUpdate(update as TelegramWebhookUpdate);
      return reply.send({ ok: true });
    } catch (error) {
      request.log.error({ error, updateId: update.update_id }, 'Telegram webhook update processing failed');
      return reply.status(500).send({ message: 'Telegram update processing failed.' });
    }
  });
}
