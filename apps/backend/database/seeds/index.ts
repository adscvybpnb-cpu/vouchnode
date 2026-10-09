import { PrismaClient } from '@prisma/client';
import { seedRoles } from './roles.seed';
import { seedCurrencies } from './currencies.seed';
import { seedCountries } from './countries.seed';
import { seedSettings } from './system-settings.seed';
import { seedCategories } from './categories.seed';
import { seedDemo } from './demo.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');
  await seedRoles(prisma);
  await seedCurrencies(prisma);
  await seedCountries(prisma);
  await seedSettings(prisma);
  await seedCategories(prisma);
  
  if (process.env.NODE_ENV !== 'production') {
    await seedDemo(prisma);
  }
  
  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
