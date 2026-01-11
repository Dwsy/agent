import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: "public",
          dest: "."
        }
      ]
    })
  ],
  build: {
    outDir: "dist",
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