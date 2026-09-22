import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

type LedgerTables = Pick<PrismaClient, 'account' | 'entry'>;
type ReadDb = LedgerTables & Pick<PrismaClient, 'balanceSnapshot' | '$queryRaw'>;

export async function computedBalances(db: LedgerTables): Promise<Map<bigint, bigint>> {
  const accounts = await db.account.findMany({ select: { id: true } });
  const balances = new Map<bigint, bigint>(accounts.map((account) => [account.id, 0n]));
  const sums = await db.entry.groupBy({
    by: ['accountId'],
    where: { accountId: { not: null }, transaction: { deletedAt: null } },
    _sum: { amount: true },
  });
  for (const sum of sums) {
    if (sum.accountId !== null) {
      balances.set(sum.accountId, sum._sum.amount ?? 0n);
    }
  }
  return balances;
}

export async function check(db: ReadDb): Promise<string[]> {
  const failures: string[] = [];
  const [{ total }] = await db.$queryRaw<[{ total: bigint }]>`
    SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM entries`;
  if (total !== 0n) {
    failures.push(`global entry sum is ${total}, not zero`);
  }
  const snapshots = new Map(
    (await db.balanceSnapshot.findMany()).map((snapshot) => [snapshot.accountId, snapshot.balance]),
  );
  for (const [accountId, balance] of await computedBalances(db)) {
    const snapshot = snapshots.get(accountId) ?? 0n;
    if (snapshot !== balance) {
      failures.push(`account ${accountId}: snapshot ${snapshot} differs from computed ${balance}`);
    }
  }
  return failures;
}

export async function rebuild(client: PrismaClient): Promise<void> {
  await client.$transaction(async (tx) => {
    const computed = await computedBalances(tx);
    await tx.balanceSnapshot.deleteMany();
    await tx.balanceSnapshot.createMany({
      data: [...computed].map(([accountId, balance]) => ({ accountId, balance })),
    });
  });
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {}
  const mode = process.argv[2];
  const client = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
  try {
    if (mode === 'check') {
      const failures = await check(client);
      if (failures.length > 0) {
        for (const failure of failures) {
          console.error(`ledger:check FAILED: ${failure}`);
        }
        process.exitCode = 1;
        return;
      }
      console.log('ledger:check OK: entries sum to zero and every snapshot matches its entries');
    } else if (mode === 'rebuild') {
      await rebuild(client);
      console.log('ledger:rebuild OK: every snapshot recomputed from entries in one transaction');
    } else {
      console.error('usage: node reconciliation.ts <check|rebuild>');
      process.exitCode = 2;
    }
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith('reconciliation.ts')) {
  void main();
}
