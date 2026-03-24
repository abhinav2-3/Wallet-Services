import express, { Application } from "express";
import { requestIdMiddleware } from "./middlewares/requestId";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./utils/logger";
import { walletRouter } from "./modules/wallets/wallet.routes";
import { transactionRouter } from "./modules/transaction/transaction.routes";

export function createApp(): Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);

  // Health check
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Routes
  app.use("/api/v1/wallet", walletRouter);
  app.use("/api/v1/transactions", transactionRouter);

  app.use(errorHandler);

  logger.info("Express application initialized");

  return app;
}
