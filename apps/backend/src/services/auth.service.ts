import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { addMinutes, isAfter } from 'date-fns';
import { CurrencyType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { UserRole } from '@vouchnode/shared';
import { createEmailProvider } from '../integrations/email/email.provider';
import { WalletRepository } from '../repositories/wallet.repository';
import { INTERNAL_SUPPORTED_ASSET_CODES } from '../lib/internal-wallet';
import { NotificationService } from './notification.service';
import { logger } from '../lib/logger';
import { WELCOME_EMAIL_SUBJECT } from '../integrations/email/email.templates';

const CURRENCY_METADATA: Record<string, { name: string; symbol: string; decimals: number }> = {
  USD: { name: 'US Dollar', symbol: 'USD', decimals: 2 },
  BTC: { name: 'Bitcoin', symbol: 'BTC', decimals: 8 },
  USDT: { name: 'Tether', symbol: 'USDT', decimals: 6 },
  ETH: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  BNB: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  SOL: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  LTC: { name: 'Litecoin', symbol: 'LTC', decimals: 8 },
  TRX: { name: 'TRON', symbol: 'TRX', decimals: 6 },
  USDC: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  BCH: { name: 'Bitcoin Cash', symbol: 'BCH', decimals: 8 },
  GRAM: { name: 'Gram', symbol: 'GRAM', decimals: 9 }
};

async function ensureAuthReferenceData(countryCode: string) {
  const countryNames: Record<string, string> = {
    US: 'United States',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
    DE: 'Germany',
    FR: 'France',
    IN: 'India',
    AE: 'United Arab Emirates'
  };

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      [UserRole.BUYER, UserRole.SELLER, UserRole.ADMIN].map((name) =>
        tx.role.upsert({
          where: { name },
          update: {},
          create: { name, description: `${name} platform role` }
        })
      )
    );

    await tx.country.upsert({
      where: { code: countryCode },
      update: {},
      create: {
        code: countryCode,
        name: countryNames[countryCode] || countryCode,
        dialCode: '+0',
        isSupported: true
      }
    });

    await Promise.all(
      ['USD', ...INTERNAL_SUPPORTED_ASSET_CODES].map((code) => {
        const metadata = CURRENCY_METADATA[code];
        if (!metadata) throw new Error(`Missing currency metadata for ${code}.`);
        return tx.currency.upsert({
          where: { code },
          update: {},
          create: {
            code,
            name: metadata.name,
            symbol: metadata.symbol,
            type: code === 'USD' ? CurrencyType.FIAT : CurrencyType.CRYPTO,
            decimals: metadata.decimals,
            isActive: true
          }
        });
      })
    );
  });
}

export class AuthService {
  static async verifyTurnstile(token: unknown, clientIp: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (typeof token !== 'string' || !token.trim() || !secret) {
      if (!secret) console.error('Turnstile verification is unavailable: TURNSTILE_SECRET_KEY is not configured');
      return false;
    }

    const form = new URLSearchParams({ secret, response: token.trim() });
    if (clientIp) form.set('remoteip', clientIp);
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (!response.ok) {
        console.error('Turnstile verification request failed', { status: response.status });
        return false;
      }
      const result: unknown = await response.json();
      return Boolean(result && typeof result === 'object' && 'success' in result && result.success === true);
    } catch (error) {
      console.error('Turnstile verification request could not be completed', error);
      return false;
    }
  }

  private static toClientUser(user: any) {
    const {
      passwordHash,
      emailVerificationToken,
      emailVerificationExpiry,
      telegramChatId,
      tgVerificationToken,
      tgVerificationExpiry,
      ...safeUser
    } = user;
    const roleName = safeUser.roles?.find((ur: any) => ur?.role?.name)?.role?.name || 'BUYER';
    const sellerStatus = safeUser.sellerProfile?.status
      ? String(safeUser.sellerProfile.status).toLowerCase()
      : 'none';
    const profile = user.profile || {};
    return {
      ...safeUser,
      role: roleName,
      username: profile.username || '',
      avatarUrl: profile.avatarUrl || null,
      displayName: profile.displayName || null,
      bio: profile.bio || null,
      countryCode: profile.countryCode || null,
      timezone: profile.timezone || null,
      language: profile.language || null,
      twitterUrl: profile.twitterUrl || null,
      linkedinUrl: profile.linkedinUrl || null,
      githubUrl: profile.githubUrl || null,
      websiteUrl: profile.websiteUrl || null,
      sellerStatus,
    };
  }
  static async register(data: any) {
    const email = String(data.email).trim().toLowerCase();
    const username = String(data.username).trim();
    const country = String(data.country).trim().toUpperCase();
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { profile: { username: { equals: username, mode: 'insensitive' } } }
        ]
      }
    });

    if (existingUser) {
      throw new Error('Email or username already exists');
    }

    let referredById: string | undefined;
    if (data.referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: String(data.referralCode).trim() },
        select: { id: true },
      });
      if (!referrer) {
        throw Object.assign(new Error('This referral link is invalid.'), { statusCode: 400 });
      }
      referredById = referrer.id;
    }

    await ensureAuthReferenceData(country);

    const passwordHash = await argon2.hash(data.password);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const buyerRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.BUYER } });

    const user = await prisma.user.create({
      data: {
        email,
        referralCode: crypto.randomBytes(8).toString('hex'),
        ...(referredById ? { referredById } : {}),
        passwordHash,
        status: 'PENDING_VERIFICATION',
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: addMinutes(new Date(), 60 * 24),
        profile: {
          create: {
            username,
            displayName: `${String(data.firstName).trim()} ${String(data.lastName).trim()}`,
            countryCode: country
          }
        },
        roles: {
          create: {
            roleId: buyerRole.id
          }
        }
      },
      include: {
        profile: true,
        roles: { include: { role: true } }
      }
    });

    await WalletRepository.initializeUserWallets(user.id);

    try {
      await NotificationService.createNotification({
        userId: user.id,
        type: 'SYSTEM',
        title: WELCOME_EMAIL_SUBJECT,
        message: 'Welcome to VouchNode. Explore gift cards and digital products, and check the marketplace for current seller offers.',
        data: { emailTemplate: 'welcome' },
        link: '/marketplace',
        sendEmail: true,
      });
    } catch (error) {
      logger.error({
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Unable to queue new-user welcome email');
    }

    return this.toClientUser(user);
  }

  static async login(email: string, password: string, ipAddress: string, userAgent: string) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      include: {
        profile: { select: { username: true, avatarUrl: true } },
        roles: { include: { role: true } },
        sellerProfile: { select: { status: true } },
      }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check account status before expensive password verification
    if (user.status !== 'ACTIVE' && user.status !== 'PENDING_VERIFICATION') {
      throw new Error(`Account is ${user.status.toLowerCase().replace(/_/g, ' ')}`);
    }

    if (user.lockedUntil && isAfter(user.lockedUntil, new Date())) {
      throw new Error('Account locked due to too many failed attempts. Please try again later.');
    }

    const isValid = await argon2.verify(user.passwordHash, password);

    if (!isValid) {
      await this.incrementFailedLogin(user.id);
      throw new Error('Invalid credentials');
    }

    await this.resetFailedLogin(user.id);

    const accessToken = this.generateAccessToken(user);
    const refreshToken = uuidv4();

    // Parse refresh token expiry correctly — config value is e.g. "30d", "7d", "1440m"
    // parseInt("30d") === NaN which breaks addMinutes; parse manually instead.
    const refreshExpiresInMs = this.parseDurationToMs(config.jwt.refreshExpiresIn);
    const expiresAt = new Date(Date.now() + refreshExpiresInMs);

    await prisma.session.create({
      data: {
        userId:    user.id,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt,
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress, isOnline: true }
    });

    return { accessToken, refreshToken, user: this.toClientUser(user) };
  }

  /** Parse duration strings like "30d", "15m", "1h" into milliseconds */
  static parseDurationToMs(duration: string): number {
    const match = /^(\d+)([smhd]?)$/.exec(duration.trim());
    if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30 days
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default:  return value * 1000;
    }
  }

  static generateAccessToken(user: any) {
    const minimumAccessLifetimeMs = 24 * 60 * 60 * 1000;
    const configuredAccessLifetimeMs = this.parseDurationToMs(config.jwt.accessExpiresIn);
    const accessLifetimeSeconds = Math.ceil(Math.max(configuredAccessLifetimeMs, minimumAccessLifetimeMs) / 1000);
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
        roles: user.roles?.map((ur: any) => ur.role.name) || []
      },
      config.jwt.accessSecret,
      { expiresIn: accessLifetimeSeconds }
    );
  }

  static async incrementFailedLogin(userId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } }
    });

    if (user.failedLoginAttempts >= config.security.maxFailedLogins) {
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: addMinutes(new Date(), config.security.accountLockDurationMins) }
      });
    }
  }

  static async resetFailedLogin(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });
  }

  static async refreshToken(token: string) {
    const session = await prisma.session.findUnique({
      where: { refreshToken: token },
      include: {
        user: {
          include: {
            profile: { select: { username: true, avatarUrl: true } },
            roles: { include: { role: true } }
          }
        }
      }
    });

    if (!session || session.isRevoked || isAfter(new Date(), session.expiresAt)) {
      throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
    }
    if (session.user.status !== 'ACTIVE' && session.user.status !== 'PENDING_VERIFICATION') {
      throw Object.assign(new Error('Account is no longer active'), { statusCode: 401 });
    }

    // Rotate refresh token
    const newRefreshToken = uuidv4();
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken, lastUsedAt: new Date() }
    });

    const accessToken = this.generateAccessToken(session.user);
    return { accessToken, refreshToken: newRefreshToken };
  }

  static async logout(sessionId: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { isRevoked: true }
    });
    await prisma.user.update({
      where: { id: session.userId },
      data: { isOnline: false }
    });
  }

  static async logoutAll(userId: string) {
    await prisma.$transaction([
      prisma.session.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } }
      }),
    ]);
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: false }
    });
  }

  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Don't reveal whether email exists
    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: resetTokenHash, // reuse field for reset token
        emailVerificationExpiry: addMinutes(new Date(), 60) // 1 hour
      }
    });

    // Queue email dispatch
    const emailProvider = createEmailProvider();
    await emailProvider.sendEmail(
      user.email,
      'Reset Your VouchNode Password',
      `<p>Click <a href="${config.app.frontendUrl}/auth/reset-password?token=${resetToken}">here</a> to reset your password. This link expires in 1 hour.</p>`
    );
  }

  static async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: { gt: new Date() }
      }
    });

    if (!user) {
      throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });
    }

    const passwordHash = await argon2.hash(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    // Revoke all sessions for security
    await this.logoutAll(user.id);
  }

  static async verifyEmail(token: string) {
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiry: { gt: new Date() }
      }
    });

    if (!user) {
      throw Object.assign(new Error('Invalid or expired verification token'), { statusCode: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null
      }
    });
  }

  static async getSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, lastUsedAt: true }
    });
  }

  static async revokeSession(sessionId: string, userId: string) {
    const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
    await prisma.session.update({ where: { id: sessionId }, data: { isRevoked: true } });
  }
}
