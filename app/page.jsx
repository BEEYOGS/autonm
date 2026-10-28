"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import * as XLSX from "@e965/xlsx";

const PRINT_DPI = 300;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const DESKTOP_DOWNLOAD_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL
  || "https://github.com/BEEYOGS/autonm/releases";

function Icon({ name, size = 20 }) {
  const paths = {
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" /></>,
    file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" /><path d="M13 3v7h7M8 14h8m-8 4h8" /></>,
    download: <><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 17v3h14v-3" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    sticker: <><path d="M20 13.5 13.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" /><path d="M13 20v-5a2 2 0 0 1 2-2h5" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    brush: <><path d="m14 6 4 4M4 20c3.5 0 6-1.5 6-4.5S12.5 11 16 8l3-3-2-2-3 3c-3 3.5-4.5 6-7.5 6S2 14.5 2 18c0 1.2.8 2 2 2Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    check: <path d="m5 12 4 4L19 6" />,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    undo: <><path d="M3 7v5h5" /><path d="M5 12a8 8 0 1 0 2-5.3L3 12" /></>,
    external: <><path d="M14 3h7v7m0-7-9 9" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /></>,
    resize: <><path d="M3 3v18h18" /><path d="M3 3h18v18" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function addPngResolution(blob, dpi) {
  const png = new Uint8Array(await blob.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => png[index] === byte)) throw new Error("Format gambar PNG tidak valid.");
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = signature.length;
  while (offset + 12 <= png.length) {
    const chunkLength = view.getUint32(offset, false);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > png.length) throw new Error("Data gambar PNG tidak lengkap.");
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "pHYs") {
      if (chunkLength !== 9) throw new Error("Metadata resolusi PNG tidak valid.");
      view.setUint32(offset + 8, pixelsPerMeter, false);
      view.setUint32(offset + 12, pixelsPerMeter, false);
      png[offset + 16] = 1;
      view.setUint32(offset + 17, crc32(png.subarray(offset + 4, offset + 17)), false);
      return new Blob([png], { type: blob.type });
    }
    if (type === "IEND") {
      const chunk = new Uint8Array(21);
      const chunkView = new DataView(chunk.buffer);
      chunkView.setUint32(0, 9, false);
      chunk.set([112, 72, 89, 115], 4);
      chunkView.setUint32(8, pixelsPerMeter, false);
      chunkView.setUint32(12, pixelsPerMeter, false);
      chunk[16] = 1;
      chunkView.setUint32(17, crc32(chunk.subarray(4, 17)), false);
      return new Blob([png.subarray(0, offset), chunk, png.subarray(offset)], { type: blob.type });
    }
    offset = chunkEnd;
  }
  throw new Error("Gambar PNG tidak memiliki penanda akhir yang valid.");
}

function hexToHsv(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return { hue: (hue + 360) % 360, saturation: maximum === 0 ? 0 : delta / maximum, value: maximum };
}

function applyCase(text, mode) {
  if (mode === "upper") return String(text).toUpperCase();
  if (mode === "lower") return String(text).toLowerCase();
  return String(text);
}

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  const channels = hue < 60 ? [chroma, secondary, 0]
    : hue < 120 ? [secondary, chroma, 0]
      : hue < 180 ? [0, chroma, secondary]
        : hue < 240 ? [0, secondary, chroma]
          : hue < 300 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];

  return `#${channels.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function ColorPicker({ label, value, onChange }) {
  const color = hexToHsv(value);
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const pickerRef = useRef(null);

  useEffect(() => {
    setHexDraft(value.toUpperCase());
  }, [value]);

  function updateFromPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const brightness = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    onChange(hsvToHex(color.hue, saturation, brightness));
  }

  function updateColor(nextHue, saturation = color.saturation, brightness = color.value) {
    onChange(hsvToHex(nextHue, saturation, brightness));
  }

  function handleFieldKeyDown(event) {
    const step = event.shiftKey ? 0.1 : 0.025;
    if (event.key === "ArrowLeft") updateColor(color.hue, color.saturation - step, color.value);
    else if (event.key === "ArrowRight") updateColor(color.hue, color.saturation + step, color.value);
    else if (event.key === "ArrowUp") updateColor(color.hue, color.saturation, color.value + step);
    else if (event.key === "ArrowDown") updateColor(color.hue, color.saturation, color.value - step);
    else return;
    event.preventDefault();
  }

  function handleToggle(event) {
    const target = event.currentTarget;
    if (!target.open) {
      setOpen(false);
      setOpensUp(false);
      return;
    }
    setOpen(true);
    const rect = target.getBoundingClientRect();
    const panelHeight = 260;
    const gap = 10;
    const nextOpensUp = window.innerHeight - rect.bottom < panelHeight + gap;
    setOpensUp(nextOpensUp);
    setPanelPos({
      top: nextOpensUp ? rect.top - panelHeight - gap : rect.bottom + gap,
      left: rect.left,
    });
  }

  function handleDocumentClick(event) {
    if (open && pickerRef.current && !pickerRef.current.contains(event.target)) {
      setOpen(false);
    }
  }

  useEffect(() => {
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [open]);

  const panel = (
    <div
      ref={pickerRef}
      className={`color-picker-panel ${opensUp ? "opens-up" : ""}`}
      style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
    >
      <div
        className="color-sv-field"
        role="group"
        aria-label={`${label}: atur saturasi dan kecerahan`}
        tabIndex={0}
        style={{ "--picker-hue": `hsl(${color.hue} 100% 50%)` }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => { if (event.buttons) updateFromPointer(event); }}
        onKeyDown={handleFieldKeyDown}
      >
        <span aria-hidden="true" />
        <span
          className="color-picker-indicator"
          aria-hidden="true"
          style={{
            left: `${color.saturation * 100}%`,
            top: `${(1 - color.value) * 100}%`,
            backgroundColor: value,
          }}
        />
      </div>
      <label className="hue-control">
        <span>Rona</span>
        <input
          type="range"
          min="0"
          max="359"
          value={Math.round(color.hue)}
          aria-label={`Rona ${label.toLowerCase()}`}
          style={{ "--picker-current-color": value }}
          onChange={(event) => updateColor(Number(event.target.value))}
        />
      </label>
      <div className="color-picker-footer">
        <span className="color-preview-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
        <label className="hex-control">
          <span>HEX</span>
          <input
            value={hexDraft}
            maxLength={7}
            spellCheck={false}
            aria-label={`Kode HEX ${label.toLowerCase()}`}
            onChange={(event) => {
              const nextValue = event.target.value.toUpperCase();
              setHexDraft(nextValue);
              if (/^#[0-9A-F]{6}$/.test(nextValue)) onChange(nextValue.toLowerCase());
            }}
            onBlur={() => setHexDraft(value.toUpperCase())}
          />
        </label>
        <div className="color-presets" role="group" aria-label="Warna pilihan">
          {["#FFFFFF", "#C4F27A", "#A78BFA", "#60A5FA", "#F472B6", "#F97316", "#EF4444", "#171321"].map((preset) => (
            <button
              key={preset}
              type="button"
              className={value.toUpperCase() === preset ? "is-selected" : ""}
              style={{ backgroundColor: preset }}
              aria-label={`Pilih warna ${preset}`}
              title={preset}
              onClick={() => { onChange(preset.toLowerCase()); setOpen(false); }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="color-control">
      <span className="color-label">{label}</span>
      <details
        className="color-picker"
        onToggle={handleToggle}
      >
        <summary className="color-picker-trigger" aria-label={`Pilih ${label.toLowerCase()}`}>
          <span className="color-swatch" style={{ backgroundColor: value }} />
          <code>{value.toUpperCase()}</code>
          <span className="color-chevron" aria-hidden="true" />
        </summary>
        {open && createPortal(panel, document.body)}
      </details>
    </div>
  );
}

async function requestPythonImage(form) {
  const response = await fetch("/api/image-tools", { method: "POST", body: form });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.error || "Worker Python gagal memproses gambar.");
  }
  const blob = await response.blob();
  if (blob.type !== "image/png") throw new Error("Worker Python mengembalikan format gambar yang tidak valid.");
  return blob;
}

async function readEntries(file) {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("File Excel tidak memiliki sheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: "" });
  const nameColumns = (rows[0] || []).reduce((columns, header, index) => {
    if (String(header).trim().toLowerCase() === "nama") columns.push(index);
    return columns;
  }, []);
  const partnerColumn = (rows[0] || []).findIndex((header) =>
    /^(pasangan|partner|istri|suami)$/i.test(String(header).trim())
  );
  if (nameColumns.length === 0) throw new Error('Tidak ditemukan kolom "Nama" pada baris pertama sheet Excel.');
  const entries = nameColumns.flatMap((columnIndex) => rows.slice(1).map((row) => {
    const rawName = String(row[columnIndex] || "").trim();
    let name = rawName;
    let partnerFromName = "";
    const slashIndex = rawName.indexOf("/");
    if (slashIndex >= 0) {
      name = rawName.slice(0, slashIndex).trim();
      partnerFromName = rawName.slice(slashIndex + 1).trim();
    }
    const partner = partnerColumn >= 0 ? String(row[partnerColumn] || "").trim() : partnerFromName;
    return {
      rawName: rawName,
      name,
      number: (columnIndex > 0 && /^\d+$/.test(String(row[columnIndex - 1] ?? "").trim())) ? String(row[columnIndex - 1]).trim() : "",
      partner,
    };
  })).filter((entry) => entry.name && entry.name.toLowerCase() !== "nama")
    .sort((a, b) => Number(a.number) - Number(b.number));

  return entries;
}

const TOOLS = [
  ["stickers", "Stiker nama", "sticker"],
  ["qr", "QR Code", "qr"],
  ["browser", "Browser", "external"],
];

export default function Home() {
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const zipRef = useRef(null);
  const cancelledRef = useRef(false);
  const backgroundCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const baseImageRef = useRef(null);
  const maskSnapshotRef = useRef(null);
  const maskImagePreviewRef = useRef("");
  const paintingRef = useRef(false);
  const strokePointRef = useRef(null);
  const [activeTool, setActiveTool] = useState("stickers");
  const [entries, setEntries] = useState([]);
  const [fileName, setFileName] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#c1c1c1");
  const [textColor, setTextColor] = useState("#000000");
  const [stickerWidth, setStickerWidth] = useState("9");
  const [stickerHeight, setStickerHeight] = useState("2");
  const [stickerShape, setStickerShape] = useState("rounded");
  const [textAlign, setTextAlign] = useState("center");
  const [numberingMode, setNumberingMode] = useState("with");
  const [caseMode, setCaseMode] = useState("normal");
  const [showPartner, setShowPartner] = useState(false);
  const [partnerLayout, setPartnerLayout] = useState("inline");
  const [stickers, setStickers] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [isZipping, setIsZipping] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [processedImage, setProcessedImage] = useState(null);
  const [upscaleFactor, setUpscaleFactor] = useState("2");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageModels, setImageModels] = useState({
    available: false,
    backgroundAiReady: false,
    upscalerAiReady: false,
  });
  const [brushSize, setBrushSize] = useState(32);
  const [brushMode, setBrushMode] = useState("erase");
  const [backgroundDirty, setBackgroundDirty] = useState(false);
  const [backgroundDownload, setBackgroundDownload] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetResults, setAssetResults] = useState([]);
  const [assetSearchBusy, setAssetSearchBusy] = useState(false);
  const [assetSearchError, setAssetSearchError] = useState("");
  const [assetFormat, setAssetFormat] = useState("svg");
  const [assetSource, setAssetSource] = useState("commons");
  const [showDownloadNotice, setShowDownloadNotice] = useState(false);
  const [showAppDownload, setShowAppDownload] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [recentTools, setRecentTools] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem("stikerin-recent-tools-v1") || "[]"); }
    catch { return []; }
  });
  const [appAssets, setAppAssets] = useState([]);
  const [appLoading, setAppLoading] = useState(false);
  const [appError, setAppError] = useState("");
  const [appDownloaded, setAppDownloaded] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserInput, setBrowserInput] = useState("");
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState("");
  const [dismissedDownload, setDismissedDownload] = useState(false);

  useEffect(() => {
    try { if (window.localStorage.getItem("stikerin-app-downloaded-v1") === "true") setAppDownloaded(true); } catch {}
    try { if (window.localStorage.getItem("stikerin-download-dismissed-v1") === "true") setDismissedDownload(true); } catch {}
    try { setIsBrowser(window.navigator.userAgent.includes("Electron")); } catch {}
  }, []);

  function dismissDownload() {
    setShowDownloadNotice(false);
    setShowAppDownload(false);
    try { window.localStorage.setItem("stikerin-download-dismissed-v1", "true"); setDismissedDownload(true); }
    catch { setDismissedDownload(true); }
  }

  async function downloadAppAsset(asset) {
    try {
      toast("Mengunduh " + asset.name + "...", "info", 3000);
      const res = await fetch(asset.browser_download_url);
      if (!res.ok) throw new Error("Gagal mengunduh file");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      try { window.localStorage.setItem("stikerin-app-downloaded-v1", "true"); setAppDownloaded(true); }
      catch { setAppDownloaded(true); }
      toast("Unduhan " + asset.name + " selesai", "success");
      setShowAppDownload(false);
    } catch (e) {
      toast("Gagal mengunduh: " + (e.message || e), "error");
    }
  }

  function openBrowser() {
    const url = browserInput.trim();
    if (!url) return;
    let target = url;
    if (!/^https?:\/\//i.test(target)) {
      target = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(url);
    }
    setBrowserUrl(target);
    setBrowserError("");
    setBrowserLoading(true);
  }

  useEffect(() => {
    if (window.navigator.userAgent.includes("Electron")) return undefined;
    try {
      if (window.localStorage.getItem("stikerin-download-dismissed-v1") === "true") {
        return undefined;
      }
    } catch (storageError) {
      console.warn("Preferensi pemberitahuan unduhan tidak dapat dibaca:", storageError);
    }
    const timeout = window.setTimeout(() => setShowDownloadNotice(true), 2400);
    return () => window.clearTimeout(timeout);
  }, []);
  const [qrText, setQrText] = useState("");
  const [qrSize, setQrSize] = useState(300);
  const [qrColor, setQrColor] = useState("#000000");
  const [qrBgColor, setQrBgColor] = useState("#ffffff");
  const [qrLevel, setQrLevel] = useState("M");
  const [qrType, setQrType] = useState("text");
  const [qrWifiSsid, setQrWifiSsid] = useState("");
  const [qrWifiPass, setQrWifiPass] = useState("");
  const [qrWifiEnc, setQrWifiEnc] = useState("WPA");
  const [qrEmail, setQrEmail] = useState("");
  const [qrPhone, setQrPhone] = useState("");
  const [qrLogo, setQrLogo] = useState(null);
  const [qrLogoPreview, setQrLogoPreview] = useState("");
  const [qrShowLogo, setQrShowLogo] = useState(false);
  const [qrImage, setQrImage] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [resizeFile, setResizeFile] = useState(null);
  const [resizePreview, setResizePreview] = useState("");
  const [resizeWidth, setResizeWidth] = useState("");
  const [resizeHeight, setResizeHeight] = useState("");
  const [resizeResult, setResizeResult] = useState(null);
  const [resizeBusy, setResizeBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [stickerBorder, setStickerBorder] = useState(false);
  const [stickerBorderColor, setStickerBorderColor] = useState("#000000");
  const [stickerBorderWidth, setStickerBorderWidth] = useState(4);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandPalette((v) => !v);
      }
      if (event.key === "Escape") {
        setShowCommandPalette(false);
        setShowAppDownload(false);
        setShowDownloadNotice(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("stikerin-recent-tools-v1", JSON.stringify(recentTools.slice(0, 8))); }
    catch { /* ignore */ }
  }, [recentTools]);

  useEffect(() => {
    if (activeTool && !recentTools.includes(activeTool)) {
      setRecentTools((prev) => [activeTool, ...prev.filter((t) => t !== activeTool)].slice(0, 8));
    }
  }, [activeTool]);

  useEffect(() => {
    if (window.navigator.userAgent.includes("Electron")) return undefined;
    try {
      if (window.localStorage.getItem("stikerin-download-prompt-dismissed-v1") === "true") {
        return undefined;
      }
    } catch (storageError) {
      console.warn("Preferensi pemberitahuan unduhan tidak dapat dibaca:", storageError);
    }
    const timeout = window.setTimeout(() => setShowDownloadNotice(true), 2400);
    return () => window.clearTimeout(timeout);
  }, []);

  function dismissDownloadNotice() {
    dismissDownload();
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/image-tools", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!cancelled && result) {
          setImageModels({
            available: result.available === true,
            backgroundAiReady: result.backgroundAiReady === true,
            upscalerAiReady: result.upscalerAiReady === true,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setImageModels({ available: false, backgroundAiReady: false, upscalerAiReady: false });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!imagePreview) {
      baseImageRef.current = null;
      setBackgroundDirty(false);
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      if (image.naturalWidth * image.naturalHeight > 40000000) {
        setImageError("Gambar melebihi batas aman 40 megapiksel. Pilih gambar yang lebih kecil.");
        return;
      }
      baseImageRef.current = image;
      if (activeTool !== "background") return;
      for (const canvas of [backgroundCanvasRef.current, maskCanvasRef.current]) {
        if (!canvas) continue;
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
      }
      const cachedMask = maskImagePreviewRef.current === imagePreview ? maskSnapshotRef.current : null;
      if (cachedMask) {
        const maskImage = new Image();
        maskImage.onload = () => {
          if (cancelled || !maskCanvasRef.current) return;
          maskCanvasRef.current.getContext("2d").drawImage(maskImage, 0, 0);
          setBackgroundDirty(true);
          renderBackground();
        };
        maskImage.src = cachedMask;
      } else {
        maskSnapshotRef.current = null;
        maskImagePreviewRef.current = imagePreview;
        setBackgroundDirty(false);
        setBackgroundDownload("");
        renderBackground();
      }
    };
    image.onerror = () => {
      if (!cancelled) setImageError("Gambar tidak dapat dibuka.");
    };
    image.src = imagePreview;
    return () => { cancelled = true; };
  }, [imagePreview, activeTool]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => () => {
    if (processedImage?.url) URL.revokeObjectURL(processedImage.url);
  }, [processedImage]);

  useEffect(() => () => {
    if (backgroundDownload) URL.revokeObjectURL(backgroundDownload);
  }, [backgroundDownload]);

  function renderBackground() {
    const canvas = backgroundCanvasRef.current;
    const mask = maskCanvasRef.current;
    const image = baseImageRef.current;
    if (!canvas || !mask || !image) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = "destination-out";
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = "source-over";
  }

  function handleImageFile(file) {
    setImageError("");
    setProcessedImage(null);
    setBackgroundDownload("");
    setBackgroundDirty(false);
    if (!file) return;
    maskSnapshotRef.current = null;
    maskImagePreviewRef.current = "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageFile(null);
      setImageError("Format yang didukung: PNG, JPG, atau WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageFile(null);
      setImageError("Ukuran gambar maksimal 20 MB.");
      return;
    }
    setImageFile(file);
  }

  async function upscaleImage() {
    if (!imagePreview || imageBusy) return;
    setImageBusy(true);
    setImageError("");
    setProcessedImage(null);
    try {
      const image = new Image();
      image.src = imagePreview;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Gambar tidak dapat dibuka."));
      });
      const scale = Number(upscaleFactor);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      if (width > 16384 || height > 16384 || width * height > 40000000) {
        throw new Error("Hasil melebihi batas aman 40 megapiksel. Coba skala 2Ã— atau gambar yang lebih kecil.");
      }
      let blob;
      if (imageModels.available) {
        const form = new FormData();
        form.append("operation", "upscale-ai");
        form.append("scale", String(scale));
        form.append("image", imageFile, imageFile.name);
        blob = await requestPythonImage(form);
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      }
      if (!blob) throw new Error("Gagal mengekspor gambar. Silakan coba file lain.");
      setProcessedImage({
        url: URL.createObjectURL(blob),
        width,
        height,
        name: `${imageFile.name.replace(/\.[^.]+$/, "")}_${scale}x.png`,
      });
      if (imageModels.available) {
        setImageModels((current) => ({ ...current, upscalerAiReady: true }));
      }
    } catch (processingError) {
      setImageError(processingError.message || "Gagal memproses gambar.");
    } finally {
      setImageBusy(false);
    }
  }

  function getBrushPoint(event) {
    const canvas = backgroundCanvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
      scale: canvas.width / bounds.width,
    };
  }

  function startBrushStroke(event) {
    if (!baseImageRef.current || !maskCanvasRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    paintingRef.current = true;
    const point = getBrushPoint(event);
    strokePointRef.current = point;
    const context = maskCanvasRef.current.getContext("2d");
    context.lineWidth = brushSize * point.scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = brushMode === "erase" ? "source-over" : "destination-out";
    context.strokeStyle = "#fff";
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();
    renderBackground();
    setBackgroundDirty(true);
    setBackgroundDownload("");
  }

  function continueBrushStroke(event) {
    if (!paintingRef.current || !maskCanvasRef.current) return;
    event.preventDefault();
    const point = getBrushPoint(event);
    const context = maskCanvasRef.current.getContext("2d");
    context.lineWidth = brushSize * point.scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = brushMode === "erase" ? "source-over" : "destination-out";
    context.strokeStyle = "#fff";
    context.beginPath();
    context.moveTo(strokePointRef.current.x, strokePointRef.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    strokePointRef.current = point;
    renderBackground();
    setBackgroundDirty(true);
    setBackgroundDownload("");
  }

  function stopBrushStroke() {
    if (paintingRef.current && maskCanvasRef.current) {
      maskSnapshotRef.current = maskCanvasRef.current.toDataURL("image/png");
      maskImagePreviewRef.current = imagePreview;
    }
    paintingRef.current = false;
    strokePointRef.current = null;
  }

  function resetBackgroundMask() {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    mask.getContext("2d").clearRect(0, 0, mask.width, mask.height);
    maskSnapshotRef.current = null;
    maskImagePreviewRef.current = imagePreview;
    renderBackground();
    setBackgroundDirty(false);
    setBackgroundDownload("");
  }

  async function removeBackgroundAI() {
    if (!imageFile || !imageModels.available || imageBusy) return;
    setImageBusy(true);
    setImageError("");
    setBackgroundDownload("");
    try {
      const form = new FormData();
      form.append("operation", "remove-background-ai");
      form.append("image", imageFile, imageFile.name);
      const blob = await requestPythonImage(form);
      setBackgroundDownload(URL.createObjectURL(blob));
      setImageModels((current) => ({ ...current, backgroundAiReady: true }));
    } catch (processingError) {
      setImageError(processingError.message || "Gagal menghapus latar dengan AI lokal.");
    } finally {
      setImageBusy(false);
    }
  }

  async function exportBackground() {
    const canvas = backgroundCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!canvas || !mask || !backgroundDirty || imageBusy) return;
    setImageBusy(true);
    setImageError("");
    try {
      let blob;
      if (imageModels.available) {
        const maskBlob = await new Promise((resolve) => mask.toBlob(resolve, "image/png"));
        if (!maskBlob) throw new Error("Gagal menyiapkan mask kuas.");
        const form = new FormData();
        form.append("operation", "remove-background");
        form.append("image", imageFile, imageFile.name);
        form.append("mask", maskBlob, "mask.png");
        blob = await requestPythonImage(form);
      } else {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      }
      if (!blob) throw new Error("Gagal mengekspor PNG transparan.");
      setBackgroundDownload(URL.createObjectURL(blob));
    } catch (exportError) {
      setImageError(exportError.message || "Gagal menghapus latar.");
    } finally {
      setImageBusy(false);
    }
  }

  async function searchAssets(event) {
    event.preventDefault();
    const query = assetQuery.trim();
    if (query.length < 2 || assetSearchBusy) return;
    setAssetSearchBusy(true);
    setAssetSearchError("");
    setAssetResults([]);
    try {
      const response = await fetch(`/api/assets?q=${encodeURIComponent(query)}&format=${assetFormat}&source=${assetSource}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Pencarian ${assetFormat.toUpperCase()} gagal.`);
      setAssetResults(data.assets);
      if (data.assets.length === 0) setAssetSearchError(`Tidak ada ${assetFormat.toUpperCase()} yang cocok. Coba kata kunci lain.`);
    } catch (requestError) {
      setAssetSearchError(requestError.message);
    } finally {
      setAssetSearchBusy(false);
    }
  }
  async function regenerateStickers() {
    cancelledRef.current = true;
    if (entries.length === 0) return;
    const widthCm = Number(stickerWidth);
    const heightCm = Number(stickerHeight);
    if (!Number.isFinite(widthCm) || widthCm < 2 || widthCm > 30 ||
        !Number.isFinite(heightCm) || heightCm < 1 || heightCm > 15) {
      zipRef.current = null;
      setStickers([]);
      setStatus("error");
      setError("Ukuran stiker harus antara 2–30 cm untuk lebar dan 1–15 cm untuk tinggi.");
      return;
    }
    cancelledRef.current = false;
    const zip = new JSZip();
    const nextStickers = [];
    setStatus("processing");
    setProgress(0);
    setError("");
    setStickers([]);
    zipRef.current = null;
    try {
      for (let index = 0; index < entries.length; index += 1) {
        if (cancelledRef.current) return;
        let finalNumber = "";
        if (numberingMode === "with") finalNumber = entries[index].number;
        else if (numberingMode === "auto") finalNumber = String(index + 1);
        const { name, number: entryNumber, partner } = entries[index];
        const nameLabel = finalNumber ? `${finalNumber}. ${applyCase(name, caseMode)}` : applyCase(name, caseMode);
        let partnerLabel = "";
        if (showPartner && partner) {
          partnerLabel = "/" + applyCase(partner, caseMode);
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((widthCm * PRINT_DPI) / 2.54);
        canvas.height = Math.round((heightCm * PRINT_DPI) / 2.54);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Browser tidak mendukung pembuatan gambar.");
        const cornerRadius = Math.min(canvas.height * 0.18, canvas.width * 0.08);
        context.beginPath();
        if (stickerShape === "rounded") {
          context.moveTo(cornerRadius, 0);
          context.lineTo(canvas.width - cornerRadius, 0);
          context.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
          context.lineTo(canvas.width, canvas.height - cornerRadius);
          context.quadraticCurveTo(canvas.width, canvas.height, canvas.width - cornerRadius, canvas.height);
          context.lineTo(cornerRadius, canvas.height);
          context.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
          context.lineTo(0, cornerRadius);
          context.quadraticCurveTo(0, 0, cornerRadius, 0);
        } else context.rect(0, 0, canvas.width, canvas.height);
        context.closePath();
        context.clip();
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (stickerBorder) {
          context.lineWidth = stickerBorderWidth;
          context.strokeStyle = stickerBorderColor;
          context.strokeRect(stickerBorderWidth / 2, stickerBorderWidth / 2,
            canvas.width - stickerBorderWidth, canvas.height - stickerBorderWidth);
        }
        context.fillStyle = textColor;
        context.textAlign = textAlign;
        context.textBaseline = "middle";

        const fontSize = Math.min(canvas.height * 0.30, 55);
        const horizontalPadding = canvas.width * 0.08;
        const maxTextWidth = canvas.width - horizontalPadding * 2;
        const maxLines = 3;
        const textX = textAlign === "left" ? horizontalPadding :
          textAlign === "right" ? canvas.width - horizontalPadding : canvas.width / 2;

        const rawLines = partnerLabel ? (partnerLayout === "inline" ? [`${nameLabel} ${partnerLabel}`] : [nameLabel, partnerLabel]) : [nameLabel];

        context.font = `700 ${fontSize}px "Arial", "Microsoft YaHei", sans-serif`;
        const wrappedLines = [];
        for (const raw of rawLines) {
          const words = String(raw).split(/\s+/);
          let current = "";
          for (const word of words) {
            const test = current ? `${current} ${word}` : word;
            if (context.measureText(test).width > maxTextWidth && current) {
              wrappedLines.push(current);
              current = word;
            } else {
              current = test;
            }
          }
          if (current) wrappedLines.push(current);
        }

        const truncatedLines = wrappedLines.slice(0, maxLines);
        const lineHeight = fontSize * 1.3;
        const totalHeight = truncatedLines.length * lineHeight;
        const startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;
        for (let i = 0; i < truncatedLines.length; i += 1) {
          context.fillText(truncatedLines[i], textX, startY + i * lineHeight);
        }
        const canvasBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!canvasBlob) throw new Error(`Gagal membuat gambar untuk nama "${name}".`);
        const stickerBlob = await addPngResolution(canvasBlob, PRINT_DPI);
        if (cancelledRef.current) return;
        zip.file(`Stiker_${String(index + 1).padStart(3, "0")}.png`, stickerBlob);
        nextStickers.push({ name, number: entries[index].number, preview: canvas.toDataURL("image/png") });
        setStickers([...nextStickers]);
        setProgress(Math.round(((index + 1) / entries.length) * 100));
        await new Promise((resolve) => window.setTimeout(resolve, 8));
      }
      if (cancelledRef.current) return;
      zipRef.current = zip;
      setStatus("complete");
    } catch (generationError) {
      if (cancelledRef.current) return;
      console.error("Error membuat stiker:", generationError);
      setStatus("error");
      setError(generationError.message || "Gagal membuat stiker.");
    }
  }

  useEffect(() => {
    regenerateStickers();
  }, [entries, backgroundColor, textColor, stickerWidth, stickerHeight, stickerShape, textAlign, numberingMode, caseMode, showPartner, partnerLayout, stickerBorder, stickerBorderColor, stickerBorderWidth]);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setEntries([]);
    setStickers([]);
    setProgress(0);
    setStatus("loading");
    setFileName(file.name);
    zipRef.current = null;
    try {
      setEntries(await readEntries(file));
    } catch (fileError) {
      console.error("Error membaca Excel:", fileError);
      setStatus("error");
      setError(fileError.message || "Gagal membaca file Excel.");
    }
  }

  async function downloadZip() {
    if (!zipRef.current) return;
    setIsZipping(true);
    try {
      const content = await zipRef.current.generateAsync({ type: "blob" }, (metadata) => setProgress(Math.round(metadata.percent)));
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Export_Stiker_Nama_dan_Nomor.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      console.error("Error membuat ZIP:", downloadError);
      setError("Gagal mengompres file. Silakan coba lagi.");
    } finally {
      setIsZipping(false);
      setProgress(100);
    }
  }

  function toast(message, type = "info", duration = 4000) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    }
  }

  // ---------- QR Code ----------
  async function generateQr() {
    if (!qrText.trim() || typeof window.QRCode !== "function") {
      if (!qrText.trim()) toast("Masukkan teks atau URL terlebih dahulu", "error");
      else toast("Library QR Code belum siap", "error");
      return;
    }
    setQrBusy(true);
    try {
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      document.body.appendChild(container);
      new window.QRCode(container, {
        text: qrText.trim(),
        width: Number(qrSize) || 300,
        height: Number(qrSize) || 300,
        colorDark: qrColor,
        colorLight: qrBgColor,
        correctLevel: (window.QRCode.CorrectLevel && window.QRCode.CorrectLevel[qrLevel]) || window.QRCode.CorrectLevel.M,
      });
      await new Promise((r) => setTimeout(r, 60));
      const canvas = container.querySelector("canvas");
      if (canvas) {
        setQrImage(canvas.toDataURL("image/png"));
      } else {
        const svg = container.querySelector("svg");
        setQrImage("data:image/svg+xml;base64," + btoa(svg.outerHTML));
      }
      document.body.removeChild(container);
      toast("QR Code berhasil dibuat", "success");
    } catch (err) {
      toast("Gagal membuat QR Code: " + (err.message || err), "error");
    } finally {
      setQrBusy(false);
    }
  }

  function downloadQr() {
    if (!qrImage) return;
    const a = document.createElement("a");
    a.href = qrImage;
    a.download = "qrcode.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("QR Code diunduh", "success");
  }

  // ---------- Image Resize ----------
  function handleResizeFile(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast("Format tidak didukung: PNG, JPG, WebP", "error");
      return;
    }
    const url = URL.createObjectURL(file);
    setResizeFile(file);
    setResizePreview(url);
    setResizeResult(null);
    setResizeWidth("");
    setResizeHeight("");
  }

  async function doResize() {
    if (!resizeFile || (!resizeWidth && !resizeHeight)) return;
    setResizeBusy(true);
    try {
      const img = new Image();
      img.src = resizePreview;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      const w = resizeWidth ? Number(resizeWidth) : Math.round((Number(resizeHeight) / origH) * origW);
      const h = resizeHeight ? Number(resizeHeight) : Math.round((Number(resizeWidth) / origW) * origH);
      if (w > 4096 || h > 4096) throw new Error("Ukuran maksimal 4096Ã—4096 px.");
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      setResizeResult(URL.createObjectURL(blob));
      toast("Gambar diubah ukurannya", "success");
    } catch (err) {
      toast("Gagal mengubah ukuran: " + (err.message || err), "error");
    } finally {
      setResizeBusy(false);
    }
  }

  function downloadResize() {
    if (!resizeResult) return;
    const a = document.createElement("a");
    a.href = resizeResult;
    a.download = "resize.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("Hasil resize diunduh", "success");
  }

  function resetProject() {
    setEntries([]);
    setStickers([]);
    setFileName("");
    setProgress(0);
    setStatus("idle");
    setError("");
    zipRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isBusy = status === "processing" || status === "loading";
  const [isBrowser, setIsBrowser] = useState(false);
  const showDownloadButton = !isBrowser && !appDownloaded && !dismissedDownload;

  return (
    <main className="app-shell"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
          if (activeTool === "stickers" && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
            // handled by file input
          } else if (file.type.startsWith("image/")) {
            handleImageFile(file);
          } else {
            toast("Format file tidak didukung untuk drag & drop", "warn");
          }
        }
      }}>
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} role="status" aria-live="polite">
            <span className="toast-icon">
              {t.type === "success" ? <Icon name="check" size={14} /> : t.type === "error" ? <Icon name="close" size={14} /> : t.type === "warn" ? <Icon name="spark" size={14} /> : <Icon name="spark" size={14} />}
            </span>
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
      {dragOver && (
        <div className="drop-overlay">
          <div style={{ textAlign: "center" }}>
            <strong>Lepaskan file di sini</strong>
            <span>Upload gambar atau Excel otomatis</span>
          </div>
        </div>
      )}
      {showCommandPalette && (
        <>
          <div className="command-palette-backdrop" onClick={() => setShowCommandPalette(false)} />
          <div className="command-palette">
            <input autoFocus placeholder="Cari tool... (Ctrl+K)"
              value={commandQuery} onChange={(e) => setCommandQuery(e.target.value)} />
            <div className="command-palette-list">
              {TOOLS.filter(([_, label]) => label.toLowerCase().includes(commandQuery.toLowerCase())).length === 0 && (
                <div className="command-palette-empty">Tidak ada tool yang cocok</div>
              )}
              {TOOLS.filter(([_, label]) => label.toLowerCase().includes(commandQuery.toLowerCase())).map(([tool, label, icon]) => (
                <div key={tool} className={`command-palette-item ${activeTool === tool ? "is-active" : ""}`}
                  onClick={() => { setActiveTool(tool); setShowCommandPalette(false); setCommandQuery(""); }}>
                  <Icon name={icon} size={16} /> {label}
                  <span>{tool.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <header className="topbar">
        <a className="brand hover-lift" href="#" aria-label="Stikerin beranda">
          <span className="brand-mark"><Icon name="spark" size={21} /></span>
          <span>stikerin<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-actions">
          <div className="topbar-note"><span className="online-dot" /> Studio desain Â· file tetap di perangkat</div>
          {showDownloadButton && (
            <button className="desktop-download-link" type="button"
              onClick={async () => {
                setShowAppDownload(true);
                if (appAssets.length === 0 && !appLoading) {
                  setAppLoading(true);
                  setAppError("");
                  try {
                    const res = await fetch("https://api.github.com/repos/BEEYOGS/autonm/releases/latest", {
                      headers: { "Accept": "application/vnd.github+json" },
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || "Gagal mengambil rilis");
                    const assets = (data.assets || []).filter((a) => /\.(exe|msi)$/i.test(a.name));
                    setAppAssets(assets);
                    if (assets.length === 0) setAppError("Belum ada file installer (.exe/.msi) di rilis terbaru.");
                  } catch (e) {
                    setAppError(e.message || "Gagal mengambil daftar unduhan");
                  } finally {
                    setAppLoading(false);
                  }
                }
              }}>
              <Icon name="download" size={15} /> Aplikasi Windows
            </button>
          )}
        </div>
      </header>

      {showAppDownload && (
        <>
          <div className="download-backdrop" onClick={() => setShowAppDownload(false)} />
          <aside className="download-notice" role="dialog" aria-modal="true" aria-live="polite" style={{ width: "min(460px, calc(100vw - 32px))" }}>
            <span className="download-notice-icon"><Icon name="download" size={19} /></span>
            <div className="download-notice-copy" style={{ width: "100%" }}>
              <strong>Unduh Aplikasi Windows</strong>
              <span>Stikerin Studio â€” langsung unduh tanpa keluar halaman.</span>
              {appLoading && <div className="tool-description" style={{ margin: "8px 0 0" }}>Memuat daftar file...</div>}
              {appError && <div className="tool-error" role="status" style={{ marginTop: 8 }}>{appError}</div>}
              {!appLoading && appAssets.length > 0 && (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {appAssets.map((asset) => (
                    <button key={asset.id} type="button"
                      className="primary-tool-button"
                      style={{ justifyContent: "space-between", width: "100%", cursor: "pointer" }}
                      onClick={() => downloadAppAsset(asset)}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Icon name="download" size={16} />
                        {asset.name}
                      </span>
                      <span style={{ opacity: 0.8, fontSize: 9 }}>{Math.round(asset.size / 1024 / 1024 * 10) / 10} MB</span>
                    </button>
                  ))}
                </div>
              )}
              {!appLoading && appAssets.length === 0 && !appError && (
                <a className="secondary-button" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" style={{ marginTop: 10, width: "100%" }}>
                  Buka Halaman Rilis GitHub <Icon name="external" size={14} />
                </a>
              )}
            </div>
            <button className="download-notice-close" type="button" aria-label="Tutup" onClick={() => setShowAppDownload(false)}>
              <Icon name="close" size={16} />
            </button>
          </aside>
        </>
      )}

      {showDownloadNotice && !dismissedDownload && !appDownloaded && (
        <>
          <div className="download-backdrop" onClick={dismissDownloadNotice} />
          <aside className="download-notice" role="status" aria-live="polite">
          <span className="download-notice-icon"><Icon name="download" size={19} /></span>
          <div className="download-notice-copy">
            <strong>Desain lebih nyaman di Windows</strong>
            <span>Pasang Stikerin Studio untuk memakai AI gambar lokal.</span>
            <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              Lihat aplikasi Windows <Icon name="arrow" size={14} />
            </a>
          </div>
          <button className="download-notice-close" type="button" aria-label="Tutup pemberitahuan unduhan"
            onClick={dismissDownloadNotice}><Icon name="close" size={16} /></button>
        </aside>
        </>
      )}

      <nav className="tool-switcher" aria-label="Pilih tool">
        {TOOLS.map(([tool, label, icon]) => (
          <button key={tool} type="button" className={activeTool === tool ? "is-active" : ""}
            aria-pressed={activeTool === tool} onClick={() => setActiveTool(tool)}>
            <Icon name={icon} size={17} />{label}
          </button>
        ))}
      </nav>

      {activeTool === "stickers" && (
        <>
          <section className="hero">
            <div className="eyebrow"><span /> STIKER NAMA &amp; NOMOR</div>
            <h1>Dari spreadsheet,<br />jadi <span>stiker keren.</span></h1>
            <p>Upload daftar nama, atur warna sesukamu, lalu unduh semua stiker siap cetak sekaligus.</p>
          </section>
          <section className="workspace" aria-label="Buat stiker">
            <div className="setup-card glass-panel slide-up">
              <div className="section-heading">
                <div><div className="section-kicker">MULAI DI SINI</div><h2>Siapkan stikermu</h2></div>
                <span className="step-pill"><span>01</span> / 02</span>
              </div>
              <div className={`dropzone animate-in hover-lift ${fileName ? "has-file" : ""}`} role="button" tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]); }}>
                <span className="upload-icon"><Icon name={fileName ? "file" : "upload"} size={23} /></span>
                <span className="drop-copy"><strong>{fileName || "Klik untuk upload file Excel"}</strong>
                  <span>{fileName ? "File siap diproses" : "atau tarik file ke sini Â· .XLSX, .XLS"}</span></span>
                {fileName ? <button type="button" className="clear-file" aria-label="Hapus file" onClick={(event) => {
                  event.stopPropagation(); resetProject();
                }}><Icon name="close" size={17} /></button> :
                  <span className="browse-label">Pilih file <Icon name="arrow" size={15} /></span>}
              </div>
              <input ref={fileInputRef} className="visually-hidden" type="file" accept=".xlsx,.xls"
                onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; handleFile(file); }} />
              <div className="file-hint"><Icon name="check" size={14} /> Pastikan kolom <b>Nama</b> ada di baris pertama</div>
              <div className="settings-divider" />
              <div className="settings-heading"><span className="settings-icon"><Icon name="spark" size={18} /></span>
                <div><h3>Atur tampilan</h3><p>Pilih kombinasi warna favoritmu</p></div></div>
              <div className="color-controls glass-panel">
                <ColorPicker label="Warna background" value={backgroundColor} onChange={setBackgroundColor} />
                <ColorPicker label="Warna teks" value={textColor} onChange={setTextColor} />
              </div>
              <div className="sticker-settings glass-panel slide-up">
                <div className="sticker-settings-title"><span>Ukuran stiker</span><span>DALAM CM</span></div>
                <div className="dimension-controls">
                  <label className="dimension-control"><span>Lebar</span><span className="dimension-input">
                    <input type="number" min="2" max="30" step="0.1" value={stickerWidth} aria-label="Lebar stiker dalam sentimeter"
                      onChange={(event) => setStickerWidth(event.target.value)}
                      onBlur={() => { const value = Number(stickerWidth); setStickerWidth(String(Math.min(30, Math.max(2, Number.isFinite(value) ? value : 9)))); }} />
                    <span>cm</span></span></label><span className="dimension-times">Ã—</span>
                  <label className="dimension-control"><span>Tinggi</span><span className="dimension-input">
                    <input type="number" min="1" max="15" step="0.1" value={stickerHeight} aria-label="Tinggi stiker dalam sentimeter"
                      onChange={(event) => setStickerHeight(event.target.value)}
                      onBlur={() => { const value = Number(stickerHeight); setStickerHeight(String(Math.min(15, Math.max(1, Number.isFinite(value) ? value : 2)))); }} />
                    <span>cm</span></span></label>
                </div>
                <div className="option-row"><span className="option-label">Bentuk sudut</span><div className="segmented-control" role="group" aria-label="Bentuk stiker">
                  {[["rounded", "Rounded"], ["square", "Kotak"]].map(([shape, label]) => <button key={shape} type="button"
                    className={stickerShape === shape ? "is-selected" : ""} aria-pressed={stickerShape === shape}
                    onClick={() => setStickerShape(shape)}>{label}</button>)}</div></div>
                <div className="option-row"><span className="option-label">Align teks</span><div className="segmented-control align-control" role="group" aria-label="Perataan teks">
                  {[["left", "Kiri"], ["center", "Tengah"], ["right", "Kanan"]].map(([alignment, label]) => <button key={alignment}
                    type="button" className={textAlign === alignment ? "is-selected" : ""} aria-pressed={textAlign === alignment}
                    onClick={() => setTextAlign(alignment)}>{label}</button>)}</div></div>
                <div className="option-row"><span className="option-label">Mode nomor</span><div className="segmented-control" role="group" aria-label="Mode nomor">
                  {[
                    ["with", "Pakai Nomor dari Excel"],
                    ["auto", "Nomor Otomatis"],
                    ["none", "Hanya Nama"]
                  ].map(([value, label]) => <button key={value} type="button"
                    className={numberingMode === value ? "is-selected" : ""} aria-pressed={numberingMode === value}
                    onClick={() => { setNumberingMode(value); regenerateStickers(); }}>{label}</button>)}</div></div>
                <div className="option-row"><span className="option-label">Format nama</span><div className="segmented-control" role="group" aria-label="Format nama">
                  {[
                    ["normal", "Normal"],
                    ["upper", "UPPERCASE"],
                    ["lower", "lowercase"]
                  ].map(([value, label]) => <button key={value} type="button"
                    className={caseMode === value ? "is-selected" : ""} aria-pressed={caseMode === value}
                    onClick={() => { setCaseMode(value); regenerateStickers(); }}>{label}</button>)}</div></div>
                <div className="option-row"><span className="option-label">Pasangan</span><div className="segmented-control" role="group" aria-label="Tampilkan pasangan">
                  {[
                    ["off", "Off"],
                    ["on", "On"]
                  ].map(([value, label]) => <button key={value} type="button"
                    className={(showPartner && value === "on") || (!showPartner && value === "off") ? "is-selected" : ""} aria-pressed={showPartner === (value === "on")}
                    onClick={() => { setShowPartner(value === "on"); regenerateStickers(); }}>{label}</button>)}</div></div>
                {showPartner && <div className="option-row"><span className="option-label">Layout</span><div className="segmented-control" role="group" aria-label="Layout pasangan">
                  {[
                    ["inline", "Sebaris"],
                    ["block", "Berbaris"]
                  ].map(([value, label]) => <button key={value} type="button"
                    className={partnerLayout === value ? "is-selected" : ""} aria-pressed={partnerLayout === value}
                    onClick={() => { setPartnerLayout(value); regenerateStickers(); }}>{label}</button>)}</div></div>}
                <div className="option-row"><span className="option-label">Bingkai tepi</span>
                  <div className="segmented-control" role="group" aria-label="Bingkai stiker">
                    <button key="off" type="button"
                      className={!stickerBorder ? "is-selected" : ""} aria-pressed={!stickerBorder}
                      onClick={() => setStickerBorder(false)}>Off</button>
                    <button key="on" type="button"
                      className={stickerBorder ? "is-selected" : ""} aria-pressed={stickerBorder}
                      onClick={() => setStickerBorder(true)}>On</button>
                  </div>
                </div>
                {stickerBorder && <div className="field-group" style={{ marginTop: 8 }}>
                  <div className="color-controls" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
                    <ColorPicker label="Warna bingkai" value={stickerBorderColor} onChange={setStickerBorderColor} />
                    <div className="field-group" style={{ margin: 0 }}><label className="field-label">Tebal (px)</label>
                      <input className="input-field" type="number" min="1" max="20" value={stickerBorderWidth}
                        onChange={(e) => setStickerBorderWidth(e.target.value)} /></div>
                  </div>
                  <span className="badge purple">Bingkai aktif</span>
                </div>}
              </div>
              <div className="size-note"><span className="size-note-icon"><Icon name="layers" size={16} /></span>
                <span>Ukuran stiker <b>{stickerWidth || "0"} Ã— {stickerHeight || "0"} cm</b>
                  <small>Resolusi cetak {PRINT_DPI} DPI Â· {stickerShape === "rounded" ? "Rounded" : "Kotak"}</small></span>
                <span className="size-tag">SIAP CETAK</span></div>
            </div>
            <div className="preview-panel">
              <div className="preview-heading"><div><div className="section-kicker">LIVE PREVIEW</div><h2>Lihat hasilnya</h2></div>
                <span className={`status-chip ${status === "complete" ? "is-ready" : ""}`}><span />
                  {status === "complete" ? "Siap diunduh" : isBusy ? "Sedang dibuat" : "Menunggu file"}</span></div>
              <div className="sticker-stage">{stickers[0] ? <div className="hero-sticker">
                <img src={stickers[0].preview} alt={`Preview stiker ${stickers[0].name}`} /><span className="sticker-caption">CONTOH STIKER</span>
              </div> : <div className="empty-preview"><span className="empty-art"><span className="empty-art-back" />
                <span className="empty-art-front"><Icon name="spark" size={25} /></span></span>
                <strong>Preview-mu tampil di sini</strong><span>Upload file Excel untuk mulai membuat stiker</span></div>}</div>
              <div className="preview-footer"><div className="counter"><span className="counter-icon"><Icon name="layers" size={17} /></span>
                <span><b>{stickers.length}</b> <small>/ {entries.length || "â€”"} stiker</small></span></div>
                {entries.length > 0 && <span className="progress-label">{status === "complete" ? "Semua stiker selesai" : `${progress}% selesai`}</span>}</div>
              <div className="progress-track" role="progressbar" aria-label="Progres pembuatan stiker"
                aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
            </div>
          </section>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <section className="results-section slide-up"><div className="results-heading"><div><div className="section-kicker">HASIL GENERATOR</div>
            <h2>Stiker kamu <span>{stickers.length > 0 ? stickers.length : ""}</span></h2></div>
            {status === "complete" && <button className="download-button" type="button" onClick={downloadZip} disabled={isZipping}>
              <Icon name="download" size={18} />{isZipping ? "Menyiapkan ZIP..." : "Download semua"}</button>}</div>
            {stickers.length > 1 ? <div className="sticker-grid stagger">{stickers.slice(1).map((sticker, index) => <article className="sticker-card hover-lift scale-in"
              key={`${sticker.number}-${index}`}><img src={sticker.preview} alt={`Stiker ${sticker.number}: ${sticker.name}`} />
              <div className="sticker-card-info"><span>STIKER {String(index + 2).padStart(2, "0")}</span>
                <b>{sticker.number}. {sticker.name}</b></div></article>)}</div> :
              status === "complete" ? <div className="single-result-note"><Icon name="check" size={16} /> Semua stiker siap. ZIP berisi gambar PNG resolusi tinggi.</div> :
                <div className="results-placeholder"><span>Setiap stiker yang dibuat akan muncul di sini</span>
                  <span className="placeholder-dots"><i /><i /><i /></span></div>}
          </section>
        </>
      )}

      {(activeTool === "upscale" || activeTool === "background") && (
        <section className="editor-page">
          <div className="tool-page-heading">
            <div className="section-kicker">{activeTool === "upscale" ? "PEMBESAR GAMBAR" : "PENGHAPUS LATAR"}</div>
            <h1>{activeTool === "upscale" ? <>Beri asetmu ruang<br /><span>untuk tampil besar.</span></> : <>Hapus latar gambar<br /><span>secara otomatis.</span></>}</h1>
            <p>AI berjalan di perangkat Anda. Model hanya diunduh saat pertama kali dipakai.</p>
          </div>
          <section className="editor-card">
            <div className="editor-sidebar">
              <div className="section-kicker">SUMBER GAMBAR</div>
              <button className={`dropzone image-dropzone ${imageFile ? "has-file" : ""}`} type="button"
                onClick={() => imageInputRef.current?.click()}><span className="upload-icon"><Icon name="upload" size={22} /></span>
                <span className="drop-copy"><strong>{imageFile?.name || "Pilih gambar"}</strong>
                  <span>PNG, JPG, WebP Â· maksimal 20 MB</span></span><Icon name="arrow" size={16} /></button>
              <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; handleImageFile(file); }} />
              {imageError && <div className="tool-error" role="alert">{imageError}</div>}
              {activeTool === "upscale" && <>
                <label className="editor-label" htmlFor="upscale-factor">Skala pembesaran</label>
                <select id="upscale-factor" className="editor-select" value={upscaleFactor} onChange={(event) => setUpscaleFactor(event.target.value)}>
                  <option value="2">2Ã— Â· seimbang</option><option value="4">4Ã— Â· maksimal</option>
                </select>
                <p className="tool-description">
                  {imageModels.available
                    ? imageModels.upscalerAiReady
                      ? "Real-ESRGAN x4v3 siap Â· AI lokal."
                      : "AI lokal Real-ESRGAN Â· unduhan pertama sekitar 5 MB."
                    : "AI tersedia di aplikasi desktop. Mode browser memperbesar tanpa AI."}
                  {" "}Pemrosesan memakai CPU dan berusaha memulihkan detail gambar.
                </p>
                <button type="button" className="primary-tool-button full-button" onClick={upscaleImage} disabled={!imageFile || imageBusy}>
                  {imageBusy ? <><span className="spinner" /> {imageModels.upscalerAiReady ? "Meningkatkan kualitas..." : "Menyiapkan AI lokal..."}</> :
                    <><Icon name="image" size={17} /> {imageModels.available ? "AI perbesar & jernihkan" : "Perbesar gambar"}</>}</button>
              </>}
              {activeTool === "background" && <>
                <p className="tool-description">
                  Hapus latar gambar secara otomatis dengan AI lokal di perangkat Anda.{" "}
                  {imageModels.available
                    ? imageModels.backgroundAiReady
                      ? "AI lokal siap. Hapus latar dalam beberapa detik."
                      : "Unduhan model AI pertama sekitar 214 MB."
                    : "AI lokal tersedia di aplikasi desktop Stikerin Studio."}
                  Hasil bisa langsung diunduh sebagai PNG transparan.
                </p>
                <button type="button" className="primary-tool-button full-button" onClick={removeBackgroundAI}
                  disabled={!imageFile || !imageModels.available || imageBusy}>
                  {imageBusy ? <><span className="spinner" /> {imageModels.backgroundAiReady ? "Menghapus latar..." : "Mengunduh model AI..."}</> :
                    <><Icon name="spark" size={17} /> Hapus Latar Otomatis Â· AI Lokal</>}</button>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <label className="field-label">Hasil hapus latar</label>
                  <button type="button" className="input-field" style={{ justifyContent: "space-between", textAlign: "left", background: "#15121d" }}
                    disabled={!backgroundDownload} onClick={() => { if (backgroundDownload) window.open(backgroundDownload, "_blank"); }}>
                    {backgroundDownload ? "PNG transparan siap diunduh" : "Belum ada hasil"}
                    <Icon name={backgroundDownload ? "download" : "close"} size={14} style={{ marginLeft: 8 }} />
                  </button>
                  {backgroundDownload && <a className="download-button result-download" href={backgroundDownload}
                    download={`${imageFile?.name.replace(/\.[^.]+$/, "") || "gambar"}_transparan.png`}
                    style={{ marginTop: 8 }}><Icon name="download" size={16} /> Unduh PNG Transparan</a>}
                </div>
                <div className="editor-action-row"><button type="button" className="subtle-button" onClick={resetBackgroundMask} disabled={!imageFile}>
                  <Icon name="undo" size={15} /> Reset</button></div>
              </>}
              {processedImage && activeTool === "upscale" && <a className="download-button result-download" href={processedImage.url} download={processedImage.name}>
                <Icon name="download" size={17} /> Unduh PNG Â· {processedImage.width} Ã— {processedImage.height}</a>}
              {backgroundDownload && activeTool === "background" && <a className="download-button result-download" href={backgroundDownload}
                download={`${imageFile?.name.replace(/\.[^.]+$/, "") || "gambar"}_transparan.png`}><Icon name="download" size={17} /> Unduh PNG transparan</a>}
            </div>
            <div className={`editor-stage ${activeTool === "background" ? "checkerboard" : ""}`}>
              {imagePreview ? activeTool === "upscale" ? <>
                <img className="editor-preview" src={processedImage?.url || imagePreview} alt="Pratinjau gambar" />
                <span className="stage-caption">{processedImage ? "HASIL PERBESAR" : "GAMBAR ASLI"}</span>
              </> : activeTool === "background" ? backgroundDownload ? <>
                <img className="editor-preview" src={backgroundDownload} alt="Hasil hapus latar" />
                <span className="stage-caption">LATAR TELAH DIHAPUS Â· PNG TRANSPARAN</span>
              </> : <>
                <img className="editor-preview" src={imagePreview} alt="Gambar asli" />
                <span className="stage-caption">GAMBAR ASLI Â· KLIK "HAPUS LATAR OTOMATIS"</span>
              </> : <>
                <canvas ref={backgroundCanvasRef} className="background-canvas" aria-label="Kanvas penghapus latar"
                  onPointerDown={startBrushStroke} onPointerMove={continueBrushStroke}
                  onPointerUp={stopBrushStroke} onPointerCancel={stopBrushStroke} />
                <canvas ref={maskCanvasRef} className="mask-canvas" aria-hidden="true" />
                <span className="stage-caption">{backgroundDirty ? "LATAR DIEDIT" : "SERET KUAS PADA LATAR"}</span>
              </> : <div className="empty-editor"><span className="empty-art"><span className="empty-art-back" />
                <span className="empty-art-front"><Icon name={activeTool === "upscale" ? "image" : "brush"} size={25} /></span></span>
                <strong>Pratinjau gambar akan tampil di sini</strong><span>Pilih file untuk mulai mengedit</span></div>}
            </div>
          </section>
        </section>
      )}

      {activeTool === "assets" && (
        <section className="asset-page">
          <div className="tool-page-heading">
            <div className="section-kicker">PERPUSTAKAAN ASET</div>
            <h1>Temukan elemen<br /><span>untuk desainmu.</span></h1>
            <p>Cari ilustrasi SVG, cek lisensi, lalu unduh SVG sumber dan PNG untuk kebutuhan desain.</p>
          </div>
          <section className="asset-search-panel">
            <form className="asset-search-form" onSubmit={searchAssets}>
              <label className="visually-hidden" htmlFor="asset-search">Cari ilustrasi {assetFormat.toUpperCase()}</label>
              <Icon name="search" size={20} />
              <input id="asset-search" type="search" maxLength="100" placeholder={`Contoh: coffee plant, flower, abstract shape... (${assetFormat.toUpperCase()})`}
                value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} />
              <div className="segmented-control" role="group" aria-label="Format aset">
                {["svg", "png"].map((fmt) => <button key={fmt} type="button"
                  className={assetFormat === fmt ? "is-selected" : ""} aria-pressed={assetFormat === fmt}
                  onClick={() => setAssetFormat(fmt)}>{fmt.toUpperCase()}</button>)}
              </div>
              <button className="primary-tool-button" type="submit" disabled={assetSearchBusy || assetQuery.trim().length < 2}>
                {assetSearchBusy ? <><span className="spinner" /> Mencari</> : `Cari ${assetFormat.toUpperCase()}`}<Icon name="arrow" size={16} /></button>
            </form>
            <div className="asset-search-hint"><span>SUMBER</span> Wikimedia Commons Â· {assetFormat.toUpperCase()} lisensi bebas Â· hasil memuat tautan sumber dan lisensi.</div>
          </section>
          {assetSearchError && <div className="tool-error" role="status">{assetSearchError}</div>}
          {assetResults.length > 0 && <div className="asset-results-grid">
            {assetResults.map((asset) => <article className="asset-result-card" key={asset.id}>
              <a className="asset-artwork" href={asset.pageUrl} target="_blank" rel="noreferrer">
                <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" />
              </a>
              <div className="asset-info"><strong title={asset.title}>{asset.title}</strong>
                <span>Lisensi: {asset.license}</span>{asset.author && <span>Kontributor: {asset.author}</span>}
                <div className="asset-actions">
                  <a href={`/api/assets/download?title=${encodeURIComponent(asset.fileTitle)}&format=${asset.format === "png" ? "png" : "svg"}`} download>
                    {asset.format.toUpperCase()} <Icon name="download" size={14} /></a>
                </div>
                <a className="asset-source" href={asset.pageUrl} target="_blank" rel="noreferrer">Sumber &amp; lisensi <Icon name="external" size={13} /></a>
              </div>
            </article>)}
          </div>}
          {!assetResults.length && !assetSearchError && <div className="asset-empty">
            <span className="empty-art"><span className="empty-art-back" /><span className="empty-art-front"><Icon name="search" size={23} /></span></span>
            <strong>{assetSearchBusy ? "Mencari aset berlisensi..." : "Kata kunci jadi inspirasi pertama."}</strong>
            <span>{assetSearchBusy ? `Sedang mengambil hasil ${assetFormat.toUpperCase()} dari Wikimedia Commons.` : `Cari untuk menemukan ilustrasi ${assetFormat.toUpperCase()} yang bisa diunduh.`}</span>
          </div>}
          <aside className="zonalogo-card"><div><div className="section-kicker">PENCARIAN LOGO &amp; BRAND</div>
            <h2>Jelajahi katalog Zonalogo</h2><p>Buka sumber resminya untuk mencari logo, bendera, dan emblem. Hak merek dan aturan penggunaan mengikuti pemilik masing-masing.</p></div>
            <a className="secondary-button" href="https://zonalogo.com/browse" target="_blank" rel="noreferrer">Buka Zonalogo <Icon name="external" size={16} /></a>
          </aside>
        </section>
      )}

      {activeTool === "qr" && (
        <section className="editor-page">
          <div className="tool-page-heading">
            <div className="section-kicker">QR CODE GENERATOR</div>
            <h1>Buat QR Code<br /><span>dari teks atau URL.</span></h1>
            <p className="tool-intro">Hasilkan QR Code instan untuk kontak, situs, Wi-Fi, atau teks apa saja. Hasil bisa langsung diunduh sebagai PNG.</p>
          </div>
          <section className="editor-card">
            <div className="editor-sidebar">
              <div className="section-card">
                <div className="section-kicker">KONFIGURASI</div>
                <div className="field-group">
                  <label className="field-label">Teks atau URL</label>
                  <input className="input-field" type="text" placeholder="Contoh: https://stikerin.com"
                    value={qrText} onChange={(e) => setQrText(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Ukuran (px)</label>
                  <input className="input-field" type="number" min="100" max="1024" value={qrSize}
                    onChange={(e) => setQrSize(e.target.value)} />
                </div>
                <div className="color-controls" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <ColorPicker label="Warna titik" value={qrColor} onChange={setQrColor} />
                  <ColorPicker label="Warna background" value={qrBgColor} onChange={setQrBgColor} />
                </div>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <label className="field-label">Model koreksi (error correction)</label>
                  <div className="segmented-control" role="group" aria-label="Tingkat koreksi QR">
                    {["L", "M", "Q", "H"].map((lvl) => <button key={lvl} type="button"
                      className={qrLevel === lvl ? "is-selected" : ""} aria-pressed={qrLevel === lvl}
                      onClick={() => setQrLevel(lvl)}>{lvl}</button>)}
                  </div>
                  <p className="tool-description" style={{ marginTop: 6, fontSize: "9px" }}>
                    L = ringan (7%), M = sedang (15%), Q = kuat (25%), H = sangat kuat (30%). Semakin tinggi, semakin tahan rusak tapi ukuran QR semakin padat.
                  </p>
                </div>
                <button type="button" className="primary-tool-button full-button" onClick={generateQr} disabled={qrBusy || !qrText.trim()}>
                  {qrBusy ? <><span className="spinner" /> Membuat...</> : <><Icon name="qr" size={17} /> Buat QR Code</>}</button>
              </div>
            </div>
            <div className="editor-stage">
              {qrImage ? <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <img src={qrImage} alt="QR Code" style={{ maxWidth: 260, maxHeight: 260, imageRendering: "pixelated" }} />
                  <button type="button" className="primary-tool-button" onClick={downloadQr}>
                    <Icon name="download" size={16} /> Unduh QR Code PNG
                  </button>
                </div>
              </> : <div className="empty-editor"><span className="empty-art"><span className="empty-art-back" /><span className="empty-art-front"><Icon name="qr" size={25} /></span></span>
                <strong>QR Code akan muncul di sini</strong><span>Isi teks atau URL, lalu klik Buat QR Code</span></div>}
            </div>
          </section>
        </section>
      )}

      {activeTool === "resize" && (
        <section className="editor-page">
          <div className="tool-page-heading">
            <div className="section-kicker">UBAH UKURAN GAMBAR</div>
            <h1>Perbesar atau<br /><span>perkecil gambar.</span></h1>
            <p className="tool-intro">Ubah ukuran gambar dengan mempertahankan proporsi atau menyesukai ukuran baru. Hasil diekspor sebagai PNG.</p>
          </div>
          <section className="editor-card">
            <div className="editor-sidebar">
              <div className="section-card">
                <div className="section-kicker">SUMBER</div>
                <button className="dropzone image-dropzone" type="button" onClick={() => imageInputRef.current?.click()}>
                  <span className="upload-icon"><Icon name="upload" size={22} /></span>
                  <span className="drop-copy"><strong>{resizeFile?.name || "Pilih gambar"}</strong>
                    <span>PNG, JPG, WebP Â· maksimal 20 MB</span></span><Icon name="arrow" size={16} /></button>
                <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; handleResizeFile(file); }} />
                {resizePreview && <div className="tool-error" role="status" style={{ borderColor: "#4a7c17", color: "#c4f27a", background: "#17141f" }}>{resizeFile?.name} siap diubah ukurannya</div>}
              </div>
              <div className="section-card">
                <div className="section-kicker">DIMENSI</div>
                <div className="field-group">
                  <label className="field-label">Lebar (px)</label>
                  <input className="input-field" type="number" min="1" max="4096" value={resizeWidth}
                    onChange={(e) => setResizeWidth(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Tinggi (px)</label>
                  <input className="input-field" type="number" min="1" max="4096" value={resizeHeight}
                    onChange={(e) => setResizeHeight(e.target.value)} />
                </div>
                <p className="tool-description">Kosongkan salah satu sisi untuk mempertahankan rasio aspek.</p>
                <button type="button" className="primary-tool-button full-button" onClick={doResize} disabled={resizeBusy || !resizeFile || (!resizeWidth && !resizeHeight)}>
                  {resizeBusy ? <><span className="spinner" /> Mengubah ukuran...</> : <><Icon name="resize" size={17} /> Ubah ukuran gambar</>}</button>
              </div>
            </div>
            <div className="editor-stage">
              {resizePreview ? <>
                <img className="editor-preview" src={resizePreview} alt="Pratinjau gambar" />
                <span className="stage-caption">GAMBAR ASLI</span>
              </> : <div className="empty-editor"><span className="empty-art"><span className="empty-art-back" /><span className="empty-art-front"><Icon name="resize" size={25} /></span></span>
                <strong>Pratinjau gambar akan tampil di sini</strong><span>Pilih file untuk mulai mengubah ukuran</span></div>}
              {resizeResult && <>
                <div className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 14, maxWidth: 320 }}>
                  <img src={resizeResult} alt="Hasil resize" style={{ width: "100%", height: "auto", borderRadius: 8, background: "#15121d" }} />
                  <button type="button" className="primary-tool-button full-button" onClick={downloadResize} style={{ marginTop: 10 }}>
                    <Icon name="download" size={16} /> Unduh Hasil Resize
                  </button>
                </div>
              </>}
            </div>
          </section>
        </section>
      )}

      {activeTool === "browser" && (
        <section className="editor-page">
          <div className="tool-page-heading">
            <div className="section-kicker">BROWSER</div>
            <h1>Cari &amp; jelajahi<br /><span>tanpa keluar app.</span></h1>
            <p className="tool-intro">Ketik kata kunci atau URL, lalu tekan Enter. Hasil pencarian akan tampil di bawah.</p>
          </div>
          <section className="editor-card" style={{ gridTemplateColumns: "1fr" }}>
            <div className="editor-sidebar" style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
              <div className="asset-search-form" style={{ width: "100%" }}>
                <Icon name="search" size={20} />
                <input type="search" placeholder="Cari di DuckDuckGo atau masukkan URL..."
                  value={browserInput} onChange={(e) => setBrowserInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") openBrowser(); }} />
                <button className="primary-tool-button" type="button" onClick={openBrowser}
                  disabled={browserInput.trim().length < 2}>
                  <Icon name="arrow" size={16} /> Cari
                </button>
              </div>
              {browserError && <div className="tool-error" role="status" style={{ marginTop: 10 }}>{browserError}</div>}
              {browserUrl && (
                <div style={{ marginTop: 14, border: "1px solid #342b43", borderRadius: 12, overflow: "hidden", background: "#15121d" }}>
                  <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #342b43", background: "#1b1725" }}>
                    <span style={{ color: "#a59bb7", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{browserUrl}</span>
                    <button className="subtle-button" type="button" onClick={() => { setBrowserUrl(""); setBrowserInput(""); setBrowserError(""); }} style={{ minHeight: 30, padding: "0 10px" }}>
                      <Icon name="close" size={14} /> Tutup
                    </button>
                  </div>
                  <iframe src={browserUrl} title="Browser" loading="lazy"
                    style={{ width: "100%", height: 600, border: 0, background: "#fff" }}
                    onLoad={() => setBrowserLoading(false)}
                    onError={() => { setBrowserError("Halaman tidak dapat dimuat (mungkin diblokir oleh situs)."); setBrowserLoading(false); }} />
                  {browserLoading && <div className="tool-description" style={{ padding: 14 }}>Memuat halaman...</div>}
                </div>
              )}
              {!browserUrl && (
                <div className="empty-editor" style={{ marginTop: 24 }}>
                  <span className="empty-art"><span className="empty-art-back" /><span className="empty-art-front"><Icon name="external" size={25} /></span></span>
                  <strong>Browser siap digunakan</strong>
                  <span>Ketik kata kunci atau URL di atas, lalu tekan Enter atau klik Cari</span>
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      <footer className="page-footer"><span>Stikerin Studio Â· dibuat untuk proses desain yang lebih praktis.</span>
        <span>Privat di perangkat <span className="footer-lock">â—†</span></span><span className="made-by">MADE BY <b>YD</b></span></footer>

    </main>
  );
}
