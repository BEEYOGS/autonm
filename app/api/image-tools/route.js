import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_MASK_SIZE = 12 * 1024 * 1024;
const MAX_REQUEST_SIZE = 34 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isLoopbackRequest(request) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  return /^(localhost|127(?:\.\d{1,3}){3})(:\d+)?$/.test(host) || /^\[::1\](?::\d+)?$/.test(host);
}

function getWorker() {
  if (process.env.STIKERIN_IMAGE_WORKER) {
    return { command: process.env.STIKERIN_IMAGE_WORKER, prefix: [] };
  }
  if (process.env.NODE_ENV !== "development") return null;

  const script = path.resolve(process.cwd(), "scripts", "image_worker.py");
  return process.platform === "win32"
    ? { command: process.env.STIKERIN_PYTHON_PATH || "py", prefix: process.env.STIKERIN_PYTHON_PATH ? [script] : ["-3.12", script] }
    : { command: process.env.STIKERIN_PYTHON_PATH || "python3", prefix: [script] };
}

function runWorker(args, timeoutMs = 120_000) {
  const worker = getWorker();
  if (!worker) return Promise.reject(new Error("Worker Python hanya tersedia di aplikasi desktop lokal."));

  return new Promise((resolve, reject) => {
    const child = spawn(worker.command, [...worker.prefix, ...args], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error("Pemrosesan gambar melewati batas waktu 120 detik."));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8000);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Worker Python tidak dapat dijalankan: ${error.message}`));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || "Worker Python gagal memproses gambar."));
    });
  });
}

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

function isUpload(value) {
  return value && typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

export async function GET(request) {
  if (!isLoopbackRequest(request)) return jsonError("Worker gambar hanya tersedia di perangkat lokal.", 403);
  if (!getWorker()) return Response.json({ available: false });
  const worker = getWorker();
  const check = spawnSync(worker.command, [...worker.prefix, "--healthcheck"], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  return Response.json({ available: !check.error && check.status === 0 });
}

export async function POST(request) {
  if (!isLoopbackRequest(request)) return jsonError("Worker gambar hanya tersedia di perangkat lokal.", 403);
  const worker = getWorker();
  if (!worker) return jsonError("Worker Python tidak aktif pada deployment ini.", 503);

  const requestLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(requestLength) && requestLength > MAX_REQUEST_SIZE) {
    return jsonError("Ukuran permintaan gambar maksimal 34 MB.", 413);
  }

  let temporaryDirectory;
  try {
    const form = await request.formData();
    const operation = form.get("operation");
    const image = form.get("image");
    if (!isUpload(image) || !IMAGE_TYPES.has(image.type) || image.size === 0 || image.size > MAX_FILE_SIZE) {
      return jsonError("Pilih gambar PNG, JPG, atau WebP maksimal 20 MB.", 400);
    }
    if (!["upscale", "remove-background"].includes(operation)) {
      return jsonError("Operasi gambar tidak didukung.", 400);
    }

    const args = ["--operation", operation];
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "stikerin-image-"));
    const inputPath = path.join(temporaryDirectory, "input-image");
    const outputPath = path.join(temporaryDirectory, "output.png");
    await writeFile(inputPath, Buffer.from(await image.arrayBuffer()));
    args.push("--input", inputPath, "--output", outputPath);

    if (operation === "upscale") {
      const scale = Number(form.get("scale"));
      if (![2, 3, 4].includes(scale)) return jsonError("Skala yang didukung hanya 2x, 3x, atau 4x.", 400);
      args.push("--scale", String(scale));
    } else {
      const mask = form.get("mask");
      if (!isUpload(mask) || mask.type !== "image/png" || mask.size === 0 || mask.size > MAX_MASK_SIZE) {
        return jsonError("Mask PNG kuas tidak valid.", 400);
      }
      const maskPath = path.join(temporaryDirectory, "mask.png");
      await writeFile(maskPath, Buffer.from(await mask.arrayBuffer()));
      args.push("--mask", maskPath);
    }

    await runWorker(args);
    const output = await readFile(outputPath);
    return new Response(output, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pemrosesan gambar Python gagal:", error);
    return jsonError(error.message || "Gagal memproses gambar secara lokal.", 500);
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
