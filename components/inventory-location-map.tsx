"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { ArchiveIcon, BoxIcon, ChevronLeftIcon, ChevronRightIcon, MapPinIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AddComponentDialog } from "@/components/add-component-dialog"
import { UpdateStockQuantityDrawer } from "@/components/update-stock-quantity-drawer"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useInventoryActions } from "@/components/inventory-actions"
import { cn } from "@/lib/utils"
import type { ComponentItem, StorageBox } from "@/lib/inventory-types"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"

type BoxDefinition = StorageBox
type ParsedLocation = { boxId: string; x: number; y: number }
type Cell = { x: number; y: number }

const DEFAULT_BOXES: BoxDefinition[] = [
  { id: "A", label: "盒 01", subtitle: "电阻 / 电容", created_at: "", updated_at: "" },
  { id: "B", label: "盒 02", subtitle: "二极管 / 连接器", created_at: "", updated_at: "" },
  { id: "C", label: "盒 03", subtitle: "芯片 / 模块", created_at: "", updated_at: "" },
]

function parseLocation(location: string): ParsedLocation | null {
  const match = location.trim().match(/^([^,\s-]+)[,\s-]+(\d+)[,\s-]+(\d+)$/)
  if (!match) return null
  const x = Number(match[2])
  const y = Number(match[3])
  if (x < 1 || x > 8 || y < 1 || y > 7) return null
  return { boxId: match[1].toUpperCase(), x, y }
}

function getThemeColors() {
  const dark = document.documentElement.classList.contains("dark")
  return dark
    ? {
        top: 0x59636d,
        side: 0x3d454e,
        border: 0x626c76,
        slot: 0x343c45,
        occupied: 0xa3e635,
        occupiedOpacity: 0.46,
        accent: 0x66717c,
        edge: 0xa3adb7,
        surfaceOpacity: 1,
        sideOpacity: 1,
        rimOpacity: 1,
        slotOpacity: 1,
        edgeOpacity: 0.9,
      }
    : {
        top: 0xe9edf0,
        side: 0xd0d8de,
        border: 0xb0bac2,
        slot: 0xf1f4f6,
        occupied: 0xf59e0b,
        occupiedOpacity: 0.46,
        accent: 0xc4ccd3,
        edge: 0x84909a,
        surfaceOpacity: 1,
        sideOpacity: 1,
        rimOpacity: 1,
        slotOpacity: 1,
        edgeOpacity: 0.82,
      }
}

function setSlotAppearance(mesh: THREE.Mesh, selected: boolean, colors: ReturnType<typeof getThemeColors>, highlighted = false) {
  const materials = mesh.material as THREE.MeshBasicMaterial[]
  const occupied = Boolean(mesh.userData.occupied)
  materials.forEach((material, index) => {
    material.color.setHex(occupied
      ? colors.occupied
      : selected ? colors.accent : index === 2 ? colors.slot : colors.side)
    material.transparent = occupied
    material.opacity = occupied ? highlighted ? 0.94 : colors.occupiedOpacity : 1
    material.depthWrite = !occupied
  })
}

function setMaterialOpacity(object: THREE.Mesh | THREE.LineSegments, opacity: number) {
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  materials.forEach((material) => {
    material.transparent = opacity < 1
    material.opacity = opacity
    material.depthWrite = opacity >= 1
    material.needsUpdate = true
  })
}

function StorageBoxThumbnail({ active, boxId }: { active: boolean; boxId: string }) {
  return (
    <span aria-hidden="true" className={cn("flex h-7 items-center justify-center gap-1.5", active ? "text-foreground" : "text-muted-foreground")}>
      <ArchiveIcon aria-hidden="true" className="size-5" strokeWidth={1.5} />
      <span className={cn(
        "inline-flex h-4 shrink-0 items-center rounded-sm border px-1 font-mono text-[8px] font-bold leading-none shadow-xs",
        active ? "border-foreground/30 bg-foreground text-background" : "border-border bg-muted/70 text-foreground",
      )}>
        ID {boxId}
      </span>
    </span>
  )
}

function paintLabelTexture(canvas: HTMLCanvasElement, boxId: string, label: string, subtitle: string, dark: boolean) {
  const context = canvas.getContext("2d")
  if (!context) return
  const fontFamily = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  const fitFont = (text: string, maxWidth: number, initialSize: number, weight: number) => {
    let size = initialSize
    context.font = `${weight} ${size}px ${fontFamily}`
    while (context.measureText(text).width > maxWidth && size > 30) {
      size -= 2
      context.font = `${weight} ${size}px ${fontFamily}`
    }
    return size
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "left"
  context.textBaseline = "middle"
  context.lineCap = "round"
  context.strokeStyle = dark ? "#a3e635" : "#ea580c"
  context.lineWidth = 12
  context.beginPath()
  context.moveTo(56, 58)
  context.lineTo(56, 260)
  context.stroke()

  context.font = `700 34px ${fontFamily}`
  context.fillStyle = dark ? "#a3e635" : "#ea580c"
  context.fillText(`BOX ID  ${boxId}`, 92, 60)

  const labelSize = fitFont(label, 860, 118, 700)
  context.font = `700 ${labelSize}px ${fontFamily}`
  context.fillStyle = dark ? "#ecfccb" : "#9a3412"
  context.fillText(label, 92, 142)

  const subtitleSize = fitFont(subtitle, 860, 52, 500)
  context.font = `500 ${subtitleSize}px ${fontFamily}`
  context.fillStyle = dark ? "#cbd5e1" : "#475569"
  context.fillText(subtitle, 92, 218)

  context.strokeStyle = dark ? "rgba(226,232,240,.28)" : "rgba(71,85,105,.28)"
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(92, 264)
  context.lineTo(950, 264)
  context.stroke()
}

function ThreeStorageScene({ boxId, label, subtitle, locations, selectedCell, onSelect, onHover, interactive = true, highlightedCells, horizontalFraming = 1 }: { boxId: string; label: string; subtitle: string; locations: Map<string, ComponentItem[]>; selectedCell: Cell | null; onSelect: (cell: Cell | null) => void; onHover: (cell: Cell | null) => void; interactive?: boolean; highlightedCells?: Set<string>; horizontalFraming?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(selectedCell)
  const onSelectRef = useRef(onSelect)
  const onHoverRef = useRef(onHover)
  const highlightedRef = useRef(highlightedCells)

  useEffect(() => {
    selectedRef.current = selectedCell
    onSelectRef.current = onSelect
    onHoverRef.current = onHover
    highlightedRef.current = highlightedCells
  }, [highlightedCells, onHover, onSelect, selectedCell])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return
    let colors = getThemeColors()
    const scene = new THREE.Scene()
    // An orthographic camera keeps parallel edges parallel, which is the key
    // visual characteristic of an isometric storage layout.
    const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100)
    camera.position.set(10, 10, 10)
    camera.zoom = 1.05
    camera.lookAt(0, 0, 0)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    renderer.domElement.className = "size-full"

    const group = new THREE.Group()
    group.rotation.x = 0
    group.rotation.y = -0.08
    scene.add(group)

    const labelCanvas = document.createElement("canvas")
    labelCanvas.width = 1024
    labelCanvas.height = 320
    paintLabelTexture(labelCanvas, boxId, label, subtitle, document.documentElement.classList.contains("dark"))
    const labelTexture = new THREE.CanvasTexture(labelCanvas)
    labelTexture.colorSpace = THREE.SRGBColorSpace
    labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const projectedLabel = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.08), labelMaterial)
    projectedLabel.userData.themeRole = "projectedLabel"
    projectedLabel.position.set(-2, -0.55, 5.7)
    projectedLabel.rotation.x = -Math.PI / 2
    projectedLabel.renderOrder = 4
    group.add(projectedLabel)

    const baseGeometry = new THREE.BoxGeometry(9.3, 0.5, 8.3)
    const base = new THREE.Mesh(baseGeometry, [
      new THREE.MeshBasicMaterial({ color: colors.side }),
      new THREE.MeshBasicMaterial({ color: colors.side }),
      new THREE.MeshBasicMaterial({ color: colors.top }),
      new THREE.MeshBasicMaterial({ color: colors.side }),
      new THREE.MeshBasicMaterial({ color: colors.side }),
      new THREE.MeshBasicMaterial({ color: colors.side }),
    ])
    base.userData.themeRole = "base"
    base.position.y = -0.28
    group.add(base)

    const topGeometry = new THREE.BoxGeometry(9.0, 0.14, 8.0)
    const top = new THREE.Mesh(topGeometry, new THREE.MeshBasicMaterial({ color: colors.top }))
    top.userData.themeRole = "top"
    top.position.y = 0.03
    group.add(top)

    const rims = [[0, 0.23, -4.02, 9.2, 0.4, 0.18], [0, 0.23, 4.02, 9.2, 0.4, 0.18], [-4.52, 0.23, 0, 0.18, 0.4, 8.1], [4.52, 0.23, 0, 0.18, 0.4, 8.1]] as const
    for (const [x, y, z, sx, sy, sz] of rims) {
      const rimGeometry = new THREE.BoxGeometry(sx, sy, sz)
      const rim = new THREE.Mesh(rimGeometry, new THREE.MeshBasicMaterial({ color: colors.border }))
      rim.userData.themeRole = "rim"
      rim.position.set(x, y, z)
      group.add(rim)

      const rimEdges = new THREE.LineSegments(new THREE.EdgesGeometry(rimGeometry), new THREE.LineBasicMaterial({ color: colors.edge, transparent: true, opacity: colors.edgeOpacity }))
      rimEdges.userData.themeRole = "structureEdge"
      rimEdges.position.copy(rim.position)
      group.add(rimEdges)
    }

    const baseEdges = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeometry), new THREE.LineBasicMaterial({ color: colors.edge, transparent: true, opacity: colors.edgeOpacity }))
    baseEdges.userData.themeRole = "structureEdge"
    baseEdges.position.copy(base.position)
    group.add(baseEdges)

    const topEdges = new THREE.LineSegments(new THREE.EdgesGeometry(topGeometry), new THREE.LineBasicMaterial({ color: colors.edge, transparent: true, opacity: colors.edgeOpacity * 0.72 }))
    topEdges.userData.themeRole = "topEdge"
    topEdges.position.copy(top.position)
    group.add(topEdges)

    const slotMeshes = new Map<string, THREE.Mesh>()
    const slotGroups = new Map<string, THREE.Group>()
    for (let index = 0; index < 56; index += 1) {
      const x = (index % 8) + 1
      const y = Math.floor(index / 8) + 1
      const key = `${x}-${y}`
      const cellItems = locations.get(key) ?? []
      const occupied = cellItems.length > 0
      const highlighted = Boolean(highlightedRef.current?.has(key))
      const slotGeometry = new THREE.BoxGeometry(0.94, 0.18, 0.86)
      const slot = new THREE.Mesh(slotGeometry, Array.from({ length: 6 }, (_, faceIndex) => new THREE.MeshBasicMaterial({
        color: occupied ? colors.occupied : faceIndex === 2 ? colors.slot : colors.side,
        transparent: occupied,
        opacity: occupied ? highlighted ? 0.94 : colors.occupiedOpacity : 1,
        depthWrite: !occupied,
      })))
      slot.userData.themeRole = "slot"
      slot.userData.occupied = occupied
      slot.userData.cell = { x, y }
      const slotEdges = new THREE.LineSegments(new THREE.EdgesGeometry(slotGeometry), new THREE.LineBasicMaterial({
        color: colors.edge,
        transparent: true,
        opacity: colors.edgeOpacity * 0.82,
      }))
      slotEdges.userData.themeRole = "slotEdge"
      slotEdges.userData.occupied = occupied
      slotEdges.renderOrder = 1
      const slotGroup = new THREE.Group()
      slotGroup.position.set((x - 4.5) * 1.08, 0.24, (y - 4) * 1.03)
      slotGroup.add(slotEdges, slot)
      group.add(slotGroup)
      slotMeshes.set(key, slot)
      slotGroups.set(key, slotGroup)
    }

    let frame = 0
    let hoveredKey: string | null = null

    function resize() {
      const width = mountRef.current?.clientWidth ?? 0
      const height = mountRef.current?.clientHeight ?? 0
      const aspect = width / Math.max(height, 1)
      const frustumHeight = 11
      camera.left = -(frustumHeight * aspect * horizontalFraming) / 2
      camera.right = (frustumHeight * aspect * horizontalFraming) / 2
      camera.top = frustumHeight / 2
      camera.bottom = -frustumHeight / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      const compact = width < 640
      camera.zoom = compact ? 0.68 : 1.05
      camera.updateProjectionMatrix()
      projectedLabel.position.set(compact ? 0.15 : -2, -0.55, compact ? 5 : 5.7)
      projectedLabel.scale.setScalar(compact ? 0.9 : 1)
    }
    function setHover(key: string | null) {
      if (hoveredKey === key) return
      if (hoveredKey) {
        const old = slotMeshes.get(hoveredKey)
        if (old) setSlotAppearance(old, hoveredKey === `${selectedRef.current?.x}-${selectedRef.current?.y}`, colors)
      }
      renderer.domElement.style.cursor = key ? "pointer" : "default"
      hoveredKey = key
      if (hoveredKey) {
        const next = slotMeshes.get(hoveredKey)
        if (next) setSlotAppearance(next, hoveredKey === `${selectedRef.current?.x}-${selectedRef.current?.y}`, colors)
      }
    }
    function pointerCell(event: PointerEvent | MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects([...slotMeshes.values()])[0]
      return hit?.object.userData.cell as Cell | undefined
    }
    function handlePointerMove(event: PointerEvent) {
      const cell = pointerCell(event)
      setHover(cell ? `${cell.x}-${cell.y}` : null)
      onHoverRef.current(cell ?? null)
    }
    function handlePointerLeave() {
      setHover(null)
      onHoverRef.current(null)
    }
    function handleClick(event: MouseEvent) {
      const cell = pointerCell(event)
      onSelectRef.current(cell ?? null)
    }
    if (interactive) {
      renderer.domElement.addEventListener("pointermove", handlePointerMove)
      renderer.domElement.addEventListener("pointerleave", handlePointerLeave)
      renderer.domElement.addEventListener("click", handleClick)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    function animate(now: number) {
      const selectedKey = selectedRef.current ? `${selectedRef.current.x}-${selectedRef.current.y}` : null
      for (const [key, mesh] of slotMeshes) {
        const highlighted = Boolean(highlightedRef.current?.has(key))
        setSlotAppearance(mesh, key === selectedKey, colors, highlighted)
        const slotGroup = slotGroups.get(key)
        if (slotGroup) {
          const targetY = 0.24 + (key === hoveredKey || highlighted ? 0.2 : 0)
          const smoothing = 1 - Math.exp(-Math.min(now - (slotGroup.userData.lastFrame ?? now), 48) * 0.018)
          slotGroup.position.y = THREE.MathUtils.lerp(slotGroup.position.y, targetY, smoothing)
          slotGroup.userData.lastFrame = now
        }
      }
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    const themeObserver = new MutationObserver(() => {
      colors = getThemeColors()
      scene.traverse((object) => {
        const role = object.userData.themeRole as string | undefined
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments) || !role) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        if (role === "base") {
          materials.forEach((material, index) => {
            ;(material as THREE.MeshBasicMaterial).color.setHex(index === 2 ? colors.top : colors.side)
            material.opacity = index === 2 ? colors.surfaceOpacity : colors.sideOpacity
          })
        } else if (role === "top") {
          materials[0].color.setHex(colors.top)
          setMaterialOpacity(object, colors.surfaceOpacity)
        } else if (role === "rim") {
          materials[0].color.setHex(colors.border)
          setMaterialOpacity(object, colors.rimOpacity)
        } else if (role === "structureEdge") {
          materials[0].color.setHex(colors.edge)
          setMaterialOpacity(object, colors.edgeOpacity)
        } else if (role === "topEdge") {
          materials[0].color.setHex(colors.edge)
          setMaterialOpacity(object, colors.edgeOpacity * 0.72)
        } else if (role === "slotEdge") {
          materials[0].color.setHex(colors.edge)
          setMaterialOpacity(object, colors.edgeOpacity * 0.82)
        } else if (role === "slot") {
          const slotMesh = object as THREE.Mesh
          const cell = slotMesh.userData.cell as Cell | undefined
          const key = cell ? `${cell.x}-${cell.y}` : ""
          const selected = cell && `${cell.x}-${cell.y}` === `${selectedRef.current?.x}-${selectedRef.current?.y}`
          setSlotAppearance(slotMesh, Boolean(selected), colors, Boolean(highlightedRef.current?.has(key)))
        } else if (role === "projectedLabel") {
          paintLabelTexture(labelCanvas, boxId, label, subtitle, document.documentElement.classList.contains("dark"))
          labelTexture.needsUpdate = true
        }
      })
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    frame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frame)
      themeObserver.disconnect()
      observer.disconnect()
      renderer.domElement.removeEventListener("pointermove", handlePointerMove)
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave)
      renderer.domElement.removeEventListener("click", handleClick)
      renderer.dispose()
      container.removeChild(renderer.domElement)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose()
          const material = object.material
          if (Array.isArray(material)) material.forEach((item) => {
            item.map?.dispose()
            item.dispose()
          })
          else {
            material.map?.dispose()
            material.dispose()
          }
        }
      })
    }
  }, [boxId, horizontalFraming, interactive, label, locations, subtitle])

  return <div ref={mountRef} className="h-[360px] w-full touch-none sm:h-[430px]" aria-label={`盒子 ID ${boxId}，${label} 三维收纳盒${highlightedCells?.size ? `，高亮 ${highlightedCells.size} 个匹配货位` : ""}`} role="img" />
}

export function InventoryLocationMap({ items, boxes: incomingBoxes = [] }: { items: ComponentItem[]; boxes?: StorageBox[] }) {
  const actions = useInventoryActions()
  const boxes = incomingBoxes && incomingBoxes.length > 0 ? incomingBoxes : DEFAULT_BOXES
  const [activeBox, setActiveBox] = useState(0)
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [renderedBoxes, setRenderedBoxes] = useState<number[]>([0])
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null)
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  const [quantityOpen, setQuantityOpen] = useState(false)
  const [entryLocation, setEntryLocation] = useState("")
  const [dialog, setDialog] = useState<"add" | "rename" | null>(null)
  const [draftName, setDraftName] = useState("")
  const [draftSubtitle, setDraftSubtitle] = useState("")

  const box = boxes[activeBox] ?? boxes[0]
  const nextBoxId = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)).find((candidate) => !boxes.some((boxItem) => boxItem.id === candidate)) ?? `BOX-${boxes.length + 1}`
  const visibleBoxStart = Math.min(Math.max(activeBox - 1, 0), Math.max(boxes.length - 3, 0))
  const visibleBoxes = boxes.slice(visibleBoxStart, visibleBoxStart + 3)
  const locationsByBox = useMemo(() => {
    const boxMaps = new Map<string, Map<string, ComponentItem[]>>()
    for (const candidate of boxes) boxMaps.set(candidate.id, new Map())
    for (const item of items) {
      const parsed = parseLocation(item.location)
      if (!parsed) continue
      const map = boxMaps.get(parsed.boxId)
      if (!map) continue
      const key = `${parsed.x}-${parsed.y}`
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return boxMaps
  }, [boxes, items])
  const locations = locationsByBox.get(box.id) ?? new Map<string, ComponentItem[]>()
  const selectedItems = selectedCell ? locations.get(`${selectedCell.x}-${selectedCell.y}`) ?? [] : []
  const hoveredItems = hoveredCell ? locations.get(`${hoveredCell.x}-${hoveredCell.y}`) ?? [] : []
  const categories = Array.from(new Set(items.map((item) => item.category)))
  const occupied = locations.size
  const unassigned = items.filter((item) => {
    const parsed = parseLocation(item.location)
    return !parsed || !boxes.some((candidate) => candidate.id === parsed.boxId)
  }).length

  useEffect(() => {
    if (!carouselApi) return
    const syncActiveBox = () => {
      const selected = carouselApi.selectedScrollSnap()
      setActiveBox(selected)
      setRenderedBoxes((current) => current.includes(selected) ? current : [...current, selected])
      setSelectedCell(null)
      setHoveredCell(null)
    }
    const releasePreviousSlides = () => setRenderedBoxes([carouselApi.selectedScrollSnap()])
    syncActiveBox()
    carouselApi.on("select", syncActiveBox)
    carouselApi.on("reInit", syncActiveBox)
    carouselApi.on("settle", releasePreviousSlides)
    return () => {
      carouselApi.off("select", syncActiveBox)
      carouselApi.off("reInit", syncActiveBox)
      carouselApi.off("settle", releasePreviousSlides)
    }
  }, [carouselApi])
  function openAdd() {
    setDraftName(`盒 ${String(boxes.length + 1).padStart(2, "0")}`)
    setDraftSubtitle("新建收纳盒")
    setDialog("add")
  }
  function openRename() {
    setDraftName(box.label)
    setDraftSubtitle(box.subtitle)
    setDialog("rename")
  }
  function locationFor(cell: Cell) {
    return `${box.id}-${String(cell.x).padStart(2, "0")}-${String(cell.y).padStart(2, "0")}`
  }
  function selectCell(cell: Cell | null) {
    setSelectedCell(cell)
    if (!cell) return
    const cellItems = locations.get(`${cell.x}-${cell.y}`) ?? []
    if (cellItems.length > 0) {
      setQuantityOpen(true)
      return
    }
    setEntryLocation(locationFor(cell))
    setEntryOpen(true)
  }
  async function submitDialog() {
    const label = draftName.trim()
    const subtitle = draftSubtitle.trim()
    if (!label) return
    if (dialog === "rename") await actions.updateStorageBox(box.id, label, subtitle)
    if (dialog === "add") {
      await actions.createStorageBox(nextBoxId, label, subtitle)
      setActiveBox(boxes.length)
    }
    setDialog(null)
  }
  async function removeBox() {
    if (boxes.length <= 1) return
    const hasItems = items.some((item) => parseLocation(item.location)?.boxId === box.id)
    const message = hasItems ? `${box.label} 仍有元件，删除后这些元件会变成未分配货位。确定删除吗？` : `确定删除${box.label}吗？`
    if (!window.confirm(message)) return
    await actions.deleteStorageBox(box.id)
    setSelectedCell(null)
  }

  return (
    <section aria-labelledby="location-map-title" className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="shrink-0">
          <div className="flex items-center gap-2">
            <MapPinIcon className="size-4 text-muted-foreground" />
            <h3 id="location-map-title" className="text-sm font-semibold">收纳盒总览</h3>
            {/* <Badge variant="outline" className="font-mono text-[10px] font-normal">7 × 8 · 3D</Badge> */}
          </div>
          <p className="mt-1 pl-6 text-xs text-muted-foreground">
            货位编码：盒子 ID-行-列
          </p>
        </div>
        <div className="-mx-2 flex min-w-0 items-center justify-end overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button type="button" variant="ghost" size="icon" aria-label="上一个元件盒" title="上一个元件盒" onClick={() => carouselApi?.scrollPrev()} disabled={boxes.length <= 1} className="size-11 shrink-0 cursor-pointer"><ChevronLeftIcon /></Button>
          <div role="tablist" aria-label="选择收纳盒" className="flex h-14 shrink-0 items-stretch">
            {visibleBoxes.map((candidate, visibleIndex) => {
              const index = visibleBoxStart + visibleIndex
              const isActive = index === activeBox
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`storage-box-panel-${candidate.id}`}
                  aria-label={`盒子 ID ${candidate.id}，${candidate.label}，${candidate.subtitle}`}
                  title={`盒子 ID ${candidate.id} · ${candidate.label} · ${candidate.subtitle}`}
                  onClick={() => carouselApi?.scrollTo(index)}
                  className={cn(
                    "relative flex min-w-20 cursor-pointer flex-col items-center justify-center px-2 text-center transition-colors duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:bg-orange-500 after:transition-transform after:duration-200 dark:after:bg-lime-400",
                    isActive && "after:scale-x-100",
                  )}
                >
                  <StorageBoxThumbnail active={isActive} boxId={candidate.id} />
                  <span className="-mt-0.5 max-w-20 truncate text-[11px] font-semibold leading-4">{candidate.label}</span>
                  <span className="max-w-20 truncate text-[9px] leading-3 text-muted-foreground">{candidate.subtitle}</span>
                </button>
              )
            })}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="下一个元件盒" title="下一个元件盒" onClick={() => carouselApi?.scrollNext()} disabled={boxes.length <= 1} className="size-11 shrink-0 cursor-pointer"><ChevronRightIcon /></Button>
          <div aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-border" />
          <Button type="button" variant="ghost" size="icon" aria-label="新增收纳盒" title="新增收纳盒" onClick={openAdd} className="size-11 shrink-0 cursor-pointer"><PlusIcon /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="编辑当前收纳盒" title="编辑收纳盒" onClick={openRename} className="size-11 shrink-0 cursor-pointer"><PencilIcon /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="删除当前收纳盒" title="删除收纳盒" onClick={removeBox} disabled={boxes.length <= 1} className="size-11 shrink-0 cursor-pointer"><Trash2Icon /></Button>
        </div>
      </div>
      <Carousel
        setApi={setCarouselApi}
        orientation="horizontal"
        opts={{ loop: boxes.length > 1, align: "start", watchDrag: false }}
        aria-label="元件盒三维视图"
        className="border-t border-border bg-card"
      >
        <CarouselContent className="ml-0">
          {boxes.map((candidate, index) => {
            const candidateLocations = locationsByBox.get(candidate.id) ?? new Map<string, ComponentItem[]>()
            const isActive = index === activeBox
            const shouldRender = renderedBoxes.includes(index)

            return (
              <CarouselItem id={`storage-box-panel-${candidate.id}`} key={candidate.id} className="pl-0" aria-label={`${candidate.label}，第 ${index + 1} 个，共 ${boxes.length} 个`}>
                <div className={cn("relative bg-card", !isActive && "pointer-events-none")} aria-hidden={!isActive}>
                  {shouldRender ? (
                    <ThreeStorageScene
                      boxId={candidate.id}
                      label={candidate.label}
                      subtitle={candidate.subtitle}
                      locations={candidateLocations}
                      selectedCell={isActive ? selectedCell : null}
                      onSelect={(cell) => isActive && selectCell(cell)}
                      onHover={(cell) => isActive && setHoveredCell(cell)}
                    />
                  ) : (
                    <div className="h-[360px] w-full sm:h-[430px]" />
                  )}
                </div>
              </CarouselItem>
            )
          })}
        </CarouselContent>
        {hoveredCell ? (
          <div className="pointer-events-none absolute right-5 top-5 z-10 max-w-[min(70%,22rem)] border-l-2 border-orange-500 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm dark:border-lime-400 sm:right-6">
            <div className="font-mono text-[10px] text-muted-foreground">{locationFor(hoveredCell)}</div>
            {hoveredItems.length ? (
              <div className="mt-1 space-y-0.5">
                {hoveredItems.map((item) => <p key={item.id} className="truncate font-medium">{item.name} · {item.value} · {item.quantity} pcs</p>)}
              </div>
            ) : <p className="mt-1 text-muted-foreground">空货位 · 点击后快速录入元件</p>}
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-4 left-5 right-5 z-10 flex flex-col gap-2 text-xs sm:left-6 sm:right-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-orange-500 dark:bg-lime-400" />已占用 {occupied}</span>
            <span>空位 {56 - occupied}</span>
            {unassigned > 0 ? <span className="text-amber-700 dark:text-amber-400">未分配 {unassigned}</span> : null}
          </div>
          {selectedCell ? (
            <div className="max-w-full border-l-2 border-foreground/20 pl-3 sm:max-w-sm">
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><BoxIcon className="size-3" />{locationFor(selectedCell)}</div>
              {selectedItems.length ? <p className="mt-1 truncate font-medium">{selectedItems.map((item) => `${item.name} · ${item.value}`).join("、")}</p> : <p className="mt-1 text-muted-foreground">这是一个空货位</p>}
            </div>
          ) : null}
        </div>
      </Carousel>
      <AddComponentDialog categories={categories} items={items} open={entryOpen} onOpenChange={setEntryOpen} initialLocation={entryLocation} locationReadOnly showTrigger={false} />
      <UpdateStockQuantityDrawer items={selectedItems} location={selectedCell ? locationFor(selectedCell) : ""} open={quantityOpen} onOpenChange={setQuantityOpen} />
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "add" ? "新增收纳盒" : "编辑收纳盒"}</DialogTitle>
            <DialogDescription>
              {dialog === "add" ? "填写名称和说明，新盒子会自动分配下一个可用的大写字母 ID。" : `修改${box.label}的名称和说明；盒子 ID ${box.id} 与已有货位坐标不会改变。`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">盒子 ID</p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">{dialog === "add" ? `${nextBoxId}（保存后生效）` : box.id}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-box-name">盒子名称</Label>
              <Input
                id="storage-box-name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submitDialog()}
                maxLength={24}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-box-subtitle">盒子说明</Label>
              <Input
                id="storage-box-subtitle"
                value={draftSubtitle}
                onChange={(event) => setDraftSubtitle(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submitDialog()}
                placeholder="例如：电阻 / 电容"
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">显示在顶部导航与 3D 标签中，可留空。</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="cursor-pointer" />}>取消</DialogClose>
            <Button type="button" onClick={submitDialog} disabled={!draftName.trim()} className="cursor-pointer">保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

export function InventoryMatchMap({ items, boxes: incomingBoxes = [], matchedItemIds }: { items: ComponentItem[]; boxes?: StorageBox[]; matchedItemIds: Set<string> }) {
  const boxes = incomingBoxes.length > 0 ? incomingBoxes : DEFAULT_BOXES
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null)
  const locationsByBox = useMemo(() => {
    const boxMaps = new Map<string, Map<string, ComponentItem[]>>()
    for (const candidate of boxes) boxMaps.set(candidate.id, new Map())
    for (const item of items) {
      const parsed = parseLocation(item.location)
      const locationMap = parsed ? boxMaps.get(parsed.boxId) : undefined
      if (!parsed || !locationMap) continue
      const key = `${parsed.x}-${parsed.y}`
      locationMap.set(key, [...(locationMap.get(key) ?? []), item])
    }
    return boxMaps
  }, [boxes, items])
  const highlightedByBox = useMemo(() => {
    const result = new Map<string, Set<string>>()
    for (const candidate of boxes) result.set(candidate.id, new Set())
    for (const item of items) {
      if (!matchedItemIds.has(item.id)) continue
      const parsed = parseLocation(item.location)
      if (parsed) result.get(parsed.boxId)?.add(`${parsed.x}-${parsed.y}`)
    }
    return result
  }, [boxes, items, matchedItemIds])

  const preferredBox = boxes.find((candidate) => (highlightedByBox.get(candidate.id)?.size ?? 0) > 0)
  const box = boxes.find((candidate) => candidate.id === activeBoxId) ?? preferredBox ?? boxes[0]
  const locations = locationsByBox.get(box.id) ?? new Map<string, ComponentItem[]>()
  const highlightedCells = highlightedByBox.get(box.id) ?? new Set<string>()
  const matchedWithLocation = items.filter((item) => {
    const parsed = parseLocation(item.location)
    return matchedItemIds.has(item.id) && Boolean(parsed && boxes.some((candidate) => candidate.id === parsed.boxId))
  }).length
  const matchedWithoutLocation = matchedItemIds.size - matchedWithLocation

  return (
    <section aria-labelledby="bom-location-map-title" className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-orange-500 dark:bg-lime-400" />库存匹配 {matchedWithLocation}</span>
            {matchedWithoutLocation > 0 ? <span className="text-amber-700 dark:text-amber-400">未分配库位 {matchedWithoutLocation}</span> : null}
          </div>
        </div>
        <div role="tablist" aria-label="选择收纳盒" className="flex min-w-0 gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {boxes.map((candidate) => {
            const active = candidate.id === box.id
            const count = highlightedByBox.get(candidate.id)?.size ?? 0
            return (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`盒子 ID ${candidate.id}，${candidate.label}，${count} 个匹配货位`}
                onClick={() => setActiveBoxId(candidate.id)}
                className={cn("flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                <BoxIcon aria-hidden="true" className="size-4" />
                <span>
                  <span className={cn("block font-mono text-[10px] font-semibold", active ? "text-background/75" : "text-foreground")}>ID {candidate.id}</span>
                  <span className="block font-medium">{candidate.label}</span>
                  <span className={cn("block font-mono text-[10px]", active ? "text-background/70" : "text-muted-foreground")}>{count} 个匹配货位</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="relative bg-[radial-gradient(circle_at_50%_38%,color-mix(in_oklch,var(--muted)_72%,transparent),transparent_66%)]">
        <ThreeStorageScene
          boxId={box.id}
          label={box.label}
          subtitle={highlightedCells.size > 0 ? `已标记 ${highlightedCells.size} 个匹配货位` : box.subtitle}
          locations={locations}
          selectedCell={null}
          onSelect={() => undefined}
          onHover={() => undefined}
          interactive={false}
          highlightedCells={highlightedCells}
          horizontalFraming={1.12}
        />
      </div>
    </section>
  )
}
