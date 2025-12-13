import { cache } from "react";
import { prisma } from "./prisma";

export type UserContext = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
};

export async function getUserWithRolesAndPermissions(
  userId: string,
): Promise<UserContext | null> {
  return getUserWithRolesAndPermissionsCached(userId);
}

export const getUserWithRolesAndPermissionsCached = cache(
  async (userId: string): Promise<UserContext | null> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const roles = user.roles.map((r) => r.name);

    const permissionSet = new Set<string>();
    for (const role of user.roles) {
      for (const rp of role.rolePermissions) {
        if (rp.permission?.name) {
          permissionSet.add(rp.permission.name);
        }
      }
    }

    return {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      roles,
      permissions: Array.from(permissionSet),
    };
  },
);

export function isSuperAdmin(ctx: Pick<UserContext, "roles"> | null | undefined) {
  if (!ctx) return false;
  return ctx.roles.includes("super_admin");
}

export function hasRole(ctx: UserContext | null | undefined, role: string): boolean {
  if (!ctx) return false;
  return ctx.roles.includes(role);
}

export function hasAnyRole(ctx: UserContext | null | undefined, roles: string[]): boolean {
  if (!ctx) return false;
  return roles.some((r) => ctx.roles.includes(r));
}

export function hasPermission(
  ctx: UserContext | null | undefined,
  permission: string,
): boolean {
  if (!ctx) return false;

  if (isSuperAdmin(ctx)) return true;

  return ctx.permissions.includes(permission);
}

export function hasAnyPermission(
  ctx: UserContext | null | undefined,
  permissions: string[],
): boolean {
  if (!ctx) return false;

  if (isSuperAdmin(ctx)) return true;

  return permissions.some((p) => ctx.permissions.includes(p));
}

export function requirePermission(
  ctx: UserContext | null | undefined,
  permission: string,
): asserts ctx is UserContext {
  if (!ctx) {
    throw new Error("Not authenticated");
  }

  if (!hasPermission(ctx, permission)) {
    throw new Error("Forbidden: missing permission " + permission);
  }
}
