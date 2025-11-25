import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-teal-800 via-teal-600 to-teal-800 text-white shadow-lg shadow-teal-800/25 hover:shadow-xl hover:shadow-teal-800/25 focus-visible:ring-teal-700",
        outline:
          "border border-white/40 bg-white/60 text-slate-900 shadow-card hover:-translate-y-0.5 hover:shadow-glass focus-visible:ring-teal-700",
        ghost: "text-slate-700 hover:bg-slate-100",
        muted: "bg-slate-100 text-slate-700 hover:bg-slate-200"
      },
      size: {
        default: "px-4 py-3",
        sm: "px-3 py-2 text-xs",
        lg: "px-5 py-3.5 text-base"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
