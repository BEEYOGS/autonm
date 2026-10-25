const fs = require("node:fs");
const path = require("node:path");

const standaloneModules = path.resolve(".next", "standalone", "node_modules");
const stagedModules = path.resolve(".desktop-build", "runtime-modules");

if (!fs.existsSync(standaloneModules)) {
  throw new Error("Next.js standalone node_modules is missing. Run npm run build first.");
}

fs.rmSync(stagedModules, { recursive: true, force: true });
fs.mkdirSync(path.dirname(stagedModules), { recursive: true });
fs.cpSync(standaloneModules, stagedModules, { recursive: true });
console.info("Staged Next.js runtime modules for the Windows package.");
