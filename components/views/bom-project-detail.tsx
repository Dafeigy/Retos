"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleSlash2Icon, SearchIcon } from "lucide-react"
import { InventoryMatchMap } from "@/components/inventory-location-map"
import { NavigationLink } from "@/components/navigation-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { matchBomRows, type BomMatch, type BomMatchStatus } from "@/lib/bom"
import { completedRows, projectRows, type BomProject } from "@/lib/bom-project"
import type { ComponentItem, StorageBox } from "@/lib/inventory-types"
import { cn } from "@/lib/utils"

const PAGE_SIZE_KEY = "retos-inventory-page-size"
const PAGE_SIZES = [5, 10, 15, 20] as const
type MatchFilter = "" | "matched" | "ready" | "short" | "unmatched" | "completed"

function hasLocation(match: BomMatch) {
  return match.items.some((item) => Boolean(item.location.trim()))
}

const statusTone: Record<BomMatchStatus, { icon: typeof CheckCircle2Icon; className: string }> = {
  unmatched: { icon: CircleSlash2Icon, className: "border-border bg-muted text-muted-foreground" },
  ready: { icon: CheckCircle2Icon, className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300" },
  short: { icon: AlertTriangleIcon, className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300" },
  "untracked-ready": { icon: CheckCircle2Icon, className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300" },
  "untracked-short": { icon: AlertTriangleIcon, className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300" },
}

function MatchBadge({ match }: { match: BomMatch }) {
  const tone = statusTone[match.status]
  const Icon = tone.icon
  const label = match.status === "unmatched" ? "未匹配" : `已匹配 · ${hasLocation(match) ? "有库位" : "无库位"} · ${match.status === "ready" || match.status === "short" ? "有货号" : "无货号"} · ${match.status === "ready" || match.status === "untracked-ready" ? "充足" : "不足"}`
  return <Badge variant="outline" className={cn("h-6 gap-1.5 px-2.5", tone.className)}><Icon aria-hidden="true" className="size-3" />{label}</Badge>
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number | string; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", active && "border-foreground bg-muted")}><span>{label}</span><span className="font-mono tabular-nums">{count}</span></button>
}

export function BomProjectDetail({ project, items, boxes, saveCompleted }: { project: BomProject; items: ComponentItem[]; boxes: StorageBox[]; saveCompleted: (completed: string[]) => Promise<void> }) {
  const rows = useMemo(() => projectRows(project), [project])
  const [completed, setCompleted] = useState(() => completedRows(project))
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<MatchFilter>("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const matches = useMemo(() => matchBomRows(rows, items), [rows, items])
  const matchedIds = useMemo(() => new Set(matches.flatMap((match) => match.items.map((item) => item.id))), [matches])
  const matchedCount = matches.filter((match) => match.status !== "unmatched").length
  const readyCount = matches.filter((match) => match.status === "ready" || match.status === "untracked-ready").length
  const shortCount = matches.filter((match) => match.status === "short" || match.status === "untracked-short").length
  const filtered = useMemo(() => matches.filter((match) => {
    const text = [match.row.comment, match.row.designator, match.row.footprint, match.row.value, match.row.manufacturerPart, match.row.supplierPart, ...match.items.map((item) => `${item.name} ${item.value} ${item.location}`)].join(" ").toLocaleLowerCase()
    if (query.trim() && !text.includes(query.trim().toLocaleLowerCase())) return false
    return !filter || (filter === "matched" && match.status !== "unmatched") || (filter === "ready" && (match.status === "ready" || match.status === "untracked-ready")) || (filter === "short" && (match.status === "short" || match.status === "untracked-short")) || (filter === "unmatched" && match.status === "unmatched") || (filter === "completed" && completed.includes(match.row.id))
  }), [matches, query, filter, completed])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const progress = rows.length ? Math.round(rows.filter((row) => completed.includes(row.id)).length / rows.length * 100) : 0

  useEffect(() => {
    const read = () => {
      const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY))
      if (PAGE_SIZES.some((size) => size === saved)) setPageSize(saved)
    }
    const frame = window.requestAnimationFrame(read)
    const onStorage = (event: StorageEvent) => { if (event.key === PAGE_SIZE_KEY) read() }
    window.addEventListener("storage", onStorage)
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("storage", onStorage) }
  }, [])

  function changeFilter(value: MatchFilter) { setFilter(value); setPage(1) }
  function changePageSize(value: number) { setPageSize(value); setPage(1); window.localStorage.setItem(PAGE_SIZE_KEY, String(value)) }

  async function toggle(id: string) {
    if (saving) return
    const previous = completed
    const next = previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]
    setCompleted(next); setError(""); setSaving(true)
    try { await saveCompleted(next) }
    catch (reason) { setCompleted(previous); setError(reason instanceof Error ? reason.message : "工程进度保存失败。") }
    finally { setSaving(false) }
  }

  const filterNames: Record<MatchFilter, string> = { "": "全部条目", matched: "已匹配", ready: "充足", short: "不足", unmatched: "未匹配", completed: "已焊接" }

  return <div className="mx-auto max-w-[1680px] space-y-6">
    <div><NavigationLink href="/bom" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />返回项目看板</NavigationLink><h2 className="mt-3 text-2xl font-semibold tracking-tight">{project.name}</h2>{project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}</div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm"><Badge variant="outline">{project.status}</Badge><span className="text-muted-foreground">{project.file_name}</span><span className="ml-auto font-mono tabular-nums">工程进度 {completed.length}/{rows.length} · {progress}%</span><div role="progressbar" aria-label="工程进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></div>
    <InventoryMatchMap items={items} boxes={boxes} matchedItemIds={matchedIds} />
    <Card className="min-w-0 border-border py-0 shadow-xs"><CardHeader className="gap-4 border-b py-5"><CardTitle>BOM 清单</CardTitle>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="按 BOM 匹配结果筛选">
        <FilterPill label="已匹配" count={`${matchedCount}/${rows.length}`} active={filter === "matched"} onClick={() => changeFilter(filter === "matched" ? "" : "matched")} />
        <FilterPill label="充足" count={readyCount} active={filter === "ready"} onClick={() => changeFilter(filter === "ready" ? "" : "ready")} />
        <FilterPill label="不足" count={shortCount} active={filter === "short"} onClick={() => changeFilter(filter === "short" ? "" : "short")} />
        <FilterPill label="未匹配" count={rows.length - matchedCount} active={filter === "unmatched"} onClick={() => changeFilter(filter === "unmatched" ? "" : "unmatched")} />
        <div className="relative ml-auto w-full sm:w-56"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="搜索 BOM" placeholder="搜索型号、封装或位号" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className="pl-9" /></div>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="cursor-pointer">{filterNames[filter]}<ChevronDownIcon className="size-4" /></Button>} /><DropdownMenuContent align="end" className="min-w-32"><DropdownMenuRadioGroup value={filter} onValueChange={(value) => changeFilter(value as MatchFilter)}>{Object.entries(filterNames).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      </div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardHeader>
      <CardContent className="px-0"><div className="overflow-x-auto"><Table className="min-w-[980px]" aria-label="BOM 匹配结果"><TableHeader><TableRow><TableHead className="pl-5">序号</TableHead><TableHead>Comment / 位号</TableHead><TableHead>Footprint</TableHead><TableHead>Value</TableHead><TableHead className="text-right">需求 / 库存</TableHead><TableHead>命中库存</TableHead><TableHead>匹配状态</TableHead><TableHead className="pr-5">焊接</TableHead></TableRow></TableHeader><TableBody>{visibleRows.map((match) => <TableRow key={match.row.id}><TableCell className="pl-5 font-mono text-xs text-muted-foreground">{match.row.number}</TableCell><TableCell><p className="max-w-48 truncate font-medium" title={match.row.comment}>{match.row.comment || "—"}</p><p className="max-w-48 truncate font-mono text-[11px] text-muted-foreground" title={match.row.designator}>{match.row.designator || "无位号"}</p></TableCell><TableCell className="font-mono text-xs">{match.row.footprint || "—"}</TableCell><TableCell className="font-mono text-xs">{match.row.value || "—"}</TableCell><TableCell className="text-right font-mono text-xs">{match.row.quantity} / {match.stock}</TableCell><TableCell className="max-w-44 truncate text-xs" title={match.items.map((item) => item.name).join("、")}>{match.items.map((item) => item.name).join("、") || "—"}</TableCell><TableCell><MatchBadge match={match} /></TableCell><TableCell className="pr-5"><label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs"><input type="checkbox" checked={completed.includes(match.row.id)} disabled={saving} onChange={() => void toggle(match.row.id)} className="size-4 accent-primary" />完成焊接</label></TableCell></TableRow>)}</TableBody></Table>{!visibleRows.length && <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">没有符合筛选条件的 BOM 行。</div>}</div></CardContent>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground"><span>显示 {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} / {filtered.length} 条</span><div className="flex flex-wrap items-center gap-3"><span>每页</span><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="每页显示数量" className="cursor-pointer">{pageSize}<ChevronDownIcon className="size-3" /></Button>} /><DropdownMenuContent align="end" className="min-w-20"><DropdownMenuRadioGroup value={String(pageSize)} onValueChange={(value) => changePageSize(Number(value))}>{PAGE_SIZES.map((size) => <DropdownMenuRadioItem key={size} value={String(size)}>{size}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><span>条</span><Button variant="outline" size="icon-sm" aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeftIcon /></Button><span className="min-w-12 text-center tabular-nums">{currentPage} / {pageCount}</span><Button variant="outline" size="icon-sm" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRightIcon /></Button></div></div>
    </Card>
  </div>
}
