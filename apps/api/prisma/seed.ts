import { PrismaPg } from '@prisma/adapter-pg';
import { CategoryType, PrismaClient } from '@prisma/client';

export const FIXED_CATEGORIES: { name: string; type: CategoryType }[] = [
  { name: 'Groceries', type: 'expense' },
  { name: 'Dining', type: 'expense' },
  { name: 'Rent', type: 'expense' },
  { name: 'Utilities', type: 'expense' },
  { name: 'Transport', type: 'expense' },
  { name: 'Health', type: 'expense' },
  { name: 'Entertainment', type: 'expense' },
  { name: 'Shopping', type: 'expense' },
  { name: 'Travel', type: 'expense' },
  { name: 'Salary', type: 'income' },
  { name: 'Freelance', type: 'income' },
  { name: 'Interest', type: 'income' },
];

export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(
    new Date(),
  );
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {}
  const client = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
  try {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'TRUNCATE TABLE entries, transactions, balance_snapshots, scheduled_items, projects, system_accounts, categories, accounts RESTART IDENTITY CASCADE',
      );
      await tx.systemAccount.create({ data: { kind: 'equity' } });
      for (const category of FIXED_CATEGORIES) {
        const row = await tx.category.create({ data: category });
        await tx.systemAccount.create({ data: { kind: 'category', categoryId: row.id } });
      }
    });
    console.log(
      `db:seed OK: ${FIXED_CATEGORIES.length} categories with system accounts, run date ${todayIn(
        process.env.APP_TIMEZONE ?? 'UTC',
      )}`,
    );
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  void main();
}
