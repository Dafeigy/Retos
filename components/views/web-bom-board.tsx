"use client"

import { useRouter } from "next/navigation"
import { BomBoardView } from "@/components/views/bom-board-view"
import type { BomRow } from "@/lib/bom"
import type { BomProject, BomProjectStatus } from "@/lib/bom-project"

async function request(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.message ?? "保存失败。") }
}

export function WebBomBoard({ projects }: { projects: BomProject[] }) {
  const router = useRouter()
  return <BomBoardView projects={projects} createProject={async (name: string, description: string, fileName: string, rows: BomRow[], startDate: string) => {
    await request("/api/bom-projects", "POST", { name, description, fileName, rows, startDate }); router.refresh()
  }} changeStatus={async (id: string, status: BomProjectStatus) => {
    await request(`/api/bom-projects/${encodeURIComponent(id)}`, "PATCH", { status }); router.refresh()
  }} editProject={async (id: string, name: string, description: string, startDate: string) => {
    await request(`/api/bom-projects/${encodeURIComponent(id)}`, "PATCH", { name, description, startDate }); router.refresh()
  }} />
}

export async function updateWebBomProject(id: string, completed: string[]) {
  await request(`/api/bom-projects/${encodeURIComponent(id)}`, "PATCH", { completed })
}
