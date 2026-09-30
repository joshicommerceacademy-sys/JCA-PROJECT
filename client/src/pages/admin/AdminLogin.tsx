import * as React from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ShieldCheck, Eye, EyeOff } from "lucide-react"
import { useAdminAuth } from "@/context/AdminAuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import jcaBadge from "@/assets/jca-badge.png"

export default function AdminLogin() {
  const { login, isLoading } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await login(email, password)
      toast.success("Welcome back!")
      navigate("/admin/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed")
    }
  }

  return (
    <div className="flex min-h-svh bg-background">
      <div className="hidden w-1/2 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-10" />
          <span className="font-semibold">Joshi's Commerce Academy</span>
        </div>
        <div>
          <ShieldCheck className="mb-4 size-10 opacity-90" />
          <h1 className="text-3xl font-semibold tracking-tight">Admin Console</h1>
          <p className="mt-2 max-w-sm text-primary-foreground/80">
            Manage students, centres, exams, question banks, hall tickets and results from one
            place.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Joshi's Commerce Academy
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-primary lg:mx-0">
              <ShieldCheck className="size-6" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Admin Login</h2>
            <p className="text-sm text-muted-foreground">Joshi's Commerce Academy Exam Portal</p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="joshicommerceacademy@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="mt-2" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
