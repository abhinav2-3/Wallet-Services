import { createApp } from "./app";
import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/prisma";
import { logger } from "./utils/logger";

async function bootstrap(): Promise<void> {
  await connectDatabase();
  logger.info("Database connected");

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "Server started");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    server.close(async () => {
      await disconnectDatabase();
      logger.info("Server closed gracefully");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
