import { Link } from "react-router-dom"
import { GraduationCap, ArrowRight, Clock, Ticket, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import jcaBadge from "@/assets/jca-badge.png"

const features = [
  { icon: Clock, label: "Timed online exams" },
  { icon: Ticket, label: "Instant hall tickets" },
  { icon: BarChart3, label: "Real-time result tracking" },
]

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-b from-background to-muted/40 px-4">
      <div className="flex flex-1 flex-col items-center justify-center py-16">
        <div className="mb-10 text-center">
          <img src={jcaBadge} alt="Joshi's Commerce Academy" className="mx-auto mb-4 size-16 drop-shadow-lg" />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Joshi's Commerce Academy
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">Online Examination Portal</p>
        </div>

        <Link to="/student/login" className="w-full max-w-md">
          <Card className="group border-primary/20 shadow-md transition-shadow hover:shadow-xl">
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="size-7" />
              </div>
              <CardTitle className="flex items-center gap-2 text-xl">
                Student Login
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </CardTitle>
              <CardDescription className="text-base">
                Login with your roll number to view your hall ticket and take your scheduled exam.
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>

        <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Joshi's Commerce Academy ·{" "}
        <Link to="/admin/login" className="underline hover:text-foreground">
          Staff Login
        </Link>
      </footer>
    </div>
  )
}
