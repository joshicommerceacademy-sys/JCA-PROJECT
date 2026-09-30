import * as React from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  LayoutDashboard, Users, ShieldCheck, Building2, GraduationCap,
  CalendarClock, BookOpen, Trophy, Ticket, TicketPlus, LogOut, Menu, ClipboardCheck, RotateCcw, Radio, BarChart3,
  Settings,
} from "lucide-react"
import { useAdminAuth } from "@/context/AdminAuthContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import jcaBadge from "@/assets/jca-badge.png"

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/verification", label: "Verification", icon: ShieldCheck },
  { to: "/admin/centres", label: "Centres", icon: Building2 },
  { to: "/admin/standards", label: "Standards", icon: GraduationCap },
  { to: "/admin/exams", label: "Exam Schedule", icon: CalendarClock },
  { to: "/admin/questions", label: "Question Bank", icon: BookOpen },
  { to: "/admin/results", label: "Results", icon: Trophy },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/generate-hall-tickets", label: "Generate Hall Tickets", icon: TicketPlus },
  { to: "/admin/hall-tickets", label: "Hall Tickets", icon: Ticket },
  { to: "/admin/attendance", label: "Attendance", icon: ClipboardCheck },
  { to: "/admin/live-monitor", label: "Live Monitor", icon: Radio },
  { to: "/admin/reappear", label: "Reappear", icon: RotateCcw },
  { to: "/admin/settings", label: "Settings", icon: Settings },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )
          }
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const { admin, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  function handleLogout() {
    logout()
    navigate("/admin/login")
  }

  const initials = admin?.fullName
    ?.split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-9" />
          <div>
            <p className="text-sm font-semibold leading-tight">Joshi's Commerce Academy</p>
            <p className="text-xs text-sidebar-foreground/60 leading-tight">Exam Portal Admin</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-8 shrink-0" />
            <Avatar className="size-8">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{admin?.fullName}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{admin?.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="mt-1 w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground" onClick={handleLogout}>
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="flex-row items-center gap-2 justify-between border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-7" />
              <SheetTitle className="text-sidebar-foreground">Joshi's Commerce Academy</SheetTitle>
            </div>
          </SheetHeader>
          <div className="py-2">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="mt-auto border-t border-sidebar-border p-3">
            <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground/70" onClick={handleLogout}>
              <LogOut className="size-4" /> Logout
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-7 lg:hidden" />
          <p className="text-sm font-medium text-muted-foreground">Admin Console</p>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
