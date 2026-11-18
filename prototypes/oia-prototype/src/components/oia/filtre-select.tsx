import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

/** Liste compacte commune : le navigateur ne dessine pas sa propre flèche. */
export function FiltreSelect({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="relative inline-flex w-fit max-w-full self-start justify-self-start">
    <select
      {...props}
      className={`h-9 w-auto min-w-48 max-w-full appearance-none truncate rounded-md border border-input bg-background pl-3 pr-9 text-sm text-foreground outline-none [field-sizing:content] focus:border-ring disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-80 ${className}`}
    >{children}</select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
  </span>;
}
