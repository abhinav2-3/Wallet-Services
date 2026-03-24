import { Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  EntryType,
  TransactionStatus,
  TransactionType,
  WalletType,
} from "../../types/enums";
import { LedgerEntryCreate } from "../../types/wallet.types";

type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// ─── Wallet Queries ───────────────────────────────────────────────────────────

export async function findWalletByUserAndAsset(
  tx: PrismaTx,
  userId: string,
  assetTypeId: string,
) {
  return tx.wallet.findUnique({
    where: { userId_assetTypeId: { userId, assetTypeId } },
  });
}

export async function findSystemWalletByAsset(
  tx: PrismaTx,
  assetTypeId: string,
) {
  return tx.wallet.findFirst({
    where: { assetTypeId, type: WalletType.SYSTEM },
  });
}

export async function findWalletsByUserWithAsset(tx: PrismaTx, userId: string) {
  return tx.wallet.findMany({
    where: { userId },
    include: { assetType: true },
  });
}

/**
 * Lock wallet rows using SELECT FOR UPDATE.
 * walletIds MUST be pre-sorted by caller to avoid deadlocks.
 */
export async function lockWalletsForUpdate(
  tx: PrismaTx,
  sortedWalletIds: string[],
): Promise<
  Array<{ id: string; userId: string; assetTypeId: string; type: string }>
> {
  const placeholders = sortedWalletIds.map((_, i) => `$${i + 1}`).join(", ");
  const query = `
    SELECT id, "userId", "assetTypeId", type
    FROM wallets
    WHERE id IN (${placeholders})
    ORDER BY id ASC
    FOR UPDATE
  `;

  return tx.$queryRawUnsafe<
    Array<{ id: string; userId: string; assetTypeId: string; type: string }>
  >(query, ...sortedWalletIds);
}

// ─── Transaction Queries ──────────────────────────────────────────────────────

export async function createTransaction(
  tx: PrismaTx,
  data: {
    idempotencyKey: string;
    type: TransactionType;
    status: TransactionStatus;
    assetTypeId: string;
    amount: Decimal;
    initiatorUserId: string;
    description?: string;
  },
) {
  return tx.transaction.create({ data });
}

export async function updateTransactionStatus(
  tx: PrismaTx,
  transactionId: string,
  status: TransactionStatus,
) {
  return tx.transaction.update({
    where: { id: transactionId },
    data: { status },
  });
}

export async function findTransactionByIdempotencyKey(
  tx: PrismaTx,
  idempotencyKey: string,
) {
  return tx.transaction.findUnique({
    where: { idempotencyKey },
    include: { ledgerEntries: true },
  });
}

// ─── Ledger Queries ───────────────────────────────────────────────────────────

export async function createLedgerEntry(tx: PrismaTx, data: LedgerEntryCreate) {
  return tx.ledgerEntry.create({ data });
}

export async function getBalanceFromLedger(
  tx: PrismaTx,
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

  return new Decimal(credits._sum.amount ?? 0).minus(
    new Decimal(debits._sum.amount ?? 0),
  );
}

// ─── Asset Queries ────────────────────────────────────────────────────────────

export async function findAssetTypeById(tx: PrismaTx, assetTypeId: string) {
  return tx.assetType.findUnique({ where: { id: assetTypeId } });
}

export async function findUserById(tx: PrismaTx, userId: string) {
  return tx.user.findUnique({ where: { id: userId } });
}

// ─── Balance View (outside tx) ────────────────────────────────────────────────

export async function getWalletsWithBalances(
  prismaClient: PrismaClient,
  userId: string,
): Promise<
  Array<{
    walletId: string;
    assetTypeId: string;
    assetName: string;
    assetSymbol: string;
    credits: Decimal | null;
    debits: Decimal | null;
  }>
> {
  const result = await prismaClient.$queryRaw<
    Array<{
      walletId: string;
      assetTypeId: string;
      assetName: string;
      assetSymbol: string;
      credits: Decimal | null;
      debits: Decimal | null;
    }>
  >(
    Prisma.sql`
      SELECT
        w.id AS "walletId",
        w."assetTypeId",
        at.name AS "assetName",
        at.symbol AS "assetSymbol",
        SUM(CASE WHEN le."entryType" = 'CREDIT' THEN le.amount ELSE 0 END) AS credits,
        SUM(CASE WHEN le."entryType" = 'DEBIT'  THEN le.amount ELSE 0 END) AS debits
      FROM wallets w
      JOIN asset_types at ON at.id = w."assetTypeId"
      LEFT JOIN ledger_entries le ON le."walletId" = w.id
      WHERE w."userId" = ${userId}
      GROUP BY w.id, w."assetTypeId", at.name, at.symbol
    `,
  );

  return result;
}
