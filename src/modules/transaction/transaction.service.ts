import { prisma } from "../../config/prisma";
import {
  ErrorCode,
  TransactionType,
  TransactionStatus,
  EntryType,
} from "../../types/enums";
import { TransactionResponse } from "../../types/wallet.types";
import { NotFoundError } from "../../middlewares/errorHandler";
import { createChildLogger } from "../../utils/logger";
import {
  findTransactionById,
  findTransactionsByUser,
} from "./transaction.repository";
import { GetTransactionsByUserInput } from "./transaction.schema";

const log = createChildLogger({ module: "transaction.service" });

export async function getTransactionById(
  transactionId: string,
): Promise<TransactionResponse> {
  log.info({ transactionId }, "getTransactionById called");

  const tx = await findTransactionById(prisma, transactionId);
  if (!tx) {
    throw new NotFoundError(
      ErrorCode.TRANSACTION_NOT_FOUND,
      `Transaction not found: ${transactionId}`,
    );
  }

  return mapToResponse(tx);
}

export async function getTransactionsByUser(
  input: GetTransactionsByUserInput,
): Promise<{
  transactions: TransactionResponse[];
  total: number;
  limit: number;
  offset: number;
}> {
  log.info({ input }, "getTransactionsByUser called");
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new NotFoundError(
        ErrorCode.USER_NOT_FOUND,
        `User not found: ${input.userId}`,
      );
    }

    const { transactions, total } = await findTransactionsByUser(prisma, {
      userId: input.userId,
      type: input.type,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    });

    return {
      transactions: transactions.map(mapToResponse),
      total,
      limit: input.limit,
      offset: input.offset,
    };
  } catch (error) {
    console.error("Error in getTransactionsByUser:", error);
    throw error;
  }
}

function mapToResponse(tx: {
  id: string;
  idempotencyKey: string;
  type: string;
  status: string;
  amount: { toFixed: (d: number) => string };
  assetTypeId: string;
  description: string | null;
  createdAt: Date;
  ledgerEntries: Array<{
    id: string;
    walletId: string;
    entryType: string;
    amount: { toFixed: (d: number) => string };
    runningBalance: { toFixed: (d: number) => string };
  }>;
}): TransactionResponse {
  return {
    transactionId: tx.id,
    idempotencyKey: tx.idempotencyKey,
    type: tx.type as TransactionType,
    status: tx.status as TransactionStatus,
    amount: tx.amount.toFixed(8),
    assetTypeId: tx.assetTypeId,
    description: tx.description,
    createdAt: tx.createdAt,
    ledgerEntries: tx.ledgerEntries.map((e) => ({
      entryId: e.id,
      walletId: e.walletId,
      entryType: e.entryType as EntryType,
      amount: e.amount.toFixed(8),
      runningBalance: e.runningBalance.toFixed(8),
    })),
  };
}
