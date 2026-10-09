import { PrismaClient, UserStatus } from '@prisma/client';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import path from 'path';

const prisma = new PrismaClient();
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const ADMIN_ID = process.env.ADMIN_USER_ID || '11111111-1111-4111-8111-111111111111';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim();
const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('Admin seeding requires ADMIN_EMAIL, ADMIN_USERNAME, and ADMIN_PASSWORD from the protected environment.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }
  if (ADMIN_PASSWORD.length < 16) {
    throw new Error('ADMIN_PASSWORD must be at least 16 characters.');
  }

  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'Platform administrator' },
  });
  const existingByEmail = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });
  if (existingByEmail && existingByEmail.id !== ADMIN_ID) {
    throw new Error(`Cannot seed admin: ${ADMIN_EMAIL} belongs to a different user (${existingByEmail.id}).`);
  }

  const passwordHash = await argon2.hash(ADMIN_PASSWORD);
  const user = await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {
      email: ADMIN_EMAIL,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      profile: {
        upsert: {
          create: {
            username: ADMIN_USERNAME,
            displayName: 'Platform Administrator',
            isIdentityVerified: true,
          },
          update: {
            username: ADMIN_USERNAME,
            displayName: 'Platform Administrator',
            isIdentityVerified: true,
          },
        },
      },
    },
    create: {
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profile: {
        create: {
          username: ADMIN_USERNAME,
          displayName: 'Platform Administrator',
          isIdentityVerified: true,
        },
      },
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`Admin seed ready: ${user.id} (${ADMIN_EMAIL})`);
}

main()
  .catch((error) => {
    console.error('Admin seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
