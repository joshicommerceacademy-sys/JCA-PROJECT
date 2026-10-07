import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Settings as SettingsIcon, Hash, Mail, KeyRound, Ban } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { AppSettings } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
      <Checkbox id={id} className="mt-0.5" checked={checked} disabled={disabled} onCheckedChange={(c) => onCheckedChange(!!c)} />
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
            id="seat-number-enabled"
            checked={!!settings?.seat_number_enabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ seat_number_enabled: checked })}
            title="Lab seat number verification"
            description="When on, Schedule Exam gets an option to require seat numbers for that exam. If required,
              admins must enter each student's seat number individually on the Verification page before that
              student can be allowed — bulk approval is disabled for that exam."
          />
          <ToggleRow
            id="ip-capture-enabled"
            checked={!!settings?.ip_capture_enabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ ip_capture_enabled: checked })}
            title="Capture student IP address"
            description="Records each candidate's IP address when they start or resume an exam, and shows it as a
              column on the Live Monitor page. Off by default."
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
    </div>
  )
}
