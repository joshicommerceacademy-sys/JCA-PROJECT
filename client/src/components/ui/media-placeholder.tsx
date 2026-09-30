import { ImageOff, PenOff } from "lucide-react"
import { cn } from "@/lib/utils"

export function PhotoFallback({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-full items-center justify-center bg-muted text-muted-foreground", className)}>
      <ImageOff className="size-1/2" />
    </div>
  )
}

export function SignatureBox({ url, className }: { url: string | null; className?: string }) {
  return (
    <div className={cn("flex h-14 w-32 items-center justify-center rounded-md border bg-muted/30", className)}>
      {url ? (
        <img src={url} alt="Signature" className="max-h-full max-w-full object-contain" />
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PenOff className="size-3.5" /> No Signature
        </div>
      )}
    </div>
  )
}
