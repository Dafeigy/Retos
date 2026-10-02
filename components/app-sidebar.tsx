"use client"

import { NavigationLink as Link } from "@/components/navigation-link"
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation"
import {
  AlertTriangleIcon,
  BoxesIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  LogOutIcon,
  PackagePlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

const navigation = [
  { title: "总览", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "元件库存", href: "/components", icon: BoxesIcon },

  { title: "出入库", href: "/movements", icon: PackagePlusIcon },
  { title: "库存提醒", href: "/alerts", icon: AlertTriangleIcon},
  { title: "iBOM", href: "/bom", icon: ListTreeIcon },
  { title: "RetosAI", href: "/waitlist", icon: SparklesIcon, badge: "🚧" },
]

export function AppSidebar({ pathname, onLogout, ...props }: React.ComponentProps<typeof Sidebar> & { pathname: string; onLogout?: () => void }) {
  const { isMobile } = useSidebar()

  if (isMobile) {
    return <MobileBottomNavigation key={pathname} pathname={pathname} />
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/dashboard" />}
              className="cursor-pointer hover:bg-transparent active:bg-transparent"
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#111111] group-data-[collapsible=icon]:size-8">
                {/* Shared with the offline desktop; this small local asset needs no image server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/retos-avatar-v2.png"
                  alt=""
                  width={36}
                  height={36}
                  className="size-full object-contain"
                />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="font-semibold tracking-[-0.02em]">Retos</span>
                <span className="text-xs text-muted-foreground">元件库存管理</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={pathname === item.href}
                      render={<Link href={item.href} />}
                      className="cursor-pointer"
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge className="text-amber-700">
                        {item.badge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="设置"
              isActive={pathname === "/settings"}
              render={<Link href="/settings" />}
              className="cursor-pointer"
            >
              <SettingsIcon />
              <span>系统设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {onLogout ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="退出登录"
              onClick={onLogout}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOutIcon />
              <span>退出登录</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
