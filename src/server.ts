import { env } from "./config/env";
import { logger } from "./config/logger";
import { bootstrapApplicationData } from "./db/bootstrap";
import { startScheduledJobs } from "./jobs/scanActiveSearches";
import { createApp } from "./app";

async function main() {
  await bootstrapApplicationData();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server started");
  });

  startScheduledJobs();
}

void main().catch((error) => {
  logger.error({ error }, "Failed to start application");
  process.exit(1);
});
