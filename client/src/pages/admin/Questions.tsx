import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Trash2, Pencil, BookOpen, Search, Upload, CheckCircle2, XCircle } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { QuestionBank, Question } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const SUBJECTS = ["Accounts", "Economics", "Business Studies", "Mathematics", "English", "General Knowledge", "Science", "Computer"]

const emptyBankForm = { id: 0, name: "", standardId: "", subject: "", description: "", status: "draft" as "draft" | "published" }
const emptyQuestionForm = {
  id: 0, bankId: "", questionText: "", optionA: "", optionB: "", optionC: "", optionD: "",
  correctAnswer: "A" as "A" | "B" | "C" | "D", marks: "2", difficulty: "medium" as "easy" | "medium" | "hard",
  status: "published" as "draft" | "published", explanation: "",
}

export default function Questions() {
  const queryClient = useQueryClient()
  const { data: banks, isLoading: banksLoading } = useQuery({ queryKey: ["question-banks"], queryFn: () => adminApi.questionBanks.list() })
  const { data: standards } = useQuery({ queryKey: ["standards"], queryFn: () => adminApi.standards.list() })
  const [search, setSearch] = React.useState("")
  const [difficultyFilter, setDifficultyFilter] = React.useState("all")
  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ["questions", { search, difficulty: difficultyFilter }],
    queryFn: () =>
      adminApi.questions.list({
        ...(search ? { search } : {}),
        ...(difficultyFilter !== "all" ? { difficulty: difficultyFilter } : {}),
      }),
  })

  const [bankOpen, setBankOpen] = React.useState(false)
  const [bankForm, setBankForm] = React.useState(emptyBankForm)
  const [questionOpen, setQuestionOpen] = React.useState(false)
  const [questionForm, setQuestionForm] = React.useState(emptyQuestionForm)
  const [activeBankFilter, setActiveBankFilter] = React.useState<string>("all")
  const [selectedIds, setSelectedIds] = React.useState<number[]>([])
  const [importOpen, setImportOpen] = React.useState(false)
  const [importBankId, setImportBankId] = React.useState<number | null>(null)
  const [importText, setImportText] = React.useState("")

  const saveBankMutation = useMutation({
    mutationFn: () =>
      bankForm.id
        ? adminApi.questionBanks.update(bankForm.id, { ...bankForm, standardId: Number(bankForm.standardId) })
        : adminApi.questionBanks.create({ ...bankForm, standardId: Number(bankForm.standardId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      toast.success(bankForm.id ? "Bank updated" : "Bank created")
      setBankOpen(false)
      setBankForm(emptyBankForm)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteBankMutation = useMutation({
    mutationFn: (id: number) => adminApi.questionBanks.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      queryClient.invalidateQueries({ queryKey: ["questions"] })
      toast.success("Bank and its questions deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const saveQuestionMutation = useMutation({
    mutationFn: () => {
      const body = {
        bankId: Number(questionForm.bankId),
        questionText: questionForm.questionText,
        optionA: questionForm.optionA,
        optionB: questionForm.optionB,
        optionC: questionForm.optionC,
        optionD: questionForm.optionD,
        correctAnswer: questionForm.correctAnswer,
        marks: Number(questionForm.marks),
        difficulty: questionForm.difficulty,
        status: questionForm.status,
        explanation: questionForm.explanation,
      }
      return questionForm.id ? adminApi.questions.update(questionForm.id, body) : adminApi.questions.create(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] })
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      toast.success(questionForm.id ? "Question updated" : "Question added")
      setQuestionOpen(false)
      setQuestionForm(emptyQuestionForm)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: number) => adminApi.questions.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] })
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      toast.success("Question deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const bulkStatusMutation = useMutation({
    mutationFn: (status: "draft" | "published") => adminApi.questions.bulkStatus(selectedIds, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] })
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      toast.success("Questions updated")
      setSelectedIds([])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => adminApi.questions.bulkDelete(selectedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] })
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      toast.success("Questions deleted")
      setSelectedIds([])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  // Accepts one question per line, fields separated by tabs (pasted straight from a
  // spreadsheet) or commas: Question, Option A, Option B, Option C, Option D, Correct Answer,
  // Marks (optional), Difficulty (optional).
  function parseImportRows(text: string) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = (line.includes("\t") ? line.split("\t") : line.split(",")).map((p) => p.trim())
        const [questionText, optionA, optionB, optionC, optionD, correctAnswer, marks, difficulty] = parts
        return { questionText, optionA, optionB, optionC, optionD, correctAnswer, marks, difficulty }
      })
  }

  const importMutation = useMutation({
    mutationFn: () => adminApi.questions.bulkImport(importBankId!, parseImportRows(importText)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["questions"] })
      queryClient.invalidateQueries({ queryKey: ["question-banks"] })
      toast.success(
        `Imported ${result.createdCount} question(s)${result.skipped.length ? `, skipped ${result.skipped.length}` : ""}`
      )
      setImportOpen(false)
      setImportText("")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function openImport(bankId: number) {
    setImportBankId(bankId)
    setImportText("")
    setImportOpen(true)
  }

  function openEditBank(b: QuestionBank) {
    setBankForm({ id: b.id, name: b.name, standardId: String(b.standard_id), subject: b.subject || "", description: b.description || "", status: b.status })
    setBankOpen(true)
  }

  function openEditQuestion(q: Question) {
    setQuestionForm({
      id: q.id, bankId: String(q.bank_id), questionText: q.question_text,
      optionA: q.option_a, optionB: q.option_b, optionC: q.option_c, optionD: q.option_d,
      correctAnswer: q.correct_answer, marks: String(q.marks), difficulty: q.difficulty,
      status: q.status, explanation: q.explanation || "",
    })
    setQuestionOpen(true)
  }

  function openNewQuestion(bankId?: number) {
    setQuestionForm({ ...emptyQuestionForm, bankId: bankId ? String(bankId) : "" })
    setQuestionOpen(true)
  }

  const filteredQuestions = (questions || []).filter(
    (q) => activeBankFilter === "all" || String(q.bank_id) === activeBankFilter
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Question Bank</h1>
        <p className="text-sm text-muted-foreground">Organize questions into banks and publish them for exams</p>
      </div>

      <Tabs defaultValue="banks">
        <TabsList>
          <TabsTrigger value="banks">Question Banks</TabsTrigger>
          <TabsTrigger value="questions">All Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="banks" className="mt-4 flex flex-col gap-4">
          <div className="flex justify-end">
            <Button onClick={() => { setBankForm(emptyBankForm); setBankOpen(true) }}>
              <Plus /> New Bank
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {banksLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!banksLoading && (banks || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No question banks yet.</p>
            )}
            {banks?.map((b) => (
              <Card key={b.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BookOpen className="size-4" />
                    </div>
                    <Badge variant={b.status === "published" ? "success" : "secondary"}>{b.status}</Badge>
                  </div>
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <CardDescription>{b.standard_name} · {b.subject || "General"}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{b.question_count} question{b.question_count === 1 ? "" : "s"}</p>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" title="Bulk import questions" onClick={() => openImport(b.id)}><Upload className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openNewQuestion(b.id)}><Plus className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditBank(b)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete bank "${b.name}" and all its questions?`)) deleteBankMutation.mutate(b.id) }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="questions" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search question text..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={activeBankFilter} onValueChange={setActiveBankFilter}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Filter by bank" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  {banks?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => openNewQuestion()}>
              <Plus /> Add Question
            </Button>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
              <span className="px-2 text-sm text-muted-foreground">{selectedIds.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate("published")}>
                <CheckCircle2 className="size-3.5" /> Publish
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate("draft")}>
                <XCircle className="size-3.5" /> Draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { if (confirm(`Delete ${selectedIds.length} selected question(s)?`)) bulkDeleteMutation.mutate() }}
              >
                <Trash2 className="size-3.5 text-destructive" /> Delete
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredQuestions.length > 0 && filteredQuestions.every((q) => selectedIds.includes(q.id))}
                        onCheckedChange={(c) =>
                          setSelectedIds(c ? filteredQuestions.map((q) => q.id) : [])
                        }
                      />
                    </TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionsLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  )}
                  {!questionsLoading && filteredQuestions.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No questions found.</TableCell></TableRow>
                  )}
                  {filteredQuestions.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(q.id)}
                          onCheckedChange={(c) =>
                            setSelectedIds((prev) => (c ? [...prev, q.id] : prev.filter((id) => id !== q.id)))
                          }
                        />
                      </TableCell>
                      <TableCell className="max-w-96 truncate">{q.question_text}</TableCell>
                      <TableCell>{q.bank_name}</TableCell>
                      <TableCell>{q.marks}</TableCell>
                      <TableCell className="capitalize">{q.difficulty}</TableCell>
                      <TableCell><Badge variant={q.status === "published" ? "success" : "secondary"}>{q.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditQuestion(q)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this question?")) deleteQuestionMutation.mutate(q.id) }}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{bankForm.id ? "Edit Bank" : "New Question Bank"}</DialogTitle></DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveBankMutation.mutate() }}>
            <div className="flex flex-col gap-1.5">
              <Label>Bank Name</Label>
              <Input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Standard</Label>
              <Select value={bankForm.standardId} onValueChange={(v) => setBankForm({ ...bankForm, standardId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select standard" /></SelectTrigger>
                <SelectContent>
                  {standards?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Subject</Label>
              <Select value={bankForm.subject} onValueChange={(v) => setBankForm({ ...bankForm, subject: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea value={bankForm.description} onChange={(e) => setBankForm({ ...bankForm, description: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={bankForm.status} onValueChange={(v) => setBankForm({ ...bankForm, status: v as "draft" | "published" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveBankMutation.isPending}>{saveBankMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={questionOpen} onOpenChange={setQuestionOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{questionForm.id ? "Edit Question" : "Add Question"}</DialogTitle></DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveQuestionMutation.mutate() }}>
            <div className="flex flex-col gap-1.5">
              <Label>Question Bank</Label>
              <Select value={questionForm.bankId} onValueChange={(v) => setQuestionForm({ ...questionForm, bankId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {banks?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Question Text</Label>
              <Textarea value={questionForm.questionText} onChange={(e) => setQuestionForm({ ...questionForm, questionText: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Option A</Label>
                <Input value={questionForm.optionA} onChange={(e) => setQuestionForm({ ...questionForm, optionA: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Option B</Label>
                <Input value={questionForm.optionB} onChange={(e) => setQuestionForm({ ...questionForm, optionB: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Option C</Label>
                <Input value={questionForm.optionC} onChange={(e) => setQuestionForm({ ...questionForm, optionC: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Option D</Label>
                <Input value={questionForm.optionD} onChange={(e) => setQuestionForm({ ...questionForm, optionD: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Correct Answer</Label>
                <Select value={questionForm.correctAnswer} onValueChange={(v) => setQuestionForm({ ...questionForm, correctAnswer: v as "A" | "B" | "C" | "D" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C", "D"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Marks</Label>
                <Input type="number" min={1} max={10} value={questionForm.marks} onChange={(e) => setQuestionForm({ ...questionForm, marks: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Difficulty</Label>
                <Select value={questionForm.difficulty} onValueChange={(v) => setQuestionForm({ ...questionForm, difficulty: v as "easy" | "medium" | "hard" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={questionForm.status} onValueChange={(v) => setQuestionForm({ ...questionForm, status: v as "draft" | "published" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Explanation (optional)</Label>
              <Textarea value={questionForm.explanation} onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveQuestionMutation.isPending}>{saveQuestionMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Import Questions</DialogTitle>
            <DialogDescription>
              One question per line, fields separated by tabs (paste straight from a spreadsheet) or
              commas: Question, Option A, Option B, Option C, Option D, Correct Answer (A-D), Marks
              (optional), Difficulty (optional).
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); importMutation.mutate() }}>
            <Textarea
              rows={10}
              placeholder={"What is 2+2?, 3, 4, 5, 6, B, 2, easy"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              required
            />
            <DialogFooter>
              <Button type="submit" disabled={importMutation.isPending || !importText.trim()}>
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
