import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { addMinutes, isAfter } from 'date-fns';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { UserRole } from '@vouchnode/shared';
import { createEmailProvider } from '../integrations/email/email.provider';
import { WalletRepository } from '../repositories/wallet.repository';
import { INTERNAL_SUPPORTED_ASSET_CODES } from '../lib/internal-wallet';
import { COUNTRY_CATALOG } from '../catalogs/countries';
import { CURRENCY_CATALOG } from '../catalogs/currencies';
import { ROLE_CATALOG } from '../catalogs/roles';

async function ensureAuthReferenceData(countryCode: string) {
  const country = COUNTRY_CATALOG.find((entry) => entry.code === countryCode);
  if (!country) {
    throw Object.assign(new Error('Unsupported country code.'), { statusCode: 400 });
  }

  const currencyCodes = new Set(CURRENCY_CATALOG.map(({ code }) => code));
  const missingCurrencyMetadata = ['USD', ...INTERNAL_SUPPORTED_ASSET_CODES]
    .filter((code) => !currencyCodes.has(code));
  if (missingCurrencyMetadata.length > 0) {
    throw new Error(`Missing currency metadata for ${missingCurrencyMetadata.join(', ')}.`);
  }

  const requiredCurrencyCodes = ['USD', ...INTERNAL_SUPPORTED_ASSET_CODES];
  const [existingCountry, buyerRole, existingCurrencies] = await Promise.all([
    prisma.country.findUnique({ where: { code: country.code }, select: { code: true } }),
    prisma.role.findUnique({ where: { name: UserRole.BUYER } }),
    prisma.currency.findMany({
      where: { code: { in: requiredCurrencyCodes } },
      select: { code: true },
    }),
  ]);
  const existingCurrencyCodes = new Set(existingCurrencies.map(({ code }) => code));
  const missingCurrencies = requiredCurrencyCodes.filter((code) => !existingCurrencyCodes.has(code));

  await Promise.all([
    !existingCountry && prisma.country.createMany({ data: [country], skipDuplicates: true }),
    !buyerRole && prisma.role.createMany({
      data: ROLE_CATALOG.map((name) => ({ name, description: `${name} platform role` })),
      skipDuplicates: true,
    }),
    missingCurrencies.length > 0 && prisma.currency.createMany({
      data: CURRENCY_CATALOG
        .filter(({ code }) => missingCurrencies.includes(code))
        .map((currency) => ({ ...currency, isActive: true })),
      skipDuplicates: true,
    }),
  ]);
  return buyerRole || prisma.role.findUniqueOrThrow({ where: { name: UserRole.BUYER } });
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
        signal: AbortSignal.timeout(5_000),
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

    const [buyerRole, passwordHash] = await Promise.all([
      ensureAuthReferenceData(country),
      argon2.hash(data.password),
    ]);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          referralCode: crypto.randomBytes(8).toString('hex'),
          ...(referredById ? { referredById } : {}),
          passwordHash,
          status: 'PENDING_VERIFICATION',
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

      await WalletRepository.initializeUserWallets(createdUser.id, tx);
      return createdUser;
    });

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

    const refreshToken = uuidv4();

    // Parse refresh token expiry correctly — config value is e.g. "30d", "7d", "1440m"
    // parseInt("30d") === NaN which breaks addMinutes; parse manually instead.
    const refreshExpiresInMs = this.parseDurationToMs(config.jwt.refreshExpiresIn);
    const expiresAt = new Date(Date.now() + refreshExpiresInMs);

    const session = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          userId: user.id,
          refreshToken,
          ipAddress,
          userAgent,
          expiresAt,
        }
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
        }
      });
      return createdSession;
    });

    const accessToken = await this.generateAccessToken(user, session.id);
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

  static generateAccessToken(user: any, sessionId?: string): Promise<string> {
    const minimumAccessLifetimeMs = 24 * 60 * 60 * 1000;
    const configuredAccessLifetimeMs = this.parseDurationToMs(config.jwt.accessExpiresIn);
    const accessLifetimeSeconds = Math.ceil(Math.max(configuredAccessLifetimeMs, minimumAccessLifetimeMs) / 1000);
    const payload = {
        id: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
        roles: user.roles?.map((ur: any) => ur.role.name) || [],
        ...(sessionId ? { sessionId } : {})
    };
    return new Promise((resolve, reject) => {
      jwt.sign(payload, config.jwt.accessSecret, { expiresIn: accessLifetimeSeconds }, (error, token) => {
        if (error) {
          reject(error);
          return;
        }
        if (!token) {
          reject(new Error('JWT signing did not return a token'));
          return;
        }
        resolve(token);
      });
    });
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

    const now = new Date();
    const newRefreshToken = uuidv4();
    const rotation = await prisma.session.updateMany({
      where: {
        id: session.id,
        refreshToken: token,
        isRevoked: false,
        expiresAt: { gt: now },
      },
      data: { refreshToken: newRefreshToken, lastUsedAt: now }
    });
    if (rotation.count !== 1) {
      throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
    }

    const accessToken = await this.generateAccessToken(session.user, session.id);
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
      'Reset Your VouchNodes Password',
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
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { emailVerificationToken: token },
          { emailVerificationToken: tokenHash },
        ],
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
