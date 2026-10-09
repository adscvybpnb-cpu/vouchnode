import { describe, expect, it } from 'vitest';
import {
  matchesTelegramWebhookPath,
  matchesTelegramWebhookSecret,
  resolveTelegramWebhookConfig,
} from '../integrations/telegram/telegram.bot';

describe('Telegram webhook runtime configuration', () => {
  it('uses updated environment-file URL and secret values', () => {
    const resolved = resolveTelegramWebhookConfig({
      TELEGRAM_WEBHOOK_URL: 'https://production.example.com/api/v1/telegram/webhook',
      TELEGRAM_WEBHOOK_SECRET: 'production-secret-123',
    }, {
      TELEGRAM_WEBHOOK_URL: undefined,
      TELEGRAM_WEBHOOK_SECRET: undefined,
    });

    expect(resolved).toEqual({
      url: 'https://production.example.com/api/v1/telegram/webhook',
      secret: 'production-secret-123',
    });
  });

  it('keeps externally injected values higher priority than file values', () => {
    const resolved = resolveTelegramWebhookConfig({
      TELEGRAM_WEBHOOK_URL: 'https://file.example.com/api/v1/telegram/webhook',
      TELEGRAM_WEBHOOK_SECRET: 'file-secret-123',
    }, {
      TELEGRAM_WEBHOOK_URL: 'https://environment.example.com/api/v1/telegram/webhook',
      TELEGRAM_WEBHOOK_SECRET: 'environment-secret-123',
    });

    expect(resolved.url).toBe('https://environment.example.com/api/v1/telegram/webhook');
    expect(resolved.secret).toBe('environment-secret-123');
  });

  it('accepts only the active or in-transition webhook secret', () => {
    expect(matchesTelegramWebhookSecret('current-secret', ['current-secret', 'next-secret'])).toBe(true);
    expect(matchesTelegramWebhookSecret('next-secret', ['current-secret', 'next-secret'])).toBe(true);
    expect(matchesTelegramWebhookSecret('wrong-secret', ['current-secret', 'next-secret'])).toBe(false);
    expect(matchesTelegramWebhookSecret(undefined, ['current-secret'])).toBe(false);
  });

  it('accepts only the active or in-transition callback path', () => {
    expect(matchesTelegramWebhookPath(
      '/api/v1/telegram/webhook',
      ['https://old.example.com/api/v1/telegram/webhook'],
      'https://new.example.com/api/v1/telegram/webhook',
    )).toBe(true);
    expect(matchesTelegramWebhookPath(
      '/hooks/telegram',
      ['https://old.example.com/api/v1/telegram/webhook'],
      'https://new.example.com/hooks/telegram',
    )).toBe(true);
    expect(matchesTelegramWebhookPath(
      '/api/v1/other',
      ['https://old.example.com/api/v1/telegram/webhook'],
      'https://new.example.com/hooks/telegram',
    )).toBe(false);
  });
});
