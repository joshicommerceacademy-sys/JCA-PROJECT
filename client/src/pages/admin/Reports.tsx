import * as React from "react"
import { FileBarChart, Users, Ticket, ClipboardCheck, BarChart3, Trophy, Monitor } from "lucide-react"
import RegistrationsByExam from "@/pages/admin/RegistrationsByExam"
import HallTickets from "@/pages/admin/HallTickets"
import Attendance from "@/pages/admin/Attendance"
import Analytics from "@/pages/admin/Analytics"
import Results from "@/pages/admin/Results"
import OperationalReports from "@/pages/admin/OperationalReports"
import CentreCandidateReports from "@/pages/admin/CentreCandidateReports"
import { Button } from "@/components/ui/button"

const reportTabs = [
  { id: "registrations", label: "Registrations", icon: Users },
  { id: "halltickets", label: "Hall Tickets", icon: Ticket },
  { id: "attendance", label: "Attendance", icon: ClipboardCheck },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "results", label: "Results", icon: Trophy },
  { id: "operational", label: "Live & Centre Reports", icon: Monitor },
  { id: "centres", label: "Centre Candidate Summary", icon: Users },
] as const

type ReportTab = (typeof reportTabs)[number]["id"]

export default function Reports() {
  const [tab, setTab] = React.useState<ReportTab>("registrations")
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><FileBarChart className="size-6 text-primary" /> Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Student registrations, hall tickets, attendance and results in one place.</p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-background p-2">
        {reportTabs.map(({ id, label, icon: Icon }) => (
          <Button key={id} size="sm" variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)}>
            <Icon className="size-4" /> {label}
          </Button>
        ))}
      </div>
      {tab === "registrations" && <RegistrationsByExam />}
      {tab === "halltickets" && <HallTickets />}
      {tab === "attendance" && <Attendance />}
      {tab === "analytics" && <Analytics />}
      {tab === "results" && <Results />}
      {tab === "operational" && <OperationalReports />}
      {tab === "centres" && <CentreCandidateReports />}
    </div>
  )
}
