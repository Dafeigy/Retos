"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleSlash2Icon,
  FileSearchIcon,
  LoaderCircleIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { InventoryMatchMap } from "@/components/inventory-location-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { decodeBomFile, matchBomRows, parseBomCsv, type BomMatch, type BomMatchStatus, type BomRow } from "@/lib/bom"
import type { ComponentItem, StorageBox } from "@/lib/inventory-types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10
const BOM_CACHE_DATABASE = "mob-ibom-cache"
const BOM_CACHE_STORE = "imports"
const BOM_CACHE_KEY = "current-csv-v1"
type MatchFilter = "matched" | "ready" | "short" | "unmatched"

type BomCacheEntry = {
  version: 1
  fileName: string
  rows: BomRow[]
}

let memoryCache: BomCacheEntry | null = null

function isBomCacheEntry(value: unknown): value is BomCacheEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<BomCacheEntry>
  return entry.version === 1 && typeof entry.fileName === "string" && Array.isArray(entry.rows)
}

function openBomCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(BOM_CACHE_DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BOM_CACHE_STORE)) request.result.createObjectStore(BOM_CACHE_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readBomCache() {
  if (memoryCache) return memoryCache
  if (typeof window === "undefined" || !window.indexedDB) return null
  const database = await openBomCache()
  return new Promise<BomCacheEntry | null>((resolve, reject) => {
    const request = database.transaction(BOM_CACHE_STORE, "readonly").objectStore(BOM_CACHE_STORE).get(BOM_CACHE_KEY)
    request.onsuccess = () => {
      database.close()
      const entry = isBomCacheEntry(request.result) ? request.result : null
      memoryCache = entry
      resolve(entry)
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}

async function writeBomCache(entry: BomCacheEntry) {
  memoryCache = entry
  if (typeof window === "undefined" || !window.indexedDB) return
  const database = await openBomCache()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BOM_CACHE_STORE, "readwrite")
    transaction.objectStore(BOM_CACHE_STORE).put(entry, BOM_CACHE_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

async function deleteBomCache() {
  memoryCache = null
  if (typeof window === "undefined" || !window.indexedDB) return
  const database = await openBomCache()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BOM_CACHE_STORE, "readwrite")
    transaction.objectStore(BOM_CACHE_STORE).delete(BOM_CACHE_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

const statusPresentation: Record<BomMatchStatus, { label: string; className: string; icon: typeof CheckCircle2Icon }> = {
  unmatched: {
    label: "未匹配",
    className: "border-border bg-muted text-muted-foreground",
    icon: CircleSlash2Icon,
  },
  ready: {
    label: "已匹配 · 有货号 · 充足",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
    icon: CheckCircle2Icon,
  },
  short: {
    label: "已匹配 · 有货号 · 不足",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
    icon: AlertTriangleIcon,
  },
  "untracked-ready": {
    label: "已匹配 · 无货号 · 充足",
    className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300",
    icon: CheckCircle2Icon,
  },
  "untracked-short": {
    label: "已匹配 · 无货号 · 不足",
    className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300",
    icon: AlertTriangleIcon,
  },
}

function MatchBadge({ status }: { status: BomMatchStatus }) {
  const presentation = statusPresentation[status]
  const Icon = presentation.icon
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 px-2.5", presentation.className)}>
      <Icon aria-hidden="true" className="size-3" />
      {presentation.label}
    </Badge>
  )
}

function SummaryFilterTag({ label, count, active, tone, onClick }: { label: string; count: string | number; active: boolean; tone: "neutral" | "ready" | "short" | "unmatched"; onClick: () => void }) {
  const tones = {
    neutral: "border-border bg-card text-foreground hover:bg-muted",
    ready: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/80",
    short: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950/80",
    unmatched: "border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", tones[tone], active ? "ring-2 ring-foreground/35 ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100")}
    >
      <span>{label}</span>
      <span className="font-mono font-semibold tabular-nums">{count}</span>
    </button>
  )
}

function searchableText(match: BomMatch) {
  return [match.row.comment, match.row.designator, match.row.footprint, match.row.value, match.row.manufacturerPart, match.row.supplierPart, ...match.items.map((item) => `${item.name} ${item.value} ${item.location}`)].join(" ").toLocaleLowerCase()
}

export function BomView({ items, boxes }: { items: ComponentItem[]; boxes: StorageBox[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BomRow[]>([])
  const [fileName, setFileName] = useState("")
  const [cacheReady, setCacheReady] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [matchFilter, setMatchFilter] = useState<MatchFilter | null>(null)
  const [page, setPage] = useState(1)
  const [dragging, setDragging] = useState(false)
  const matches = useMemo(() => matchBomRows(rows, items), [items, rows])
  const matchedRows = matches.filter((match) => match.status !== "unmatched").length
  const readyRows = matches.filter((match) => match.status === "ready" || match.status === "untracked-ready").length
  const shortRows = matches.filter((match) => match.status === "short" || match.status === "untracked-short").length
  const unmatchedRows = matches.length - matchedRows
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return matches.filter((match) => {
      const matchesQuery = !needle || searchableText(match).includes(needle)
      const matchesStatus = !matchFilter
        || (matchFilter === "matched" && match.status !== "unmatched")
        || (matchFilter === "ready" && (match.status === "ready" || match.status === "untracked-ready"))
        || (matchFilter === "short" && (match.status === "short" || match.status === "untracked-short"))
        || (matchFilter === "unmatched" && match.status === "unmatched")
      return matchesQuery && matchesStatus
    })
  }, [matchFilter, matches, query])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const matchedItemIds = useMemo(() => new Set(matches.flatMap((match) => match.items.map((item) => item.id))), [matches])

  useEffect(() => {
    let cancelled = false
    void readBomCache()
      .then((entry) => {
        if (cancelled || !entry) return
        setRows(entry.rows)
        setFileName(entry.fileName)
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setCacheReady(true) })
    return () => { cancelled = true }
  }, [])

  function toggleMatchFilter(next: MatchFilter) {
    setMatchFilter((current) => current === next ? null : next)
    setPage(1)
  }

  async function importFile(file?: File) {
    if (!file) return
    setDragging(false)
    setError("")
    if (!file.name.toLocaleLowerCase().endsWith(".csv")) {
      setError("请选择 CSV 格式的 BOM 文件。")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("CSV 文件不能超过 10 MB。")
      return
    }
    try {
      const parsed = parseBomCsv(decodeBomFile(await file.arrayBuffer()))
      if (parsed.length === 0) throw new Error("CSV 中没有有效的 BOM 行。")
      setRows(parsed)
      setFileName(file.name)
      setQuery("")
      setMatchFilter(null)
      setPage(1)
      void writeBomCache({ version: 1, fileName: file.name, rows: parsed }).catch(() => undefined)
    } catch (reason) {
      setRows([])
      setFileName("")
      setError(reason instanceof Error ? reason.message : "无法读取这个 BOM 文件。")
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function clearImportedFile() {
    setRows([])
    setFileName("")
    setError("")
    setQuery("")
    setMatchFilter(null)
    setPage(1)
    if (inputRef.current) inputRef.current.value = ""
    void deleteBomCache().catch(() => undefined)
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <section>
        <div>
          <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">Inventory BOM matcher</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">嘉立创BOM匹配</h2>
          {/* <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">导入 CSV 后，系统会依次按 Comment、Footprint、Value 缩小匹配范围，并把命中的库存货位标到右侧收纳盒。</p> */}
        </div>
      </section>

      <div className="space-y-6">
        <InventoryMatchMap items={items} boxes={boxes} matchedItemIds={matchedItemIds} />

        <Card className="min-w-0 border-border py-0 shadow-xs">
          <CardHeader className="gap-4 border-b border-border/70 py-5">
            <div>
              <CardTitle>BOM 清单</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">请使用嘉立创默认BOM导出的csv文件进行导入</p>
            </div>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="选择 BOM CSV 文件" onChange={(event) => void importFile(event.target.files?.[0])} />
            {!cacheReady ? (
              <div role="status" aria-label="正在恢复已缓存的 BOM" className="grid min-h-64 place-items-center text-muted-foreground">
                <LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
                onDrop={(event) => { event.preventDefault(); void importFile(event.dataTransfer.files[0]) }}
                className={cn("grid min-h-64 cursor-pointer place-items-center rounded-2xl border border-dashed px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", dragging ? "border-foreground bg-muted" : "border-border bg-muted/30 hover:border-foreground/40 hover:bg-muted/60")}
              >
                <span>
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground text-background"><UploadIcon aria-hidden="true" className="size-5" /></span>
                  <span className="mt-4 block text-base font-semibold">拖入或选择 BOM CSV</span>
                  <span className="mt-2 block text-sm text-muted-foreground">最大 10 MB；至少包含 Quantity 与 Comment 列</span>
                </span>
              </button>
            ) : (
              <div className="grid gap-3 @3xl/card-header:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] @3xl/card-header:items-center @4xl/card-header:grid-cols-[minmax(12rem,15rem)_minmax(20rem,1fr)_minmax(15rem,20rem)]">
                <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 pl-3 text-sm @3xl/card-header:col-span-2 @4xl/card-header:col-span-1">
                  <FileSearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium" title={fileName}>{fileName}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={clearImportedFile} aria-label={`清空已加载的 ${fileName}`} className="h-11 shrink-0 cursor-pointer px-2.5 text-muted-foreground hover:text-destructive">
                    <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                  </Button>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="按 BOM 匹配结果筛选">
                  <SummaryFilterTag label="匹配" count={`${matchedRows}/${rows.length}`} tone="neutral" active={matchFilter === "matched"} onClick={() => toggleMatchFilter("matched")} />
                  <SummaryFilterTag label="充足" count={readyRows} tone="ready" active={matchFilter === "ready"} onClick={() => toggleMatchFilter("ready")} />
                  <SummaryFilterTag label="不足" count={shortRows} tone="short" active={matchFilter === "short"} onClick={() => toggleMatchFilter("short")} />
                  <SummaryFilterTag label="未匹配" count={unmatchedRows} tone="unmatched" active={matchFilter === "unmatched"} onClick={() => toggleMatchFilter("unmatched")} />
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="筛选型号、封装或位号" aria-label="筛选 BOM" className="h-11 pl-9" />
                </div>
              </div>
            )}
            {error ? <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertTriangleIcon aria-hidden="true" className="size-4" />{error}</p> : null}
          </CardHeader>

          {rows.length > 0 ? (
            <>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table aria-label="BOM 匹配结果" className="min-w-[920px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-14 pl-5">序号</TableHead>
                        <TableHead>Comment</TableHead>
                        <TableHead>Footprint</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead className="text-right">需求 / 库存</TableHead>
                        <TableHead>命中库存</TableHead>
                        <TableHead className="pr-5">匹配状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((match) => (
                        <TableRow key={match.row.id} className="hover:bg-muted/30">
                          <TableCell className="pl-5 font-mono text-xs text-muted-foreground">{match.row.number}</TableCell>
                          <TableCell>
                            <p className="max-w-48 truncate font-medium" title={match.row.comment}>{match.row.comment || "—"}</p>
                            <p className="mt-0.5 max-w-48 truncate font-mono text-[11px] text-muted-foreground" title={match.row.designator}>{match.row.designator || "无位号"}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{match.row.footprint || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{match.row.value || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums"><span className="font-semibold text-foreground">{match.row.quantity}</span><span className="text-muted-foreground"> / {match.stock}</span></TableCell>
                          <TableCell>
                            {match.items.length > 0 ? (
                              <div className="max-w-44">
                                <p className="truncate text-xs font-medium" title={match.items.map((item) => item.name).join("、")}>{match.items.map((item) => item.name).join("、")}</p>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{match.items.map((item) => item.location || "未分配").join(" · ")}</p>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="pr-5"><MatchBadge status={match.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {visibleRows.length === 0 ? <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">没有符合筛选条件的 BOM 行。</div> : null}
                </div>
              </CardContent>
              <div className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">第 {currentPage} / {pageCount} 页 · 共 {filtered.length} 行</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" aria-label="上一页" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1} className="size-11 cursor-pointer"><ChevronLeftIcon /></Button>
                  <Button type="button" variant="outline" size="icon" aria-label="下一页" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage >= pageCount} className="size-11 cursor-pointer"><ChevronRightIcon /></Button>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
