import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss()
  ],
  base: "/agent/",
  build: {
    outDir: "../docs",
    // docs/ also stores project documentation; never wipe it during a landing-page build.
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: "./index.html"
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});