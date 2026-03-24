import { z } from "zod";

const positiveAmount = z
  .number({ required_error: "amount is required" })
  .positive("amount must be positive")
  .finite("amount must be finite")
  .refine((val) => {
    const scaled = val * 1e8;
    return Math.abs(scaled - Math.round(scaled)) < 1e-8;
  }, {
    message: "amount exceeds maximum precision (8 decimal places)",
  });

export const topUpSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  assetTypeId: z.string().uuid("assetTypeId must be a valid UUID"),
  amount: positiveAmount,
  idempotencyKey: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});

export const bonusSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  assetTypeId: z.string().uuid("assetTypeId must be a valid UUID"),
  amount: positiveAmount,
  idempotencyKey: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});

export const spendSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  assetTypeId: z.string().uuid("assetTypeId must be a valid UUID"),
  amount: positiveAmount,
  idempotencyKey: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});

export type TopUpInput = z.infer<typeof topUpSchema>;
export type BonusInput = z.infer<typeof bonusSchema>;
export type SpendInput = z.infer<typeof spendSchema>;
