import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 shadow-inner shadow-white/60 outline-none ring-offset-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
