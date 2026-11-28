import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? "/",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787", "/uploads": "http://localhost:8787" },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    // Liste des fichiers de la version : le service worker les garde tous pour l'usage hors connexion.
    manifest: "asset-manifest.json",
    rollupOptions: { output: { manualChunks: { faceapi: ["@vladmandic/face-api"] } } },
  },
});
