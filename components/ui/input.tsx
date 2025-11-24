import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={`
        w-full px-4 py-2.5 
        bg-white text-foreground
        border border-input-border rounded-md
        focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
        placeholder:text-muted-foreground
        disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed
        transition-all duration-200
        ${className}
      `}
      {...props}
    />
  )
);

Input.displayName = "Input";
