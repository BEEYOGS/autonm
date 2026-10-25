"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "@e965/xlsx";

const PRINT_DPI = 300;

function Icon({ name, size = 20, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const icons = {
    sparkles: (
      <>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
        <path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
        <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
      </>
    ),
    file: (
      <>
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" />
        <path d="M13 3v7h7M8 14h8m-8 4h8" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
        <path d="M5 17v3h14v-3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.4-3h1A4.9 4.9 0 0 0 22 9.8C22 6 17.5 3 12 3Z" />
        <path d="M7.5 10h.01M10 7h.01M15 7h.01M17.5 10h.01" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
  };

  return <svg {...common}>{icons[name]}</svg>;
}

async function addPngResolution(blob, dpi) {
  const png = new Uint8Array(await blob.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => png[index] === byte)) {
    throw new Error("Format gambar PNG tidak valid.");
  }

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = signature.length;

  while (offset + 12 <= png.length) {
    const chunkLength = view.getUint32(offset, false);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > png.length) {
      throw new Error("Data gambar PNG tidak lengkap.");
    }

    const chunkType = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (chunkType === "pHYs") {
      if (chunkLength !== 9) {
        throw new Error("Metadata resolusi PNG tidak valid.");
      }
      view.setUint32(offset + 8, pixelsPerMeter, false);
      view.setUint32(offset + 12, pixelsPerMeter, false);
      png[offset + 16] = 1;
      view.setUint32(offset + 17, crc32(png.subarray(offset + 4, offset + 17)), false);
      return new Blob([png], { type: blob.type });
    }

    if (chunkType === "IEND") {
      const chunk = new Uint8Array(21);
      const chunkView = new DataView(chunk.buffer);
      chunkView.setUint32(0, 9, false);
      chunk.set([112, 72, 89, 115], 4);
      chunkView.setUint32(8, pixelsPerMeter, false);
      chunkView.setUint32(12, pixelsPerMeter, false);
      chunk[16] = 1;
      chunkView.setUint32(17, crc32(chunk.subarray(4, 17)), false);
      return new Blob([png.subarray(0, offset), chunk, png.subarray(offset)], {
        type: blob.type,
      });
    }

    offset = chunkEnd;
  }

  throw new Error("Gambar PNG tidak memiliki penanda akhir yang valid.");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readEntries(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("File Excel tidak memiliki sheet.");
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      header: 1,
      defval: "",
    });
    const nameColumns = (rows[0] || []).reduce((columns, header, index) => {
      if (String(header).trim().toLowerCase() === "nama") columns.push(index);
      return columns;
    }, []);

    if (nameColumns.length === 0) {
      throw new Error('Tidak ditemukan kolom "Nama" pada baris pertama sheet Excel.');
    }

    const entries = nameColumns
      .flatMap((columnIndex) =>
        rows
          .slice(1)
          .map((row) => ({
            name: String(row[columnIndex] || "").trim(),
            number: String(row[columnIndex - 1] ?? "").trim(),
          }))
          .filter((entry) => entry.name !== "" && entry.name.toLowerCase() !== "nama"),
      )
      .sort((a, b) => Number(a.number) - Number(b.number));

    if (entries.length === 0) {
      throw new Error("Tidak ada nama yang dapat diproses pada file Excel.");
    }
    if (
      !entries.every(
        (entry) => entry.number !== "" && Number.isFinite(Number(entry.number)),
      )
    ) {
      throw new Error('Pastikan setiap nama memiliki nomor yang valid pada kolom "No".');
    }

    return entries;
  });
}

export default function Home() {
  const fileInputRef = useRef(null);
  const zipRef = useRef(null);
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

  useEffect(() => {
    if (entries.length === 0) return undefined;

    const widthCm = Number(stickerWidth);
    const heightCm = Number(stickerHeight);
    if (
      !Number.isFinite(widthCm) ||
      widthCm < 2 ||
      widthCm > 30 ||
      !Number.isFinite(heightCm) ||
      heightCm < 1 ||
      heightCm > 15
    ) {
      zipRef.current = null;
      setStickers([]);
      setStatus("error");
      setError("Ukuran stiker harus antara 2–30 cm untuk lebar dan 1–15 cm untuk tinggi.");
      return undefined;
    }

    let cancelled = false;
    const createStickers = async () => {
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
          canvas.width = Math.round((Number(stickerWidth) * PRINT_DPI) / 2.54);
          canvas.height = Math.round((Number(stickerHeight) * PRINT_DPI) / 2.54);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Browser tidak mendukung pembuatan gambar.");

          const cornerRadius = Math.min(
            canvas.height * 0.18,
            canvas.width * 0.08,
          );
          context.beginPath();
          if (stickerShape === "rounded") {
            context.moveTo(cornerRadius, 0);
            context.lineTo(canvas.width - cornerRadius, 0);
            context.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
            context.lineTo(canvas.width, canvas.height - cornerRadius);
            context.quadraticCurveTo(
              canvas.width,
              canvas.height,
              canvas.width - cornerRadius,
              canvas.height,
            );
            context.lineTo(cornerRadius, canvas.height);
            context.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
            context.lineTo(0, cornerRadius);
            context.quadraticCurveTo(0, 0, cornerRadius, 0);
          } else {
            context.rect(0, 0, canvas.width, canvas.height);
          }
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
          const textX =
            textAlign === "left"
              ? horizontalPadding
              : textAlign === "right"
                ? canvas.width - horizontalPadding
                : canvas.width / 2;
          context.font = `700 ${maxFontSize}px "Arial", "Microsoft YaHei", sans-serif`;
          const measuredWidth = context.measureText(label).width;
          const fontSize =
            measuredWidth > maxTextWidth
              ? (maxFontSize * maxTextWidth) / measuredWidth
              : maxFontSize;
          context.font = `700 ${fontSize}px "Arial", "Microsoft YaHei", sans-serif`;
          context.fillText(label, textX, canvas.height / 2);

          const canvasBlob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (!canvasBlob) {
            throw new Error(`Gagal membuat gambar untuk nama "${name}".`);
          }
          const stickerBlob = await addPngResolution(canvasBlob, PRINT_DPI);
          if (cancelled) return;

          zip.file(`Stiker_${String(index + 1).padStart(3, "0")}.png`, stickerBlob);
          nextStickers.push({
            name,
            number,
            preview: canvas.toDataURL("image/png"),
          });
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
    };

    createStickers();
    return () => {
      cancelled = true;
    };
  }, [
    entries,
    backgroundColor,
    textColor,
    stickerWidth,
    stickerHeight,
    stickerShape,
    textAlign,
  ]);

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
      const nextEntries = await readEntries(file);
      setEntries(nextEntries);
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
      const content = await zipRef.current.generateAsync(
        { type: "blob" },
        (metadata) => setProgress(Math.round(metadata.percent)),
      );
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
      <nav className="topbar">
        <a className="brand" href="#" aria-label="Stikerin beranda">
          <span className="brand-mark">
            <Icon name="sparkles" size={21} />
          </span>
          <span>stikerin<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-note">
          <span className="online-dot" />
          Gratis &amp; berjalan di browser
        </div>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span /> STIKER NAMA &amp; NOMOR</div>
        <h1>
          Dari spreadsheet,
          <br />
          jadi <span>stiker keren.</span>
        </h1>
        <p>
          Upload daftar nama, atur warna sesukamu, lalu unduh semua stiker
          sekaligus. Praktis banget.
        </p>
      </section>

      <section className="workspace" aria-label="Buat stiker">
        <div className="setup-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker">MULAI DI SINI</div>
              <h2>Siapkan stikermu</h2>
            </div>
            <span className="step-pill"><span>01</span> / 02</span>
          </div>

          <div
            className={`dropzone ${fileName ? "has-file" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="upload-icon"><Icon name={fileName ? "file" : "upload"} size={23} /></span>
            <span className="drop-copy">
              <strong>{fileName || "Klik untuk upload file Excel"}</strong>
              <span>{fileName ? "File siap diproses" : "atau tarik file ke sini · .XLSX, .XLS"}</span>
            </span>
            {fileName ? (
              <button
                type="button"
                className="clear-file"
                aria-label="Hapus file"
                onClick={(event) => {
                  event.stopPropagation();
                  resetProject();
                }}
              >
                <Icon name="close" size={17} />
              </button>
            ) : (
              <span className="browse-label">Pilih file <Icon name="arrow" size={15} /></span>
            )}
          </div>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => {
              const file = event.target.files[0];
              event.target.value = "";
              handleFile(file);
            }}
          />
          <div className="file-hint">
            <Icon name="check" size={14} />
            Pastikan kolom <b>No</b> dan <b>Nama</b> ada di baris pertama
          </div>

          <div className="settings-divider" />

          <div className="settings-heading">
            <span className="settings-icon"><Icon name="palette" size={18} /></span>
            <div>
              <h3>Atur tampilan</h3>
              <p>Pilih kombinasi warna favoritmu</p>
            </div>
          </div>
          <div className="color-controls">
            <label className="color-control">
              <span className="color-label">Warna background</span>
              <span className="color-picker">
                <input
                  type="color"
                  value={backgroundColor}
                  aria-label="Warna background"
                  onChange={(event) => setBackgroundColor(event.target.value)}
                />
                <code>{backgroundColor.toUpperCase()}</code>
              </span>
            </label>
            <label className="color-control">
              <span className="color-label">Warna teks</span>
              <span className="color-picker">
                <input
                  type="color"
                  value={textColor}
                  aria-label="Warna teks"
                  onChange={(event) => setTextColor(event.target.value)}
                />
                <code>{textColor.toUpperCase()}</code>
              </span>
            </label>
          </div>

          <div className="sticker-settings">
            <div className="sticker-settings-title">Ukuran stiker <span>DALAM CM</span></div>
            <div className="dimension-controls">
              <label className="dimension-control">
                <span>Lebar</span>
                <span className="dimension-input">
                  <input
                    type="number"
                    min="2"
                    max="30"
                    step="0.1"
                    value={stickerWidth}
                    aria-label="Lebar stiker dalam sentimeter"
                    onChange={(event) => setStickerWidth(event.target.value)}
                    onBlur={() => {
                      const value = Number(stickerWidth);
                      setStickerWidth(String(Math.min(30, Math.max(2, Number.isFinite(value) ? value : 9))));
                    }}
                  />
                  <span>cm</span>
                </span>
              </label>
              <span className="dimension-times" aria-hidden="true">×</span>
              <label className="dimension-control">
                <span>Tinggi</span>
                <span className="dimension-input">
                  <input
                    type="number"
                    min="1"
                    max="15"
                    step="0.1"
                    value={stickerHeight}
                    aria-label="Tinggi stiker dalam sentimeter"
                    onChange={(event) => setStickerHeight(event.target.value)}
                    onBlur={() => {
                      const value = Number(stickerHeight);
                      setStickerHeight(String(Math.min(15, Math.max(1, Number.isFinite(value) ? value : 2))));
                    }}
                  />
                  <span>cm</span>
                </span>
              </label>
            </div>

            <div className="option-row">
              <span className="option-label">Bentuk sudut</span>
              <div className="segmented-control" role="group" aria-label="Bentuk stiker">
                <button
                  type="button"
                  className={stickerShape === "rounded" ? "is-selected" : ""}
                  aria-pressed={stickerShape === "rounded"}
                  onClick={() => setStickerShape("rounded")}
                >
                  Rounded
                </button>
                <button
                  type="button"
                  className={stickerShape === "square" ? "is-selected" : ""}
                  aria-pressed={stickerShape === "square"}
                  onClick={() => setStickerShape("square")}
                >
                  Kotak
                </button>
              </div>
            </div>

            <div className="option-row">
              <span className="option-label">Align teks</span>
              <div className="segmented-control align-control" role="group" aria-label="Perataan teks">
                {[
                  ["left", "Kiri"],
                  ["center", "Tengah"],
                  ["right", "Kanan"],
                ].map(([alignment, label]) => (
                  <button
                    key={alignment}
                    type="button"
                    className={textAlign === alignment ? "is-selected" : ""}
                    aria-pressed={textAlign === alignment}
                    onClick={() => setTextAlign(alignment)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="size-note">
            <span className="size-note-icon"><Icon name="layers" size={16} /></span>
            <span>Ukuran stiker <b>{stickerWidth || "0"} × {stickerHeight || "0"} cm</b><small>Resolusi cetak {PRINT_DPI} DPI · {stickerShape === "rounded" ? "Rounded" : "Kotak"}</small></span>
            <span className="size-tag">SIAP CETAK</span>
          </div>
        </div>

        <div className="preview-panel">
          <div className="preview-heading">
            <div>
              <div className="section-kicker">LIVE PREVIEW</div>
              <h2>Lihat hasilnya</h2>
            </div>
            <span className={`status-chip ${status === "complete" ? "is-ready" : ""}`}>
              <span />
              {status === "complete" ? "Siap diunduh" : isBusy ? "Sedang dibuat" : "Menunggu file"}
            </span>
          </div>

          <div className="sticker-stage">
            {stickers[0] ? (
              <div className="hero-sticker">
                <img src={stickers[0].preview} alt={`Preview stiker ${stickers[0].name}`} />
                <span className="sticker-caption">CONTOH STIKER</span>
              </div>
            ) : (
              <div className="empty-preview">
                <span className="empty-art">
                  <span className="empty-art-back" />
                  <span className="empty-art-front"><Icon name="sparkles" size={25} /></span>
                </span>
                <strong>Preview-mu tampil di sini</strong>
                <span>Upload file Excel untuk mulai membuat stiker</span>
              </div>
            )}
          </div>

          <div className="preview-footer">
            <div className="counter">
              <span className="counter-icon"><Icon name="layers" size={17} /></span>
              <span><b>{stickers.length}</b> <small>/ {entries.length || "—"} stiker</small></span>
            </div>
            {entries.length > 0 && (
              <span className="progress-label">
                {status === "complete" ? "Semua stiker selesai" : `${progress}% selesai`}
              </span>
            )}
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Progres pembuatan stiker"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="results-section">
        <div className="results-heading">
          <div>
            <div className="section-kicker">HASIL GENERATOR</div>
            <h2>Stiker kamu <span>{stickers.length > 0 ? stickers.length : ""}</span></h2>
          </div>
          {status === "complete" && (
            <button className="download-button" type="button" onClick={downloadZip} disabled={isZipping}>
              <Icon name="download" size={18} />
              {isZipping ? "Menyiapkan ZIP..." : "Download semua"}
            </button>
          )}
        </div>

        {stickers.length > 1 ? (
          <div className="sticker-grid">
            {stickers.slice(1).map((sticker, index) => (
              <article className="sticker-card" key={`${sticker.number}-${index}`}>
                <img src={sticker.preview} alt={`Stiker ${sticker.number}: ${sticker.name}`} />
                <div className="sticker-card-info">
                  <span>STIKER {String(index + 2).padStart(2, "0")}</span>
                  <b>{sticker.number}. {sticker.name}</b>
                </div>
              </article>
            ))}
          </div>
        ) : status === "complete" ? (
          <div className="single-result-note">
            <Icon name="check" size={16} /> Semua stiker sudah siap. File ZIP berisi gambar PNG resolusi tinggi.
          </div>
        ) : (
          <div className="results-placeholder">
            <span>Setiap stiker yang dibuat akan muncul di sini</span>
            <span className="placeholder-dots"><i /><i /><i /></span>
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span>Dirancang untuk bikin proses cetak lebih simpel.</span>
        <span>File diproses langsung di perangkatmu <span className="footer-lock">◆</span></span>
        <span className="made-by">MADE BY <b>YD</b></span>
      </footer>
    </main>
  );
}
