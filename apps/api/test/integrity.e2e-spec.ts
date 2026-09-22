import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { LedgerService } from '../src/modules/ledger/services/ledger.service';

const run = promisify(execFile);

async function ledgerCheck(): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run('node', ['src/modules/ledger/reconciliation.ts', 'check']);
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
  }
}

async function ledgerRebuild(): Promise<void> {
  await run('node', ['src/modules/ledger/reconciliation.ts', 'rebuild']);
}

describe('ledger integrity (SC-002, SC-010)', () => {
  let prisma: PrismaClient;
  let app: INestApplicationContext;
  let ledger: LedgerService;
  let accountId: bigint;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    ledger = app.get(LedgerService);
    const account = await prisma.account.create({
      data: {
        name: `Integrity Probe ${Date.now()}`,
        kind: 'bank',
        openingDate: new Date('2026-09-01'),
      },
    });
    accountId = account.id;
    await ledger.record({
      kind: 'opening',
      amount: 150000n,
      accountId,
      date: '2026-09-01',
      description: 'Opening balance',
    });
    const groceries = await prisma.category.findFirst({ where: { name: 'Groceries' } });
    if (!groceries) throw new Error('run db:seed before test:e2e');
    await ledger.record({
      kind: 'expense',
      amount: 4250n,
      accountId,
      categoryId: groceries.id,
      date: '2026-09-10',
      description: 'Market',
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('sums every entry in the database to exactly zero', async () => {
    const [{ total }] = await prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM entries`;
    expect(total).toBe(0n);
  });

  it('keeps the snapshot equal to the entry sum after real writes through the ledger', async () => {
    const snapshot = await prisma.balanceSnapshot.findUnique({ where: { accountId } });
    expect(snapshot?.balance).toBe(145750n);
    const { code, output } = await ledgerCheck();
    expect(output).toContain('ledger:check OK');
    expect(code).toBe(0);
  });

  it('rejects unbalanced entries at commit through the database constraint trigger', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const row = await tx.transaction.create({
          data: { kind: 'expense', date: new Date('2026-09-11'), description: 'unbalanced write' },
        });
        await tx.entry.create({ data: { transactionId: row.id, accountId, amount: -100n } });
      }),
    ).rejects.toThrow(/sum to -100, not zero/);
    const [{ total }] = await prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM entries`;
    expect(total).toBe(0n);
  });

  it('fails ledger:check naming the corrupted snapshot, and passes again after ledger:rebuild', async () => {
    await prisma.balanceSnapshot.update({
      where: { accountId },
      data: { balance: { increment: 1n } },
    });
    const corrupted = await ledgerCheck();
    expect(corrupted.code).toBe(1);
    expect(corrupted.output).toContain(
      `account ${accountId}: snapshot 145751 differs from computed 145750`,
    );

    await ledgerRebuild();
    const repaired = await ledgerCheck();
    expect(repaired.code).toBe(0);
    expect(repaired.output).toContain('ledger:check OK');
  });
});
