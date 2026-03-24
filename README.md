# Internal Wallet Service

A production-grade closed-loop virtual wallet system built with Node.js, TypeScript, PostgreSQL, and Prisma. Designed for high-traffic applications like gaming platforms or loyalty rewards systems.

---

## Tech Stack

| Layer           | Choice      | Why                                                       |
| --------------- | ----------- | --------------------------------------------------------- |
| Runtime         | Node.js v20 | LTS, native async, strong ecosystem                       |
| Language        | TypeScript  | Type safety, better DX, fewer runtime errors              |
| Framework       | Express     | Minimal, well-understood, easy to extend                  |
| ORM             | Prisma      | Type-safe queries, migration system, raw SQL escape hatch |
| Database        | PostgreSQL  | ACID transactions, row-level locking, strong consistency  |
| Validation      | Zod         | Runtime schema validation with TypeScript inference       |
| Logging         | Pino        | Structured JSON logs, low overhead                        |
| Package Manager | pnpm        | Fast, disk-efficient                                      |

---

## Architecture

```
src/
├── app.ts                        # Express app factory
├── server.ts                     # Bootstrap + graceful shutdown
├── config/
│   ├── env.ts                    # Zod-validated typed env
│   └── prisma.ts                 # Singleton Prisma client
├── modules/
│   ├── wallet/
│   │   ├── wallet.schema.ts      # Zod request schemas
│   │   ├── wallet.repository.ts  # Prisma queries + raw SQL locking
│   │   ├── wallet.service.ts     # Business logic + transaction orchestration
│   │   ├── wallet.controller.ts  # Thin HTTP handlers
│   │   └── wallet.routes.ts      # Route definitions
│   └── transaction/
│       ├── transaction.schema.ts
│       ├── transaction.repository.ts
│       ├── transaction.service.ts
│       ├── transaction.controller.ts
│       └── transaction.routes.ts
├── middlewares/
│   ├── requestId.ts              # x-request-id tracing
│   ├── validate.ts               # Reusable Zod middleware
│   └── errorHandler.ts           # Typed error classes + global handler
├── utils/
│   ├── logger.ts                 # Pino structured logger
│   ├── balanceCalculator.ts      # Ledger-based balance computation
│   └── idempotency.ts            # Idempotency key check + error
└── types/
    ├── enums.ts                  # All enums
    └── wallet.types.ts           # Request/response/internal types
```

---

## Spin Up with Docker (Recommended)

### Prerequisites

- Docker
- Docker Compose

### Steps

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd wallet-service

# 2. Start everything (postgres + migrate + seed + app)
docker compose up --build

# 3. Verify
curl http://localhost:3000/health
```

Docker Compose will:

1. Start PostgreSQL and wait until healthy
2. Run Prisma migrations
3. Run the seed script (2 users, 1 system wallet, 1 asset type)
4. Start the app

---

## Spin Up Locally (Without Docker)

### Prerequisites

- Node.js v20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL running locally

### Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL

# 3. Run migrations
pnpm prisma:migrate

# 4. Generate Prisma client
pnpm prisma:generate

# 5. Seed the database
pnpm seed

# 6. Start dev server
pnpm dev
```

### Using seed.sql directly

```bash
psql $DATABASE_URL -f prisma/seed.sql
```

---

## API Reference

### Base URL

```
http://localhost:3000/api/v1
```

All write endpoints require an `idempotencyKey` in the request body.  
All responses include a `requestId` for tracing.

---

### POST `/wallet/top-up`

Credit a user's wallet (simulates real-money purchase).

**Request**

```json
{
  "userId": "uuid",
  "assetTypeId": "uuid",
  "amount": 100,
  "idempotencyKey": "unique-key-per-operation",
  "description": "Purchased 100 Gold Coins"
}
```

**Response `201`**

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "transactionId": "uuid",
    "type": "TOP_UP",
    "status": "COMPLETED",
    "amount": "100.00000000",
    "ledgerEntries": [
      {
        "entryType": "DEBIT",
        "walletId": "<system-wallet>",
        "runningBalance": "-100.00000000"
      },
      {
        "entryType": "CREDIT",
        "walletId": "<user-wallet>",
        "runningBalance": "600.00000000"
      }
    ]
  }
}
```

---

### POST `/wallet/bonus`

Issue free credits to a user (referral bonus, incentive).

**Request** — same shape as `/top-up`

---

### POST `/wallet/spend`

Debit a user's wallet. Fails atomically if balance is insufficient.

**Request**

```json
{
  "userId": "uuid",
  "assetTypeId": "uuid",
  "amount": 50,
  "idempotencyKey": "unique-key-per-operation",
  "description": "Bought in-game item"
}
```

**Response `422` — Insufficient Balance**

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance. Current: 30.00000000, Required: 50.00000000",
    "details": {
      "currentBalance": "30.00000000",
      "requiredAmount": "50.00000000"
    }
  }
}
```

---

### GET `/wallet/:userId`

Get all asset balances for a user (computed from ledger).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "balances": [
      {
        "assetTypeId": "uuid",
        "assetName": "Gold Coins",
        "assetSymbol": "GLD",
        "balance": "470.00000000",
        "walletId": "uuid"
      }
    ]
  }
}
```

---

### GET `/transactions/user/:userId`

List transactions for a user with optional filters.

**Query Params**

| Param  | Type                             | Default |
| ------ | -------------------------------- | ------- |
| type   | `TOP_UP \| BONUS \| SPEND`       | —       |
| status | `PENDING \| COMPLETED \| FAILED` | —       |
| limit  | number (1–100)                   | 20      |
| offset | number                           | 0       |

---

### GET `/transactions/:transactionId`

Get a single transaction with its ledger entries.

---

## Concurrency Strategy

### Problem

Without locking, two concurrent `spend` requests can both read the same balance, both pass the balance check, and both write — resulting in a negative balance.

### Solution: Three-Layer Defence

**1. Row-Level Locking (`SELECT FOR UPDATE`)**

Before any balance read inside a transaction, wallet rows are locked:

```sql
SELECT id, "userId", "assetTypeId", type
FROM wallets
WHERE id IN ($1, $2)
ORDER BY id ASC
FOR UPDATE
```

This forces concurrent requests to queue at the database level. Only one proceeds at a time per wallet.

**2. Deadlock Avoidance — Consistent Lock Ordering**

When two wallets must be locked simultaneously (user + system), they are always sorted by `walletId` alphabetically before locking. This guarantees every concurrent request acquires locks in the same order, eliminating circular wait — the root cause of deadlocks.

```typescript
const sortedIds = [systemWallet.id, userWallet.id].sort();
await lockWalletsForUpdate(tx, sortedIds);
```

**3. Idempotency — DB-Level Unique Constraint**

`Transaction.idempotencyKey` has a `@unique` index. Even if a client retries a request that succeeded, the duplicate is caught either at the application layer (pre-tx check) or the database layer (Prisma `P2002` error on the unique constraint), and the original result is returned.

---

## Ledger Architecture (Double-Entry)

Balance is **never stored as a column**. It is always computed as:

```
balance = SUM(CREDIT entries) - SUM(DEBIT entries)
```

Every financial operation creates exactly **2 ledger entries**:

| Transaction    | From          | To            | Entry Type                      |
| -------------- | ------------- | ------------- | ------------------------------- |
| Top-up / Bonus | System Wallet | User Wallet   | DEBIT on system, CREDIT on user |
| Spend          | User Wallet   | System Wallet | DEBIT on user, CREDIT on system |

This provides a complete, immutable audit trail. No record is ever updated or deleted.

---

## Seed Data

After running the seed:

| Entity        | Value            |
| ------------- | ---------------- |
| Asset         | Gold Coins (GLD) |
| System Wallet | Treasury         |
| User 1        | Alice — 500 GLD  |
| User 2        | Bob — 300 GLD    |

---

## Environment Variables

| Variable       | Required | Default       | Description                  |
| -------------- | -------- | ------------- | ---------------------------- |
| `DATABASE_URL` | ✅       | —             | PostgreSQL connection string |
| `PORT`         | ❌       | `3000`        | HTTP port                    |
| `NODE_ENV`     | ❌       | `development` | Environment                  |
| `LOG_LEVEL`    | ❌       | `info`        | Pino log level               |
