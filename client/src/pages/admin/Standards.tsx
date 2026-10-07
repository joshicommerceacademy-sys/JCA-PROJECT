import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Standard } from "@/api/types"
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

const emptyForm = { id: 0, name: "", code: "", description: "", status: "active" as "active" | "inactive" }

export default function Standards() {
  const queryClient = useQueryClient()
  const { data: standards, isLoading } = useQuery({ queryKey: ["standards"], queryFn: () => adminApi.standards.list() })
  const [search, setSearch] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)
  const isEditing = form.id !== 0

  const saveMutation = useMutation({
    mutationFn: () =>
      isEditing ? adminApi.standards.update(form.id, form) : adminApi.standards.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["standards"] })
      toast.success(isEditing ? "Standard updated" : "Standard created")
      setOpen(false)
      setForm(emptyForm)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.standards.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["standards"] })
      toast.success("Standard deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function openCreate() {
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(s: Standard) {
    setForm({ id: s.id, name: s.name, code: s.code, description: s.description, status: s.status })
    setOpen(true)
  }

  const filtered = (standards || []).filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Standards</h1>
          <p className="text-sm text-muted-foreground">Manage class / grade levels</p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> Add Standard
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">All Standards</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search standards..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No standards found.</TableCell></TableRow>
              )}
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.code}</TableCell>
                  <TableCell className="max-w-64 truncate">{s.description}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "success" : "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete standard "${s.name}"?`)) deleteMutation.mutate(s.id) }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Standard" : "Add Standard"}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Standard Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Standard Code</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
