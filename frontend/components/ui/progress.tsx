import * as React from "react";
import { cn } from "../../lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-3 w-full overflow-hidden rounded-full border border-white/50 bg-white/60 shadow-inner shadow-white/50",
      className
    )}
    {...props}
  >
    <div
      className="h-full w-full rounded-full bg-gradient-to-r from-teal-800 via-teal-600 to-teal-800 transition-all"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
