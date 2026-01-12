import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-72" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72" />
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/40">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-2 h-3 w-52" />
        </div>
        <div className="p-5 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
