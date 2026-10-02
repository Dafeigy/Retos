import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowDownToLineIcon, CloudUploadIcon, LoaderCircleIcon } from "lucide-react"
import { InventoryActionsContext, actionError, type InventoryActions } from "@/components/inventory-actions"
import { NavigationLinkContext, type NavigationLinkProps } from "@/components/navigation-link"
import { AppSidebar } from "@/components/app-sidebar"
import { WorkspaceHeader } from "@/components/workspace-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { ComponentsView } from "@/components/views/components-view"
import { DashboardView } from "@/components/views/dashboard-view"
import { MovementsView } from "@/components/views/movements-view"
import { AlertsView } from "@/components/views/alerts-view"
import { BomView } from "@/components/views/bom-view"
import { WaitlistView } from "@/components/views/waitlist-view"
import { inventoryOverview } from "@/lib/inventory-types"
import { createMovement, deleteStorageBox, saveComponent, saveStorageBox, setStockQuantity, type Snapshot, type SyncReport } from "./api"
import { DesktopSettings } from "./settings"

function DesktopLink({ href, ...props }: NavigationLinkProps) { return <a {...props} href={`#${href}`} /> }
function currentPath() { return window.location.hash.slice(1) || "/dashboard" }

export function DesktopApp() {
  const [pathname, setPathname] = useState(currentPath)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState("")
  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null)
  const [syncMessage, setSyncMessage] = useState("")
  const [syncFailed, setSyncFailed] = useState(false)
  const latestRead = useRef(0)

  const refresh = useCallback(async () => {
    const read = ++latestRead.current
    const result = await invoke<Snapshot>("inventory_snapshot")
    if (read === latestRead.current) { setSnapshot(result); setError("") }
  }, [])

  useEffect(() => {
    const navigate = () => setPathname(currentPath())
    window.addEventListener("hashchange", navigate)
    void refresh().catch((error) => setError(actionError(error)))
    return () => { window.removeEventListener("hashchange", navigate) }
  }, [refresh])

  const actions = useMemo<InventoryActions>(() => {
    async function mutate(operation: Promise<unknown>) {
      await operation
      // A failed read after a committed write must not invite the user to submit it again.
      await refresh().catch((error) => setError(actionError(error)))
    }
    return {
      createComponent: (data) => mutate(saveComponent(data)),
      updateComponent: (id, data) => mutate(saveComponent(data, id)),
      deleteComponent: (id) => mutate(invoke("delete_component", { id })),
      createMovement: (data) => mutate(createMovement(data)),
      setStockQuantity: (id, quantity, note) => mutate(setStockQuantity(id, quantity, note)),
      createStorageBox: (id, label, subtitle) => mutate(saveStorageBox(id, label, subtitle)),
      updateStorageBox: (id, label, subtitle) => mutate(saveStorageBox(id, label, subtitle)),
      deleteStorageBox: (id) => mutate(deleteStorageBox(id)),
    }
  }, [refresh])

  async function sync(direction: "push" | "pull") {
    if (syncing) return
    setSyncing(direction); setSyncMessage(""); setSyncFailed(false)
    try {
      const report = await invoke<SyncReport>("sync_inventory", { direction })
      await refresh()
      setSyncMessage(`${direction === "push" ? "已推送" : "已拉取"} ${report.components} 项元件、${report.movements} 条流水、${report.boxes} 个收纳盒${report.preserved ? `，保留 ${report.preserved} 项本地修改` : ""}`)
    } catch (error) { setSyncMessage(actionError(error)); setSyncFailed(true) }
    finally { setSyncing(null) }
  }

  const syncButtons = <>
    <Button variant="outline" className="cursor-pointer" disabled={!!syncing} onClick={() => void sync("push")}>
      {syncing === "push" ? <LoaderCircleIcon className="animate-spin" /> : <CloudUploadIcon />}推送到云端{snapshot?.pending ? <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{snapshot.pending}</span> : null}
    </Button>
    <Button variant="outline" className="cursor-pointer" disabled={!!syncing} onClick={() => void sync("pull")}>
      {syncing === "pull" ? <LoaderCircleIcon className="animate-spin" /> : <ArrowDownToLineIcon />}拉取更新
    </Button>
  </>

  return (
    <NavigationLinkContext.Provider value={DesktopLink}><InventoryActionsContext.Provider value={actions}><TooltipProvider><SidebarProvider className="tauri-app-shell">
      <AppSidebar pathname={pathname} />
      <SidebarInset className="min-w-0 bg-muted/30"><WorkspaceHeader pathname={pathname} /><main className="flex-1 px-4 pt-4 pb-[calc(7rem+var(--app-safe-area-bottom))] sm:px-6 sm:pt-6 sm:pb-[calc(7rem+var(--app-safe-area-bottom))] md:pb-6 lg:p-8">
        {error ? <div role="alert" className="mb-4 flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={() => void refresh().catch((e) => setError(actionError(e)))}>重试</Button></div> : null}
        {pathname === "/settings" 
          ? <DesktopSettings onSaved={refresh} /> 
          : !snapshot 
            ? <div role="status" aria-label="加载库存" className="grid min-h-64 place-items-center"><LoaderCircleIcon className="size-5 animate-spin" /></div> 
            : pathname === "/dashboard" 
              ? <DashboardView overview={inventoryOverview(snapshot.components, snapshot.movements)} items={snapshot.components} boxes={snapshot.boxes} />
              : pathname === "/movements" 
                ? <MovementsView items={snapshot.components} movements={snapshot.movements} /> 
                : pathname === "/waitlist" 
                  ? <WaitlistView />
                  : pathname === "/bom"
                  ? <BomView items={snapshot.components} boxes={snapshot.boxes} />
                    : pathname === "/alerts" 
                    ? <AlertsView items={snapshot.components} /> 
                      : <>
          <ComponentsView items={snapshot.components} actions={syncButtons} />
          {syncMessage ? <p role={syncFailed ? "alert" : "status"} className={`mx-auto mt-3 max-w-[1440px] text-sm ${syncFailed ? "text-destructive" : "text-muted-foreground"}`}>{syncMessage}</p> : null}
        </>}
      </main></SidebarInset>
    </SidebarProvider><Toaster /></TooltipProvider></InventoryActionsContext.Provider></NavigationLinkContext.Provider>
  )
}
