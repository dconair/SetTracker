import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Der Build landet im Python-Paket und wird von FastAPI ausgeliefert.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "../settracker/static", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8000", "/callback": "http://127.0.0.1:8000" } },
});
