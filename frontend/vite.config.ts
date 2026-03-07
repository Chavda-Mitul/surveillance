import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import cesium from "vite-plugin-cesium"

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api/, ''), 
        secure: false, // Set to false if your backend uses self-signed certs with HTTPS
      },
    },
  },
});