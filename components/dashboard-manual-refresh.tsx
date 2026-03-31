"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import RefreshIconButton from "@/components/ui/refresh-icon-button";

type DashboardManualRefreshProps = {
  label: string;
  className?: string;
};

export default function DashboardManualRefresh({
  label,
  className = "",
}: DashboardManualRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <RefreshIconButton
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      loading={isPending}
      label={label}
      className={className}
    />
  );
}
