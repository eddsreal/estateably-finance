import { PrismaPg } from '@prisma/adapter-pg';
import {
  AccountKind,
  CategoryType,
  Prisma,
  PrismaClient,
  ProjectStatus,
  Recurrence,
  ScheduledItemKind,
  TransactionKind,
} from '@prisma/client';
import { addDays, addMonthsClamped } from '../src/common/dates/dates.ts';
import { toEntries, type LedgerIntent } from '../src/modules/ledger/domain/to-entries.ts';

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

const ACCOUNTS: { name: string; kind: AccountKind; archived?: boolean }[] = [
  { name: 'Checking', kind: 'bank' },
  { name: 'Savings', kind: 'bank' },
  { name: 'Visa', kind: 'card' },
  { name: 'Cash', kind: 'cash' },
  { name: 'Old Bank', kind: 'bank', archived: true },
];

type SeedTransaction = {
  month: 0 | 1 | 2;
  day: number;
  kind: TransactionKind;
  amount: bigint;
  account: string;
  category?: string;
  counterAccount?: string;
  project?: string;
  description: string;
};

const OPENINGS: SeedTransaction[] = [
  {
    month: 0,
    day: 1,
    kind: 'opening',
    amount: 150000n,
    account: 'Checking',
    description: 'Opening balance',
  },
  {
    month: 0,
    day: 1,
    kind: 'opening',
    amount: -50000n,
    account: 'Visa',
    description: 'Opening balance',
  },
  {
    month: 0,
    day: 1,
    kind: 'opening',
    amount: 25000n,
    account: 'Old Bank',
    description: 'Opening balance',
  },
];

const PROJECTS: { name: string; budget: bigint | null; status: ProjectStatus }[] = [
  { name: 'Trip to France', budget: 500000n, status: 'active' },
  { name: 'Home office', budget: 5000n, status: 'closed' },
];

const UBER_DESCRIPTIONS = ['Uber 1234', 'UBER 5678', 'uber'];

function monthlyTransactions(month: 0 | 1 | 2): SeedTransaction[] {
  return [
    {
      month,
      day: 1,
      kind: 'expense',
      amount: 120000n,
      account: 'Checking',
      category: 'Rent',
      description: 'Rent',
    },
    {
      month,
      day: 1,
      kind: 'income',
      amount: 300000n,
      account: 'Checking',
      category: 'Salary',
      description: 'Acme payroll',
    },
    {
      month,
      day: 2,
      kind: 'transfer',
      amount: 15000n,
      account: 'Checking',
      counterAccount: 'Cash',
      description: 'ATM withdrawal',
    },
    {
      month,
      day: 2,
      kind: 'expense',
      amount: 8550n,
      account: 'Checking',
      category: 'Utilities',
      description: 'Hydro bill',
    },
    {
      month,
      day: 3,
      kind: 'expense',
      amount: 7240n,
      account: 'Checking',
      category: 'Groceries',
      description: 'Market',
    },
    {
      month,
      day: 4,
      kind: 'expense',
      amount: 2375n,
      account: 'Visa',
      category: 'Dining',
      description: 'Lunch bistro',
    },
    {
      month,
      day: 5,
      kind: 'expense',
      amount: 1830n,
      account: 'Cash',
      category: 'Transport',
      description: UBER_DESCRIPTIONS[month],
    },
    {
      month,
      day: 6,
      kind: 'expense',
      amount: 4000n,
      account: 'Cash',
      category: 'Health',
      description: 'Pharmacy',
    },
    {
      month,
      day: 7,
      kind: 'expense',
      amount: 1599n,
      account: 'Visa',
      category: 'Entertainment',
      description: 'Cinema',
    },
    {
      month,
      day: 8,
      kind: 'expense',
      amount: 8990n,
      account: 'Visa',
      category: 'Shopping',
      description: 'Clothing store',
    },
    {
      month,
      day: 9,
      kind: 'expense',
      amount: 12000n,
      account: 'Visa',
      category: 'Travel',
      description: 'Train tickets',
      project: 'Trip to France',
    },
    {
      month,
      day: 10,
      kind: 'expense',
      amount: 5410n,
      account: 'Checking',
      category: 'Groceries',
      description: 'Market',
    },
    {
      month,
      day: 11,
      kind: 'transfer',
      amount: 50000n,
      account: 'Checking',
      counterAccount: 'Savings',
      description: 'To savings',
    },
    {
      month,
      day: 12,
      kind: 'income',
      amount: 45000n,
      account: 'Checking',
      category: 'Freelance',
      description: 'Invoice 42',
    },
    {
      month,
      day: 13,
      kind: 'income',
      amount: 1235n,
      account: 'Savings',
      category: 'Interest',
      description: 'Monthly interest',
    },
    {
      month,
      day: 14,
      kind: 'expense',
      amount: 3120n,
      account: 'Cash',
      category: 'Dining',
      description: 'Pizza night',
    },
    {
      month,
      day: 15,
      kind: 'expense',
      amount: 6680n,
      account: 'Checking',
      category: 'Groceries',
      description: 'Supermarket',
    },
    {
      month,
      day: 16,
      kind: 'expense',
      amount: 275n,
      account: 'Cash',
      category: 'Transport',
      description: 'Bus fare',
    },
    {
      month,
      day: 17,
      kind: 'expense',
      amount: 1199n,
      account: 'Visa',
      category: 'Subscriptions',
      description: 'News subscription',
    },
    {
      month,
      day: 18,
      kind: 'expense',
      amount: 6000n,
      account: 'Checking',
      category: 'Utilities',
      description: 'Internet',
    },
    {
      month,
      day: 20,
      kind: 'expense',
      amount: 4825n,
      account: 'Checking',
      category: 'Groceries',
      description: 'Market',
    },
    {
      month,
      day: 21,
      kind: 'expense',
      amount: 5800n,
      account: 'Visa',
      category: 'Dining',
      description: 'Dinner out',
    },
    {
      month,
      day: 22,
      kind: 'expense',
      amount: 999n,
      account: 'Visa',
      category: 'Entertainment',
      description: 'Streaming',
    },
    {
      month,
      day: 24,
      kind: 'expense',
      amount: 2550n,
      account: 'Cash',
      category: 'Shopping',
      description: 'Bookstore',
      project: 'Home office',
    },
    {
      month,
      day: 25,
      kind: 'expense',
      amount: 2210n,
      account: 'Checking',
      category: 'Health',
      description: 'Dentist copay',
    },
    {
      month,
      day: 26,
      kind: 'expense',
      amount: 7500n,
      account: 'Checking',
      category: 'Travel',
      description: 'Gas station',
      project: 'Trip to France',
    },
  ];
}

const OLD_BANK_HISTORY: SeedTransaction[] = [
  {
    month: 0,
    day: 8,
    kind: 'expense',
    amount: 3000n,
    account: 'Old Bank',
    category: 'Groceries',
    description: 'Old market run',
  },
  {
    month: 0,
    day: 15,
    kind: 'transfer',
    amount: 10000n,
    account: 'Old Bank',
    counterAccount: 'Checking',
    description: 'Moving out',
  },
];

type SeedScheduledItem = {
  kind: ScheduledItemKind;
  description: string;
  amount: bigint;
  account: string;
  category: string;
  nextDueDate: string;
  recurrence: Recurrence;
  endDate?: string;
};

function next31st(today: string): string {
  const [year, month] = today.split('-').map(Number);
  for (let offset = 0; ; offset += 1) {
    const last = new Date(Date.UTC(year, month + offset, 0));
    const date = last.toISOString().slice(0, 10);
    if (last.getUTCDate() === 31 && date >= today) return date;
  }
}

function scheduledItems(today: string): SeedScheduledItem[] {
  return [
    {
      kind: 'bill',
      description: 'Property tax',
      amount: 900000n,
      account: 'Checking',
      category: 'Utilities',
      nextDueDate: addDays(today, 20),
      recurrence: 'once',
    },
    {
      kind: 'bill',
      description: 'Storage rent',
      amount: 7500n,
      account: 'Checking',
      category: 'Rent',
      nextDueDate: next31st(today),
      recurrence: 'monthly',
    },
    {
      kind: 'income',
      description: 'Dog walking',
      amount: 4500n,
      account: 'Cash',
      category: 'Freelance',
      nextDueDate: addDays(today, 3),
      recurrence: 'weekly',
    },
    {
      kind: 'bill',
      description: 'Gym trial',
      amount: 5000n,
      account: 'Checking',
      category: 'Health',
      nextDueDate: addDays(today, 5),
      recurrence: 'monthly',
      endDate: addMonthsClamped(addDays(today, 5), 1),
    },
    {
      kind: 'bill',
      description: 'Water bill',
      amount: 6050n,
      account: 'Checking',
      category: 'Utilities',
      nextDueDate: addDays(today, -40),
      recurrence: 'monthly',
    },
  ];
}

export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(
    new Date(),
  );
}

function seedDate(today: string, month: 0 | 1 | 2, day: number): string {
  const [year, monthOfYear, dayOfMonth] = today.split('-').map(Number);
  const target = new Date(Date.UTC(year, monthOfYear - 1 - (2 - month), 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cappedDay = month === 2 ? Math.min(day, dayOfMonth, lastDay) : Math.min(day, lastDay);
  target.setUTCDate(cappedDay);
  return target.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {}
  const today = todayIn(process.env.APP_TIMEZONE ?? 'UTC');
  const client = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
  try {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'TRUNCATE TABLE entries, transactions, balance_snapshots, scheduled_items, projects, system_accounts, categories, accounts RESTART IDENTITY CASCADE',
      );
      const equity = await tx.systemAccount.create({ data: { kind: 'equity' } });

      const categories = new Map<
        string,
        { id: bigint; type: CategoryType; systemAccountId: bigint }
      >();
      const allCategories = [
        ...FIXED_CATEGORIES,
        { name: 'Subscriptions', type: 'expense' as CategoryType, archived: true },
      ];
      for (const category of allCategories) {
        const row = await tx.category.create({
          data: {
            name: category.name,
            type: category.type,
            archived: 'archived' in category ? category.archived : false,
          },
        });
        const systemAccount = await tx.systemAccount.create({
          data: { kind: 'category', categoryId: row.id },
        });
        categories.set(category.name, {
          id: row.id,
          type: category.type,
          systemAccountId: systemAccount.id,
        });
      }

      const accounts = new Map<string, bigint>();
      for (const account of ACCOUNTS) {
        const row = await tx.account.create({
          data: {
            name: account.name,
            kind: account.kind,
            openingDate: new Date(`${seedDate(today, 0, 1)}T00:00:00Z`),
            archived: account.archived ?? false,
          },
        });
        accounts.set(account.name, row.id);
      }

      const projects = new Map<string, bigint>();
      for (const project of PROJECTS) {
        const row = await tx.project.create({ data: project });
        projects.set(project.name, row.id);
      }

      const balances = new Map<bigint, bigint>();
      const seedTransactions = [
        ...OPENINGS,
        ...monthlyTransactions(0),
        ...monthlyTransactions(1),
        ...monthlyTransactions(2),
        ...OLD_BANK_HISTORY,
      ];
      for (const item of seedTransactions) {
        const accountId = accounts.get(item.account)!;
        let intent: LedgerIntent;
        if (item.kind === 'opening') {
          intent = {
            kind: 'opening',
            amount: item.amount,
            accountId,
            equitySystemAccountId: equity.id,
          };
        } else if (item.kind === 'transfer') {
          intent = {
            kind: 'transfer',
            amount: item.amount,
            accountId,
            counterAccountId: accounts.get(item.counterAccount!)!,
          };
        } else {
          intent = {
            kind: item.kind,
            amount: item.amount,
            accountId,
            categorySystemAccountId: categories.get(item.category!)!.systemAccountId,
          };
        }
        const entries = toEntries(intent);
        await tx.transaction.create({
          data: {
            kind: item.kind,
            date: new Date(`${seedDate(today, item.month, item.day)}T00:00:00Z`),
            description: item.description,
            projectId: item.project === undefined ? null : projects.get(item.project)!,
            entries: { create: entries },
          },
        });
        for (const entry of entries) {
          if (entry.accountId !== null) {
            balances.set(entry.accountId, (balances.get(entry.accountId) ?? 0n) + entry.amount);
          }
        }
      }

      const snapshots: Prisma.BalanceSnapshotCreateManyInput[] = [];
      for (const [accountId, balance] of balances) {
        snapshots.push({ accountId, balance });
      }
      await tx.balanceSnapshot.createMany({ data: snapshots });

      const seedItems = scheduledItems(today);
      for (const item of seedItems) {
        await tx.scheduledItem.create({
          data: {
            kind: item.kind,
            description: item.description,
            amount: item.amount,
            accountId: accounts.get(item.account)!,
            categoryId: categories.get(item.category)!.id,
            nextDueDate: new Date(`${item.nextDueDate}T00:00:00Z`),
            recurrence: item.recurrence,
            endDate: item.endDate === undefined ? null : new Date(`${item.endDate}T00:00:00Z`),
          },
        });
      }

      console.log(
        `db:seed OK: ${allCategories.length} categories, ${accounts.size} accounts, ${seedTransactions.length} transactions, ${seedItems.length} scheduled items, ${projects.size} projects, run date ${today}`,
      );
    });
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  void main();
}
