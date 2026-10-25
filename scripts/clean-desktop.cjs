const fs = require("node:fs");
const path = require("node:path");

fs.rmSync(path.resolve(".desktop-build"), { recursive: true, force: true });
console.info("Removed temporary desktop packaging files.");
