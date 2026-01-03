import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { UserCreationLogClient } from "./UserCreationLogClient";

export default async function UserCreationLogPage() {
  const user = await requireUser();

  const canView = isSuperAdmin(user) || hasRole(user, "admin");

  if (!canView) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">
          User Account Creation Log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When an account was created, who created it, and which user was created.
          Visible to Super Admin (all) and Admin (their agents and those agents’ creations).
          No sales or other activities are shown here.
        </p>
      </div>

      <UserCreationLogClient />
    </div>
  );
}
