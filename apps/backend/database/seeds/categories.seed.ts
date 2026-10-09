import { PrismaClient } from '@prisma/client';

export async function seedCategories(prisma: PrismaClient) {
  console.log('Seeding categories...');
  const cats = [
    'Gift Cards',
    'Gaming',
    'Game Credits',
    'Steam Keys',
    'PUBG Mobile',
    'Free Fire',
    'Roblox',
    'Fortnite',
    'Rocket League',
    'Digital Software',
    'Streaming',
  ];
  for (const c of cats) {
    await prisma.category.upsert({
      where: { slug: c.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: { name: c, slug: c.toLowerCase().replace(/\s+/g, '-') }
    });
  }
}
