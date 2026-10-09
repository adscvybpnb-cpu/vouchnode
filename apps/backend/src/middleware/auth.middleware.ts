import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';

interface JwtPayload {
  id: string;
  email: string;
  roles: string[];
  sessionId?: string;
  adminAuth?: boolean;
  tokenVersion?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'No authorization token provided' });
  }
  const token = authHeader.slice(7);
  let payload: JwtPayload;

  try {
    if (config.admin.tokenSecret) {
      try {
        payload = jwt.verify(token, config.admin.tokenSecret) as JwtPayload;
        if (payload.adminAuth === true) {
          request.user = payload;
          return;
        }
      } catch {
        // Fall through to the regular user token verifier.
      }
    }
    payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
  } catch {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { status: true, tokenVersion: true },
    });
    if (!user || (user.status !== 'ACTIVE' && user.status !== 'PENDING_VERIFICATION')) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'ACCOUNT_LOCKED',
        message: 'Your account is no longer active. Please sign in again.',
      });
    }
    if (!Number.isInteger(payload.tokenVersion) || payload.tokenVersion !== user.tokenVersion) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'SESSION_REVOKED',
        message: 'Your session has been revoked. Please sign in again.',
      });
    }
    request.user = payload;
  } catch (error) {
    request.log.error({ error }, 'Unable to verify account status for authenticated request');
    return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Unable to verify account status' });
  }
}

export async function requireAdminToken(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.adminAuth !== true) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Dedicated admin login required' });
  }
}

export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      request.user = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
    }
  } catch {
    // No token or invalid token - that's ok for optional auth
  }
}

export function requireRole(...rolesOrArray: (string | string[])[]) {
  const roles = rolesOrArray.flat();
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    }
    const hasRole = request.user.roles?.some(r => roles.includes(r));
    const activeSeller = !hasRole && roles.includes('SELLER')
      ? await prisma.seller.findUnique({
        where: { userId: request.user.id },
        select: { status: true },
      })
      : null;
    const hasSellerAccess = activeSeller?.status === 'ACTIVE';
    if (!hasRole && !hasSellerAccess) {
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: `Required role: ${roles.join(' or ')}` });
    }
  };
}

export async function requireApprovedSeller(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
  }

  const seller = await prisma.seller.findUnique({
    where: { userId: request.user.id },
    select: { status: true },
  });

  if (seller?.status !== 'ACTIVE') {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'An approved seller account is required before publishing listings or P2P offers',
    });
  }
}
