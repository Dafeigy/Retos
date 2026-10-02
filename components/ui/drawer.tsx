"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "cn"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerContent({ className, children, mobileFullWidth = false, ...props }: DrawerPrimitive.Popup.Props & { mobileFullWidth?: boolean }) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        data-slot="drawer-overlay"
        className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0"
      />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50 flex items-stretch justify-end">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "relative h-full overflow-y-auto overscroll-contain bg-popover pt-[var(--app-safe-area-top)] pb-[calc(var(--app-safe-area-bottom)+1.5rem)] text-popover-foreground shadow-2xl outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-200 ease-out data-ending-style:translate-x-full data-starting-style:translate-x-full data-swiping:select-none",
            mobileFullWidth
              ? "w-full border-l-0 md:w-[min(100%-2rem,27.3rem)] md:border-l"
              : "w-[min(100%-2rem,27.3rem)] border-l",
            className,
          )}
          {...props}
        >
          <DrawerPrimitive.Close
            data-slot="drawer-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4 cursor-pointer" />}
          >
            <XIcon />
            <span className="sr-only">关闭</span>
          </DrawerPrimitive.Close>
          <DrawerPrimitive.Content>{children}</DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("space-y-1.5 px-5 pt-5", className)} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("flex flex-col-reverse gap-2 border-t bg-popover px-5 pt-4 sm:flex-row sm:justify-end", className)} {...props} />
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("text-base font-semibold", className)} {...props} />
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger }
