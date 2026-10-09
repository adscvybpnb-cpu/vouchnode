import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { htmlToPlainText, wrapInVouchNodeBrand } from './email.templates';

export interface EmailProvider {
  sendEmail(to: string, subject: string, html: string, text?: string): Promise<void>;
}

export class SmtpProvider implements EmailProvider {
  private transporter?: Transporter;

  private getTransporter() {
    const { host, port, secure, user, pass } = config.email.smtp;
    if (!host || !port || !user || !pass) {
      throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are required to send email');
    }
    this.transporter ??= nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async verifyConnection() {
    await this.getTransporter().verify();
    logger.info({ host: config.email.smtp.host, port: config.email.smtp.port }, 'SMTP authentication verified');
  }

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    const plainText = text ?? htmlToPlainText(html);
    const result = await this.getTransporter().sendMail({
      from: { name: config.email.from.name, address: config.email.from.address },
      to,
      subject,
      html: wrapInVouchNodeBrand(html),
      text: `VouchNode\n\n${plainText}`,
    });
    const responseCode = Number(/^\s*(\d{3})/.exec(result.response)?.[1] ?? 0);
    const accepted = result.accepted.some((address: unknown) => String(address).toLowerCase() === to.toLowerCase());
    logger.info({
      responseCode,
      accepted,
      acceptedCount: result.accepted.length,
      rejectedCount: result.rejected.length,
      messageId: result.messageId,
    }, 'SMTP message submission completed');
    if (!accepted) throw new Error('SMTP server did not accept the requested recipient');
  }
}

class MockEmailProvider implements EmailProvider {
  async sendEmail(_to: string, subject: string) {
    logger.info({ subject }, 'Mock email dispatched');
  }
}

export function createEmailProvider(): EmailProvider {
  return config.email.provider === 'mock' ? new MockEmailProvider() : new SmtpProvider();
}
