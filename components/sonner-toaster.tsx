"use client";

import { useEffect } from "react";
import { Toaster, toast } from "sonner";

const warningPattern = /(মুছ|ডিলিট|delete|remove|removed|বাতিল|রিমুভ)/i;
const errorPattern = /(ভুল|সমস্যা|error|failed|cannot|can't|পারিনি|পারি না|নেই|missing|select|must|required|অনুমতি নেই|blocked)/i;

function notifyFromAlert(message: string) {
  if (!message) return;
  if (warningPattern.test(message)) {
    toast.warning(message);
    return;
  }
  if (errorPattern.test(message)) {
    toast.error(message);
    return;
  }
  toast.success(message);
}

export default function SonnerToaster() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalAlert = window.alert;
    window.alert = (msg?: any) => notifyFromAlert(String(msg ?? ""));
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={2600}
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-border bg-card text-foreground shadow-[0_10px_22px_rgba(15,23,42,0.12)]",
          title: "text-sm font-semibold",
          description: "text-xs text-muted-foreground",
        },
      }}
    />
  );
}
