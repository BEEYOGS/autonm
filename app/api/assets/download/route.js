import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const MAX_DOWNLOAD_SIZE = 25 * 1024 * 1024;

function safeFilename(value) {
  return value
    .replace(/^File:/i, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 120) || "commons-asset";
}

export async function GET(request) {
  const parameters = new URL(request.url).searchParams;
  const title = parameters.get("title")?.trim() || "";
  const format = parameters.get("format");
  if (!title.startsWith("File:") || title.length > 255 || !["svg", "png"].includes(format)) {
    return NextResponse.json({ error: "Permintaan unduhan aset tidak valid." }, { status: 400 });
  }

  try {
    const search = new URLSearchParams({
      action: "query",
      titles: title,
      prop: "imageinfo",
      iiprop: "url|mime",
      iiurlwidth: "2048",
      format: "json",
      formatversion: "2",
    });
    const metadataResponse = await fetch(`${COMMONS_API}?${search}`, {
      headers: { "User-Agent": "StikerinStudio/1.0 (Wikimedia Commons asset download)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!metadataResponse.ok) {
      return NextResponse.json({ error: "Tidak dapat mengambil metadata aset dari Commons." }, { status: 502 });
    }
    const metadata = await metadataResponse.json();
    const page = metadata.query?.pages?.[0];
    const image = page?.imageinfo?.[0];
    if (!image || image.mime !== "image/svg+xml" || page.missing) {
      return NextResponse.json({ error: "Aset SVG tersebut tidak tersedia di Commons." }, { status: 404 });
    }

    const imageUrl = format === "svg" ? image.url : image.thumburl;
    if (!imageUrl) {
      return NextResponse.json({ error: "Format unduhan yang diminta tidak tersedia." }, { status: 404 });
    }
    const parsedUrl = new URL(imageUrl);
    if (!["upload.wikimedia.org", "thumb.wikimedia.org"].includes(parsedUrl.hostname) ||
        !parsedUrl.pathname.startsWith("/wikipedia/commons/")) {
      return NextResponse.json({ error: "Sumber unduhan aset tidak diizinkan." }, { status: 502 });
    }
    const imageResponse = await fetch(parsedUrl, {
      headers: { "User-Agent": "StikerinStudio/1.0 (Wikimedia Commons asset download)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!imageResponse.ok) {
      return NextResponse.json({ error: "Gagal mengunduh aset dari Commons." }, { status: 502 });
    }
    const length = Number(imageResponse.headers.get("content-length") || 0);
    if (length > MAX_DOWNLOAD_SIZE) {
      return NextResponse.json({ error: "Ukuran aset melebihi batas unduhan 25 MB." }, { status: 413 });
    }
    const reader = imageResponse.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Sumber aset tidak mengirimkan file." }, { status: 502 });
    }
    const chunks = [];
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_DOWNLOAD_SIZE) {
        await reader.cancel();
        return NextResponse.json({ error: "Ukuran aset melebihi batas unduhan 25 MB." }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const extension = format === "svg" ? "svg" : "png";
    const mimeType = format === "svg" ? "image/svg+xml" : "image/png";
    return new NextResponse(body, {
      headers: {
        "Content-Type": format === "svg" ? `${mimeType}; charset=utf-8` : mimeType,
        "Content-Disposition": `attachment; filename="${safeFilename(title)}.${extension}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return NextResponse.json({ error: "Waktu tunggu unduhan aset habis. Silakan coba lagi." }, { status: 504 });
    }
    console.error("Wikimedia Commons asset download failed:", error);
    return NextResponse.json({ error: "Tidak dapat mengunduh aset dari Commons." }, { status: 502 });
  }
}
