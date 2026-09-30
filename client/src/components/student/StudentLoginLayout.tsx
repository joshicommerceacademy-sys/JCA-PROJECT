import * as React from "react"
import { GraduationCap } from "lucide-react"
import jcaBadge from "@/assets/jca-badge.png"

// Shared shell for both student-login steps (exam select, then roll-number select) so the
// branding panel and heading aren't duplicated between the two pages.
export function StudentLoginLayout({
  title, subtitle, children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <div className="hidden w-1/2 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-10" />
          <span className="font-semibold">Joshi's Commerce Academy</span>
        </div>
        <div>
          <GraduationCap className="mb-4 size-10 opacity-90" />
          <h1 className="text-3xl font-semibold tracking-tight">Student Portal</h1>
          <p className="mt-2 max-w-sm text-primary-foreground/80">
            View your hall ticket and take your scheduled exam, all in one place.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Joshi's Commerce Academy
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:text-left">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-primary lg:mx-0">
              <GraduationCap className="size-6" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
