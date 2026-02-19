import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStaffPermissionOptions,
  getStaffUserSummary,
} from "@/app/actions/user-management";
import { requireUser } from "@/lib/auth-session";
import { hasPermission, hasRole, isSuperAdmin } from "@/lib/rbac";
import AccessControlClient from "./AccessControlClient";

type PageProps = { params: Promise<{ userId: string }> };

export default async function StaffAccessPage({ params }: PageProps) {
  const actor = await requireUser();
  const canViewUsers = hasPermission(actor, "view_users_under_me");
  const canManageStaffPermissions = isSuperAdmin(actor) || hasRole(actor, "owner");

  if (!canViewUsers || !canManageStaffPermissions) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">স্টাফ অ্যাকসেস কন্ট্রোল</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য owner/super admin role এবং{" "}
          <code>view_users_under_me</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard/users"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          স্টাফ তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  const { userId } = await params;

  if (!userId) {
    notFound();
  }

  const [user, options] = await Promise.all([
    getStaffUserSummary(userId),
    getStaffPermissionOptions(userId),
  ]);

  return <AccessControlClient user={user} permissions={options.permissions} />;
}
