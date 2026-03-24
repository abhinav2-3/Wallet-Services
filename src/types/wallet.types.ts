import { Decimal } from "@prisma/client/runtime/library";
import {
  TransactionType,
  TransactionStatus,
  EntryType,
  WalletType,
} from "./enums";

// ─── Request Types ────────────────────────────────────────────────────────────

export interface TopUpRequest {
  userId: string;
  assetTypeId: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface BonusRequest {
  userId: string;
  assetTypeId: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface SpendRequest {
  userId: string;
  assetTypeId: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface GetBalanceRequest {
  userId: string;
  assetTypeId?: string;
}

// ─── Response Types ───────────────────────────────────────────────────────────

export interface AssetBalance {
  assetTypeId: string;
  assetName: string;
  assetSymbol: string;
  balance: string;
  walletId: string;
}

export interface BalanceResponse {
  userId: string;
  balances: AssetBalance[];
}

export interface TransactionResponse {
  transactionId: string;
  idempotencyKey: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  assetTypeId: string;
  description?: string | null;
  createdAt: Date;
  ledgerEntries: LedgerEntryResponse[];
}

export interface LedgerEntryResponse {
  entryId: string;
  walletId: string;
  entryType: EntryType;
  amount: string;
  runningBalance: string;
}

// ─── Internal Service Types ───────────────────────────────────────────────────

export interface WalletRow {
  id: string;
  userId: string;
  assetTypeId: string;
  type: WalletType;
}

export interface LockedWallet extends WalletRow {
  lockedAt: Date;
}

export interface LedgerEntryCreate {
  transactionId: string;
  walletId: string;
  counterWalletId: string;
  entryType: EntryType;
  assetTypeId: string;
  amount: Decimal;
  runningBalance: Decimal;
}

export interface TransferContext {
  fromWalletId: string;
  toWalletId: string;
  assetTypeId: string;
  amount: Decimal;
  transactionId: string;
}

// ─── API Response Wrapper ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  requestId: string;
  data: T;
}

export interface ApiError {
  success: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
