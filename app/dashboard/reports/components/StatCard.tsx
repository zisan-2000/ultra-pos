// app/dashboard/reports/components/StatCard.tsx

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
};

export function StatCard({ title, value, subtitle, icon }: StatCardProps) {
  return (
    <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all pressable">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-slate-700 text-sm">
            {icon}
          </span>
        ) : null}
        <div>
          <p className="text-sm font-semibold text-gray-600">{title}</p>
          <p className="text-2xl font-bold mt-1 text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
