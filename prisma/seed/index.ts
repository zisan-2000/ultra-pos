// prisma/seed/index.ts

import { PrismaClient } from "@prisma/client";
import { resetDatabase } from "./reset";
import { seedRBACAndUsers } from "./rbac/seedRbac";
import { seedShops } from "./pos/seedShops";
import { seedProducts } from "./pos/seedProducts";

const prisma = new PrismaClient();

async function main() {
  const shouldReset =
    process.env.SEED_RESET === "1" || process.env.SEED_RESET === "true";

  if (shouldReset) {
    console.log("INFO: Resetting existing data (SEED_RESET enabled)...");
    await resetDatabase(prisma);
  } else {
    console.log(
      "INFO: Skipping database reset. Set SEED_RESET=1 to wipe and reseed."
    );
  }
  console.log("🔥 Seeding RBAC (roles, permissions, demo users)...");
  const { usersByRole } = await seedRBACAndUsers(prisma);

  const ownerUser = usersByRole.owner;
  if (!ownerUser) {
    throw new Error("Owner demo user missing — RBAC seeding failed!");
  }

  console.log("🔥 Seeding shops...");
  const shops = await seedShops(prisma, ownerUser.id);

  console.log("🔥 Seeding products...");
  const products = await seedProducts(prisma, shops);

  // Intentionally skipping demo customers/sales/expenses/cash entries.

  console.log("\n🎉 Seed Completed Successfully!");
  console.log("=========================================\n");
  console.log(" SUPER ADMIN LOGIN:");
  console.log(" Email: superadmin@pos.test");
  console.log(" Password: Admin123!");
  console.log("-----------------------------------------");
  console.log(" ADMIN LOGIN:");
  console.log(" Email: admin@pos.test");
  console.log(" Password: Admin123!");
  console.log("-----------------------------------------");
  console.log(" AGENT LOGIN:");
  console.log(" Email: agent@pos.test");
  console.log(" Password: Agent123!");
  console.log("-----------------------------------------");
  console.log(" OWNER LOGIN:");
  console.log(" Email: owner@pos.test");
  console.log(" Password: Owner123!");
  console.log("-----------------------------------------");
  console.log(" STAFF LOGIN:");
  console.log(" Email: staff@pos.test");
  console.log(" Password: Staff123!");
  console.log("=========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

