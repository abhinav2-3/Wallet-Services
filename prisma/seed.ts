import {
  PrismaClient,
  WalletType,
  TransactionType,
  TransactionStatus,
  EntryType,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // ─── 1. Asset Types ───────────────────────────────────────────────────────
  const goldCoins = await prisma.assetType.upsert({
    where: { symbol: "GLD" },
    update: {},
    create: {
      name: "Gold Coins",
      symbol: "GLD",
    },
  });

  console.log(`✅ AssetType created: ${goldCoins.name} (${goldCoins.symbol})`);

  // ─── 2. System User & Wallet (Treasury) ──────────────────────────────────
  const systemUser = await prisma.user.upsert({
    where: { email: "treasury@system.internal" },
    update: {},
    create: {
      email: "treasury@system.internal",
      name: "Treasury",
      isSystem: true,
    },
  });

  const systemWallet = await prisma.wallet.upsert({
    where: {
      userId_assetTypeId: { userId: systemUser.id, assetTypeId: goldCoins.id },
    },
    update: {},
    create: {
      userId: systemUser.id,
      assetTypeId: goldCoins.id,
      type: WalletType.SYSTEM,
    },
  });

  console.log(`✅ System wallet created: ${systemWallet.id}`);

  // ─── 3. User 1 ────────────────────────────────────────────────────────────
  const user1 = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      email: "alice@example.com",
      name: "Alice",
    },
  });

  const wallet1 = await prisma.wallet.upsert({
    where: {
      userId_assetTypeId: { userId: user1.id, assetTypeId: goldCoins.id },
    },
    update: {},
    create: {
      userId: user1.id,
      assetTypeId: goldCoins.id,
      type: WalletType.USER,
    },
  });

  // ─── 4. User 2 ────────────────────────────────────────────────────────────
  const user2 = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      email: "bob@example.com",
      name: "Bob",
    },
  });

  const wallet2 = await prisma.wallet.upsert({
    where: {
      userId_assetTypeId: { userId: user2.id, assetTypeId: goldCoins.id },
    },
    update: {},
    create: {
      userId: user2.id,
      assetTypeId: goldCoins.id,
      type: WalletType.USER,
    },
  });

  console.log(
    `✅ User wallets created: Alice(${wallet1.id}), Bob(${wallet2.id})`,
  );

  // ─── 5. Seed initial balances via ledger (double-entry) ──────────────────
  // Alice: 500 GLD initial balance
  // Bob:   300 GLD initial balance
  // These are "genesis" top-up transactions from the system treasury

  const seedTransactions = [
    {
      userId: user1.id,
      walletId: wallet1.id,
      amount: new Decimal("500"),
      idempotencyKey: "seed-alice-initial-balance",
      description: "Initial seed balance for Alice",
    },
    {
      userId: user2.id,
      walletId: wallet2.id,
      amount: new Decimal("300"),
      idempotencyKey: "seed-bob-initial-balance",
      description: "Initial seed balance for Bob",
    },
  ];

  for (const seed of seedTransactions) {
    const existingTx = await prisma.transaction.findUnique({
      where: { idempotencyKey: seed.idempotencyKey },
    });

    if (existingTx) {
      console.log(
        `⏭️  Skipping already seeded transaction: ${seed.idempotencyKey}`,
      );
      continue;
    }

    // Sort wallet IDs for consistent lock order (deadlock avoidance)
    const walletIds = [systemWallet.id, seed.walletId].sort();
    const isSystemFirst = walletIds[0] === systemWallet.id;

    // Calculate running balances
    const systemBalanceBefore = await getBalance(systemWallet.id, goldCoins.id);
    const userBalanceBefore = await getBalance(seed.walletId, goldCoins.id);

    const systemNewBalance = isSystemFirst
      ? systemBalanceBefore.minus(seed.amount)
      : systemBalanceBefore.minus(seed.amount);
    const userNewBalance = userBalanceBefore.plus(seed.amount);

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey: seed.idempotencyKey,
          type: TransactionType.TOP_UP,
          status: TransactionStatus.COMPLETED,
          assetTypeId: goldCoins.id,
          amount: seed.amount,
          initiatorUserId: seed.userId,
          description: seed.description,
        },
      });

      // DEBIT system wallet
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          walletId: systemWallet.id,
          counterWalletId: seed.walletId,
          entryType: EntryType.DEBIT,
          assetTypeId: goldCoins.id,
          amount: seed.amount,
          runningBalance: systemNewBalance,
        },
      });

      // CREDIT user wallet
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          walletId: seed.walletId,
          counterWalletId: systemWallet.id,
          entryType: EntryType.CREDIT,
          assetTypeId: goldCoins.id,
          amount: seed.amount,
          runningBalance: userNewBalance,
        },
      });
    });

    console.log(`✅ Seeded balance: ${seed.description} (${seed.amount} GLD)`);
  }

  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────────────");
  console.log(`System User ID : ${systemUser.id}`);
  console.log(`System Wallet  : ${systemWallet.id}`);
  console.log(`Alice User ID  : ${user1.id}`);
  console.log(`Alice Wallet   : ${wallet1.id}`);
  console.log(`Bob User ID    : ${user2.id}`);
  console.log(`Bob Wallet     : ${wallet2.id}`);
  console.log(`Asset (GLD)    : ${goldCoins.id}`);
  console.log("─────────────────────────────────");
}

async function getBalance(
  walletId: string,
  assetTypeId: string,
): Promise<Decimal> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { walletId, assetTypeId },
    _sum: {
      amount: true,
    },
  });

  // This is a simplified balance fetch for seed only.
  // Real balance calc (credits - debits) is in utils/balanceCalculator.ts
  const credits = await prisma.ledgerEntry.aggregate({
    where: { walletId, assetTypeId, entryType: EntryType.CREDIT },
    _sum: { amount: true },
  });
  const debits = await prisma.ledgerEntry.aggregate({
    where: { walletId, assetTypeId, entryType: EntryType.DEBIT },
    _sum: { amount: true },
  });

  const totalCredits = credits._sum.amount ?? new Decimal(0);
  const totalDebits = debits._sum.amount ?? new Decimal(0);

  // suppress unused warning
  void result;

  return new Decimal(totalCredits).minus(new Decimal(totalDebits));
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
