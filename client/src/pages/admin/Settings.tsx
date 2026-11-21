import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Settings as SettingsIcon, Hash, Mail, KeyRound, Ban, Link2, Smartphone, ArrowLeft, RotateCw } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { AppSettings } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

// Settings > Device Restart. Exam names first; opening one lists only that exam's candidates with the
// IP address captured from their device. Restart Device is enabled only once an address was captured.
function DeviceRestart() {
  const [exam, setExam] = React.useState<{ id: number; name: string } | null>(null)
  const [target, setTarget] = React.useState<{ id: number; full_name: string; roll_number: string; last_ip: string | null } | null>(null)
  const queryClient = useQueryClient()
  const { data: exams } = useQuery({ queryKey: ["device-exams"], queryFn: () => adminApi.settings.deviceExams() })
  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices", exam?.id],
    queryFn: () => adminApi.settings.devices(exam!.id),
    enabled: !!exam,
    refetchInterval: 10000,
  })
  const restart = useMutation({
    mutationFn: (id: number) => adminApi.settings.restartDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices", exam?.id] })
      toast.success("Restart sent to the device")
      setTarget(null)
    },
    onError: (error) => { toast.error(getErrorMessage(error)); setTarget(null) },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="size-4" /> Device Restart</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!exam ? (
          <>
            <p className="text-xs text-muted-foreground">Open an exam to see its candidates and the IP address of the device they are using.</p>
            {(exams || []).length === 0 && <p className="text-sm text-muted-foreground">No exams scheduled.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {(exams || []).map((e) => (
                <button key={e.key} type="button" onClick={() => setExam({ id: e.id, name: e.name })} className="rounded-lg border p-3 text-left text-sm font-medium transition-colors hover:bg-muted/50">
                  {e.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{exam.name}</p>
              <Button size="sm" variant="outline" onClick={() => setExam(null)}><ArrowLeft className="size-3.5" /> All exams</Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate Name</TableHead>
                    <TableHead>Roll No</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead className="text-right">Restart Device</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
                  {!isLoading && (devices?.candidates || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No candidates for this exam.</TableCell></TableRow>}
                  {(devices?.candidates || []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="font-mono">{c.roll_number}</TableCell>
                      <TableCell className="font-mono text-sm">{c.last_ip || <span className="text-muted-foreground">Not captured</span>}</TableCell>
                      <TableCell className="text-right">
                        {c.pending_command === "device_restart"
                          ? <Badge variant="warning">Restart sent</Badge>
                          : <Button size="sm" variant="outline" disabled={!c.last_ip} onClick={() => setTarget(c)}><RotateCw className="size-3.5" /> Restart Device</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restart device of {target?.full_name}?</DialogTitle>
            <DialogDescription>
              {target?.roll_number} · {target?.last_ip}. The page on that device (mobile or computer) restarts and the exam data stored on it is deleted.
              A running exam is stopped (clock paused); grant Reappear from the Reappear page when the candidate may continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button disabled={restart.isPending} onClick={() => target && restart.mutate(target.id)}>{restart.isPending ? "Sending..." : "Restart Device"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ToggleRow({
  id, checked, disabled, onCheckedChange, title, description,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-2">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </Label>
    </div>
  )
}

export default function Settings() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery<AppSettings>({
    queryKey: ["settings"],
    queryFn: () => adminApi.settings.get(),
  })

  const updateMutation = useMutation({
    mutationFn: adminApi.settings.update,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data)
      toast.success("Settings updated")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const [passwordForm, setPasswordForm] = React.useState({ currentPassword: "", newPassword: "", confirmNewPassword: "" })
  const passwordMutation = useMutation({
    mutationFn: () => adminApi.settings.changePassword(passwordForm),
    onSuccess: () => {
      toast.success("Password updated — use your new password next time you log in.")
      setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const passwordsMismatch =
    passwordForm.newPassword.length > 0 &&
    passwordForm.confirmNewPassword.length > 0 &&
    passwordForm.newPassword !== passwordForm.confirmNewPassword

  function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      toast.error("New password and confirmation do not match.")
      return
    }
    passwordMutation.mutate()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <SettingsIcon className="size-5" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">System configuration and exam security options</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Hash className="size-4" /> Exam Security</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="ip-capture-enabled"
            checked={!!settings?.ip_capture_enabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ ip_capture_enabled: checked })}
            title="Capture student IP address"
            description="Records each candidate's device IP address when they select their roll number, log in, start
              or resume an exam (and while the exam runs), and shows it on the Live Monitor and Device Restart pages."
          />
          <ToggleRow
            id="disable-copy-enabled"
            checked={!!settings?.disable_copy_enabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ disable_copy_enabled: checked })}
            title="Block copy, right-click and drag-out during exams"
            description="Silently disables copy/cut, the right-click menu, and dragging content out of the page
              while a student is taking an exam. On by default."
          />
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              <Hash className="size-3.5 text-muted-foreground" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="max-security-warnings" className="font-medium">Tab-switch / fullscreen-exit warnings before auto-submit</Label>
              <p className="text-xs text-muted-foreground">
                How many times a candidate can switch tabs or exit fullscreen before their exam is
                automatically submitted. 1 (default) means the first offense shows a warning and the next
                one auto-submits. 0 means zero tolerance — auto-submit on the first offense.
              </p>
              <Input
                id="max-security-warnings"
                type="number"
                min={0}
                max={10}
                className="w-24"
                disabled={isLoading || updateMutation.isPending}
                defaultValue={settings?.max_security_warnings ?? 1}
                key={settings?.max_security_warnings}
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isInteger(n) && n >= 0 && n !== settings?.max_security_warnings) {
                    updateMutation.mutate({ max_security_warnings: n })
                  }
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4" /> Public Links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="registration-link-enabled"
            checked={settings?.registration_link_enabled !== false}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ registration_link_enabled: checked })}
            title="Student registration link"
            description="Turn off to stop exam registration. The registration page then says that exam registration is not
              going on and to contact Joshi Commerce Academy."
          />
          <ToggleRow
            id="result-link-enabled"
            checked={settings?.result_link_enabled !== false}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ result_link_enabled: checked })}
            title="Result link"
            description="Turn off to hide the public Results page. It then says that results are not available and to contact
              Joshi Commerce Academy."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Ban className="size-4" /> Access Control</CardTitle>
        </CardHeader>
        <CardContent>
          <ToggleRow
            id="student-login-enabled"
            checked={!!settings?.student_login_enabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ student_login_enabled: checked })}
            title="Allow student login"
            description="Turn off to immediately block every new student sign-in (exam list, roll-number list, and
              login form all show a 'temporarily disabled' message). A student already in the middle of an
              exam is not affected — this only blocks new logins and resumes."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4" /> Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <ToggleRow
            id="registration-alert-enabled"
            checked={!!settings?.registration_alert_enabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ registration_alert_enabled: checked })}
            title="Email admins on new student registration"
            description="Sends every admin account an email the moment a new student registers and is awaiting
              verification."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex max-w-sm flex-col gap-4" onSubmit={submitPasswordChange}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-new-password">Confirm New Password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={passwordForm.confirmNewPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmNewPassword: e.target.value })}
                required
              />
              {passwordsMismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
            </div>
            <Button type="submit" className="w-fit" disabled={passwordMutation.isPending || passwordsMismatch}>
              {passwordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DeviceRestart />
    </div>
  )
}
