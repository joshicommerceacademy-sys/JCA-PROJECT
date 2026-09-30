import * as React from "react"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"

interface ConfirmPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  pending: boolean
  onConfirm: (password: string) => void
}

// Gates hall-ticket and result emails behind the fixed confirmation password — the
// server independently enforces the same check, this dialog just collects it.
export function ConfirmPasswordDialog({
  open, onOpenChange, title, description, pending, onConfirm,
}: ConfirmPasswordDialogProps) {
  const [password, setPassword] = React.useState("")

  React.useEffect(() => {
    if (!open) setPassword("")
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="size-4" /> {title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onConfirm(password)
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Confirmation Password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!password || pending}>
              {pending ? "Sending..." : "Confirm & Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
