"use client"

import { useMemo, useState } from "react"
import { useInventoryActions, actionError } from "@/components/inventory-actions"
import { LoaderCircleIcon, PlusIcon, TagIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { UpdateStockQuantityDrawer } from "@/components/update-stock-quantity-drawer"
import type { ComponentItem } from "@/lib/inventory-types"

const defaultCategories = ["电容", "电阻", "电感", "芯片", "其他"]
const fields = [
  ["name", "元件名称", "例如：贴片电阻", true],
  ["package", "封装", "例如：0603", true],
  ["value", "参数 / 阻容值", "例如：10 kΩ ±1%", false],
  ["location", "货位", "格式：A-01-03", false],
] as const

export function AddComponentDialog({ categories, items = [], open: controlledOpen, onOpenChange, initialLocation, locationReadOnly = false, showTrigger = true }: { categories: string[]; items?: ComponentItem[]; open?: boolean; onOpenChange?: (open: boolean) => void; initialLocation?: string; locationReadOnly?: boolean; showTrigger?: boolean }) {
  const actions = useInventoryActions()
  const [internalOpen, setInternalOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [category, setCategory] = useState("")
  const [categoryInput, setCategoryInput] = useState("")
  const [name, setName] = useState("")
  const [duplicate, setDuplicate] = useState<{ item: ComponentItem; incomingQuantity: number } | null>(null)
  const [pendingStock, setPendingStock] = useState<{ item: ComponentItem; quantity: number } | null>(null)
  const [nameWasAutoFilled, setNameWasAutoFilled] = useState(false)
  const open = controlledOpen ?? internalOpen
  const options = useMemo(() => Array.from(new Set([...defaultCategories, ...categories])).filter(Boolean), [categories])

  const autoNameCategories = new Set(["电阻", "电容", "电感"])

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory)
    setCategoryInput("")
    setMessage("")

    if (autoNameCategories.has(nextCategory)) {
      setName(nextCategory)
      setNameWasAutoFilled(true)
    } else if (nameWasAutoFilled) {
      setName("")
      setNameWasAutoFilled(false)
    }
  }

  function changeName(nextName: string) {
    setName(nextName)
    if (autoNameCategories.has(category) && nextName !== category) {
      setCategory("其他")
      setMessage("已修改元件名称，分类已自动调整为“其他”。")
    }
    setNameWasAutoFilled(false)
  }

  function addTypedCategory() {
    const nextCategory = categoryInput.trim()
    if (nextCategory) selectCategory(nextCategory)
  }

  function closeDialog(nextOpen: boolean) {
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      setMessage("")
      setCategory("")
      setCategoryInput("")
      setName("")
      setNameWasAutoFilled(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!category) {
      setMessage("请选择分类，或输入新分类后按回车确认。")
      return
    }
    setMessage("")
    const data = Object.fromEntries(new FormData(event.currentTarget))
    data.category = category
    const quantity = Number(data.quantity)
    const matchingItem = items.find((item) => item.category.trim() === category.trim()
      && item.name.trim() === name.trim()
      && item.package.trim() === String(data.package ?? "").trim()
      && item.value.trim() === String(data.value ?? "").trim())
    if (matchingItem) {
      setDuplicate({ item: matchingItem, incomingQuantity: quantity })
      return
    }

    const requestedLocation = String(data.location ?? "").trim()
    if (requestedLocation && items.some((item) => item.location.trim() && sameLocation(item.location, requestedLocation))) {
      toast.error("该货位已有元件，不能放入。")
      return
    }

    setPending(true)
    try {
      await actions.createComponent(data)
      closeDialog(false)
    } catch (error) {
      setMessage(actionError(error))
    } finally {
      setPending(false)
    }
  }

  function confirmDuplicate() {
    if (!duplicate) return
    if (!Number.isSafeInteger(duplicate.incomingQuantity) || duplicate.incomingQuantity < 0 || duplicate.item.quantity + duplicate.incomingQuantity > Number.MAX_SAFE_INTEGER) {
      setMessage("库存数量超出有效范围，请检查后重试。")
      setDuplicate(null)
      return
    }
    setPendingStock({ item: duplicate.item, quantity: duplicate.item.quantity + duplicate.incomingQuantity })
    setDuplicate(null)
    closeDialog(false)
  }

  return (
    <Drawer open={open} onOpenChange={closeDialog} swipeDirection="right">
      {showTrigger ? <DrawerTrigger render={<Button className="cursor-pointer" />}><PlusIcon />新增元件</DrawerTrigger> : null}
      <DrawerContent mobileFullWidth>
        <DrawerHeader>
          <DrawerTitle>新增元件</DrawerTitle>
          <DrawerDescription>名称可重复；以分类、封装与参数区分不同器件。</DrawerDescription>
        </DrawerHeader>
        <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5 px-5 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="category-input">分类 <span className="text-destructive">*</span></Label>
              <div className="rounded-2xl border bg-input/20 p-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                <div className="flex flex-wrap gap-2">
                  {options.map((option) => (
                    <Button key={option} type="button" variant={category === option ? "default" : "outline"} size="xs" aria-pressed={category === option} onClick={() => selectCategory(option)} className="cursor-pointer">
                      {option}
                    </Button>
                  ))}
                  {category && !options.includes(category) ? <Badge variant="secondary"><TagIcon />{category}</Badge> : null}
                </div>
                <Input
                  id="category-input"
                  value={categoryInput}
                  onChange={(event) => setCategoryInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTypedCategory() } }}
                  placeholder="没有合适的分类？输入后按回车新增"
                  className="mt-3 border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
                  aria-describedby="category-help"
                />
              </div>
              <p id="category-help" className="text-xs text-muted-foreground">单选。选择电阻、电容或电感会自动带入名称；修改名称后分类会改为“其他”。</p>
            </div>
            {fields.map(([fieldName, label, placeholder, required]) => (
              <div key={fieldName} className="space-y-2">
                <Label htmlFor={fieldName}>{label} {required ? <span className="text-destructive">*</span> : null}</Label>
                <Input id={fieldName} name={fieldName} value={fieldName === "name" ? name : fieldName === "location" && initialLocation ? initialLocation : undefined} readOnly={fieldName === "location" && locationReadOnly} placeholder={placeholder} required={required} onChange={fieldName === "name" ? (event) => changeName(event.target.value) : undefined} />
              </div>
            ))}
            <div className="space-y-2"><Label htmlFor="quantity">初始库存</Label><Input id="quantity" name="quantity" type="number" min="0" step="1" defaultValue="0" required /></div>
            <div className="space-y-2"><Label htmlFor="minQuantity">安全库存</Label><Input id="minQuantity" name="minQuantity" type="number" min="0" step="1" placeholder="可留空" /></div>
            <div className="space-y-2"><Label htmlFor="unitPrice">单价（元）</Label><Input id="unitPrice" name="unitPrice" type="number" min="0" step="0.001" placeholder="可留空" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="notes">备注说明</Label><Input id="notes" name="notes" placeholder="例如：采购渠道、替代料或使用提示" /></div>
          </div>
          {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
          <DrawerFooter className="-mx-5 sticky bottom-0 mt-6">
            <DrawerClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>取消</DrawerClose>
            <Button type="submit" disabled={pending} className="cursor-pointer">{pending ? <LoaderCircleIcon className="animate-spin" /> : null}保存元件</Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
      <Dialog open={duplicate !== null} onOpenChange={(nextOpen) => !nextOpen && setDuplicate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>元件已在库存中</DialogTitle>
            <DialogDescription>
              {duplicate ? `“${duplicate.item.name} · ${duplicate.item.package} · ${duplicate.item.value || "无参数"}”已存在。要将本次入库数量加入该元件库存吗？` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDuplicate(null)}>取消</Button>
            <Button type="button" onClick={confirmDuplicate}>转为更新库存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {pendingStock ? (
        <UpdateStockQuantityDrawer
          items={[pendingStock.item]}
          location={pendingStock.item.location || "未分配货位"}
          open
          initialQuantity={pendingStock.quantity}
          initialNote="重复元件入库"
          onOpenChange={(nextOpen) => !nextOpen && setPendingStock(null)}
        />
      ) : null}
    </Drawer>
  )
}

function sameLocation(left: string, right: string) {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/[\s,]+/g, "-").replace(/-+/g, "-").replace(/(^|-)0+(\d)/g, "$1$2")
  return normalize(left) === normalize(right)
}
