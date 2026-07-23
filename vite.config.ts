import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    sourcemap: true,
    target: "es2022",
    rolldownOptions: {
      // Keep the emitted HTML name relative on Windows workspaces with non-ASCII path segments.
      input: "index.html",
    },
  },
});
