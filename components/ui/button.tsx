import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => {
    const baseStyles =
      "font-medium transition-all duration-200 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed";

    const variants: Record<string, string> = {
      primary:
        "bg-primary text-white hover:bg-primary-dark focus:ring-primary shadow-md hover:shadow-lg",
      secondary:
        "bg-primary-light text-primary hover:bg-primary-lighter focus:ring-primary border border-primary/20",
      outline:
        "border-2 border-primary text-primary hover:bg-primary-lighter focus:ring-primary",
      ghost: "text-primary hover:bg-muted focus:ring-primary",
      destructive:
        "bg-error text-white hover:bg-error/90 focus:ring-error shadow-md",
    };

    const sizes: Record<string, string> = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-6 py-3 text-lg",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
