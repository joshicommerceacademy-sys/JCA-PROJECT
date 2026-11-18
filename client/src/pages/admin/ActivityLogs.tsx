import * as React from "react"
import { ClipboardList, RefreshCw, Search } from "lucide-react"
import { api, getErrorMessage } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AuditEvent = { id: number; event_type: string; page_path: string | null; target_label: string | null; key_action: string | null; actor_role: string; actor_id: number | null; actor_name: string | null; actor_reference: string | null; ip_address: string | null; occurred_at: string }

const eventLabel: Record<string, string> = { click: "Click", key_action: "Keyboard action", form_submit: "Form submit", navigation: "Page navigation" }

export default function ActivityLogs() {
  const [rows, setRows] = React.useState<AuditEvent[]>([])
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const load = React.useCallback(async () => {
    setLoading(true); setError("")
    try { const res = await api.get("/audit/events?limit=500"); setRows(res.data.data || []) }
    catch (e) { setError(getErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { void load() }, [load])
  const filtered = rows.filter((r) => [r.actor_name, r.actor_reference, r.actor_role, r.event_type, r.page_path, r.target_label, r.key_action, r.ip_address].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())))
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardList className="size-6 text-primary" /> Activity Logs</h1><p className="mt-1 text-sm text-muted-foreground">User interactions, page changes and timestamps. Passwords and typed form values are not recorded.</p></div><Button onClick={() => void load()} variant="outline" disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>
    <Card><CardContent className="p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" placeholder="Search user, action, page, IP..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><p className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {rows.length} recent records</p></CardContent></Card>
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load activity logs: {error}. Check that you are signed in as Admin and the Neon migration has run.</div>}
    <div className="overflow-x-auto rounded-xl border bg-background"><Table><TableHeader><TableRow><TableHead>Date &amp; Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Target / Key</TableHead><TableHead>Page</TableHead><TableHead>IP Address</TableHead></TableRow></TableHeader><TableBody>{filtered.map((r) => <TableRow key={r.id}><TableCell className="whitespace-nowrap text-xs">{r.occurred_at ? new Date(r.occurred_at).toLocaleString() : "—"}</TableCell><TableCell><div className="font-medium">{r.actor_name || (r.actor_role === "unknown" ? "Unknown visitor" : `${r.actor_role} #${r.actor_id ?? "—"}`)}</div><div className="text-xs text-muted-foreground">{r.actor_reference || r.actor_role}</div></TableCell><TableCell>{eventLabel[r.event_type] || r.event_type}</TableCell><TableCell className="max-w-56 break-words">{r.target_label || r.key_action || "—"}{r.key_action && r.target_label ? <div className="text-xs text-muted-foreground">{r.key_action}</div> : null}</TableCell><TableCell className="max-w-48 break-all text-xs">{r.page_path || "—"}</TableCell><TableCell className="whitespace-nowrap text-xs">{r.ip_address || "—"}</TableCell></TableRow>)}{!loading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No activity records found.</TableCell></TableRow>}</TableBody></Table></div>
  </div>
}
