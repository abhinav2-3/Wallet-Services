import { Request, Response, NextFunction } from "express";
import { ErrorCode } from "../types/enums";
import { InsufficientBalanceError } from "../utils/balanceCalculator";
import { DuplicateRequestError } from "../utils/idempotency";
import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(message, 404, code);
    this.name = "NotFoundError";
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? "unknown";

  // Insufficient balance
  if (err instanceof InsufficientBalanceError) {
    res.status(422).json({
      success: false,
      requestId,
      error: {
        code: ErrorCode.INSUFFICIENT_BALANCE,
        message: err.message,
        details: {
          currentBalance: err.currentBalance,
          requiredAmount: err.requiredAmount,
        },
      },
    });
    return;
  }

  // Duplicate idempotency key
  if (err instanceof DuplicateRequestError) {
    res.status(200).json({
      success: true,
      requestId,
      data: err.existingTransaction,
    });
    return;
  }

  // Known app errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      requestId,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Prisma unique constraint violation (race on idempotency key)
  if (
    err instanceof Error &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  ) {
    res.status(409).json({
      success: false,
      requestId,
      error: {
        code: ErrorCode.DUPLICATE_REQUEST,
        message: "A transaction with this idempotency key already exists.",
      },
    });
    return;
  }

  // Unknown errors
  logger.error({ err, requestId }, "Unhandled error");

  res.status(500).json({
    success: false,
    requestId,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "An unexpected error occurred.",
    },
  });
}
