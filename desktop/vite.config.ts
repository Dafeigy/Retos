import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: false,
  plugins: [react()],
  
  resolve: { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } },
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  css: { postcss: fileURLToPath(new URL("..", import.meta.url)) },
  server: { port: 1420, strictPort: true, host: "0.0.0.0",hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
  },
  build: { outDir: "../dist-desktop", emptyOutDir: true },
  clearScreen: false,
  
})
