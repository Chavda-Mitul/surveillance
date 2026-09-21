import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import cesium from "vite-plugin-cesium"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [react(), cesium()],
    // Dev‑only proxy — always on in dev mode so the local backend is reachable.
    // On Vercel the serverless function handles /api on the same origin, so
    // this proxy is only loaded during `vite dev` and ignored during `vite build`.
    server: {
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          secure: false,
        },
      },
    },
  }
})