import { BomView } from "@/components/views/bom-view"
import { getComponents, getStorageBoxes } from "@/lib/inventory"

export const metadata = { title: "iBOM 匹配" }

export default async function Page() {
  const [items, boxes] = await Promise.all([getComponents(), getStorageBoxes()])
  return <BomView items={items} boxes={boxes} />
}
