import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { addDays, addMonthsClamped } from '../src/common/dates/dates.ts';
import { rebuild } from '../src/modules/ledger/reconciliation.ts';
import { toEntries, type LedgerIntent } from '../src/modules/ledger/domain/to-entries.ts';
import { seed, todayIn } from './seed.ts';

export const PERF_TRANSACTIONS = 5000;
const PERF_MONTHS = 24;

export function mulberry32(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DESCRIPTIONS: Record<'expense' | 'income' | 'transfer', string[]> = {
  expense: ['Market', 'Uber', 'Coffee', 'Pharmacy', 'Bookstore', 'Gas station', 'Dinner out'],
  income: ['Acme payroll', 'Invoice', 'Refund'],
  transfer: ['To savings', 'ATM withdrawal', 'Card payment'],
};

async function main(): Promise<void> {
  await seed();
  const today = todayIn(process.env.APP_TIMEZONE ?? 'UTC');
  const firstDay = addMonthsClamped(today, -PERF_MONTHS);
  const spanDays = Math.round((Date.parse(today) - Date.parse(firstDay)) / 86_400_000);
  const random = mulberry32(20260924);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const cents = (min: number, max: number): bigint =>
    BigInt(min + Math.floor(random() * (max - min)));

  const client = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
  try {
    await client.$transaction(
      async (tx) => {
        const opening = new Date(`${firstDay}T00:00:00Z`);
        await tx.account.updateMany({ data: { openingDate: opening } });
        await tx.transaction.updateMany({ where: { kind: 'opening' }, data: { date: opening } });

        const accounts = (await tx.account.findMany({ where: { archived: false } })).map(
          (account) => account.id,
        );
        const categories = await tx.category.findMany({
          where: { archived: false },
          include: { systemAccount: true },
        });
        const byType = (type: 'expense' | 'income') =>
          categories
            .filter((category) => category.type === type)
            .map((category) => category.systemAccount!.id);
        const expenseCategories = byType('expense');
        const incomeCategories = byType('income');

        for (let index = 0; index < PERF_TRANSACTIONS; index += 1) {
          const roll = random();
          const kind: keyof typeof DESCRIPTIONS =
            roll < 0.8 ? 'expense' : roll < 0.92 ? 'income' : 'transfer';
          const accountId = pick(accounts);
          let intent: LedgerIntent;
          if (kind === 'transfer') {
            const others = accounts.filter((id) => id !== accountId);
            intent = {
              kind,
              amount: cents(1000, 100000),
              accountId,
              counterAccountId: pick(others),
            };
          } else if (kind === 'income') {
            intent = {
              kind,
              amount: cents(20000, 400000),
              accountId,
              categorySystemAccountId: pick(incomeCategories),
            };
          } else {
            intent = {
              kind,
              amount: cents(100, 20000),
              accountId,
              categorySystemAccountId: pick(expenseCategories),
            };
          }
          const suffix = random() < 0.5 ? ` ${Math.floor(random() * 9000) + 1000}` : '';
          await tx.transaction.create({
            data: {
              kind,
              date: new Date(
                `${addDays(firstDay, Math.floor(random() * (spanDays + 1)))}T00:00:00Z`,
              ),
              description: `${pick(DESCRIPTIONS[kind])}${suffix}`,
              entries: { create: toEntries(intent) },
            },
          });
        }
      },
      { timeout: 600_000 },
    );
    await rebuild(client);
    console.log(
      `db:generate-perf OK: ${PERF_TRANSACTIONS} transactions over ${PERF_MONTHS} months (${firstDay} to ${today}) on top of the demo seed`,
    );
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith('generate-perf.ts')) {
  void main();
}
