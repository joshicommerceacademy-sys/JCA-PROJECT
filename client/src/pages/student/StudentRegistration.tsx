import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/api/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Exam = { id: number; name: string }
type Centre = { id: number; name: string; city: string | null }
const emptyForm = { fullName: "", email: "", phone: "", dob: "", gender: "", address: "", centreId: "", registeredExamId: "" }

export default function StudentRegistration() {
  const navigate = useNavigate()
  const [exams, setExams] = React.useState<Exam[]>([])
  const [centres, setCentres] = React.useState<Centre[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [signature, setSignature] = React.useState<File | null>(null)
  React.useEffect(() => {
    api.get("/public/centres").then((r) => setCentres(r.data.data || [])).catch(() => setCentres([]))
    api.get("/public/exams").then((r) => setExams(r.data.data || [])).catch(() => setExams([]))
  }, [])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    setSubmitting(true)
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    if (photo) fd.append("photo", photo)
    if (signature) fd.append("signature", signature)
    try {
      const r = await api.post("/public/registration", fd)
      const id = r.data.data.application_id as string
      formEl.reset()
      navigate("/student/track", { state: { applicationId: id, justRegistered: true } })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Button asChild variant="ghost" className="self-start"><Link to="/"><ArrowLeft className="size-4" /> Back to Home</Link></Button>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl"><UserPlus className="size-6 text-primary" /> Student Exam Registration</CardTitle>
            <CardDescription>Select the exam you are registering for. Your details will be reviewed by the academy.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit}>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Select Exam *</Label>
                <Select value={form.registeredExamId} onValueChange={(v) => setForm({ ...form, registeredExamId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                  <SelectContent>{exams.map((x) => <SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent>
                </Select>
                {!exams.length && <p className="text-xs text-muted-foreground">No exams are currently available for registration.</p>}
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2"><Label>Full Name *</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
              <div className="flex flex-col gap-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="flex flex-col gap-1.5"><Label>Phone Number *</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
              <div className="flex flex-col gap-1.5"><Label>Date of Birth *</Label><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required /></div>
              <div className="flex flex-col gap-1.5">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Preferred Centre *</Label>
                <Select value={form.centreId} onValueChange={(v) => setForm({ ...form, centreId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select centre" /></SelectTrigger>
                  <SelectContent>{centres.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.city ? ` — ${c.city}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5"><Label>Photo (JPG/PNG/WEBP, max 5 MB)</Label><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></div>
              <div className="flex flex-col gap-1.5"><Label>Signature (JPG/PNG/WEBP, max 5 MB)</Label><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setSignature(e.target.files?.[0] || null)} /></div>
              <div className="sm:col-span-2">
                <Button className="w-full" type="submit" disabled={submitting || !exams.length || !form.registeredExamId || !form.centreId}>
                  {submitting ? "Submitting..." : "Submit Registration"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Your application stays pending until the academy verifies it. Your hall ticket is available after verification.</p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">Already registered? <Link to="/student/track" className="underline hover:text-foreground">Track your application</Link></p>
      </div>
    </div>
  )
}
