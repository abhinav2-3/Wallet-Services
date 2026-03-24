import { Request, Response, NextFunction } from "express";
import * as walletService from "./wallet.service";
import { TopUpInput, BonusInput, SpendInput } from "./wallet.schema";
import { ErrorCode } from "../../types/enums";
import { AppError } from "../../middlewares/errorHandler";

export async function handleTopUp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await walletService.topUp(req.body as TopUpInput);
    res.status(201).json({ success: true, requestId: req.requestId, data });
  } catch (err) {
    next(err);
  }
}

export async function handleBonus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await walletService.bonus(req.body as BonusInput);
    res.status(201).json({ success: true, requestId: req.requestId, data });
  } catch (err) {
    next(err);
  }
}

export async function handleSpend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await walletService.spend(req.body as SpendInput);
    res.status(201).json({ success: true, requestId: req.requestId, data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetBalance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params;
    if (!userId) {
      throw new AppError(
        "userId param is required",
        400,
        ErrorCode.INVALID_INPUT,
      );
    }
    const data = await walletService.getBalance(userId);
    res.status(200).json({ success: true, requestId: req.requestId, data });
  } catch (err) {
    next(err);
  }
}
