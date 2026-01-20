"use client";

import { useEffect, type ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import SyncBootstrap from "@/components/sync-bootstrap";
import { handlePermissionError } from "@/lib/permission-toast";

export default function DashboardClientShell({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (handlePermissionError(event.reason)) {
        event.preventDefault();
      }
    };
    const handleError = (event: ErrorEvent) => {
      if (handlePermissionError(event.error ?? event.message)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <>
      <SyncBootstrap />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2500,
          style: {
            background: "#111827",
            color: "#f9fafb",
            borderRadius: "12px",
            padding: "12px 14px",
            fontSize: "14px",
          },
        }}
      />
      {children}
    </>
  );
}
