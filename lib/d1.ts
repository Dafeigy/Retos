type D1Param = string | number | null

type D1Result<T> = {
  results?: T[]
  success?: boolean
  meta?: {
    changes?: number
    last_row_id?: number
  }
}

type D1Response<T> = {
  success: boolean
  result?: D1Result<T>[]
  errors?: Array<{ code: number; message: string }>
}

export type D1Statement = {
  sql: string
  params?: D1Param[]
}

function getD1Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN

  if (!accountId || !databaseId || !apiToken) return null

  return { accountId, databaseId, apiToken }
}

export function isD1Configured() {
  return Boolean(getD1Config())
}

async function requestD1<T>(body: D1Statement | { batch: D1Statement[] }) {
  const config = getD1Config()
  if (!config) {
    throw new Error("D1_NOT_CONFIGURED")
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  )

  const payload = (await response.json()) as D1Response<T>

  if (!response.ok || !payload.success || payload.result?.some((item) => !item.success)) {
    const message = payload.errors?.map((error) => error.message).join("; ")
    throw new Error(message || `D1 query failed with status ${response.status}`)
  }

  return payload.result ?? []
}

export async function d1Query<T>(sql: string, params: D1Param[] = []) {
  const result = await requestD1<T>({ sql, params })
  return result[0]?.results ?? []
}

export async function d1Batch(statements: D1Statement[]) {
  return requestD1<unknown>({ batch: statements })
}

let syncSchema: Promise<void> | undefined

// Upgrade existing D1 databases without losing rows. A concurrent desktop migration is harmless.
export function ensureSyncSchema() {
  syncSchema ??= (async () => {
    const columns = await d1Query<{ name: string }>("PRAGMA table_info(components)")
    if (!columns.length) throw new Error("D1_SCHEMA_NOT_INITIALIZED")
    if (!columns.some((column) => column.name === "deleted_at")) {
      try {
        await d1Query("ALTER TABLE components ADD COLUMN deleted_at TEXT")
      } catch (error) {
        const refreshed = await d1Query<{ name: string }>("PRAGMA table_info(components)")
        if (!refreshed.some((column) => column.name === "deleted_at")) throw error
      }
    }
    const boxTable = await d1Query<{ name: string }>("PRAGMA table_info(storage_boxes)")
    if (!boxTable.length) {
      await d1Batch([
        { sql: "CREATE TABLE IF NOT EXISTS storage_boxes (id TEXT PRIMARY KEY, label TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)", params: [] },
        { sql: "INSERT OR IGNORE INTO storage_boxes (id,label,subtitle,created_at,updated_at) VALUES ('A','盒 01','电阻 / 电容',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),('B','盒 02','二极管 / 连接器',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),('C','盒 03','芯片 / 模块',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))", params: [] },
      ])
    }
    await d1Query("CREATE TABLE IF NOT EXISTS bom_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', file_name TEXT NOT NULL, rows_json TEXT NOT NULL, completed_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT '采购中' CHECK (status IN ('采购中','焊接中','测试中','完成')), start_date TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)")
    const projectColumns = await d1Query<{ name: string }>("PRAGMA table_info(bom_projects)")
    if (!projectColumns.some((column) => column.name === "start_date")) {
      try { await d1Query("ALTER TABLE bom_projects ADD COLUMN start_date TEXT NOT NULL DEFAULT ''") }
      catch (error) {
        const refreshed = await d1Query<{ name: string }>("PRAGMA table_info(bom_projects)")
        if (!refreshed.some((column) => column.name === "start_date")) throw error
      }
    }
    await d1Query("UPDATE bom_projects SET start_date = substr(created_at, 1, 10) WHERE start_date = ''")
  })().catch((error) => { syncSchema = undefined; throw error })
  return syncSchema
}
