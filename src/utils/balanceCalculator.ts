import { Decimal } from "@prisma/client/runtime/library";
import { EntryType } from "../types/enums";
import { prisma } from "../config/prisma";

export async function calculateBalance(
  walletId: string,
  assetTypeId: string,
): Promise<Decimal> {
  const [credits, debits] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { walletId, assetTypeId, entryType: EntryType.CREDIT },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { walletId, assetTypeId, entryType: EntryType.DEBIT },
      _sum: { amount: true },
    }),
  ]);

  const totalCredits = new Decimal(credits._sum.amount ?? 0);
  const totalDebits = new Decimal(debits._sum.amount ?? 0);

  return totalCredits.minus(totalDebits);
}

export async function calculateBalanceInTransaction(
  tx: Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  walletId: string,
  assetTypeId: string,
): Promise<Decimal> {
  const [credits, debits] = await Promise.all([
    tx.ledgerEntry.aggregate({
      where: { walletId, assetTypeId, entryType: EntryType.CREDIT },
      _sum: { amount: true },
    }),
    tx.ledgerEntry.aggregate({
      where: { walletId, assetTypeId, entryType: EntryType.DEBIT },
      _sum: { amount: true },
    }),
  ]);

  const totalCredits = new Decimal(credits._sum.amount ?? 0);
  const totalDebits = new Decimal(debits._sum.amount ?? 0);

  return totalCredits.minus(totalDebits);
}

export function assertSufficientBalance(
  balance: Decimal,
  amount: Decimal,
): void {
  if (balance.lessThan(amount)) {
    throw new InsufficientBalanceError(balance, amount);
  }
}

export class InsufficientBalanceError extends Error {
  public readonly currentBalance: string;
  public readonly requiredAmount: string;

  constructor(balance: Decimal, required: Decimal) {
    super(
      `Insufficient balance. Current: ${balance.toFixed(8)}, Required: ${required.toFixed(8)}`,
    );
    this.name = "InsufficientBalanceError";
    this.currentBalance = balance.toFixed(8);
    this.requiredAmount = required.toFixed(8);
  }
}
