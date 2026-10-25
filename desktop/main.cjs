const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

let nextServer;
let serverLog;

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForReady(url) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (nextServer?.exitCode !== null && nextServer?.exitCode !== undefined) {
      throw new Error("Server aplikasi berhenti sebelum siap.");
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error("Server aplikasi tidak siap dalam 90 detik. Periksa server.log di folder data Stikerin.");
}

async function startLocalApp() {
  const port = await getAvailablePort();
  const appDirectory = path.join(process.resourcesPath, "app");
  const serverFile = path.join(appDirectory, "server.js");
  if (!fs.existsSync(serverFile)) throw new Error("File server aplikasi tidak ditemukan pada instalasi.");

  serverLog = fs.createWriteStream(path.join(app.getPath("userData"), "server.log"), { flags: "a" });
  nextServer = spawn(process.execPath, [serverFile], {
    cwd: appDirectory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      STIKERIN_IMAGE_WORKER: path.join(process.resourcesPath, "image-worker.exe"),
      STIKERIN_MODEL_DIR: path.join(app.getPath("userData"), "models"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  nextServer.stdout.pipe(serverLog);
  nextServer.stderr.pipe(serverLog);

  const url = `http://127.0.0.1:${port}`;
  await waitForReady(url);
  return url;
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 880,
    minHeight: 680,
    show: false,
    backgroundColor: "#100e17",
    title: "Stikerin Studio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://") || target.startsWith("http://")) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    if (target !== url && (target.startsWith("https://") || target.startsWith("http://"))) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });
  window.once("ready-to-show", () => window.show());
  window.loadURL(url);
}

app.whenReady().then(async () => {
  try {
    const url = app.isPackaged ? await startLocalApp() : "http://127.0.0.1:3000";
    createWindow(url);
  } catch (error) {
    dialog.showErrorBox("Stikerin Studio tidak dapat dibuka", error.message);
    app.quit();
  }
});

app.on("before-quit", () => {
  nextServer?.kill();
  serverLog?.end();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
