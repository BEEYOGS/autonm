# Stikerin Studio

Stikerin Studio is a Windows desktop design utility and a Next.js web app. It
keeps sticker generation, local AI background removal and upscaling, manual
background editing, and licensed SVG asset search. There is no AI chat or
image-generation service.

## Windows desktop app

The desktop shell uses Electron's bundled Chromium engine, so it does not
require a separate browser installation. The local Next.js server binds only
to `127.0.0.1`; it is stopped when the desktop app exits.

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Install Python 3.12, then install the local image worker dependencies with
   `py -3.12 -m pip install -r requirements-image-worker.txt`.
4. Start the development desktop app with `npm run desktop:dev`.
5. Build a Windows installer with `npm run desktop:exe`. The installer is
   written to `release/`.
6. To also build a traditional MSI, install WiX Toolset 3 and add its command
   line tools (`candle.exe` and `light.exe`) to `PATH`, then run
   `npm run desktop:msi`. `npm run desktop:dist` builds both installers.

The desktop build currently targets 64-bit Windows and bundles a Python CPU
worker using BiRefNet General Lite for background removal and Real-ESRGAN
General x4v3 for image enhancement. Models download on first use and are kept
in the Stikerin Studio user-data folder: approximately 214 MB for background
removal and 5 MB for upscaling. The first download requires an internet
connection; image files themselves are processed locally and are not uploaded.
The AI upscaler outputs 2x or 4x PNG. Larger requests are limited to 40
megapixels. Unsigned installers may show a Windows SmartScreen warning until
the publisher signs the release.

## Web app

The app can still be deployed as a standard Next.js project, for example on
Vercel. Sticker generation, basic browser upscaling, and manual background
erasing run in the browser there; the local Python AI worker is only available
in the desktop package. Asset search and downloads need an internet connection
and use the Wikimedia Commons API. The desktop app does not bundle or mirror
third-party assets.

## Asset usage

Search results link to each Wikimedia Commons file page and its license.
Review the source page, attribution, and license conditions before using an
asset in client or commercial work. Zonalogo opens as an external catalog;
logos, flags, and trademarks remain subject to their owners' rules and are not
downloaded or redistributed by this app.

The background tool provides local AI removal and a manual transparency brush.
It operates on the selected local image and is intended for images the user
owns or is authorized to edit. It does not remove watermarks.
