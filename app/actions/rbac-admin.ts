"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { STAFF_BASELINE_PERMISSIONS } from "@/lib/staff-baseline-permissions";

async function requireRbacAdminWithPermission(permission?: string) {
  const user = await requireUser();

  // Base requirement: must have RBAC admin access.
  // Super admins automatically satisfy this via requirePermission logic.
  requirePermission(user, "access_rbac_admin");

  // Optional extra fine-grained permission (e.g. assign_role_to_user).
  if (permission) {
    requirePermission(user, permission);
  }

  return user;
}

export async function getRbacUsersAndRoles() {
  await requireRbacAdminWithPermission("view_users");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      roles: { select: { id: true, name: true } },
    },
  });

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return { users, roles };
}

export async function getRbacRolesAndPermissions() {
  await requireRbacAdminWithPermission("view_roles");

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      rolePermissions: {
        select: { permissionId: true },
      },
    },
  });

  const permissions = await prisma.permission.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return { roles, permissions };
}

export async function assignRoleToUser(userId: string, roleId: string) {
  await requireRbacAdminWithPermission("assign_role_to_user");

  await prisma.user.update({
    where: { id: userId },
    data: {
      roles: {
        connect: { id: roleId },
      },
    },
  });

  return { success: true };
}

export async function revokeRoleFromUser(userId: string, roleId: string) {
  await requireRbacAdminWithPermission("revoke_role_from_user");

  await prisma.user.update({
    where: { id: userId },
    data: {
      roles: {
        disconnect: { id: roleId },
      },
    },
  });

  return { success: true };
}

export async function updateRolePermissions(roleId: string, permissionIds: string[]) {
  await requireRbacAdminWithPermission("update_role");

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { name: true },
  });

  if (!role) {
    throw new Error("Role not found");
  }

  let finalPermissionIds = permissionIds;
  if (role.name === "staff") {
    const baselinePermissions = await prisma.permission.findMany({
      where: { name: { in: STAFF_BASELINE_PERMISSIONS } },
      select: { id: true },
    });
    const baselineIds = baselinePermissions.map((perm) => perm.id);
    const merged = new Set([...permissionIds, ...baselineIds]);
    finalPermissionIds = Array.from(merged);
  }

  // Clear existing mappings
  await prisma.rolePermission.deleteMany({ where: { roleId } });

  if (finalPermissionIds.length) {
    const data = finalPermissionIds.map((permissionId) => ({
      roleId,
      permissionId,
    }));
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  }

  return { success: true };
}
