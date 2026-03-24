import { PrismaClient } from "@prisma/client";
import { TransactionType, TransactionStatus } from "../../types/enums";

export async function findTransactionById(
  prismaClient: PrismaClient,
  transactionId: string,
) {
  return prismaClient.transaction.findUnique({
    where: { id: transactionId },
    include: { ledgerEntries: true, assetType: true },
  });
}

export async function findTransactionsByUser(
  prismaClient: PrismaClient,
  params: {
    userId: string;
    type?: TransactionType;
    status?: TransactionStatus;
    limit: number;
    offset: number;
  },
) {
  const where = {
    initiatorUserId: params.userId,
    ...(params.type && { type: params.type }),
    ...(params.status && { status: params.status }),
  };

  const [transactions, total] = await Promise.all([
    prismaClient.transaction.findMany({
      where,
      include: { ledgerEntries: true, assetType: true },
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
    }),
    prismaClient.transaction.count({ where }),
  ]);

  return { transactions, total };
}
