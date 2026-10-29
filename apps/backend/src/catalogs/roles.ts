import { PrismaClient } from '@prisma/client';

export const ROLE_CATALOG = ['BUYER', 'SELLER', 'ADMIN', 'SUPPORT'] as const;

export async function seedRoles(prisma: PrismaClient) {
  console.log('Seeding roles...');
  for (const name of ROLE_CATALOG) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }
}
