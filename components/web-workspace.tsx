"use client"

import { useMemo, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { WorkspaceHeader } from "@/components/workspace-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ProgressLink } from "@/components/navigation-progress"
import { NavigationLinkContext } from "@/components/navigation-link"
import { InventoryActionsContext, type InventoryActions } from "@/components/inventory-actions"

export function WebWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const actions = useMemo<InventoryActions>(() => {
    async function mutate(url: string, method: string, data?: unknown) {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined })
      const result = await response.json() as { message?: string }
      if (!response.ok) throw new Error(result.message ?? "保存失败，请重试。")
      router.refresh()
    }
    return {
      createComponent: (data) => mutate("/api/components", "POST", data),
      updateComponent: (id, data) => mutate(`/api/components/${encodeURIComponent(id)}`, "PATCH", data),
      deleteComponent: (id) => mutate(`/api/components/${encodeURIComponent(id)}`, "DELETE"),
      createMovement: (data) => mutate("/api/movements", "POST", data),
      setStockQuantity: (id, quantity, note) => mutate(`/api/components/${encodeURIComponent(id)}/stock`, "PATCH", { quantity, note }),
      createStorageBox: (id, label, subtitle) => mutate("/api/storage-boxes", "POST", { id, label, subtitle }),
      updateStorageBox: (id, label, subtitle) => mutate(`/api/storage-boxes/${encodeURIComponent(id)}`, "PATCH", { label, subtitle }),
      deleteStorageBox: (id) => mutate(`/api/storage-boxes/${encodeURIComponent(id)}`, "DELETE"),
    }
  }, [router])

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/login")
    router.refresh()
  }

  return (
    <NavigationLinkContext.Provider value={ProgressLink}>
      <InventoryActionsContext.Provider value={actions}>
        <SidebarProvider>
          <AppSidebar pathname={pathname} onLogout={logout} />
          <SidebarInset className="min-w-0 bg-muted/30">
            <WorkspaceHeader pathname={pathname} />
            <main className="flex-1 px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-6 lg:p-8">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </InventoryActionsContext.Provider>
    </NavigationLinkContext.Provider>
  )
}
