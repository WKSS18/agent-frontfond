/** Vite 开发与构建配置：React 插件以及到 FastAPI 的本地反向代理。 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";


export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // 浏览器请求同源 /api，Vite 转发并移除前缀，从而避免本地开发的 CORS 干扰。
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
