-- ============================================================
-- Wallet Service - Seed Script
-- Run after migrations: psql $DATABASE_URL -f prisma/seed.sql
-- ============================================================

BEGIN;

-- ─── Asset Types ─────────────────────────────────────────────
INSERT INTO asset_types (id, name, symbol, "createdAt")
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gold Coins', 'GLD', NOW())
ON CONFLICT (symbol) DO NOTHING;

-- ─── System User (Treasury) ──────────────────────────────────
INSERT INTO users (id, email, name, "isSystem", "createdAt", "updatedAt")
VALUES
  ('00000000-0000-0000-0001-000000000001', 'treasury@system.internal', 'Treasury', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- ─── Regular Users ───────────────────────────────────────────
INSERT INTO users (id, email, name, "isSystem", "createdAt", "updatedAt")
VALUES
  ('00000000-0000-0000-0002-000000000001', 'alice@example.com', 'Alice', false, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000002', 'bob@example.com',   'Bob',   false, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- ─── Wallets ─────────────────────────────────────────────────
INSERT INTO wallets (id, "userId", "assetTypeId", type, "createdAt", "updatedAt")
VALUES
  -- System Treasury Wallet
  ('00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0001-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'SYSTEM', NOW(), NOW()),

  -- Alice Wallet
  ('00000000-0000-0000-0003-000000000002',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'USER', NOW(), NOW()),

  -- Bob Wallet
  ('00000000-0000-0000-0003-000000000003',
   '00000000-0000-0000-0002-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'USER', NOW(), NOW())
ON CONFLICT ("userId", "assetTypeId") DO NOTHING;

-- ─── Seed Transactions (double-entry) ────────────────────────

-- Alice: 500 GLD initial balance
INSERT INTO transactions (id, "idempotencyKey", type, status, "assetTypeId", amount, "initiatorUserId", description, "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0004-000000000001',
  'seed-alice-initial-balance',
  'TOP_UP',
  'COMPLETED',
  '00000000-0000-0000-0000-000000000001',
  500,
  '00000000-0000-0000-0002-000000000001',
  'Initial seed balance for Alice',
  NOW(), NOW()
) ON CONFLICT ("idempotencyKey") DO NOTHING;

INSERT INTO ledger_entries (id, "transactionId", "walletId", "counterWalletId", "entryType", "assetTypeId", amount, "runningBalance", "createdAt")
VALUES
  -- DEBIT system wallet
  ('00000000-0000-0000-0005-000000000001',
   '00000000-0000-0000-0004-000000000001',
   '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0003-000000000002',
   'DEBIT',
   '00000000-0000-0000-0000-000000000001',
   500, -500, NOW()),
  -- CREDIT alice wallet
  ('00000000-0000-0000-0005-000000000002',
   '00000000-0000-0000-0004-000000000001',
   '00000000-0000-0000-0003-000000000002',
   '00000000-0000-0000-0003-000000000001',
   'CREDIT',
   '00000000-0000-0000-0000-000000000001',
   500, 500, NOW())
ON CONFLICT DO NOTHING;

-- Bob: 300 GLD initial balance
INSERT INTO transactions (id, "idempotencyKey", type, status, "assetTypeId", amount, "initiatorUserId", description, "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0004-000000000002',
  'seed-bob-initial-balance',
  'TOP_UP',
  'COMPLETED',
  '00000000-0000-0000-0000-000000000001',
  300,
  '00000000-0000-0000-0002-000000000002',
  'Initial seed balance for Bob',
  NOW(), NOW()
) ON CONFLICT ("idempotencyKey") DO NOTHING;

INSERT INTO ledger_entries (id, "transactionId", "walletId", "counterWalletId", "entryType", "assetTypeId", amount, "runningBalance", "createdAt")
VALUES
  -- DEBIT system wallet
  ('00000000-0000-0000-0005-000000000003',
   '00000000-0000-0000-0004-000000000002',
   '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0003-000000000003',
   'DEBIT',
   '00000000-0000-0000-0000-000000000001',
   300, -800, NOW()),
  -- CREDIT bob wallet
  ('00000000-0000-0000-0005-000000000004',
   '00000000-0000-0000-0004-000000000002',
   '00000000-0000-0000-0003-000000000003',
   '00000000-0000-0000-0003-000000000001',
   'CREDIT',
   '00000000-0000-0000-0000-000000000001',
   300, 300, NOW())
ON CONFLICT DO NOTHING;

COMMIT;

-- ─── Verify ──────────────────────────────────────────────────
SELECT u.name, w.type, w.id as wallet_id,
       COALESCE(SUM(CASE WHEN le."entryType" = 'CREDIT' THEN le.amount ELSE -le.amount END), 0) AS balance
FROM wallets w
JOIN users u ON u.id = w."userId"
LEFT JOIN ledger_entries le ON le."walletId" = w.id
GROUP BY u.name, w.type, w.id
ORDER BY u.name;