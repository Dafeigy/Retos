import type { Metadata, Viewport } from "next"
import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NavigationProgressProvider } from "@/components/navigation-progress"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: {
    default: "Retos · Inventory System",
    template: "%s · Retos",
  },
  description: "元件库存管理系统",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-svh antialiased">
        <NavigationProgressProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </NavigationProgressProvider>
      </body>
    </html>
  )
}
