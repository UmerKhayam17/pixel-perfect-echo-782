import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Settings come from frontend/.env (see .env.example).
 * - `npm run dev`: dev server that forwards /api to API_TARGET.
 * - `npm run build`: a static single-page app in dist/client/ for nginx to serve, with nginx
 *   forwarding /api to the backend. No Node process is needed for the frontend in production.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  // Where the dev server forwards /api (the backend's PORT in backend/.env).
  const apiTarget = env["API_TARGET"] || "http://127.0.0.1:5000";
  // The browser always calls /api on whatever address it opened (localhost, 127.0.0.1 or the
  // LAN IP); the dev server forwards it to the backend, which only listens on this computer.
  // xfwd passes the visitor's real IP on (sign-in limits, staff activity log).
  const apiProxy = { "/api": { target: apiTarget, xfwd: true } };

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        // src/server.ts wraps TanStack Start's server entry (dev server error page).
        server: { entry: "server" },
        // Build a static app: dist/client/_shell.html plus assets, served by nginx.
        spa: { enabled: true },
        // Keep server-only code out of the browser bundle.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
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
    // Listen on every address so staff can open the dev server by this computer's LAN IP.
    server: {
      host: env["DEV_HOST"] || "::",
      port: Number(env["DEV_PORT"]) || 8080,
      proxy: apiProxy,
    },
    preview: {
      host: env["DEV_HOST"] || "::",
      port: Number(env["DEV_PORT"]) || 8080,
      proxy: apiProxy,
    },
  };
});
