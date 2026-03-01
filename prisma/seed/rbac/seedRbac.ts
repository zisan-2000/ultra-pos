// prisma/seed/rbac/seedRbac.ts

import {
  PrismaClient,
  type Permission,
  type Role,
  type User,
} from "@prisma/client";
import {
  DEMO_USERS,
  PERMISSION_NAMES,
  ROLE_NAMES,
  type RoleName,
} from "./constants";
import { hashPassword } from "../utils";

export async function seedRBACAndUsers(prisma: PrismaClient): Promise<{
  rolesByName: Record<RoleName, Role>;
  permissionsByName: Record<string, Permission>;
  usersByRole: Record<RoleName, User>;
}> {
  const permissionsByName: Record<string, Permission> = {};
  for (const name of PERMISSION_NAMES) {
    const perm = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: name.replace(/_/g, " "),
      },
    });
    permissionsByName[name] = perm;
  }

  const rolesByName = {} as Record<RoleName, Role>;
  for (const roleName of ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `${roleName} role`,
      },
    });
    rolesByName[roleName] = role;
  }

  const superAdminRole = rolesByName.super_admin;

  await prisma.rolePermission.createMany({
    data: Object.values(permissionsByName).map((perm) => ({
      roleId: superAdminRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  const adminPermissions = [
    "view_dashboard_summary",
    "view_settings",
    "view_users_under_me",
    "create_user_agent",
    "create_user_owner",
    "create_user_staff",
    "edit_users_under_me",
    "delete_users_under_me",
  ];

  await prisma.rolePermission.createMany({
    data: adminPermissions.map((permName) => ({
      roleId: rolesByName.admin.id,
      permissionId: permissionsByName[permName].id,
    })),
    skipDuplicates: true,
  });

  const agentPermissions = [
    "view_dashboard_summary",
    "view_settings",
    "view_users_under_me",
    "create_user_owner",
    "create_user_staff",
    "edit_users_under_me",
    "delete_users_under_me",
  ];

  await prisma.rolePermission.createMany({
    data: agentPermissions.map((permName) => ({
      roleId: rolesByName.agent.id,
      permissionId: permissionsByName[permName].id,
    })),
    skipDuplicates: true,
  });

  const ownerPermissions = [
    "view_shops",
    "switch_shop",
    "manage_shop_invoice_feature",
    "manage_shop_queue_feature",
    "manage_shop_barcode_feature",
    "view_products",
    "create_product",
    "update_product",
    "delete_product",
    "update_product_stock",
    "update_product_price",
    "manage_product_status",
    "view_purchases",
    "create_purchase",
    "view_suppliers",
    "create_supplier",
    "create_purchase_payment",
    "view_sales",
    "view_sale_details",
    "view_sales_invoice",
    "view_sale_return",
    "create_sale",
    "create_sale_return",
    "use_pos_barcode_scan",
    "issue_sales_invoice",
    "view_queue_board",
    "create_queue_token",
    "update_queue_token_status",
    "print_queue_token",
    "update_sale",
    "cancel_sale",
    "create_due_sale",
    "take_due_payment_from_sale",
    "view_customers",
    "create_customer",
    "update_customer",
    "delete_customer",
    "view_due_summary",
    "view_customer_due",
    "create_due_entry",
    "take_due_payment",
    "writeoff_due",
    "view_expenses",
    "create_expense",
    "update_expense",
    "delete_expense",
    "view_cashbook",
    "create_cash_entry",
    "update_cash_entry",
    "delete_cash_entry",
    "view_reports",
    "view_sales_report",
    "view_expense_report",
    "view_cashbook_report",
    "view_profit_report",
    "view_payment_method_report",
    "view_top_products_report",
    "view_low_stock_report",
    "export_reports",
    "view_users_under_me",
    "create_user_staff",
    "edit_users_under_me",
    "delete_users_under_me",
    "view_settings",
    "view_dashboard_summary",
    "use_offline_pos",
    "sync_offline_data",
  ];

  await prisma.rolePermission.createMany({
    data: ownerPermissions.map((permName) => ({
      roleId: rolesByName.owner.id,
      permissionId: permissionsByName[permName].id,
    })),
    skipDuplicates: true,
  });

  const staffPermissions = [
    "view_shops",
    "switch_shop",
    "view_products",
    "view_sales",
    "view_sale_details",
    "view_sales_invoice",
    "view_sale_return",
    "create_sale",
    "create_sale_return",
    "use_pos_barcode_scan",
    "issue_sales_invoice",
    "view_queue_board",
    "create_queue_token",
    "update_queue_token_status",
    "print_queue_token",
    "create_due_sale",
    "take_due_payment_from_sale",
    "view_customers",
    "create_customer",
    "update_customer",
    "view_due_summary",
    "view_customer_due",
    "create_due_entry",
    "take_due_payment",
    "view_expenses",
    "view_cashbook",
    "view_reports",
    "view_purchases",
    "create_purchase",
    "view_suppliers",
    "create_supplier",
    "create_purchase_payment",
    "view_sales_report",
    "view_expense_report",
    "view_cashbook_report",
    "view_profit_report",
    "view_payment_method_report",
    "view_top_products_report",
    "view_low_stock_report",
    "export_reports",
    "view_settings",
    "view_dashboard_summary",
    "use_offline_pos",
    "sync_offline_data",
  ];

  await prisma.rolePermission.createMany({
    data: staffPermissions.map((permName) => ({
      roleId: rolesByName.staff.id,
      permissionId: permissionsByName[permName].id,
    })),
    skipDuplicates: true,
  });

  const usersByRole = {} as Record<RoleName, User>;

  for (const demo of DEMO_USERS) {
    const existingUser = await prisma.user.findUnique({
      where: { email: demo.email },
    });

    if (existingUser) {
      usersByRole[demo.role] = existingUser;
      continue;
    }

    const passwordHash = await hashPassword(demo.password);

    let createdByUserId: string | undefined;
    if (demo.role === "admin" && usersByRole.super_admin) {
      createdByUserId = usersByRole.super_admin.id;
    } else if (demo.role === "agent" && usersByRole.admin) {
      createdByUserId = usersByRole.admin.id;
    } else if (demo.role === "owner" && usersByRole.agent) {
      createdByUserId = usersByRole.agent.id;
    } else if (demo.role === "staff" && usersByRole.owner) {
      createdByUserId = usersByRole.owner.id;
    }

    const user = await prisma.user.create({
      data: {
        name: demo.name,
        email: demo.email,
        emailVerified: true,
        passwordHash,
        createdBy: createdByUserId,
        roles: {
          connect: { id: rolesByName[demo.role].id },
        },
      },
    });

    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        providerUserId: user.id,
        accountId: user.id,
        password: passwordHash,
        scope: "email:password",
      },
    });

    usersByRole[demo.role] = user;
  }

  return { rolesByName, permissionsByName, usersByRole };
}
