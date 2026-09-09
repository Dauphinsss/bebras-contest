import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],

  // La sección se llama Desafíos y ahora la ruta también. Solo se redirige la
  // portada: el redirect estático pierde la query, así que las subpáginas
  // llegarían sin su `id`.
  redirects: {
    "/competencias": "/desafios",
  },

  server: {
    port: 4321,
    host: true,
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
