import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Where the dev/preview server forwards /api (the backend's PORT in backend/.env).
const API_TARGET = process.env["API_TARGET"] ?? "http://127.0.0.1:5000";

// The browser always calls /api on whatever address it opened (localhost, 127.0.0.1 or the
// LAN IP); the dev server forwards it to the backend, which only listens on this computer.
// xfwd passes the visitor's real IP on (sign-in limits, staff activity log).
const apiProxy = { "/api": { target: API_TARGET, xfwd: true } };

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // src/server.ts wraps TanStack Start's server entry (SSR error page).
      server: { entry: "server" },
      // Keep server-only code out of the browser bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Production build: a standalone Node server in .output/ (node .output/server/index.mjs).
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  // Listen on every address so staff can open it by this computer's LAN IP.
  server: { host: "::", port: 8080, proxy: apiProxy },
  preview: { host: "::", port: 8080, proxy: apiProxy },
}));
