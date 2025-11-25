import * as React from "react";
import { cn } from "../../lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }
>(({ className, hint, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("flex items-center text-xs font-semibold uppercase tracking-[0.08em]", className)}
    {...props}
  >
    <span className="text-slate-600">{children}</span>
    {hint && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{hint}</span>}
  </label>
));
Label.displayName = "Label";

export { Label };
