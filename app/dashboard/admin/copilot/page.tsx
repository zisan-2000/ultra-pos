import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function formatCount(value: number) {
  return new Intl.NumberFormat("bn-BD").format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function CopilotAdminPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Copilot Admin</h1>
        <p className="mb-2 font-semibold text-danger">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ শুধুমাত্র <code>admin</code> বা <code>super_admin</code> এর জন্য।
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg border border-primary/30 bg-primary-soft px-6 py-3 font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/15"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  const now = new Date();
  const since = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [recentRuns, statusRows, engineRows, recentQuestionRuns] = await Promise.all([
    prisma.ownerCopilotRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        shop: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.ownerCopilotRun.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.ownerCopilotRun.groupBy({
      by: ["engine"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.ownerCopilotRun.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: {
        questionPreview: true,
      },
    }),
  ]);

  const questionRows = Array.from(
    recentQuestionRuns.reduce(
      (map, row) => map.set(row.questionPreview, (map.get(row.questionPreview) ?? 0) + 1),
      new Map<string, number>()
    )
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([questionPreview, count]) => ({
      questionPreview,
      count,
    }));

  const totalRuns = statusRows.reduce((sum, row) => sum + Number(row._count._all ?? 0), 0);
  const fallbackRuns = recentRuns.filter((row) => row.fallbackUsed).length;
  const actionRuns = recentRuns.filter((row) => row.requiresConfirmation).length;
  const avgLatency =
    recentRuns
      .map((row) => row.latencyMs)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .reduce((sum, value, _, arr) => sum + value / Math.max(arr.length, 1), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Admin
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Copilot Observability</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Recent copilot activity, fallback behavior, engine usage, and the questions users are asking most often.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Last 7 Days Runs
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{formatCount(totalRuns)}</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Recent Fallbacks
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{formatCount(fallbackRuns)}</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Recent Action Runs
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{formatCount(actionRuns)}</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Avg Latency
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{formatCount(Math.round(avgLatency))}ms</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">Status Breakdown</h2>
          <div className="mt-4 space-y-3">
            {statusRows.map((row) => (
              <div key={row.status} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{row.status}</span>
                <span className="text-sm font-semibold text-muted-foreground">{formatCount(Number(row._count._all ?? 0))}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">Engine Breakdown</h2>
          <div className="mt-4 space-y-3">
            {engineRows.map((row) => (
              <div key={row.engine ?? "unknown"} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{row.engine ?? "unknown"}</span>
                <span className="text-sm font-semibold text-muted-foreground">{formatCount(Number(row._count._all ?? 0))}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Top Questions</h2>
        <div className="mt-4 space-y-3">
          {questionRows.map((row) => (
            <div key={row.questionPreview} className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-3 py-3">
              <div className="text-sm text-foreground">{row.questionPreview}</div>
              <div className="shrink-0 text-sm font-semibold text-muted-foreground">
                {formatCount(row.count)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Recent Runs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Question</th>
                <th className="px-3 py-3">Engine</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Latency</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((row) => (
                <tr key={row.id} className="border-b border-border/50 align-top">
                  <td className="px-3 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-3 text-foreground">{row.shop.name}</td>
                  <td className="px-3 py-3 text-foreground">{row.user.name || row.user.email || row.user.id}</td>
                  <td className="px-3 py-3 text-foreground">
                    <div>{row.questionPreview}</div>
                    {row.answerPreview ? (
                      <div className="mt-1 text-xs text-muted-foreground">{row.answerPreview}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-foreground">{row.engine ?? "unknown"}</td>
                  <td className="px-3 py-3 text-foreground">
                    <div>{row.status}</div>
                    {row.fallbackUsed ? (
                      <div className="mt-1 text-xs text-warning">fallback used</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {typeof row.latencyMs === "number" ? `${row.latencyMs}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
