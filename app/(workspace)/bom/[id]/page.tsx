import { notFound } from "next/navigation"
import { WebBomProjectDetail } from "@/components/views/web-bom-project-detail"
import { getBomProject } from "@/lib/bom-project-data"
import { getComponents, getStorageBoxes } from "@/lib/inventory"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, items, boxes] = await Promise.all([getBomProject(id), getComponents(), getStorageBoxes()])
  if (!project) notFound()
  return <WebBomProjectDetail project={project} items={items} boxes={boxes} />
}
