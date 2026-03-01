// app/api/sync/admin/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { withTracing } from "@/lib/tracing";
import { requireUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  deleteBusinessType,
  setBusinessTypeActive,
  syncDefaultBusinessTypes,
  upsertBusinessType,
} from "@/app/actions/business-types";
import {
  createBusinessProductTemplate,
  deleteBusinessProductTemplate,
  updateBusinessProductTemplate,
} from "@/app/actions/business-product-templates";
import {
  assignRoleToUser,
  revokeRoleFromUser,
  updateRolePermissions,
} from "@/app/actions/rbac-admin";
import { updateSupportContact } from "@/app/actions/system-settings";
import { createShop, deleteShop, updateShop } from "@/app/actions/shops";
import {
  createUserWithRole,
  deleteUser,
  updateUser,
} from "@/app/actions/user-management";
import { businessFieldConfig as STATIC_CONFIGS, type BusinessType } from "@/lib/productFormConfig";

function isBusinessType(value: string): value is BusinessType {
  return value in STATIC_CONFIGS;
}

const actionSchema = z.object({
  id: z.number().optional(),
  action: z.string(),
  payload: z.any().optional(),
  clientActionId: z.string().optional(),
});

const bodySchema = z.object({
  actions: z.array(actionSchema).min(1),
});

const businessTypeUpsertSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  isActive: z.boolean().optional(),
  fieldRules: z.any(),
  stockRules: z.any(),
  unitRules: z.any(),
});

const businessTypeToggleSchema = z.object({
  key: z.string().min(1),
  isActive: z.boolean(),
});

const businessTypeDeleteSchema = z.object({
  key: z.string().min(1),
});

const businessTypeStaticSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
});

const templateCreateSchema = z.object({
  id: z.string().optional(),
  businessType: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  defaultSellPrice: z.union([z.string(), z.number()]).optional().nullable(),
  isActive: z.boolean().optional(),
});

const templateUpdateSchema = z.object({
  id: z.string().min(1),
  businessType: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional().nullable(),
  defaultSellPrice: z.union([z.string(), z.number()]).optional().nullable(),
  isActive: z.boolean().optional(),
});

const templateDeleteSchema = z.object({
  id: z.string().min(1),
});

const rbacAssignSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

const rbacUpdateSchema = z.object({
  roleId: z.string().min(1),
  permissionIds: z.array(z.string()),
});

const supportSchema = z.object({
  supportPhone: z.string().optional().nullable(),
  supportWhatsapp: z.string().optional().nullable(),
});

const shopCreateSchema = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  businessType: z.string().optional(),
  salesInvoiceEnabled: z.boolean().optional(),
  salesInvoicePrefix: z.string().optional().nullable(),
  queueTokenEnabled: z.boolean().optional(),
  queueTokenPrefix: z.string().optional().nullable(),
  barcodeFeatureEntitled: z.boolean().optional(),
  barcodeScanEnabled: z.boolean().optional(),
  ownerId: z.string().optional().nullable(),
});

const shopUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  businessType: z.string().optional(),
  closingTime: z.string().optional().nullable(),
  salesInvoiceEnabled: z.boolean().optional(),
  salesInvoicePrefix: z.string().optional().nullable(),
  queueTokenEnabled: z.boolean().optional(),
  queueTokenPrefix: z.string().optional().nullable(),
  barcodeFeatureEntitled: z.boolean().optional(),
  barcodeScanEnabled: z.boolean().optional(),
});

const shopDeleteSchema = z.object({
  id: z.string().min(1),
});

const userCreateSchema = z.object({
  clientId: z.string().optional(),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  roleId: z.string().min(1),
  staffShopId: z.string().optional().nullable(),
});

const userUpdateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});

const userDeleteSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  return withTracing(req, "sync-admin", async () => {
    try {
      const rl = await rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-admin" });
      if (rl.limited) {
        return NextResponse.json(
          { success: false, error: "Too many requests" },
          { status: 429, headers: rl.headers },
        );
      }

      const user = await requireUser();

      const raw = await req.json();
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid payload", details: parsed.error.format() },
          { status: 400 },
        );
      }

      const results: Array<{ id?: number; ok: boolean; error?: string }> = [];

      for (const item of parsed.data.actions) {
        const payload = item.payload ?? {};
        try {
          const clientActionId =
            payload?.clientActionId ?? item.clientActionId ?? undefined;
          if (clientActionId) {
            try {
              await prisma.adminSyncAction.create({
                data: {
                  id: clientActionId,
                  userId: user.id,
                  action: item.action,
                },
              });
            } catch (err) {
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              ) {
                results.push({ id: item.id, ok: true });
                continue;
              }
              throw err;
            }
          }

          switch (item.action) {
            case "business_type_sync_defaults": {
              await syncDefaultBusinessTypes();
              break;
            }
            case "business_type_create_from_static": {
              const input = businessTypeStaticSchema.parse(payload);
              const normalizedKey = input.key.trim().toLowerCase();
              const config = isBusinessType(normalizedKey)
                ? STATIC_CONFIGS[normalizedKey]
                : STATIC_CONFIGS.mini_grocery;
              const label = input.label?.trim() || normalizedKey;
              await upsertBusinessType({
                key: normalizedKey,
                label,
                isActive: true,
                fieldRules: config.fields,
                stockRules: config.stock,
                unitRules: config.unit,
              });
              break;
            }
            case "business_type_upsert": {
              const input = businessTypeUpsertSchema.parse(payload);
              const normalizedKey = input.key.trim().toLowerCase();
              await upsertBusinessType({
                key: normalizedKey,
                label: input.label?.trim() || normalizedKey,
                isActive: input.isActive ?? true,
                fieldRules: input.fieldRules,
                stockRules: input.stockRules,
                unitRules: input.unitRules,
              });
              break;
            }
            case "business_type_toggle_active": {
              const input = businessTypeToggleSchema.parse(payload);
              const normalizedKey = input.key.trim().toLowerCase();
              await setBusinessTypeActive(normalizedKey, input.isActive);
              break;
            }
            case "business_type_delete": {
              const input = businessTypeDeleteSchema.parse(payload);
              const normalizedKey = input.key.trim().toLowerCase();
              await deleteBusinessType(normalizedKey);
              break;
            }
            case "business_template_create": {
              const input = templateCreateSchema.parse(payload);
              await createBusinessProductTemplate(input);
              break;
            }
            case "business_template_update": {
              const input = templateUpdateSchema.parse(payload);
              await updateBusinessProductTemplate(input.id, input);
              break;
            }
            case "business_template_delete": {
              const input = templateDeleteSchema.parse(payload);
              await deleteBusinessProductTemplate(input.id);
              break;
            }
            case "rbac_assign_role": {
              const input = rbacAssignSchema.parse(payload);
              await assignRoleToUser(input.userId, input.roleId);
              break;
            }
            case "rbac_revoke_role": {
              const input = rbacAssignSchema.parse(payload);
              await revokeRoleFromUser(input.userId, input.roleId);
              break;
            }
            case "rbac_update_role_permissions": {
              const input = rbacUpdateSchema.parse(payload);
              await updateRolePermissions(input.roleId, input.permissionIds);
              break;
            }
            case "system_settings_update_support": {
              const input = supportSchema.parse(payload);
              await updateSupportContact({
                supportPhone: input.supportPhone ?? null,
                supportWhatsapp: input.supportWhatsapp ?? null,
              });
              break;
            }
            case "shop_create": {
              const input = shopCreateSchema.parse(payload);
              await createShop({
                name: input.name,
                address: input.address ?? "",
                phone: input.phone ?? "",
                businessType: input.businessType ?? "tea_stall",
                salesInvoiceEnabled: input.salesInvoiceEnabled,
                salesInvoicePrefix: input.salesInvoicePrefix ?? undefined,
                queueTokenEnabled: input.queueTokenEnabled,
                queueTokenPrefix: input.queueTokenPrefix ?? undefined,
                barcodeFeatureEntitled: input.barcodeFeatureEntitled,
                barcodeScanEnabled: input.barcodeScanEnabled,
                ownerId: input.ownerId ?? undefined,
              });
              break;
            }
            case "shop_update": {
              const input = shopUpdateSchema.parse(payload);
              const { id, ...data } = input;
              await updateShop(id, {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.address !== undefined ? { address: data.address } : {}),
                ...(data.phone !== undefined ? { phone: data.phone } : {}),
                ...(data.businessType !== undefined
                  ? { businessType: data.businessType }
                  : {}),
                ...(data.closingTime !== undefined
                  ? { closingTime: data.closingTime }
                  : {}),
                ...(data.salesInvoiceEnabled !== undefined
                  ? { salesInvoiceEnabled: data.salesInvoiceEnabled }
                  : {}),
                ...(data.salesInvoicePrefix !== undefined
                  ? { salesInvoicePrefix: data.salesInvoicePrefix }
                  : {}),
                ...(data.queueTokenEnabled !== undefined
                  ? { queueTokenEnabled: data.queueTokenEnabled }
                  : {}),
                ...(data.queueTokenPrefix !== undefined
                  ? { queueTokenPrefix: data.queueTokenPrefix }
                  : {}),
                ...(data.barcodeFeatureEntitled !== undefined
                  ? { barcodeFeatureEntitled: data.barcodeFeatureEntitled }
                  : {}),
                ...(data.barcodeScanEnabled !== undefined
                  ? { barcodeScanEnabled: data.barcodeScanEnabled }
                  : {}),
              });
              break;
            }
            case "shop_delete": {
              const input = shopDeleteSchema.parse(payload);
              await deleteShop(input.id);
              break;
            }
            case "user_create": {
              const input = userCreateSchema.parse(payload);
              await createUserWithRole(
                input.email,
                input.name,
                input.password,
                input.roleId,
                input.staffShopId ?? undefined
              );
              break;
            }
            case "user_update": {
              const input = userUpdateSchema.parse(payload);
              await updateUser(input.userId, {
                name: input.name,
                email: input.email,
                password: input.password?.trim()
                  ? input.password
                  : undefined,
              });
              break;
            }
            case "user_delete": {
              const input = userDeleteSchema.parse(payload);
              await deleteUser(input.userId);
              break;
            }
            default:
              throw new Error(`Unknown action: ${item.action}`);
          }

          results.push({ id: item.id, ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Action failed";
          results.push({ id: item.id, ok: false, error: message });
        }
      }

      return NextResponse.json({ success: true, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  });
}
