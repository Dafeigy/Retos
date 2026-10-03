import { WebBomBoard } from "@/components/views/web-bom-board"
import { getBomProjects } from "@/lib/bom-project-data"

export const metadata = { title: "iBOM 项目" }

export default async function Page() {
  return <WebBomBoard projects={await getBomProjects()} />
}
