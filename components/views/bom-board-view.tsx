"use client"

import { useMemo, useState, type FormEvent } from "react"
import { ChevronDownIcon, LoaderCircleIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react"
import { NavigationLink } from "@/components/navigation-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { decodeBomFile, parseBomCsv, type BomRow } from "@/lib/bom"
import { bomStatuses, projectProgress, projectRows, type BomProject, type BomProjectStatus } from "@/lib/bom-project"

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const statusTone: Record<BomProjectStatus, string> = {
  "采购中": "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  "焊接中": "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300",
  "测试中": "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300",
  "完成": "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
}

export function BomBoardView({ projects, createProject, changeStatus, editProject }: {
  projects: BomProject[]
  createProject: (name: string, description: string, fileName: string, rows: BomRow[], startDate: string) => Promise<void>
  changeStatus: (id: string, status: BomProjectStatus) => Promise<void>
  editProject: (id: string, name: string, description: string, startDate: string) => Promise<void>
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<BomProject | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [startDate, setStartDate] = useState(today)
  const [file, setFile] = useState<File | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const filtered = useMemo(() => projects.filter((project) => {
    const needle = query.trim().toLocaleLowerCase()
    return (!needle || `${project.name} ${project.description}`.toLocaleLowerCase().includes(needle)) && (!statusFilter || project.status === statusFilter)
  }), [projects, query, statusFilter])

  function openCreate() {
    setName(""); setDescription(""); setStartDate(today()); setFile(null); setError(""); setCreateOpen(true)
  }

  function openEdit(project: BomProject) {
    setName(project.name); setDescription(project.description); setStartDate(project.start_date || project.created_at.slice(0, 10)); setError(""); setEditing(project)
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !name.trim() || !startDate) return
    setError(""); setSaving(true)
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 10 * 1024 * 1024) throw new Error("请选择不超过 10 MB 的 CSV 文件。")
      const rows = parseBomCsv(decodeBomFile(await file.arrayBuffer()))
      if (!rows.length) throw new Error("CSV 中没有有效的 BOM 行。")
      await createProject(name.trim(), description.trim(), file.name, rows, startDate)
      setCreateOpen(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建项目失败。") }
    finally { setSaving(false) }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !name.trim() || !startDate) return
    setError(""); setSaving(true)
    try { await editProject(editing.id, name.trim(), description.trim(), startDate); setEditing(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "编辑项目失败。") }
    finally { setSaving(false) }
  }

  return <div className="mx-auto max-w-[1680px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">iBOM projects</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">项目看板</h2></div>
      <Button className="cursor-pointer" onClick={openCreate}><PlusIcon />新建项目</Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">全部项目 <span className="ml-1 rounded-md bg-muted px-2 py-1 font-mono text-foreground">{projects.length}</span></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <div className="relative min-w-48 flex-1 sm:w-64"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" aria-label="搜索项目" className="pl-9" /></div>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="cursor-pointer">{statusFilter || "全部状态"}<ChevronDownIcon className="size-4" /></Button>} /><DropdownMenuContent align="end" className="min-w-32"><DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}><DropdownMenuRadioItem value="">全部状态</DropdownMenuRadioItem>{bomStatuses.map((status) => <DropdownMenuRadioItem key={status} value={status}>{status}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      </div>
    </div>
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
      <Table className="min-w-[720px]" aria-label="iBOM 项目">
        <TableHeader><TableRow><TableHead className="pl-5">项目</TableHead><TableHead>状态</TableHead><TableHead>开始日期</TableHead><TableHead>元件条目</TableHead><TableHead className="w-52">工程进度</TableHead><TableHead className="w-20 pr-5 text-right">操作</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.map((project) => {
          const progress = projectProgress(project)
          return <TableRow key={project.id} className="hover:bg-muted/30">
            <TableCell className="pl-5"><NavigationLink href={`/bom/${project.id}`} className="font-medium hover:underline focus-visible:underline">{project.name}</NavigationLink>{project.description && <p className="mt-1 max-w-xl truncate text-xs text-muted-foreground" title={project.description}>{project.description}</p>}</TableCell>
            <TableCell><DropdownMenu><DropdownMenuTrigger render={<button type="button" aria-label={`${project.name} 状态：${project.status}`} className="inline-flex cursor-pointer items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Badge variant="outline" className={`h-7 gap-1.5 px-2.5 ${statusTone[project.status]}`}>{project.status}<ChevronDownIcon className="size-3" /></Badge></button>} /><DropdownMenuContent align="start" className="min-w-32"><DropdownMenuRadioGroup value={project.status} onValueChange={(value) => void changeStatus(project.id, value as BomProjectStatus).catch((reason) => setError(reason instanceof Error ? reason.message : "更新状态失败。"))}>{bomStatuses.map((status) => <DropdownMenuRadioItem key={status} value={status}>{status}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></TableCell>
            <TableCell className="font-mono text-xs tabular-nums">{project.start_date || project.created_at.slice(0, 10)}</TableCell>
            <TableCell className="font-mono text-xs">{projectRows(project).length}</TableCell>
            <TableCell><div className="flex items-center gap-2"><div role="progressbar" aria-label={`${project.name} 工程进度`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span></div></TableCell>
            <TableCell className="pr-5 text-right"><Button variant="ghost" size="icon-sm" aria-label={`编辑${project.name}`} className="cursor-pointer" onClick={() => openEdit(project)}><PencilIcon /></Button></TableCell>
          </TableRow>
        })}</TableBody>
      </Table>
      {!filtered.length && <div className="grid min-h-40 place-items-center px-4 text-center text-sm text-muted-foreground">{projects.length ? "没有符合筛选条件的项目。" : "还没有项目，点击“新建项目”导入 BOM CSV。"}</div>}
    </div>
    {error && !createOpen && !editing && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>新建 iBOM 项目</DialogTitle><DialogDescription>导入 CSV 后，可查看库存匹配并记录工程进度。</DialogDescription></DialogHeader>
      <form onSubmit={(event) => void submitCreate(event)} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">项目名称 <span className="text-destructive">*</span><Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：控制板 Rev.C" /></label>
        <label className="block space-y-1.5 text-sm font-medium">开始日期 <span className="text-destructive">*</span><Input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="block space-y-1.5 text-sm font-medium">BOM CSV <span className="text-destructive">*</span><Input required type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="block space-y-1.5 text-sm font-medium">项目说明<textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="可选" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button type="submit" disabled={saving} className="cursor-pointer">{saving && <LoaderCircleIcon className="animate-spin" />}创建项目</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}><DialogContent><DialogHeader><DialogTitle>编辑项目</DialogTitle><DialogDescription>修改名称、开始日期和项目说明。</DialogDescription></DialogHeader>
      <form onSubmit={(event) => void submitEdit(event)} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">项目名称 <span className="text-destructive">*</span><Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block space-y-1.5 text-sm font-medium">开始日期 <span className="text-destructive">*</span><Input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="block space-y-1.5 text-sm font-medium">项目说明<textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>取消</Button><Button type="submit" disabled={saving} className="cursor-pointer">{saving && <LoaderCircleIcon className="animate-spin" />}保存修改</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </div>
}
