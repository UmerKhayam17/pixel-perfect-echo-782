// pm2 process file for the backend API. The frontend is static files served by nginx.
//   pm2 start ecosystem.config.cjs && pm2 save
// Settings (PORT, MONGODB_URI, …) come from backend/.env.
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "leadpro-api",
      cwd: path.join(__dirname, "backend"),
      script: "src/server.js",
      env: { NODE_ENV: "production" },
      // Searches and enrichment run as child processes; give the app room before restarting it.
      max_memory_restart: "1G",
      kill_timeout: 10000,
      time: true,
    },
  ],
};
