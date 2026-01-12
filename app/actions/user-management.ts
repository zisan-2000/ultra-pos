// app/actions/user-management.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import { STAFF_BASELINE_PERMISSIONS } from "@/lib/staff-baseline-permissions";

/**
 * Role hierarchy (lower index = higher privilege):
 * 0: super_admin
 * 1: admin
 * 2: agent
 * 3: owner
 * 4: staff
 */
const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 0,
  admin: 1,
  agent: 2,
  owner: 3,
  staff: 4,
};

function getRoleHierarchy(role: string): number {
  return ROLE_HIERARCHY[role] ?? 999;
}

/**
 * Get the user's primary role (first role in the roles array)
 */
function getUserPrimaryRole(roles: string[]): string {
  return roles?.[0] ?? "staff";
}

/**
 * Check if a user can create a user with a specific role
 * Rules:
 * - super_admin can create any role
 * - admin can create agent, owner, staff (not super_admin)
 * - agent can create owner, staff (not super_admin, admin)
 * - owner can create staff (not super_admin, admin, agent)
 * - staff cannot create any user
 */
function canCreateRole(creatorRole: string, targetRole: string): boolean {
  if (targetRole === "staff") {
    return creatorRole === "owner";
  }
  if (isSuperAdminRole(creatorRole)) return true;

  const creatorHierarchy = getRoleHierarchy(creatorRole);
  const targetHierarchy = getRoleHierarchy(targetRole);

  // Can only create users of lower or equal privilege (higher hierarchy number)
  return targetHierarchy > creatorHierarchy;
}

function isSuperAdminRole(role: string): boolean {
  return role === "super_admin";
}

async function ensureOwnerOwnsStaffShop(ownerId: string, staffShopId?: string | null) {
  if (!staffShopId) {
    throw new Error("Staff user is missing shop assignment");
  }

  const shop = await prisma.shop.findFirst({
    where: { id: staffShopId, ownerId },
    select: { id: true },
  });

  if (!shop) {
    throw new Error("Forbidden: staff user is not under your shop");
  }
}

/**
 * Get users that the current user can manage
 * - super_admin can see all users
 * - owner can see staff in their shops
 * - others can only see users they created
 */
export async function getManageableUsers() {
  const user = await requireUser();
  requirePermission(user, "view_users_under_me");

  const primaryRole = getUserPrimaryRole(user.roles);

  if (isSuperAdminRole(primaryRole)) {
    // Super admin sees all users
    return await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        createdBy: true,
        staffShopId: true,
        roles: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (primaryRole === "owner") {
    return await prisma.user.findMany({
      where: {
        roles: { some: { name: "staff" } },
        staffShop: { ownerId: user.id },
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        createdBy: true,
        staffShopId: true,
        roles: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Non-super-admin can only see users they created
  return await prisma.user.findMany({
    where: { createdBy: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      createdBy: true,
      staffShopId: true,
      roles: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create a new user with hierarchical role restrictions
 */
export async function createUserWithRole(
  email: string,
  name: string,
  password: string,
  roleId: string,
  staffShopId?: string | null
) {
  const creator = await requireUser();
  const creatorRole = getUserPrimaryRole(creator.roles);

  // Get the role to be assigned
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw new Error("Role not found");
  }

  // Check if creator can create this role
  if (!canCreateRole(creatorRole, role.name)) {
    throw new Error(
      `Forbidden: ${creatorRole} cannot create users with role ${role.name}`
    );
  }

  if (role.name === "staff" && creatorRole !== "owner") {
    throw new Error("Only owners can create staff users");
  }

  // Check specific permission based on target role
  const permissionMap: Record<string, string> = {
    agent: "create_user_agent",
    owner: "create_user_owner",
    staff: "create_user_staff",
  };

  const requiredPermission = permissionMap[role.name];
  if (requiredPermission) {
    requirePermission(creator, requiredPermission);
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("Email already exists");
  }

  const passwordHash = await hashPassword(password);
  let resolvedStaffShopId: string | null | undefined = undefined;

  if (role.name === "staff") {
    if (!staffShopId) {
      throw new Error("Shop is required for staff users");
    }

    const shop = await prisma.shop.findUnique({ where: { id: staffShopId } });
    if (!shop || shop.ownerId !== creator.id) {
      throw new Error("Invalid shop for staff user");
    }

    resolvedStaffShopId = staffShopId;
  }

  // Create user
  const newUser = await prisma.user.create({
    data: {
      email,
      name,
      emailVerified: false,
      passwordHash,
      createdBy: creator.id,
      staffShopId: resolvedStaffShopId ?? undefined,
      roles: {
        connect: { id: roleId },
      },
    },
    include: {
      roles: { select: { id: true, name: true } },
    },
  });

  // Create account for credential auth
  await prisma.account.create({
    data: {
      userId: newUser.id,
      providerId: "credential",
      providerUserId: newUser.id,
      accountId: newUser.id,
      password: passwordHash,
      scope: "email:password",
    },
  });

  return newUser;
}

/**
 * Update a user (edit)
 */
export async function updateUser(
  userId: string,
  data: { name?: string; email?: string; password?: string }
) {
  const editor = await requireUser();
  requirePermission(editor, "edit_users_under_me");

  const editorRole = getUserPrimaryRole(editor.roles);
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { select: { name: true } }, staffShop: true },
  });

  if (!targetUser) {
    throw new Error("User not found");
  }

  const targetIsStaff = targetUser.roles.some((r) => r.name === "staff");
  if (targetIsStaff) {
    if (editorRole === "owner") {
      await ensureOwnerOwnsStaffShop(editor.id, targetUser.staffShopId);
    } else if (!isSuperAdminRole(editorRole) && targetUser.createdBy !== editor.id) {
      throw new Error("Forbidden: only owners can update staff users");
    }
  }

  // Check if editor can edit this user
  if (editorRole === "owner" && !targetIsStaff) {
    throw new Error("Forbidden: owners can only edit staff users");
  }

  if (
    !isSuperAdminRole(editorRole) &&
    editorRole !== "owner" &&
    targetUser.createdBy !== editor.id
  ) {
    throw new Error("Forbidden: you can only edit users you created");
  }

  const { password, ...rest } = data;

  // If password provided, hash and update both User + credential Account
  let passwordHash: string | undefined;
  if (password && password.trim().length > 0) {
    passwordHash = await hashPassword(password);

    // Update credential account password if exists
    await prisma.account.updateMany({
      where: {
        userId,
        providerId: "credential",
      },
      data: {
        password: passwordHash,
      },
    });
  }

  return await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(passwordHash ? { passwordHash } : {}),
    },
    include: {
      roles: { select: { id: true, name: true } },
    },
  });
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string) {
  const deleter = await requireUser();
  requirePermission(deleter, "delete_users_under_me");

  const deleterRole = getUserPrimaryRole(deleter.roles);
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { select: { name: true } }, staffShop: true },
  });

  if (!targetUser) {
    throw new Error("User not found");
  }

  const targetIsStaff = targetUser.roles.some((r) => r.name === "staff");
  if (targetIsStaff) {
    if (deleterRole === "owner") {
      await ensureOwnerOwnsStaffShop(deleter.id, targetUser.staffShopId);
    } else if (!isSuperAdminRole(deleterRole) && targetUser.createdBy !== deleter.id) {
      throw new Error("Forbidden: only owners can deactivate staff users");
    }
  }

  // Check if deleter can delete this user
  if (deleterRole === "owner" && !targetIsStaff) {
    throw new Error("Forbidden: owners can only delete staff users");
  }

  if (
    !isSuperAdminRole(deleterRole) &&
    deleterRole !== "owner" &&
    targetUser.createdBy !== deleter.id
  ) {
    throw new Error("Forbidden: you can only delete users you created");
  }

  // Prevent deleting super_admin users (except by another super_admin)
  if (
    targetUser.roles.some((r) => r.name === "super_admin") &&
    !isSuperAdminRole(deleterRole)
  ) {
    throw new Error("Forbidden: cannot delete super_admin users");
  }

  // Delete related records first
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.verification.deleteMany({ where: { userId } });

  // Delete the user
  return await prisma.user.delete({ where: { id: userId } });
}

/**
 * Get all available roles for user creation (based on creator's role)
 */
export async function getCreatableRoles() {
  const user = await requireUser();
  const primaryRole = getUserPrimaryRole(user.roles);

  const roles = await prisma.role.findMany({
    where: { name: { not: "super_admin" } },
    select: { id: true, name: true, description: true },
  });

  return roles.filter((role) => canCreateRole(primaryRole, role.name));
}

type StaffPermissionOption = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

async function requireStaffPermissionAccess(
  targetUserId: string,
  permissionName: string,
) {
  const actor = await requireUser();
  requirePermission(actor, permissionName);

  const actorRole = getUserPrimaryRole(actor.roles);
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      staffShopId: true,
      roles: { select: { name: true } },
    },
  });

  if (!targetUser) {
    throw new Error("User not found");
  }

  const targetIsStaff = targetUser.roles.some((r) => r.name === "staff");
  if (!targetIsStaff) {
    throw new Error("Only staff users are supported");
  }

  if (!isSuperAdminRole(actorRole)) {
    if (actorRole !== "owner") {
      throw new Error("Forbidden: only owners can manage staff permissions");
    }
    await ensureOwnerOwnsStaffShop(actor.id, targetUser.staffShopId);
  }

  return { actorRole, targetUser };
}

async function getStaffRolePermissions() {
  const staffRole = await prisma.role.findUnique({
    where: { name: "staff" },
    select: {
      id: true,
      rolePermissions: {
        select: {
          permission: { select: { id: true, name: true, description: true } },
        },
      },
    },
  });

  if (!staffRole) {
    throw new Error("Staff role not found");
  }

  const basePermissions = staffRole.rolePermissions
    .map((rp) => rp.permission)
    .filter((perm): perm is { id: string; name: string; description: string | null } =>
      Boolean(perm),
    );

  const existingNames = new Set(basePermissions.map((perm) => perm.name));
  const missingNames = STAFF_BASELINE_PERMISSIONS.filter(
    (name) => !existingNames.has(name),
  );

  if (missingNames.length) {
    const missingPermissions = await prisma.permission.findMany({
      where: { name: { in: missingNames } },
      select: { id: true, name: true, description: true },
    });

    if (missingPermissions.length) {
      await prisma.rolePermission.createMany({
        data: missingPermissions.map((perm) => ({
          roleId: staffRole.id,
          permissionId: perm.id,
        })),
        skipDuplicates: true,
      });

      missingPermissions.forEach((perm) => {
        if (!existingNames.has(perm.name)) {
          basePermissions.push(perm);
          existingNames.add(perm.name);
        }
      });
    }
  }

  return basePermissions;
}

export async function getStaffPermissionOptions(userId: string): Promise<{
  permissions: StaffPermissionOption[];
}> {
  await requireStaffPermissionAccess(userId, "view_users_under_me");

  const basePermissions = await getStaffRolePermissions();
  basePermissions.sort((a, b) => a.name.localeCompare(b.name));
  const baseIds = basePermissions.map((p) => p.id);

  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId, permissionId: { in: baseIds } },
    select: { permissionId: true, allowed: true },
  });

  const deniedIds = new Set(
    overrides.filter((o) => !o.allowed).map((o) => o.permissionId),
  );

  return {
    permissions: basePermissions.map((perm) => ({
      id: perm.id,
      name: perm.name,
      description: perm.description,
      enabled: !deniedIds.has(perm.id),
    })),
  };
}

export async function getStaffUserSummary(userId: string): Promise<{
  id: string;
  name: string | null;
  email: string | null;
  roles: { id: string; name: string }[];
  shopName: string | null;
}> {
  await requireStaffPermissionAccess(userId, "view_users_under_me");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      roles: { select: { id: true, name: true } },
      staffShop: { select: { name: true } },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    shopName: user.staffShop?.name ?? null,
  };
}

export async function updateStaffPermissions(
  userId: string,
  enabledPermissionIds: string[],
) {
  await requireStaffPermissionAccess(userId, "edit_users_under_me");

  const basePermissions = await getStaffRolePermissions();
  const baseIds = basePermissions.map((p) => p.id);
  const baseSet = new Set(baseIds);

  const uniqueEnabled = Array.from(new Set(enabledPermissionIds));
  const unknown = uniqueEnabled.filter((id) => !baseSet.has(id));
  if (unknown.length > 0) {
    throw new Error("Invalid permission selection");
  }

  const enabledSet = new Set(uniqueEnabled);
  const deniedIds = baseIds.filter((id) => !enabledSet.has(id));

  await prisma.userPermissionOverride.deleteMany({
    where: { userId, permissionId: { in: baseIds } },
  });

  if (deniedIds.length) {
    await prisma.userPermissionOverride.createMany({
      data: deniedIds.map((permissionId) => ({
        userId,
        permissionId,
        allowed: false,
      })),
      skipDuplicates: true,
    });
  }

  return { success: true };
}
