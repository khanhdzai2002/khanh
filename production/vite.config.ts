import { defineConfig } from "vite";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwind()],
  server: {
    proxy: {
      "/api": process.env.API_TARGET || "http://127.0.0.1:3001",
      "/auth": process.env.API_TARGET || "http://127.0.0.1:3001",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/zod/")) return "validation";
          if (
            id.includes("/node_modules/react") ||
            id.includes("/node_modules/scheduler/")
          )
            return "react";
        },
      },
    },
  },
});
