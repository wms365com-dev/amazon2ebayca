import { logger } from "../config/logger";
import { bootstrapApplicationData } from "../db/bootstrap";
import { prisma } from "../db/prisma";
import { runDueSearchScans } from "../services/scheduler/dueScanRunner";

async function main() {
  await bootstrapApplicationData();
  const summary = await runDueSearchScans("railway-cron");

  logger.info({ summary }, "Completed one-shot due scan run");
  await prisma.$disconnect();
}

void main().catch(async (error) => {
  logger.error({ error }, "Due scan runner failed");
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
