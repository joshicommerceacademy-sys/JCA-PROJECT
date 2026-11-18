import { cn } from "@/lib/utils"

type SwitchProps = {
  id?: string
  checked: boolean
  disabled?: boolean
  className?: string
  onCheckedChange: (checked: boolean) => void
}

// Pill-style on/off toggle (project primary colour when on, soft grey when off) used in place of checkboxes.
export function Switch({ id, checked, disabled, className, onCheckedChange }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/40",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-[18px] rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[23px]" : "translate-x-[3px]"
        )}
      />
    </button>
  )
}
