import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname } from 'node:path';
import { readFileSync, watch } from 'node:fs';
import { Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import { config } from '../../config';
import { backendEnvPath, externalTelegramEnvValues } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  text?: string;
  chat: TelegramChat;
  from?: { id: number };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramBotIdentity {
  username: string;
}

interface TelegramWebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
}

export function resolveTelegramWebhookConfig(
  fileValues: Record<string, string>,
  externalValues = externalTelegramEnvValues,
) {
  return {
    url: externalValues.TELEGRAM_WEBHOOK_URL ?? fileValues.TELEGRAM_WEBHOOK_URL,
    secret: externalValues.TELEGRAM_WEBHOOK_SECRET ?? fileValues.TELEGRAM_WEBHOOK_SECRET,
  };
}

export function matchesTelegramWebhookSecret(
  header: string | string[] | undefined,
  acceptedSecrets: Iterable<string>,
) {
  const suppliedSecret = Array.isArray(header) ? header[0] : header;
  if (!suppliedSecret) return false;
  const supplied = Buffer.from(suppliedSecret);
  return [...acceptedSecrets].some((secret) => {
    const expected = Buffer.from(secret);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

export function matchesTelegramWebhookPath(
  requestPath: string,
  acceptedUrls: Iterable<string>,
  pendingUrl?: string,
) {
  return [...acceptedUrls, ...(pendingUrl ? [pendingUrl] : [])].some((url) => {
    if (!url) return false;
    try {
      return new URL(url).pathname === requestPath;
    } catch {
      return false;
    }
  });
}

class TelegramBot {
  private username?: string;
  private running = false;
  private offset = 0;
  private activeRequest?: AbortController;
  private pollingConnectionLogged = false;
  private webhookConfigWatcher?: ReturnType<typeof watch>;
  private webhookConfigPoll?: NodeJS.Timeout;
  private webhookConfigRefresh?: NodeJS.Timeout;
  private webhookRegistrationRetry?: NodeJS.Timeout;
  private webhookRegistrationInFlight = false;
  private pendingWebhookSecret?: string;
  private pendingWebhookUrl?: string;
  private readonly acceptedWebhookUrls = new Set<string>();
  private readonly acceptedWebhookSecrets = new Set<string>();

  private get token() {
    if (!config.telegram.botToken) throw new Error('TELEGRAM_NOT_CONFIGURED');
    return config.telegram.botToken;
  }

  private async callApi<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const result: unknown = await response.json();
    if (
      !response.ok ||
      !result ||
      typeof result !== 'object' ||
      !('ok' in result) ||
      result.ok !== true ||
      !('result' in result)
    ) {
      const description = result && typeof result === 'object' && 'description' in result
        ? String(result.description)
        : `HTTP ${response.status}`;
      throw new Error(`Telegram ${method} failed: ${description}`);
    }
    return result.result as T;
  }

  private async getIdentity() {
    const identity = await this.callApi<TelegramBotIdentity>('getMe', {});
    if (!identity.username) throw new Error('Telegram bot did not return a username');
    this.username = identity.username;
    logger.info({ username: identity.username }, 'Telegram bot identity verified');
    return identity;
  }

  async createLink(userId: string) {
    if (!config.telegram.botToken) throw new Error('TELEGRAM_NOT_CONFIGURED');
    const { username } = this.username ? { username: this.username } : await this.getIdentity();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        tgVerificationToken: tokenHash,
        tgVerificationExpiry: expiresAt,
      },
    });

    return {
      url: `https://t.me/${username}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async sendMessage(chatId: string, text: string) {
    await this.callApi('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
    });
  }

  async start() {
    if (this.running || !config.telegram.botToken) return;
    if (config.telegram.webhookUrl) {
      if (!config.telegram.webhookSecret) {
        throw new Error('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_WEBHOOK_URL is configured');
      }
      const webhookUrl = new URL(config.telegram.webhookUrl);
      if (webhookUrl.protocol !== 'https:') {
        throw new Error('TELEGRAM_WEBHOOK_URL must use HTTPS');
      }
      const webhookSecret = config.telegram.webhookSecret;
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
        throw new Error('TELEGRAM_WEBHOOK_SECRET contains unsupported characters');
      }
      this.acceptedWebhookUrls.clear();
      this.acceptedWebhookUrls.add(webhookUrl.toString());
      this.acceptedWebhookSecrets.clear();
      this.acceptedWebhookSecrets.add(webhookSecret);
      this.running = true;
      this.startWebhookConfigWatcher();
      try {
        await this.registerWebhook(webhookUrl.toString(), webhookSecret);
      } catch (error) {
        logger.error({ error }, 'Telegram webhook registration failed; backend will continue and retry');
        this.scheduleWebhookRegistrationRetry();
      }
      return;
    }
    this.running = true;
    void this.poll();
  }

  stop() {
    this.running = false;
    this.activeRequest?.abort();
    this.webhookConfigWatcher?.close();
    this.webhookConfigWatcher = undefined;
    if (this.webhookConfigPoll) clearInterval(this.webhookConfigPoll);
    if (this.webhookConfigRefresh) clearTimeout(this.webhookConfigRefresh);
    if (this.webhookRegistrationRetry) clearTimeout(this.webhookRegistrationRetry);
  }

  isValidWebhookSecret(header: string | string[] | undefined) {
    return matchesTelegramWebhookSecret(header, this.acceptedWebhookSecrets);
  }

  isWebhookRequestPath(pathname: string) {
    return matchesTelegramWebhookPath(pathname, this.acceptedWebhookUrls, this.pendingWebhookUrl);
  }

  private startWebhookConfigWatcher() {
    const reload = () => {
      try {
        const fileValues = dotenv.parse(readFileSync(backendEnvPath));
        const { url: nextUrl, secret: nextSecret } = resolveTelegramWebhookConfig(fileValues);
        if (!nextUrl || !nextSecret ||
          (nextUrl === config.telegram.webhookUrl && nextSecret === config.telegram.webhookSecret)) return;

        const parsedUrl = new URL(nextUrl);
        if (parsedUrl.protocol !== 'https:' || !/^[A-Za-z0-9_-]{1,256}$/.test(nextSecret)) {
          logger.error('Telegram webhook configuration update rejected because URL or secret is invalid');
          return;
        }
        void this.updateWebhookConfiguration(parsedUrl.toString(), nextSecret);
      } catch (error) {
        logger.error({ error }, 'Unable to reload Telegram webhook configuration');
      }
    };

    const scheduleReload = () => {
      if (this.webhookConfigRefresh) clearTimeout(this.webhookConfigRefresh);
      this.webhookConfigRefresh = setTimeout(reload, 200);
      this.webhookConfigRefresh.unref();
    };

    try {
      this.webhookConfigWatcher = watch(dirname(backendEnvPath), (_eventType, filename) => {
        if (filename && filename.toString() !== backendEnvPath.split(/[\\/]/).pop()) return;
        scheduleReload();
      });
      this.webhookConfigWatcher.on('error', (error) => {
        logger.error({ error }, 'Telegram webhook environment watcher failed');
      });
    } catch (error) {
      logger.error({ error }, 'Unable to watch Telegram webhook environment file');
    }
    this.webhookConfigPoll = setInterval(reload, 2_000);
    this.webhookConfigPoll.unref();
  }

  private async updateWebhookConfiguration(webhookUrl: string, webhookSecret: string) {
    if (this.pendingWebhookSecret || this.webhookRegistrationInFlight) return;
    this.pendingWebhookSecret = webhookSecret;
    this.pendingWebhookUrl = webhookUrl;
    this.acceptedWebhookUrls.add(webhookUrl);
    this.acceptedWebhookSecrets.add(webhookSecret);
    try {
      const webhookInfo = await this.registerWebhook(webhookUrl, webhookSecret);
      config.telegram.webhookUrl = webhookUrl;
      config.telegram.webhookSecret = webhookSecret;
      this.acceptedWebhookUrls.clear();
      this.acceptedWebhookUrls.add(webhookUrl);
      this.acceptedWebhookSecrets.clear();
      this.acceptedWebhookSecrets.add(webhookSecret);
      logger.info({ pendingUpdates: webhookInfo.pending_update_count }, 'Telegram webhook configuration updated and verified');
    } catch (error) {
      logger.error({ error }, 'Telegram webhook configuration update failed; keeping previous configuration');
      try {
        await this.registerWebhook(config.telegram.webhookUrl!, config.telegram.webhookSecret!);
        this.acceptedWebhookUrls.delete(webhookUrl);
        if (webhookSecret !== config.telegram.webhookSecret) {
          this.acceptedWebhookSecrets.delete(webhookSecret);
        }
      } catch (rollbackError) {
        logger.error({ error: rollbackError }, 'Telegram webhook rollback failed; operator action is required');
      }
    } finally {
      this.pendingWebhookSecret = undefined;
      this.pendingWebhookUrl = undefined;
    }
  }

  private async registerWebhook(webhookUrl: string, webhookSecret: string) {
    if (this.webhookRegistrationInFlight) throw new Error('Telegram webhook registration is already in progress');
    this.webhookRegistrationInFlight = true;
    try {
      await this.callApi('setWebhook', {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
        drop_pending_updates: false,
      });
      const webhookInfo = await this.callApi<TelegramWebhookInfo>('getWebhookInfo', {});
      if (webhookInfo.url !== webhookUrl || webhookInfo.last_error_message) {
        throw new Error('Telegram webhook registration could not be verified');
      }
      logger.info({ pendingUpdates: webhookInfo.pending_update_count }, 'Telegram bot webhook registered and verified');
      return webhookInfo;
    } finally {
      this.webhookRegistrationInFlight = false;
    }
  }

  private scheduleWebhookRegistrationRetry(delayMs = 2_000) {
    if (!this.running || this.webhookRegistrationRetry) return;
    this.webhookRegistrationRetry = setTimeout(async () => {
      this.webhookRegistrationRetry = undefined;
      try {
        if (!config.telegram.webhookUrl || !config.telegram.webhookSecret) return;
        if (this.webhookRegistrationInFlight || this.pendingWebhookSecret) {
          this.scheduleWebhookRegistrationRetry(delayMs);
          return;
        }
        await this.registerWebhook(config.telegram.webhookUrl, config.telegram.webhookSecret);
      } catch (error) {
        logger.error({ error }, 'Telegram webhook registration retry failed');
        this.scheduleWebhookRegistrationRetry(Math.min(delayMs * 2, 60_000));
      }
    }, delayMs);
    this.webhookRegistrationRetry.unref();
  }

  async handleWebhookUpdate(update: TelegramUpdate) {
    if (!Number.isInteger(update.update_id)) throw new Error('Invalid Telegram update');
    await this.processUpdate(update);
  }

  private async poll() {
    while (this.running) {
      try {
        if (!this.username) await this.getIdentity();
        this.activeRequest = new AbortController();
        const timeout = setTimeout(() => this.activeRequest?.abort(), 35_000);
        let updates: TelegramUpdate[];
        try {
          updates = await this.callApi<TelegramUpdate[]>('getUpdates', {
            offset: this.offset,
            timeout: 25,
            allowed_updates: ['message'],
          }, this.activeRequest.signal);
        } finally {
          clearTimeout(timeout);
          this.activeRequest = undefined;
        }
        if (!this.pollingConnectionLogged) {
          logger.info('Telegram bot long polling connected');
          this.pollingConnectionLogged = true;
        }
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          try {
            await this.processUpdate(update);
          } catch (error) {
            logger.error({ updateId: update.update_id, error }, 'Unable to process Telegram bot update');
          }
        }
      } catch (error) {
        if (this.running) {
          logger.error({ error }, 'Telegram bot polling failed; retrying');
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  private async processUpdate(update: TelegramUpdate) {
    const message = update.message;
    if (!message?.text || message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id) return;

    const command = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?(?:\s|$)/.exec(message.text.trim());
    if (!command) return;
    const token = command[1];
    if (!token) {
      await this.sendMessage(String(message.chat.id), 'Open the Telegram link from your VouchNode account settings to link your account.');
      return;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    try {
      const userId = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: {
            tgVerificationToken: tokenHash,
            tgVerificationExpiry: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!user) return null;

        const claimed = await tx.user.updateMany({
          where: {
            id: user.id,
            tgVerificationToken: tokenHash,
            tgVerificationExpiry: { gt: new Date() },
          },
          data: {
            telegramChatId: String(message.chat.id),
            tgVerificationToken: null,
            tgVerificationExpiry: null,
          },
        });
        return claimed.count === 1 ? user.id : null;
      });

      if (!userId) {
        await this.sendMessage(String(message.chat.id), 'This VouchNode link is invalid or expired. Sign in and generate a new Telegram link.');
        return;
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.sendMessage(String(message.chat.id), 'This Telegram account is already linked to another VouchNode account.');
        return;
      }
      throw error;
    }

    try {
      await this.sendMessage(String(message.chat.id), 'Your Telegram account is now linked to VouchNode. Private notifications will be sent to this chat.');
    } catch (error) {
      logger.error({ error }, 'Telegram linking succeeded but confirmation could not be delivered');
    }
  }
}

export const TelegramBotService = new TelegramBot();
