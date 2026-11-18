import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ClipboardCheck, Eye, EyeOff } from "lucide-react"
import { api, getErrorMessage } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DeviceStatus } from "@/components/desk/DeviceStatus"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

// Verification Desk sign-in: user ID is the first 5 letters of the exam name + "verify", and the
// password is that exam's access password (shown on the Exam Schedule page).
export default function DeskLogin() {
  const navigate = useNavigate()
  const [userId, setUserId] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [show, setShow] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [askOperator, setAskOperator] = React.useState(false)
  const [operator, setOperator] = React.useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post("/desk/login", { userId, password })
      const { token, exam } = res.data.data
      localStorage.setItem("jca_desk_token", token)
      localStorage.setItem("jca_desk_exam", JSON.stringify(exam))
      localStorage.removeItem("jca_desk_operator")
      localStorage.removeItem("jca_desk_slot")
      setAskOperator(true)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <ClipboardCheck className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Verification Desk</h1>
          <p className="text-sm text-muted-foreground">Joshi's Commerce Academy Exam Portal</p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desk-user">User ID</Label>
            <Input id="desk-user" value={userId} onChange={(e) => setUserId(e.target.value)} autoFocus required autoCapitalize="none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desk-password">Password</Label>
            <div className="relative">
              <Input id="desk-password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-9" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="mt-2" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
          <DeviceStatus />
          <Link to="/" className="text-center text-sm text-muted-foreground underline hover:text-foreground">Back to Home</Link>
        </form>
      </div>
      <Dialog open={askOperator}>
        <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Operator name</DialogTitle>
            <DialogDescription>Enter the name of the person running this desk.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!operator.trim()) return
              localStorage.setItem("jca_desk_operator", operator.trim())
              navigate("/desk")
            }}
          >
            <Input autoFocus placeholder="Operator name" value={operator} onChange={(e) => setOperator(e.target.value)} required />
            <Button type="submit" disabled={!operator.trim()}>Submit</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
