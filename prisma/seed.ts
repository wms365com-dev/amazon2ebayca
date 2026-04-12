import { bootstrapApplicationData } from "../src/db/bootstrap";
import { prisma } from "../src/db/prisma";

async function main() {
  await bootstrapApplicationData();
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
