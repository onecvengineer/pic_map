import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "../../public",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5173",
      "/media": "http://127.0.0.1:5173",
    },
  },
});
