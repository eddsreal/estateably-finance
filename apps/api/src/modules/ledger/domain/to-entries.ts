export type EntryDraft =
  | { accountId: bigint; systemAccountId: null; amount: bigint }
  | { accountId: null; systemAccountId: bigint; amount: bigint };

export type LedgerIntent =
  | { kind: 'expense'; amount: bigint; accountId: bigint; categorySystemAccountId: bigint }
  | { kind: 'income'; amount: bigint; accountId: bigint; categorySystemAccountId: bigint }
  | { kind: 'transfer'; amount: bigint; accountId: bigint; counterAccountId: bigint }
  | { kind: 'opening'; amount: bigint; accountId: bigint; equitySystemAccountId: bigint };

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerInvariantError';
  }
}

function user(accountId: bigint, amount: bigint): EntryDraft {
  return { accountId, systemAccountId: null, amount };
}

function system(systemAccountId: bigint, amount: bigint): EntryDraft {
  return { accountId: null, systemAccountId, amount };
}

export function toEntries(intent: LedgerIntent): [EntryDraft, EntryDraft] {
  let entries: [EntryDraft, EntryDraft];
  switch (intent.kind) {
    case 'expense':
    case 'income':
    case 'transfer': {
      if (intent.amount <= 0n) {
        throw new LedgerInvariantError(`a ${intent.kind} amount must be positive`);
      }
      if (intent.kind === 'transfer') {
        if (intent.accountId === intent.counterAccountId) {
          throw new LedgerInvariantError('a transfer needs two distinct accounts');
        }
        entries = [
          user(intent.accountId, -intent.amount),
          user(intent.counterAccountId, intent.amount),
        ];
      } else if (intent.kind === 'expense') {
        entries = [
          user(intent.accountId, -intent.amount),
          system(intent.categorySystemAccountId, intent.amount),
        ];
      } else {
        entries = [
          user(intent.accountId, intent.amount),
          system(intent.categorySystemAccountId, -intent.amount),
        ];
      }
      break;
    }
    case 'opening': {
      if (intent.amount === 0n) {
        throw new LedgerInvariantError('an opening amount must be non-zero');
      }
      entries = [
        user(intent.accountId, intent.amount),
        system(intent.equitySystemAccountId, -intent.amount),
      ];
      break;
    }
  }
  if (entries[0].amount + entries[1].amount !== 0n) {
    throw new LedgerInvariantError('entries must sum to zero');
  }
  return entries;
}
