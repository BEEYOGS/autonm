import { NextResponse } from "next/server";

export const runtime = "nodejs";

function plainText(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  const format = new URL(request.url).searchParams.get("format") || "svg";
  const source = new URL(request.url).searchParams.get("source") || "commons";

  if (query.length < 2 || query.length > 100) {
    return NextResponse.json(
      { error: "Kata kunci pencarian harus berisi 2–100 karakter." },
      { status: 400 },
    );
  }

  if (source !== "commons") {
    return NextResponse.json(
      { error: "Sumber aset saat ini hanya Wikimedia Commons." },
      { status: 400 },
    );
  }

  const mimeFilter = format === "png" ? "image/png" : "image/svg+xml";
  const parameters = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filemime:${mimeFilter} ${query}`,
    gsrnamespace: "6",
    gsrlimit: "16",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "640",
    format: "json",
    formatversion: "2",
  });

  try {
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${parameters}`,
      {
        headers: {
          "User-Agent": "StikerinStudio/1.0 (designer asset search; Wikimedia Commons API)",
        },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: `Pencarian aset gagal (status ${response.status}).` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const assets = (data.query?.pages || [])
      .map((page) => {
        const image = page.imageinfo?.[0];
        if (!image?.thumburl || !image?.descriptionurl || image.mime !== mimeFilter) return null;
        const metadata = image.extmetadata || {};
        return {
          id: String(page.pageid),
          title: page.title?.replace(/^File:/, "") || "Gambar tanpa judul",
          fileTitle: page.title,
          thumbnailUrl: image.thumburl,
          pageUrl: image.descriptionurl,
          author: plainText(metadata.Artist?.value || ""),
          license: plainText(
            metadata.LicenseShortName?.value || metadata.UsageTerms?.value || "Periksa halaman lisensi",
          ),
          licenseUrl: metadata.LicenseUrl?.value || image.descriptionurl,
          format,
          source,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { assets, format, source },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Tidak dapat mencari aset di Wikimedia Commons. Periksa koneksi internet." },
      { status: 503 },
    );
  }
}
