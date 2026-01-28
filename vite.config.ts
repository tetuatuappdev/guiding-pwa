import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/pwa/" : "/",
  plugins: [react()],
  server: {
    port: 5174,
  },
}));
