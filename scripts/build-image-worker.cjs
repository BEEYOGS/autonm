const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.platform !== "win32") {
  throw new Error("Image worker .exe harus dibangun dari Windows.");
}

const python = process.env.STIKERIN_PYTHON_PATH
  ? { command: process.env.STIKERIN_PYTHON_PATH, prefix: [] }
  : { command: "py", prefix: ["-3.12"] };
const dependencies = spawnSync(python.command, [...python.prefix, "-m", "PyInstaller", "--version"], {
  encoding: "utf8",
  windowsHide: true,
});

if (dependencies.error || dependencies.status !== 0) {
  throw new Error("Image worker membutuhkan Python 3.12 dan PyInstaller. Jalankan: py -3.12 -m pip install -r requirements-image-worker.txt");
}

const outputDirectory = path.resolve(".desktop-build");
fs.mkdirSync(outputDirectory, { recursive: true });

const build = spawnSync(python.command, [
  ...python.prefix,
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--collect-all",
  "PIL",
  "--collect-all",
  "rembg",
  "--collect-all",
  "onnxruntime",
  "--copy-metadata",
  "pymatting",
  "--name",
  "stikerin-image-worker",
  "--distpath",
  outputDirectory,
  "--workpath",
  path.join(outputDirectory, "pyinstaller"),
  "--specpath",
  outputDirectory,
  path.resolve("scripts", "image_worker.py"),
], { stdio: "inherit", windowsHide: true });

if (build.error) throw build.error;
if (build.status !== 0) throw new Error("Gagal membangun worker gambar Python.");
console.info("Python image worker siap untuk paket Windows.");
