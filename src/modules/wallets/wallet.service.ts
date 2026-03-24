import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma";
import {
  TransactionStatus,
  TransactionType,
  EntryType,
  ErrorCode,
} from "../../types/enums";
import { BalanceResponse, TransactionResponse } from "../../types/wallet.types";
import { assertSufficientBalance } from "../../utils/balanceCalculator";
import {
  checkIdempotency,
  DuplicateRequestError,
} from "../../utils/idempotency";
import { createChildLogger } from "../../utils/logger";
import { AppError, NotFoundError } from "../../middlewares/errorHandler";
import {
  findWalletByUserAndAsset,
  findSystemWalletByAsset,
  lockWalletsForUpdate,
  createTransaction,
  updateTransactionStatus,
  createLedgerEntry,
  getBalanceFromLedger,
  findAssetTypeById,
  findUserById,
  getWalletsWithBalances,
} from "./wallet.repository";
import { TopUpInput, BonusInput, SpendInput } from "./wallet.schema";

const log = createChildLogger({ module: "wallet.service" });

// ─── Top-Up ───────────────────────────────────────────────────────────────────

export async function topUp(input: TopUpInput): Promise<TransactionResponse> {
  log.info({ input }, "topUp called");

  const existing = await checkIdempotency(input.idempotencyKey);
  if (existing) throw new DuplicateRequestError(existing);

  const amount = new Decimal(input.amount);

  return prisma.$transaction(async (tx) => {
    await assertEntitiesExist(tx as never, input.userId, input.assetTypeId);

    const [userWallet, systemWallet] = await resolveWallets(
      tx as never,
      input.userId,
      input.assetTypeId,
    );

    // Sort wallet IDs for consistent lock ordering — deadlock avoidance
    const sortedIds = [systemWallet.id, userWallet.id].sort();
    await lockWalletsForUpdate(tx as never, sortedIds);

    const transaction = await createTransaction(tx as never, {
      idempotencyKey: input.idempotencyKey,
      type: TransactionType.TOP_UP,
      status: TransactionStatus.PENDING,
      assetTypeId: input.assetTypeId,
      amount,
      initiatorUserId: input.userId,
      description: input.description,
    });

    const systemBalance = await getBalanceFromLedger(
      tx as never,
      systemWallet.id,
      input.assetTypeId,
    );
    const userBalance = await getBalanceFromLedger(
      tx as never,
      userWallet.id,
      input.assetTypeId,
    );

    const entries = await createDoubleEntry(tx as never, {
      transactionId: transaction.id,
      fromWalletId: systemWallet.id,
      toWalletId: userWallet.id,
      assetTypeId: input.assetTypeId,
      amount,
      fromRunningBalance: systemBalance.minus(amount),
      toRunningBalance: userBalance.plus(amount),
    });

    await updateTransactionStatus(
      tx as never,
      transaction.id,
      TransactionStatus.COMPLETED,
    );

    log.info({ transactionId: transaction.id }, "topUp completed");

    return buildTransactionResponse(
      transaction,
      amount,
      input,
      TransactionType.TOP_UP,
      entries,
    );
  });
}

// ─── Bonus ────────────────────────────────────────────────────────────────────

export async function bonus(input: BonusInput): Promise<TransactionResponse> {
  log.info({ input }, "bonus called");

  const existing = await checkIdempotency(input.idempotencyKey);
  if (existing) throw new DuplicateRequestError(existing);

  const amount = new Decimal(input.amount);

  return prisma.$transaction(async (tx) => {
    await assertEntitiesExist(tx as never, input.userId, input.assetTypeId);

    const [userWallet, systemWallet] = await resolveWallets(
      tx as never,
      input.userId,
      input.assetTypeId,
    );

    const sortedIds = [systemWallet.id, userWallet.id].sort();
    await lockWalletsForUpdate(tx as never, sortedIds);

    const transaction = await createTransaction(tx as never, {
      idempotencyKey: input.idempotencyKey,
      type: TransactionType.BONUS,
      status: TransactionStatus.PENDING,
      assetTypeId: input.assetTypeId,
      amount,
      initiatorUserId: input.userId,
      description: input.description ?? "Bonus incentive",
    });

    const systemBalance = await getBalanceFromLedger(
      tx as never,
      systemWallet.id,
      input.assetTypeId,
    );
    const userBalance = await getBalanceFromLedger(
      tx as never,
      userWallet.id,
      input.assetTypeId,
    );

    const entries = await createDoubleEntry(tx as never, {
      transactionId: transaction.id,
      fromWalletId: systemWallet.id,
      toWalletId: userWallet.id,
      assetTypeId: input.assetTypeId,
      amount,
      fromRunningBalance: systemBalance.minus(amount),
      toRunningBalance: userBalance.plus(amount),
    });

    await updateTransactionStatus(
      tx as never,
      transaction.id,
      TransactionStatus.COMPLETED,
    );

    log.info({ transactionId: transaction.id }, "bonus completed");

    return buildTransactionResponse(
      transaction,
      amount,
      input,
      TransactionType.BONUS,
      entries,
    );
  });
}

// ─── Spend ────────────────────────────────────────────────────────────────────

export async function spend(input: SpendInput): Promise<TransactionResponse> {
  log.info({ input }, "spend called");

  const existing = await checkIdempotency(input.idempotencyKey);
  if (existing) throw new DuplicateRequestError(existing);

  const amount = new Decimal(input.amount);

  return prisma.$transaction(async (tx) => {
    await assertEntitiesExist(tx as never, input.userId, input.assetTypeId);

    const [userWallet, systemWallet] = await resolveWallets(
      tx as never,
      input.userId,
      input.assetTypeId,
    );

    // Sort for consistent lock order — deadlock avoidance
    const sortedIds = [systemWallet.id, userWallet.id].sort();
    await lockWalletsForUpdate(tx as never, sortedIds);

    // Balance check AFTER acquiring lock — prevents race conditions
    const userBalance = await getBalanceFromLedger(
      tx as never,
      userWallet.id,
      input.assetTypeId,
    );
    assertSufficientBalance(userBalance, amount);

    const transaction = await createTransaction(tx as never, {
      idempotencyKey: input.idempotencyKey,
      type: TransactionType.SPEND,
      status: TransactionStatus.PENDING,
      assetTypeId: input.assetTypeId,
      amount,
      initiatorUserId: input.userId,
      description: input.description,
    });

    const systemBalance = await getBalanceFromLedger(
      tx as never,
      systemWallet.id,
      input.assetTypeId,
    );

    const entries = await createDoubleEntry(tx as never, {
      transactionId: transaction.id,
      fromWalletId: userWallet.id,
      toWalletId: systemWallet.id,
      assetTypeId: input.assetTypeId,
      amount,
      fromRunningBalance: userBalance.minus(amount),
      toRunningBalance: systemBalance.plus(amount),
    });

    await updateTransactionStatus(
      tx as never,
      transaction.id,
      TransactionStatus.COMPLETED,
    );

    log.info({ transactionId: transaction.id }, "spend completed");

    return buildTransactionResponse(
      transaction,
      amount,
      input,
      TransactionType.SPEND,
      entries,
    );
  });
}

// ─── Get Balance ──────────────────────────────────────────────────────────────

export async function getBalance(userId: string): Promise<BalanceResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError(
      ErrorCode.USER_NOT_FOUND,
      `User not found: ${userId}`,
    );
  }

  const rows = await getWalletsWithBalances(prisma, userId);

  return {
    userId,
    balances: rows.map((row) => ({
      assetTypeId: row.assetTypeId,
      assetName: row.assetName,
      assetSymbol: row.assetSymbol,
      balance: new Decimal(row.credits ?? 0)
        .minus(new Decimal(row.debits ?? 0))
        .toFixed(8),
      walletId: row.walletId,
    })),
  };
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

async function assertEntitiesExist(
  tx: Parameters<typeof findUserById>[0],
  userId: string,
  assetTypeId: string,
) {
  const [user, asset] = await Promise.all([
    findUserById(tx, userId),
    findAssetTypeById(tx, assetTypeId),
  ]);

  if (!user)
    throw new NotFoundError(
      ErrorCode.USER_NOT_FOUND,
      `User not found: ${userId}`,
    );
  if (!asset)
    throw new NotFoundError(
      ErrorCode.ASSET_NOT_FOUND,
      `AssetType not found: ${assetTypeId}`,
    );
}

async function resolveWallets(
  tx: Parameters<typeof findWalletByUserAndAsset>[0],
  userId: string,
  assetTypeId: string,
) {
  const [userWallet, systemWallet] = await Promise.all([
    findWalletByUserAndAsset(tx, userId, assetTypeId),
    findSystemWalletByAsset(tx, assetTypeId),
  ]);

  if (!userWallet) {
    throw new NotFoundError(
      ErrorCode.WALLET_NOT_FOUND,
      `Wallet not found for user: ${userId}`,
    );
  }
  if (!systemWallet) {
    throw new AppError(
      "System wallet not configured",
      500,
      ErrorCode.INTERNAL_ERROR,
    );
  }

  return [userWallet, systemWallet] as const;
}

async function createDoubleEntry(
  tx: Parameters<typeof createLedgerEntry>[0],
  params: {
    transactionId: string;
    fromWalletId: string;
    toWalletId: string;
    assetTypeId: string;
    amount: Decimal;
    fromRunningBalance: Decimal;
    toRunningBalance: Decimal;
  },
) {
  const [debitEntry, creditEntry] = await Promise.all([
    createLedgerEntry(tx, {
      transactionId: params.transactionId,
      walletId: params.fromWalletId,
      counterWalletId: params.toWalletId,
      entryType: EntryType.DEBIT,
      assetTypeId: params.assetTypeId,
      amount: params.amount,
      runningBalance: params.fromRunningBalance,
    }),
    createLedgerEntry(tx, {
      transactionId: params.transactionId,
      walletId: params.toWalletId,
      counterWalletId: params.fromWalletId,
      entryType: EntryType.CREDIT,
      assetTypeId: params.assetTypeId,
      amount: params.amount,
      runningBalance: params.toRunningBalance,
    }),
  ]);

  return [debitEntry, creditEntry] as const;
}

function buildTransactionResponse(
  transaction: {
    id: string;
    idempotencyKey: string;
    description: string | null;
    createdAt: Date;
  },
  amount: Decimal,
  input: { assetTypeId: string },
  type: TransactionType,
  entries: readonly [
    {
      id: string;
      walletId: string;
      entryType: string;
      amount: Decimal;
      runningBalance: Decimal;
    },
    {
      id: string;
      walletId: string;
      entryType: string;
      amount: Decimal;
      runningBalance: Decimal;
    },
  ],
): TransactionResponse {
  return {
    transactionId: transaction.id,
    idempotencyKey: transaction.idempotencyKey,
    type,
    status: TransactionStatus.COMPLETED,
    amount: amount.toFixed(8),
    assetTypeId: input.assetTypeId,
    description: transaction.description,
    createdAt: transaction.createdAt,
    ledgerEntries: entries.map((e) => ({
      entryId: e.id,
      walletId: e.walletId,
      entryType: e.entryType as EntryType,
      amount: e.amount.toFixed(8),
      runningBalance: e.runningBalance.toFixed(8),
    })),
  };
}
