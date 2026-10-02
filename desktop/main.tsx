import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { DesktopApp } from "./app"
import "@/app/globals.css"

const theme = localStorage.getItem("theme") || "system"
const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
document.documentElement.classList.toggle("dark", dark)
document.documentElement.style.colorScheme = dark ? "dark" : "light"
document.documentElement.dataset.tauriPlatform = /Android/i.test(navigator.userAgent) ? "android" : "desktop"

createRoot(document.getElementById("root")!).render(<StrictMode><DesktopApp /></StrictMode>)
