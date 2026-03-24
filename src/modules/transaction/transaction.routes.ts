import { Router } from "express";
import {
  handleGetTransactionById,
  handleGetTransactionsByUser,
} from "./transaction.controller";

const router: Router = Router();

router.get("/user/:userId", handleGetTransactionsByUser);
router.get("/:transactionId", handleGetTransactionById);

export { router as transactionRouter };
