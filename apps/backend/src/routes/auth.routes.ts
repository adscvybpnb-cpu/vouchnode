import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service';
import { createAuditLog } from '../middleware/audit.middleware';
import { RegisterSchema, LoginSchema, UserRole } from '@vouchnode/shared';
import { authenticate } from '../middleware/auth.middleware';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config';

export default async function authRoutes(app: FastifyInstance) {
  app.post('/admin-login', {
    config: {
      rateLimit: {
        max: config.rateLimit.auth.max,
        timeWindow: config.rateLimit.auth.windowMs,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { username?: unknown; password?: unknown; turnstileToken?: unknown };
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!await AuthService.verifyTurnstile(body?.turnstileToken, request.ip)) {
      return reply.status(403).send({
        success: false,
        message: 'Security verification failed. Please complete the CAPTCHA.',
      });
    }
    if (!config.admin.username || !config.admin.password || !config.admin.tokenSecret) {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Dedicated admin login is not configured' });
    }
    const matches = (left: string, right: string) => {
      const a = Buffer.from(left);
      const b = Buffer.from(right);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    };
    if (!matches(username, config.admin.username) || !matches(password, config.admin.password)) {
      return reply.status(401).send({ statusCode: 401, error: 'Authentication Failed', message: 'Invalid admin credentials' });
    }
    const accessToken = jwt.sign(
      { id: config.admin.userId || 'env-admin', email: 'admin@local', roles: [UserRole.ADMIN], adminAuth: true },
      config.admin.tokenSecret,
      { expiresIn: '12h' },
    );
    return reply.send({ message: 'Admin login successful', accessToken, user: { id: config.admin.userId || 'env-admin', username, email: 'admin@local', role: UserRole.ADMIN, isVerified: true } });
  });
  // POST /register
  app.post('/register', async (request, reply) => {
    try {
      const parsed = RegisterSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return reply.status(400).send({ statusCode: 400, error: 'Validation Error', message });
      }
      const user = await AuthService.register(parsed.data);
      await createAuditLog({ actorId: user.id, actorType: 'USER', action: 'auth.register', ipAddress: request.ip });
      return reply.status(201).send({ message: 'Registration successful. Please check your email to verify your account.', user });
    } catch (err: any) {
      // Prisma unique constraint violation (duplicate email or username)
      if (err.code === 'P2002') {
        const field = err.meta?.target?.includes('email') ? 'email' : 'username';
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: `This ${field} is already registered to another account.`
        });
      }
      // Explicit 'already exists' throw from service
      if (err.message?.includes('already exists')) {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: err.message });
      }
      const status = err.statusCode || 400;
      return reply.status(status).send({ statusCode: status, error: 'Registration Failed', message: err.message });
    }
  });

  // POST /login
  app.post('/login', async (request, reply) => {
    try {
      const body = request.body as { turnstileToken?: unknown };
      if (!await AuthService.verifyTurnstile(body?.turnstileToken, request.ip)) {
        return reply.status(403).send({
          success: false,
          message: 'Security verification failed. Please complete the CAPTCHA.',
        });
      }
      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return reply.status(400).send({ statusCode: 400, error: 'Validation Error', message });
      }

      const { email, password } = parsed.data;
      const result = await AuthService.login(email, password, request.ip, request.headers['user-agent'] || '');
      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true, path: '/', secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: 30 * 24 * 60 * 60
      });
      await createAuditLog({ actorId: result.user.id, actorType: 'USER', action: 'auth.login', ipAddress: request.ip });
      return reply.send({ message: 'Login successful', accessToken: result.accessToken, user: result.user });
    } catch (err: any) {
      const prismaUnavailable = err?.code === 'P1001' || err?.code === 'P1002' || err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('Authentication failed against database server');
      if (prismaUnavailable) {
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database is unavailable. Please ensure PostgreSQL is running locally or in Docker.'
        });
      }

      const status = err.statusCode || 401;
      return reply.status(status).send({ statusCode: status, error: 'Authentication Failed', message: err.message });
    }
  });

  // POST /refresh
  app.post('/refresh', async (request, reply) => {
    try {
      const token = request.cookies?.refreshToken || (request.body as any)?.refreshToken;
      if (!token) {
        reply.clearCookie('refreshToken', { path: '/' });
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'No refresh token' });
      }
      const result = await AuthService.refreshToken(token);
      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true, path: '/', secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: 30 * 24 * 60 * 60
      });
      return reply.send({ accessToken: result.accessToken });
    } catch (err: any) {
      reply.clearCookie('refreshToken', { path: '/' });
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: err.message });
    }
  });

  // POST /logout
  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sessionId = (request as any).user?.sessionId;
      if (sessionId) await AuthService.logout(sessionId);
      reply.clearCookie('refreshToken', { path: '/' });
      return reply.send({ message: 'Logged out successfully' });
    } catch {
      reply.clearCookie('refreshToken', { path: '/' });
      return reply.send({ message: 'Logged out' });
    }
  });

  // POST /logout-all
  app.post('/logout-all', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' });
    await AuthService.logoutAll(userId);
    reply.clearCookie('refreshToken', { path: '/' });
    return reply.send({ message: 'All sessions terminated' });
  });

  // POST /forgot-password
  app.post('/forgot-password', async (request, reply) => {
    const { email } = request.body as any;
    await AuthService.forgotPassword(email); // always returns 200 to prevent email enumeration
    return reply.send({ message: 'If an account with that email exists, a reset link has been sent.' });
  });

  // POST /reset-password
  app.post('/reset-password', async (request, reply) => {
    try {
      const { token, password } = request.body as any;
      await AuthService.resetPassword(token, password);
      return reply.send({ message: 'Password reset successfully. Please log in.' });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({ statusCode: err.statusCode || 400, error: 'Bad Request', message: err.message });
    }
  });

  // POST /verify-email
  app.post('/verify-email', async (request, reply) => {
    try {
      const { token } = request.body as any;
      await AuthService.verifyEmail(token);
      return reply.send({ message: 'Email verified successfully' });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({ statusCode: err.statusCode || 400, error: 'Bad Request', message: err.message });
    }
  });

  // GET /sessions  (requires auth)
  app.get('/sessions', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    const sessions = await AuthService.getSessions(userId);
    return reply.send({ data: sessions });
  });

  // DELETE /sessions/:id
  app.delete('/sessions/:id', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    const { id } = request.params as any;
    await AuthService.revokeSession(id, userId);
    return reply.send({ message: 'Session revoked' });
  });
}
