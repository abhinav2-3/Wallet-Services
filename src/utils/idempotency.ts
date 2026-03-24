import { prisma } from "../config/prisma";
import { TransactionResponse } from "../types/wallet.types";
import { TransactionType, TransactionStatus, EntryType } from "../types/enums";

export class DuplicateRequestError extends Error {
  public readonly existingTransaction: TransactionResponse;

  constructor(existing: TransactionResponse) {
    super(
      `Duplicate request. Transaction already processed: ${existing.transactionId}`,
    );
    this.name = "DuplicateRequestError";
    this.existingTransaction = existing;
  }
}

export async function checkIdempotency(
  idempotencyKey: string,
): Promise<TransactionResponse | null> {
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey },
    include: {
      ledgerEntries: true,
    },
  });

  if (!existing) return null;

  return mapTransactionToResponse(existing);
}

function mapTransactionToResponse(tx: {
  id: string;
  idempotencyKey: string;
  type: string;
  status: string;
  amount: { toString: () => string };
  assetTypeId: string;
  description: string | null;
  createdAt: Date;
  ledgerEntries: Array<{
    id: string;
    walletId: string;
    entryType: string;
    amount: { toString: () => string };
    runningBalance: { toString: () => string };
  }>;
}): TransactionResponse {
  return {
    transactionId: tx.id,
    idempotencyKey: tx.idempotencyKey,
    type: tx.type as TransactionType,
    status: tx.status as TransactionStatus,
    amount: tx.amount.toString(),
    assetTypeId: tx.assetTypeId,
    description: tx.description,
    createdAt: tx.createdAt,
    ledgerEntries: tx.ledgerEntries.map((entry) => ({
      entryId: entry.id,
      walletId: entry.walletId,
      entryType: entry.entryType as EntryType,
      amount: entry.amount.toString(),
      runningBalance: entry.runningBalance.toString(),
    })),
  };
}
