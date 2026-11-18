import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search, Armchair } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Centre } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const emptyForm = { id: 0, name: "", code: "", address: "", city: "", status: "active" as "active" | "inactive" }

export default function Centres() {
  const queryClient = useQueryClient()
  const { data: centres, isLoading } = useQuery({ queryKey: ["centres"], queryFn: () => adminApi.centres.list() })
  const [search, setSearch] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)
  const isEditing = form.id !== 0
  const [labCentreId, setLabCentreId] = React.useState<number | null>(null)
  const [labForm, setLabForm] = React.useState({ id: 0, name: "", capacity: "" })
  const labCentre = (centres || []).find((c) => c.id === labCentreId) || null
  const [seatInputs, setSeatInputs] = React.useState<Record<number, string>>({})
  const addSeatsMutation = useMutation({
    mutationFn: ({ labId, seats }: { labId: number; seats: string }) => adminApi.centres.addSeats(labId, seats),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["centres"] })
      setSeatInputs((prev) => ({ ...prev, [vars.labId]: "" }))
      toast.success("Seat numbers added")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const removeSeatMutation = useMutation({
    mutationFn: ({ labId, seat }: { labId: number; seat: string }) => adminApi.centres.removeSeat(labId, seat),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["centres"] }),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const labMutation = useMutation({
    mutationFn: () => {
      const body = { name: labForm.name.trim(), capacity: Number(labForm.capacity) }
      return labForm.id ? adminApi.centres.updateLab(labForm.id, body) : adminApi.centres.addLab(labCentreId!, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centres"] })
      toast.success(labForm.id ? "Lab updated" : "Lab added")
      setLabForm({ id: 0, name: "", capacity: "" })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const deleteLabMutation = useMutation({
    mutationFn: (id: number) => adminApi.centres.removeLab(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centres"] })
      toast.success("Lab deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      isEditing
        ? adminApi.centres.update(form.id, form)
        : adminApi.centres.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centres"] })
      toast.success(isEditing ? "Centre updated" : "Centre created")
      setOpen(false)
      setForm(emptyForm)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.centres.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centres"] })
      toast.success("Centre deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function openCreate() {
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(c: Centre) {
    setForm({ id: c.id, name: c.name, code: c.code, address: c.address, city: c.city || "", status: c.status })
    setOpen(true)
  }

  const filtered = (centres || []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Centres</h1>
          <p className="text-sm text-muted-foreground">Manage exam centres</p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> Add Centre
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">All Centres</CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search centres..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Labs / Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No centres found.</TableCell></TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.code}</TableCell>
                  <TableCell>{c.city || "—"}</TableCell>
                  <TableCell className="max-w-64 truncate">{c.address}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => { setLabForm({ id: 0, name: "", capacity: "" }); setLabCentreId(c.id) }}>
                      <Armchair className="size-4" /> {c.labs?.length || 0} lab{c.labs?.length === 1 ? "" : "s"} · {c.total_capacity || 0} seats
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "success" : "secondary"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete centre "${c.name}"?`)) deleteMutation.mutate(c.id) }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={labCentreId !== null} onOpenChange={(o) => !o && setLabCentreId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Labs — {labCentre?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Capacity is the maximum number of seats (candidates) in the lab. Total capacity: <b>{labCentre?.total_capacity || 0}</b>
          </p>
          <div className="overflow-hidden rounded-lg border">
            {(labCentre?.labs || []).map((l) => (
              <div key={l.id} className="flex flex-col gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{l.name}</span>
                  <span className="flex items-center gap-1">
                    <span className="mr-2 text-muted-foreground">{l.capacity} capacity · {l.seats?.length || 0} seat numbers</span>
                    <Button variant="ghost" size="icon" onClick={() => setLabForm({ id: l.id, name: l.name, capacity: String(l.capacity) })}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete lab "${l.name}"?`)) deleteLabMutation.mutate(l.id) }}><Trash2 className="size-4 text-destructive" /></Button>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(l.seats || []).map((seat) => (
                    <button key={seat} type="button" title="Remove seat" onClick={() => removeSeatMutation.mutate({ labId: l.id, seat })}
                      className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs hover:bg-destructive/10 hover:text-destructive">{seat}</button>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if ((seatInputs[l.id] || "").trim()) addSeatsMutation.mutate({ labId: l.id, seats: seatInputs[l.id] }) }}>
                  <Input className="h-8" placeholder="Add Seat Number — e.g. 1-30, 35" value={seatInputs[l.id] || ""} onChange={(e) => setSeatInputs((prev) => ({ ...prev, [l.id]: e.target.value }))} />
                  <Button type="submit" size="sm" variant="outline" disabled={addSeatsMutation.isPending}>Add Seat Number</Button>
                </form>
              </div>
            ))}
            {!labCentre?.labs?.length && <div className="px-3 py-3 text-sm text-muted-foreground">No labs yet.</div>}
          </div>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); labMutation.mutate() }}>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="labName">Lab Name</Label>
              <Input id="labName" placeholder="e.g. Lab 1" value={labForm.name} onChange={(e) => setLabForm({ ...labForm, name: e.target.value })} required />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor="labCap">Capacity</Label>
              <Input id="labCap" type="number" min={1} placeholder="Seats" value={labForm.capacity} onChange={(e) => setLabForm({ ...labForm, capacity: e.target.value })} required />
            </div>
            <Button type="submit" disabled={labMutation.isPending}>{labForm.id ? "Update" : "Add"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Centre" : "Add Centre"}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Centre Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Centre Code</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
