import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";

export default async function AgentDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "agent")) {
    redirect("/dashboard");
  }

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-2">Welcome to the Agent Dashboard</h1>
      <p className="text-sm text-gray-600">Start new sales or follow up on dues from here.</p>
    </div>
  );
}

