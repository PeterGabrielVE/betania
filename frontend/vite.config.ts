import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
// Backend Django. En Docker se sobreescribe con http://web:8000.
const backend = process.env.VITE_BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // Mismo origen en desarrollo: sin CORS y las cookies de sesión/CSRF funcionan.
    proxy: Object.fromEntries(
      // /retiros/<id>/lista.pdf es de Django; /retiros a secas es una página React.
      ["/api", "/admin", "/static", "^/retiros/.+\\.pdf$"].map((ruta) => [
        ruta,
        backend,
      ]),
    ),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // Skip eval warnings from react-jvectormap
        if (
          warning.code === "EVAL" &&
          warning.id?.includes("@react-jvectormap")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
});
