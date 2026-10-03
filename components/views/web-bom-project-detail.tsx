"use client"

import { useRouter } from "next/navigation"
import { BomProjectDetail } from "@/components/views/bom-project-detail"
import { updateWebBomProject } from "@/components/views/web-bom-board"
import type { BomProject } from "@/lib/bom-project"
import type { ComponentItem, StorageBox } from "@/lib/inventory-types"

export function WebBomProjectDetail({ project, items, boxes }: { project: BomProject; items: ComponentItem[]; boxes: StorageBox[] }) {
  const router = useRouter()
  return <BomProjectDetail key={`${project.id}:${project.updated_at}`} project={project} items={items} boxes={boxes} saveCompleted={async (completed) => { await updateWebBomProject(project.id, completed); router.refresh() }} />
}
