import { Request, Response, NextFunction } from "express";
import * as transactionService from "./transaction.service";
import { getTransactionsByUserSchema } from "./transaction.schema";
import { ErrorCode } from "../../types/enums";
import { AppError } from "../../middlewares/errorHandler";

export async function handleGetTransactionById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { transactionId } = req.params;
    if (!transactionId) {
      throw new AppError(
        "transactionId param is required",
        400,
        ErrorCode.INVALID_INPUT,
      );
    }
    const data = await transactionService.getTransactionById(transactionId);
    res.status(200).json({ success: true, requestId: req.requestId, data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetTransactionsByUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = getTransactionsByUserSchema.safeParse({
      userId: req.params.userId,
      ...req.query,
    });

    if (!parsed.success) {
      throw new AppError(
        "Invalid query parameters",
        400,
        ErrorCode.INVALID_INPUT,
        parsed.error.flatten().fieldErrors,
      );
    }

    const data = await transactionService.getTransactionsByUser(parsed.data);
    res.status(200).json({ success: true, requestId: req.requestId, data });
  } catch (err) {
    next(err);
  }
}
