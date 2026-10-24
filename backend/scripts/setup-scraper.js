/**
 * Creates the scraper's Python environment (scraper/.venv), installs its packages and the
 * Chromium browser Playwright drives. Works on Windows, Linux and macOS.
 *
 *   npm run scraper:setup              # packages + browser
 *   npm run scraper:setup -- --deps    # Linux servers: also install Chromium's system libraries
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scraperDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scraper");
const win = process.platform === "win32";
const venvPython = path.join(scraperDir, ".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");
const withDeps = process.argv.includes("--deps");

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: scraperDir, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")}`);
    if (!win && cmd !== venvPython) console.error("On Ubuntu/Debian, install venv support first: apt install -y python3-venv");
    process.exit(r.status ?? 1);
  }
}

// A half-created .venv (e.g. from a failed attempt) has no pip, so start again.
if (fs.existsSync(path.join(scraperDir, ".venv")) && !fs.existsSync(venvPython)) {
  fs.rmSync(path.join(scraperDir, ".venv"), { recursive: true, force: true });
}
if (!fs.existsSync(venvPython)) run(process.env.PYTHON || (win ? "python" : "python3"), ["-m", "venv", ".venv"]);
run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"]);
run(venvPython, ["-m", "playwright", "install", ...(withDeps ? ["--with-deps"] : []), "chromium"]);
console.log(`\nScraper ready: ${venvPython}`);
