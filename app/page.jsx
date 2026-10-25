"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "@e965/xlsx";

const PRINT_DPI = 300;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

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
  const [hue, setHue] = useState(color.hue);
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const [opensUp, setOpensUp] = useState(false);

  useEffect(() => {
    setHue(hexToHsv(value).hue);
    setHexDraft(value.toUpperCase());
  }, [value]);

  function updateFromPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const brightness = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    onChange(hsvToHex(hue, saturation, brightness));
  }

  function updateColor(nextHue, saturation = color.saturation, brightness = color.value) {
    setHue(nextHue);
    onChange(hsvToHex(nextHue, saturation, brightness));
  }

  function handleFieldKeyDown(event) {
    const step = event.shiftKey ? 0.1 : 0.025;
    if (event.key === "ArrowLeft") updateColor(hue, color.saturation - step, color.value);
    else if (event.key === "ArrowRight") updateColor(hue, color.saturation + step, color.value);
    else if (event.key === "ArrowUp") updateColor(hue, color.saturation, color.value + step);
    else if (event.key === "ArrowDown") updateColor(hue, color.saturation, color.value - step);
    else return;
    event.preventDefault();
  }

  return (
    <div className="color-control">
      <span className="color-label">{label}</span>
      <details
        className="color-picker"
        onToggle={(event) => {
          if (!event.currentTarget.open) {
            setOpensUp(false);
            return;
          }
          setOpensUp(window.innerHeight - event.currentTarget.getBoundingClientRect().bottom < 250);
        }}
      >
        <summary className="color-picker-trigger" aria-label={`Pilih ${label.toLowerCase()}`}>
          <span className="color-swatch" style={{ backgroundColor: value }} />
          <code>{value.toUpperCase()}</code>
          <span className="color-chevron" aria-hidden="true" />
        </summary>
        <div className={`color-picker-panel ${opensUp ? "opens-up" : ""}`}>
          <div
            className="color-sv-field"
            role="group"
            aria-label={`${label}: atur saturasi dan kecerahan`}
            tabIndex={0}
            style={{ "--picker-hue": `hsl(${hue} 100% 50%)` }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => { if (event.buttons) updateFromPointer(event); }}
            onKeyDown={handleFieldKeyDown}
          >
            <span aria-hidden="true" />
          </div>
          <label className="hue-control">
            <span>Rona</span>
            <input
              type="range"
              min="0"
              max="359"
              value={Math.round(hue)}
              aria-label={`Rona ${label.toLowerCase()}`}
              onChange={(event) => updateColor(Number(event.target.value))}
            />
          </label>
          <div className="color-picker-footer">
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
                  onClick={() => onChange(preset.toLowerCase())}
                />
              ))}
            </div>
          </div>
        </div>
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
  if (nameColumns.length === 0) throw new Error('Tidak ditemukan kolom "Nama" pada baris pertama sheet Excel.');
  const entries = nameColumns.flatMap((columnIndex) => rows.slice(1).map((row) => ({
    name: String(row[columnIndex] || "").trim(),
    number: String(row[columnIndex - 1] ?? "").trim(),
  })).filter((entry) => entry.name && entry.name.toLowerCase() !== "nama"))
    .sort((a, b) => Number(a.number) - Number(b.number));
  if (entries.length === 0) throw new Error("Tidak ada nama yang dapat diproses pada file Excel.");
  if (!entries.every((entry) => entry.number && Number.isFinite(Number(entry.number)))) {
    throw new Error('Pastikan setiap nama memiliki nomor yang valid pada kolom "No".');
  }
  return entries;
}

const TOOLS = [
  ["stickers", "Stiker nama", "sticker"],
  ["upscale", "Perbesar", "image"],
  ["background", "Hapus latar", "brush"],
  ["assets", "Cari aset", "search"],
];

export default function Home() {
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const zipRef = useRef(null);
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
  const [pythonImageTools, setPythonImageTools] = useState(false);
  const [brushSize, setBrushSize] = useState(32);
  const [brushMode, setBrushMode] = useState("erase");
  const [backgroundDirty, setBackgroundDirty] = useState(false);
  const [backgroundDownload, setBackgroundDownload] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetResults, setAssetResults] = useState([]);
  const [assetSearchBusy, setAssetSearchBusy] = useState(false);
  const [assetSearchError, setAssetSearchError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/image-tools", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { available: false })
      .then((result) => { if (!cancelled) setPythonImageTools(result.available === true); })
      .catch(() => { if (!cancelled) setPythonImageTools(false); });
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
        throw new Error("Hasil melebihi batas aman 40 megapiksel. Coba skala 2× atau gambar yang lebih kecil.");
      }
      let blob;
      if (pythonImageTools) {
        const form = new FormData();
        form.append("operation", "upscale");
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

  async function exportBackground() {
    const canvas = backgroundCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!canvas || !mask || !backgroundDirty || imageBusy) return;
    setImageBusy(true);
    setImageError("");
    try {
      let blob;
      if (pythonImageTools) {
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
      const response = await fetch(`/api/assets?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pencarian SVG gagal.");
      setAssetResults(data.assets);
      if (data.assets.length === 0) setAssetSearchError("Tidak ada SVG yang cocok. Coba kata kunci lain.");
    } catch (requestError) {
      setAssetSearchError(requestError.message);
    } finally {
      setAssetSearchBusy(false);
    }
  }

  useEffect(() => {
    if (entries.length === 0) return undefined;
    const widthCm = Number(stickerWidth);
    const heightCm = Number(stickerHeight);
    if (!Number.isFinite(widthCm) || widthCm < 2 || widthCm > 30 ||
        !Number.isFinite(heightCm) || heightCm < 1 || heightCm > 15) {
      zipRef.current = null;
      setStickers([]);
      setStatus("error");
      setError("Ukuran stiker harus antara 2–30 cm untuk lebar dan 1–15 cm untuk tinggi.");
      return undefined;
    }
    let cancelled = false;
    async function createStickers() {
      const zip = new JSZip();
      const nextStickers = [];
      setStatus("processing");
      setProgress(0);
      setError("");
      setStickers([]);
      zipRef.current = null;
      try {
        for (let index = 0; index < entries.length; index += 1) {
          if (cancelled) return;
          const { name, number } = entries[index];
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
          context.fillStyle = textColor;
          context.textAlign = textAlign;
          context.textBaseline = "middle";
          const label = `${number}. ${name}`;
          const maxFontSize = canvas.height * 0.322;
          const horizontalPadding = canvas.width * 0.094;
          const maxTextWidth = canvas.width - horizontalPadding * 2;
          const textX = textAlign === "left" ? horizontalPadding :
            textAlign === "right" ? canvas.width - horizontalPadding : canvas.width / 2;
          context.font = `700 ${maxFontSize}px "Arial", "Microsoft YaHei", sans-serif`;
          const measuredWidth = context.measureText(label).width;
          const fontSize = measuredWidth > maxTextWidth ? (maxFontSize * maxTextWidth) / measuredWidth : maxFontSize;
          context.font = `700 ${fontSize}px "Arial", "Microsoft YaHei", sans-serif`;
          context.fillText(label, textX, canvas.height / 2);
          const canvasBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!canvasBlob) throw new Error(`Gagal membuat gambar untuk nama "${name}".`);
          const stickerBlob = await addPngResolution(canvasBlob, PRINT_DPI);
          if (cancelled) return;
          zip.file(`Stiker_${String(index + 1).padStart(3, "0")}.png`, stickerBlob);
          nextStickers.push({ name, number, preview: canvas.toDataURL("image/png") });
          setStickers([...nextStickers]);
          setProgress(Math.round(((index + 1) / entries.length) * 100));
          await new Promise((resolve) => window.setTimeout(resolve, 8));
        }
        if (cancelled) return;
        zipRef.current = zip;
        setStatus("complete");
      } catch (generationError) {
        if (cancelled) return;
        console.error("Error membuat stiker:", generationError);
        setStatus("error");
        setError(generationError.message || "Gagal membuat stiker.");
      }
    }
    createStickers();
    return () => { cancelled = true; };
  }, [entries, backgroundColor, textColor, stickerWidth, stickerHeight, stickerShape, textAlign]);

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Stikerin beranda">
          <span className="brand-mark"><Icon name="spark" size={21} /></span>
          <span>stikerin<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-note"><span className="online-dot" /> Studio desain · file tetap di perangkat</div>
      </header>

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
            <div className="setup-card">
              <div className="section-heading">
                <div><div className="section-kicker">MULAI DI SINI</div><h2>Siapkan stikermu</h2></div>
                <span className="step-pill"><span>01</span> / 02</span>
              </div>
              <div className={`dropzone ${fileName ? "has-file" : ""}`} role="button" tabIndex={0}
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
                  <span>{fileName ? "File siap diproses" : "atau tarik file ke sini · .XLSX, .XLS"}</span></span>
                {fileName ? <button type="button" className="clear-file" aria-label="Hapus file" onClick={(event) => {
                  event.stopPropagation(); resetProject();
                }}><Icon name="close" size={17} /></button> :
                  <span className="browse-label">Pilih file <Icon name="arrow" size={15} /></span>}
              </div>
              <input ref={fileInputRef} className="visually-hidden" type="file" accept=".xlsx,.xls"
                onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; handleFile(file); }} />
              <div className="file-hint"><Icon name="check" size={14} /> Pastikan kolom <b>No</b> dan <b>Nama</b> ada di baris pertama</div>
              <div className="settings-divider" />
              <div className="settings-heading"><span className="settings-icon"><Icon name="spark" size={18} /></span>
                <div><h3>Atur tampilan</h3><p>Pilih kombinasi warna favoritmu</p></div></div>
              <div className="color-controls">
                <ColorPicker label="Warna background" value={backgroundColor} onChange={setBackgroundColor} />
                <ColorPicker label="Warna teks" value={textColor} onChange={setTextColor} />
              </div>
              <div className="sticker-settings">
                <div className="sticker-settings-title"><span>Ukuran stiker</span><span>DALAM CM</span></div>
                <div className="dimension-controls">
                  <label className="dimension-control"><span>Lebar</span><span className="dimension-input">
                    <input type="number" min="2" max="30" step="0.1" value={stickerWidth} aria-label="Lebar stiker dalam sentimeter"
                      onChange={(event) => setStickerWidth(event.target.value)}
                      onBlur={() => { const value = Number(stickerWidth); setStickerWidth(String(Math.min(30, Math.max(2, Number.isFinite(value) ? value : 9)))); }} />
                    <span>cm</span></span></label><span className="dimension-times">×</span>
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
              </div>
              <div className="size-note"><span className="size-note-icon"><Icon name="layers" size={16} /></span>
                <span>Ukuran stiker <b>{stickerWidth || "0"} × {stickerHeight || "0"} cm</b>
                  <small>Resolusi cetak {PRINT_DPI} DPI · {stickerShape === "rounded" ? "Rounded" : "Kotak"}</small></span>
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
                <span><b>{stickers.length}</b> <small>/ {entries.length || "—"} stiker</small></span></div>
                {entries.length > 0 && <span className="progress-label">{status === "complete" ? "Semua stiker selesai" : `${progress}% selesai`}</span>}</div>
              <div className="progress-track" role="progressbar" aria-label="Progres pembuatan stiker"
                aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
            </div>
          </section>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <section className="results-section"><div className="results-heading"><div><div className="section-kicker">HASIL GENERATOR</div>
            <h2>Stiker kamu <span>{stickers.length > 0 ? stickers.length : ""}</span></h2></div>
            {status === "complete" && <button className="download-button" type="button" onClick={downloadZip} disabled={isZipping}>
              <Icon name="download" size={18} />{isZipping ? "Menyiapkan ZIP..." : "Download semua"}</button>}</div>
            {stickers.length > 1 ? <div className="sticker-grid">{stickers.slice(1).map((sticker, index) => <article className="sticker-card"
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
            <h1>{activeTool === "upscale" ? <>Beri asetmu ruang<br /><span>untuk tampil besar.</span></> : <>Rapikan latar<br /><span>dengan kontrolmu.</span></>}</h1>
            <p>File diproses lokal dan tidak dikirim ke internet.</p>
          </div>
          <section className="editor-card">
            <div className="editor-sidebar">
              <div className="section-kicker">SUMBER GAMBAR</div>
              <button className={`dropzone image-dropzone ${imageFile ? "has-file" : ""}`} type="button"
                onClick={() => imageInputRef.current?.click()}><span className="upload-icon"><Icon name="upload" size={22} /></span>
                <span className="drop-copy"><strong>{imageFile?.name || "Pilih gambar"}</strong>
                  <span>PNG, JPG, WebP · maksimal 20 MB</span></span><Icon name="arrow" size={16} /></button>
              <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; handleImageFile(file); }} />
              {imageError && <div className="tool-error" role="alert">{imageError}</div>}
              {activeTool === "upscale" && <>
                <label className="editor-label" htmlFor="upscale-factor">Skala pembesaran</label>
                <select id="upscale-factor" className="editor-select" value={upscaleFactor} onChange={(event) => setUpscaleFactor(event.target.value)}>
                  <option value="2">2× · seimbang</option><option value="3">3× · lebih detail</option><option value="4">4× · maksimal</option>
                </select>
                <p className="tool-description">
                  {pythonImageTools ? "Python Pillow · Lanczos." : "Mode browser · interpolasi berkualitas tinggi."}
                  {" "}Memperbesar piksel, bukan memulihkan detail yang hilang.
                </p>
                <button type="button" className="primary-tool-button full-button" onClick={upscaleImage} disabled={!imageFile || imageBusy}>
                  {imageBusy ? <><span className="spinner" /> Memproses...</> : <><Icon name="image" size={17} /> Perbesar gambar</>}</button>
              </>}
              {activeTool === "background" && <>
                <div className="editor-label">Kuas manual · hanya gambar milik Anda</div>
                <p className="tool-description">
                  Sapukan kuas pada area latar untuk menjadikannya transparan.{" "}
                  {pythonImageTools ? "Mask diproses oleh Python Pillow." : "Pemrosesan memakai browser."}
                  {" "}Tidak ada penghapus watermark.
                </p>
                <div className="brush-modes" role="group" aria-label="Mode kuas">
                  <button type="button" className={brushMode === "erase" ? "is-selected" : ""} aria-pressed={brushMode === "erase"} onClick={() => setBrushMode("erase")}>Hapus latar</button>
                  <button type="button" className={brushMode === "restore" ? "is-selected" : ""} aria-pressed={brushMode === "restore"} onClick={() => setBrushMode("restore")}>Pulihkan</button>
                </div>
                <label className="editor-label" htmlFor="brush-size">Ukuran kuas <b>{brushSize}px</b></label>
                <input id="brush-size" className="brush-slider" type="range" min="6" max="120" value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))} />
                <div className="editor-action-row"><button type="button" className="subtle-button" onClick={resetBackgroundMask} disabled={!imageFile}>
                  <Icon name="undo" size={15} /> Reset</button>
                  <button type="button" className="primary-tool-button" onClick={exportBackground} disabled={!backgroundDirty || imageBusy}>
                    {imageBusy ? <><span className="spinner" /> Memproses...</> : <><Icon name="download" size={16} /> Ekspor PNG</>}</button></div>
              </>}
              {processedImage && activeTool === "upscale" && <a className="download-button result-download" href={processedImage.url} download={processedImage.name}>
                <Icon name="download" size={17} /> Unduh PNG · {processedImage.width} × {processedImage.height}</a>}
              {backgroundDownload && activeTool === "background" && <a className="download-button result-download" href={backgroundDownload}
                download={`${imageFile?.name.replace(/\.[^.]+$/, "") || "gambar"}_transparan.png`}><Icon name="download" size={17} /> Unduh PNG transparan</a>}
            </div>
            <div className={`editor-stage ${activeTool === "background" ? "checkerboard" : ""}`}>
              {imagePreview ? activeTool === "upscale" ? <>
                <img className="editor-preview" src={processedImage?.url || imagePreview} alt="Pratinjau gambar" />
                <span className="stage-caption">{processedImage ? "HASIL PERBESAR" : "GAMBAR ASLI"}</span>
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
              <label className="visually-hidden" htmlFor="asset-search">Cari ilustrasi SVG</label>
              <Icon name="search" size={20} />
              <input id="asset-search" type="search" maxLength="100" placeholder="Contoh: coffee plant, flower, abstract shape..."
                value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} />
              <button className="primary-tool-button" type="submit" disabled={assetSearchBusy || assetQuery.trim().length < 2}>
                {assetSearchBusy ? <><span className="spinner" /> Mencari</> : "Cari SVG"}<Icon name="arrow" size={16} /></button>
            </form>
            <div className="asset-search-hint"><span>SUMBER</span> Wikimedia Commons · hasil memuat tautan sumber dan lisensi.</div>
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
                  <a href={`/api/assets/download?title=${encodeURIComponent(asset.fileTitle)}&format=svg`} download>SVG <Icon name="download" size={14} /></a>
                  <a href={`/api/assets/download?title=${encodeURIComponent(asset.fileTitle)}&format=png`} download>PNG <Icon name="download" size={14} /></a>
                </div>
                <a className="asset-source" href={asset.pageUrl} target="_blank" rel="noreferrer">Sumber &amp; lisensi <Icon name="external" size={13} /></a>
              </div>
            </article>)}
          </div>}
          {!assetResults.length && !assetSearchError && <div className="asset-empty">
            <span className="empty-art"><span className="empty-art-back" /><span className="empty-art-front"><Icon name="search" size={23} /></span></span>
            <strong>{assetSearchBusy ? "Mencari aset berlisensi..." : "Kata kunci jadi inspirasi pertama."}</strong>
            <span>{assetSearchBusy ? "Sedang mengambil hasil dari Wikimedia Commons." : "Cari untuk menemukan ilustrasi SVG yang bisa diunduh."}</span>
          </div>}
          <aside className="zonalogo-card"><div><div className="section-kicker">PENCARIAN LOGO &amp; BRAND</div>
            <h2>Jelajahi katalog Zonalogo</h2><p>Buka sumber resminya untuk mencari logo, bendera, dan emblem. Hak merek dan aturan penggunaan mengikuti pemilik masing-masing.</p></div>
            <a className="secondary-button" href="https://zonalogo.com/browse" target="_blank" rel="noreferrer">Buka Zonalogo <Icon name="external" size={16} /></a>
          </aside>
        </section>
      )}

      <footer className="page-footer"><span>Stikerin Studio · dibuat untuk proses desain yang lebih praktis.</span>
        <span>Privat di perangkat <span className="footer-lock">◆</span></span><span className="made-by">MADE BY <b>YD</b></span></footer>
    </main>
  );
}
