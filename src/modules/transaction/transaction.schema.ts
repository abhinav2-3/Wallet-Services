import { z } from "zod";
import { TransactionType, TransactionStatus } from "../../types/enums";

export const getTransactionsByUserSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  type: z.nativeEnum(TransactionType).optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const getTransactionByIdSchema = z.object({
  transactionId: z.string().uuid("transactionId must be a valid UUID"),
});

export type GetTransactionsByUserInput = z.infer<
  typeof getTransactionsByUserSchema
>;
export type GetTransactionByIdInput = z.infer<typeof getTransactionByIdSchema>;
