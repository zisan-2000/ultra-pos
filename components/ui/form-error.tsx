import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormErrorProps {
  message?: string;
  className?: string;
}

export function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1.5 text-xs text-danger",
        className
      )}
    >
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}
