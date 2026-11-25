import { cn } from "@/lib/utils"

/** Text that acts, underlined like a link: for an action inside a sentence. Forwards its props
 * and ref, so it can be a popover's or a menu's trigger. */
export function LinkButton({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn("text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60", className)}
      {...props}
    />
  )
}
