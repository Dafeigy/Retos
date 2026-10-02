"use client"


import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

const pageTitles: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "库存总览", description: "掌握元件库存的整体状态" },
  "/components": { title: "元件库存", description: "查找、录入与维护所有元件" },
  "/bom": { title: "iBOM", description: "导入物料清单并定位匹配库存" },
  "/movements": { title: "出入库", description: "记录每一次库存变化" },
  "/alerts": { title: "库存提醒", description: "及时处理低于安全线的元件" },
  "/waitlist": { title: "待开放功能", description: "探索 Retos 正在构建的新能力" },
  "/settings": { title: "系统设置", description: "检查登录与数据库连接状态" },
}

export function WorkspaceHeader({ pathname }: { pathname: string }) {
  const page = pageTitles[pathname] ?? pageTitles["/dashboard"]

  return (
    <header className="workspace-header sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b bg-background/88 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-1 hidden cursor-pointer md:inline-flex" />
        <Separator orientation="vertical" className="hidden data-vertical:h-5 md:block" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{page.title}</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {page.description}
          </p>
        </div>
      </div>
      <ThemeToggle />
    </header>
  )
}
