import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/finance',
  },
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.ts' },
});
