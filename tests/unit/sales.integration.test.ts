import assert from "node:assert/strict";
import { prisma } from "../../lib/prisma.ts";
import { syncOfflineSalesBatch } from "../../lib/sales/sync-offline-sales.ts";
import { runSuite } from "./test-utils.ts";
import {
  isIntegrationScenarioEnabled,
  logIntegrationScenarioSkip,
} from "./integration-test-utils.ts";

type PermissionSeed = {
  id: string;
  createdByTest: boolean;
};

async function ensurePermission(name: string): Promise<PermissionSeed> {
  const existing = await prisma.permission.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, createdByTest: false };
  }

  const created = await prisma.permission.create({
    data: { name, description: "integration test permission" },
    select: { id: true },
  });
  return { id: created.id, createdByTest: true };
}

export async function runSalesIntegrationScaffoldTests() {
  const suiteName = "integration: sales flow (db-backed)";

  if (!isIntegrationScenarioEnabled()) {
    logIntegrationScenarioSkip(suiteName);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.log(`\n[Suite] ${suiteName}`);
    console.log("  SKIP DATABASE_URL is not configured.");
    return;
  }

  await runSuite(suiteName, [
    {
      name: "persists cash sale, sale items, stock decrement, and cash entry",
      fn: async () => {
        const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const roleName = `it_sales_role_${suffix}`;
        const email = `it.sales.${suffix}@pos.test`;

        const permissionsToCleanup: PermissionSeed[] = [];
        let roleId: string | null = null;
        let userId: string | null = null;
        let shopId: string | null = null;
        let productId: string | null = null;
        let saleId: string | null = null;

        try {
          const syncPermission = await ensurePermission("sync_offline_data");
          const createSalePermission = await ensurePermission("create_sale");
          permissionsToCleanup.push(syncPermission, createSalePermission);

          const role = await prisma.role.create({
            data: { name: roleName, description: "integration test role" },
            select: { id: true, name: true },
          });
          roleId = role.id;

          await prisma.rolePermission.createMany({
            data: [
              { roleId: role.id, permissionId: syncPermission.id },
              { roleId: role.id, permissionId: createSalePermission.id },
            ],
          });

          const user = await prisma.user.create({
            data: {
              email,
              name: "Integration Owner",
              roles: { connect: [{ id: role.id }] },
            },
            select: { id: true },
          });
          userId = user.id;

          const shop = await prisma.shop.create({
            data: {
              ownerId: user.id,
              name: `Integration Shop ${suffix}`,
              businessType: "tea_stall",
              salesInvoiceEnabled: false,
            },
            select: { id: true },
          });
          shopId = shop.id;

          const product = await prisma.product.create({
            data: {
              shopId: shop.id,
              name: `Integration Product ${suffix}`,
              category: "Test",
              buyPrice: "30.00",
              sellPrice: "50.00",
              stockQty: "10.00",
              trackStock: true,
              isActive: true,
            },
            select: { id: true },
          });
          productId = product.id;

          const result = await syncOfflineSalesBatch({
            user: {
              id: user.id,
              roles: [role.name],
              permissions: ["sync_offline_data", "create_sale"],
              staffShopId: null,
            },
            newItems: [
              {
                shopId: shop.id,
                paymentMethod: "cash",
                note: "integration test sale",
                createdAt: "2026-02-19T08:30:00.000Z",
                items: [
                  {
                    productId: product.id,
                    name: "Integration Product",
                    qty: 2,
                    unitPrice: 50,
                  },
                ],
              },
            ],
          });

          assert.equal(result.saleIds.length, 1);
          saleId = result.saleIds[0] ?? null;
          assert.ok(saleId);

          const sale = await prisma.sale.findUnique({
            where: { id: saleId! },
            include: { saleItems: true },
          });

          assert.ok(sale);
          assert.equal(sale?.paymentMethod, "cash");
          assert.equal(Number(sale?.totalAmount ?? 0), 100);
          assert.equal(sale?.saleItems.length, 1);
          assert.equal(Number(sale?.saleItems[0]?.quantity ?? 0), 2);
          assert.equal(Number(sale?.saleItems[0]?.unitPrice ?? 0), 50);
          assert.equal(Number(sale?.saleItems[0]?.lineTotal ?? 0), 100);

          const updatedProduct = await prisma.product.findUnique({
            where: { id: product.id },
            select: { stockQty: true },
          });
          assert.ok(updatedProduct);
          assert.equal(Number(updatedProduct?.stockQty ?? 0), 8);

          const cashEntry = await prisma.cashEntry.findFirst({
            where: {
              shopId: shop.id,
              reason: `Cash sale #${saleId}`,
              entryType: "IN",
            },
            orderBy: { createdAt: "desc" },
          });
          assert.ok(cashEntry);
          assert.equal(Number(cashEntry?.amount ?? 0), 100);
        } finally {
          if (saleId) {
            await prisma.saleItem.deleteMany({ where: { saleId } }).catch(() => {});
            await prisma.sale.deleteMany({ where: { id: saleId } }).catch(() => {});
            await prisma.cashEntry
              .deleteMany({ where: { reason: `Cash sale #${saleId}` } })
              .catch(() => {});
          }

          if (productId) {
            await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
          }

          if (shopId) {
            await prisma.cashEntry.deleteMany({ where: { shopId } }).catch(() => {});
            await prisma.shop.deleteMany({ where: { id: shopId } }).catch(() => {});
          }

          if (userId && roleId) {
            await prisma.user
              .update({
                where: { id: userId },
                data: { roles: { disconnect: [{ id: roleId }] } },
              })
              .catch(() => {});
          }

          if (userId) {
            await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
          }

          if (roleId) {
            await prisma.rolePermission.deleteMany({ where: { roleId } }).catch(() => {});
            await prisma.role.deleteMany({ where: { id: roleId } }).catch(() => {});
          }

          for (const permission of permissionsToCleanup) {
            if (permission.createdByTest) {
              await prisma.permission
                .deleteMany({ where: { id: permission.id } })
                .catch(() => {});
            }
          }
        }
      },
    },
  ]);
}
