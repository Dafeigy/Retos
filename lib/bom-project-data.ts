import { d1Query, ensureSyncSchema, isD1Configured } from "@/lib/d1"
import { bomStatuses, type BomProject, type BomProjectStatus } from "@/lib/bom-project"
import type { BomRow } from "@/lib/bom"

const columns = "id,name,description,file_name,rows_json,completed_json,status,start_date,created_at,updated_at,deleted_at"
const nextVersion = "strftime('%Y-%m-%dT%H:%M:%fZ', max(julianday('now'), julianday(updated_at, '+0.001 seconds')))"

export async function getBomProjects() {
  if (!isD1Configured()) return [] as BomProject[]
  await ensureSyncSchema()
  return d1Query<BomProject>(`SELECT ${columns} FROM bom_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC`)
}

export async function getBomProject(id: string) {
  if (!isD1Configured()) return null
  await ensureSyncSchema()
  return (await d1Query<BomProject>(`SELECT ${columns} FROM bom_projects WHERE id=? AND deleted_at IS NULL`, [id]))[0] ?? null
}

export async function createBomProject(name: string, description: string, fileName: string, rows: BomRow[], startDate: string) {
  if (!isD1Configured()) throw new Error("D1_NOT_CONFIGURED")
  await ensureSyncSchema()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await d1Query("INSERT INTO bom_projects (id,name,description,file_name,rows_json,completed_json,status,start_date,created_at,updated_at) VALUES (?,?,?,?,?,'[]','采购中',?,?,?)", [id, name, description, fileName, JSON.stringify(rows), startDate, now, now])
  return id
}

export async function updateBomProjectMetadata(id: string, name: string, description: string, startDate: string) {
  if (!isD1Configured()) throw new Error("D1_NOT_CONFIGURED")
  await ensureSyncSchema()
  if (!await getBomProject(id)) throw new Error("PROJECT_NOT_FOUND")
  await d1Query(`UPDATE bom_projects SET name=?,description=?,start_date=?,updated_at=${nextVersion} WHERE id=? AND deleted_at IS NULL`, [name, description, startDate, id])
}

export async function updateBomProject(id: string, status?: BomProjectStatus, completed?: string[]) {
  if (!isD1Configured()) throw new Error("D1_NOT_CONFIGURED")
  await ensureSyncSchema()
  const project = await getBomProject(id)
  if (!project) throw new Error("PROJECT_NOT_FOUND")
  if (status !== undefined && !bomStatuses.includes(status)) throw new Error("INVALID_STATUS")
  if (completed !== undefined) {
    const rows = JSON.parse(project.rows_json) as BomRow[]
    const valid = new Set(rows.map((row) => row.id))
    if (completed.some((rowId) => !valid.has(rowId))) throw new Error("INVALID_COMPLETED")
  }
  const fields: string[] = []
  const params: Array<string> = []
  if (status !== undefined) { fields.push("status=?"); params.push(status) }
  if (completed !== undefined) { fields.push("completed_json=?"); params.push(JSON.stringify([...new Set(completed)])) }
  if (!fields.length) return
  await d1Query(`UPDATE bom_projects SET ${fields.join(",")},updated_at=${nextVersion} WHERE id=? AND deleted_at IS NULL`, [...params, id])
}
