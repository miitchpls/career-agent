/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": `${import.meta.dirname}/src` } },
  build: { outDir: "../src/career_agent/static", emptyOutDir: true },
  server: { host: true, proxy: { "/api": "http://127.0.0.1:8000" } },
  // Tests assert Italian copy whatever the machine's language.
  test: { setupFiles: ["src/test-setup.ts"] },
})
