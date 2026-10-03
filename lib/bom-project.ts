import type { BomRow } from "@/lib/bom"

export const bomStatuses = ["采购中", "焊接中", "测试中", "完成"] as const
export type BomProjectStatus = typeof bomStatuses[number]

export function isProjectDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export type BomProject = {
  id: string
  name: string
  description: string
  file_name: string
  rows_json: string
  completed_json: string
  status: BomProjectStatus
  start_date: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function projectRows(project: BomProject): BomRow[] {
  try { return JSON.parse(project.rows_json) as BomRow[] } catch { return [] }
}

export function completedRows(project: BomProject): string[] {
  try { return JSON.parse(project.completed_json) as string[] } catch { return [] }
}

export function projectProgress(project: BomProject) {
  const rows = projectRows(project)
  if (!rows.length) return 0
  const completed = new Set(completedRows(project))
  return Math.round(rows.filter((row) => completed.has(row.id)).length / rows.length * 100)
}
