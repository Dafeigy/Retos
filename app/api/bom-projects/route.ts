import { requireSession } from "@/lib/auth/require-session"
import { createBomProject, getBomProjects } from "@/lib/bom-project-data"
import type { BomRow } from "@/lib/bom"
import { isProjectDate } from "@/lib/bom-project"

export async function GET() {
  await requireSession()
  return Response.json(await getBomProjects())
}

export async function POST(request: Request) {
  await requireSession()
  const body = await request.json().catch(() => null) as { name?: unknown; description?: unknown; fileName?: unknown; rows?: unknown; startDate?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : ""
  const rows = body?.rows
  const startDate = typeof body?.startDate === "string" ? body.startDate : ""
  if (!name || name.length > 120 || description.length > 1000 || !isProjectDate(startDate) || !fileName.toLowerCase().endsWith(".csv") || fileName.length > 255 || !Array.isArray(rows) || !rows.length || rows.length > 10000 || rows.some((row: BomRow) => typeof row?.id !== "string" || typeof row?.comment !== "string" || !Number.isSafeInteger(row?.quantity))) return Response.json({ message: "请填写有效的项目名称、日期和 BOM CSV。" }, { status: 400 })
  try { return Response.json({ id: await createBomProject(name, description, fileName, rows, startDate) }, { status: 201 }) }
  catch (error) {
    return Response.json({ message: error instanceof Error && error.message === "D1_NOT_CONFIGURED" ? "请先配置 D1 数据库。" : "创建项目失败。" }, { status: 503 })
  }
}
