import { requireSession } from "@/lib/auth/require-session"
import { getBomProject, updateBomProject, updateBomProjectMetadata } from "@/lib/bom-project-data"
import { bomStatuses, isProjectDate, type BomProjectStatus } from "@/lib/bom-project"

export async function GET(_: Request, { params }: RouteContext<"/api/bom-projects/[id]">) {
  await requireSession()
  const project = await getBomProject((await params).id)
  return project ? Response.json(project) : Response.json({ message: "项目不存在。" }, { status: 404 })
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/bom-projects/[id]">) {
  await requireSession()
  const body = await request.json().catch(() => null) as { status?: unknown; completed?: unknown; name?: unknown; description?: unknown; startDate?: unknown } | null
  const metadata = body?.name !== undefined || body?.description !== undefined || body?.startDate !== undefined
  if (!body || (!metadata && body.status === undefined && body.completed === undefined) || (body.status !== undefined && !bomStatuses.includes(body.status as BomProjectStatus)) || (body.completed !== undefined && (!Array.isArray(body.completed) || body.completed.some((id: unknown) => typeof id !== "string"))) || (metadata && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120 || typeof body.description !== "string" || body.description.length > 1000 || !isProjectDate(body.startDate)))) return Response.json({ message: "无效的项目更新。" }, { status: 400 })
  try {
    const id = (await params).id
    if (metadata) await updateBomProjectMetadata(id, (body.name as string).trim(), (body.description as string).trim(), body.startDate as string)
    else await updateBomProject(id, body.status as BomProjectStatus | undefined, body.completed as string[] | undefined)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ message: error instanceof Error && error.message === "PROJECT_NOT_FOUND" ? "项目不存在。" : "更新项目失败。" }, { status: error instanceof Error && error.message === "PROJECT_NOT_FOUND" ? 404 : 500 })
  }
}
