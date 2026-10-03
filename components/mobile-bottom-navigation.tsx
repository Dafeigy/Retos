"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangleIcon,
  BoxesIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  PackagePlusIcon,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { NavigationLink as Link } from "@/components/navigation-link"
import { cn } from "cn"

const mobileNavigation = [
  { title: "总览", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "元件库存", href: "/components", icon: BoxesIcon },
  { title: "出入库", href: "/movements", icon: PackagePlusIcon },
  { title: "库存提醒", href: "/alerts", icon: AlertTriangleIcon },
  { title: "iBOM", href: "/bom", icon: ListTreeIcon },
]

export function MobileBottomNavigation({ pathname }: { pathname: string }) {
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)
  const animationFrame = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0)

    function updateVisibility() {
      const scrollY = Math.max(window.scrollY, 0)
      const delta = scrollY - lastScrollY.current

      if (scrollY <= 24) {
        setVisible(true)
        lastScrollY.current = scrollY
      } else if (Math.abs(delta) >= 8) {
        setVisible(delta < 0)
        lastScrollY.current = scrollY
      }

      animationFrame.current = null
    }

    function handleScroll() {
      if (animationFrame.current === null) {
        animationFrame.current = window.requestAnimationFrame(updateVisibility)
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current)
      }
    }
  }, [])

  return (
    <motion.nav
      aria-label="移动端主导航"
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : "calc(100% + 1.5rem)",
      }}
      transition={{ duration: reducedMotion ? 0 : 0.24, ease: "linear" }}
      className={cn(
        "fixed inset-x-3 bottom-[calc(var(--app-safe-area-bottom)+0.75rem)] z-40 mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[1.75rem] border border-border/80 bg-background/92 p-1.5 text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl will-change-transform md:hidden",
        !visible && "pointer-events-none",
      )}
    >
      {mobileNavigation.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || (item.href === "/bom" && pathname.startsWith("/bom/"))

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1 text-[11px] leading-none font-medium text-muted-foreground outline-none transition-colors duration-200 ease-linear hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none",
              active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={active ? 2.25 : 2} />
            <span className="max-w-full truncate">{item.title}</span>
          </Link>
        )
      })}
    </motion.nav>
  )
}
