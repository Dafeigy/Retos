import { invoke } from "@tauri-apps/api/core"
import type { InventoryForm } from "@/components/inventory-actions"
import type { ComponentItem, StockMovement, StorageBox } from "@/lib/inventory-types"
import type { BomProject } from "@/lib/bom-project"
import type { BomRow } from "@/lib/bom"

export type Snapshot = { components: ComponentItem[]; movements: StockMovement[]; boxes: StorageBox[]; projects: BomProject[]; pending: number }
export type CloudConfig = { account_id: string; database_id: string; has_token: boolean; last_push: string | null; last_pull: string | null }
export type SyncReport = { components: number; movements: number; boxes: number; projects: number; preserved: number }

export async function createBomProject(name: string, description: string, fileName: string, rows: BomRow[], startDate: string) {
  await invoke("create_bom_project", { input: { name, description, file_name: fileName, rows_json: JSON.stringify(rows), start_date: startDate } })
}

export async function updateBomProjectMetadata(id: string, name: string, description: string, startDate: string) {
  await invoke("update_bom_project_metadata", { id, name, description, startDate })
}

export async function updateBomProject(id: string, status?: string, completed?: string[]) {
  await invoke("update_bom_project", { id, status: status ?? null, completed: completed ?? null })
}

function optionalNumber(value: unknown) { return value === "" || value === undefined || value === null ? null : Number(value) }

export async function saveComponent(data: InventoryForm, id: string | null = null) {
  const input = {
    name: String(data.name ?? ""), category: String(data.category ?? ""), package: String(data.package ?? ""),
    value: String(data.value ?? ""), quantity: Number(data.quantity), min_quantity: optionalNumber(data.minQuantity),
    location: String(data.location ?? ""), notes: String(data.notes ?? ""), unit_price: optionalNumber(data.unitPrice),
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0 || (input.min_quantity !== null && (!Number.isSafeInteger(input.min_quantity) || input.min_quantity < 0)) || (input.unit_price !== null && (!Number.isFinite(input.unit_price) || input.unit_price < 0))) throw new Error("请填写有效的库存数量和单价。")
  await invoke("save_component", { id, input })
}

export async function createMovement(data: InventoryForm) {
  const quantity = Number(data.quantity)
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("请填写有效的出入库数量。")
  await invoke("create_movement", { input: { componentId: String(data.componentId ?? ""), type: String(data.type ?? ""), quantity, note: String(data.note ?? "") } })
}

export async function setStockQuantity(id: string, quantity: number, note: string) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("请填写有效的库存数量。")
  await invoke("set_stock_quantity", { id, quantity, note })
}

export async function saveStorageBox(id: string | null, label: string, subtitle = "") {
  await invoke("save_storage_box", { id, input: { label, subtitle } })
}

export async function deleteStorageBox(id: string) {
  await invoke("delete_storage_box", { id })
}

// Parse only the three recognized values. Never execute shell expressions or import application secrets.
export function parseCloudEnv(source: string) {
  const values: Record<string, string> = {}
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_D1_DATABASE_ID|CLOUDFLARE_D1_API_TOKEN)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    let value = match[2]
    if (value.startsWith('"') || value.startsWith("'")) {
      const end = value.indexOf(value[0], 1)
      if (end < 0) throw new Error("配置中存在未闭合的引号。")
      value = value.slice(1, end)
    } else value = value.replace(/\s+#.*$/, "").trim()
    values[match[1]] = value
  }
  if (!Object.keys(values).length) throw new Error("未找到 Cloudflare 配置。")
  return values
}
