# Stikerin Studio

Stikerin Studio is a Windows desktop design utility and a Next.js web app. It
keeps sticker generation, image upscaling, manual background erasing for images
you own, and licensed SVG asset search. There is no AI chat or image-generation
service.

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

The desktop build currently targets 64-bit Windows and bundles a Python/Pillow
worker so image processing stays local. Lanczos enlargement adds pixels but
does not reconstruct AI detail. Unsigned installers may show a Windows
SmartScreen warning until the publisher signs the release.

## Web app

The app can still be deployed as a standard Next.js project, for example on
Vercel. Sticker generation, upscaling, and manual background erasing run in the
browser there; the Python worker is enabled only by the local desktop package.
Asset search and downloads need an internet connection and use the Wikimedia
Commons API. The desktop app does not bundle or mirror third-party assets.

## Asset usage

Search results link to each Wikimedia Commons file page and its license.
Review the source page, attribution, and license conditions before using an
asset in client or commercial work. Zonalogo opens as an external catalog;
logos, flags, and trademarks remain subject to their owners' rules and are not
downloaded or redistributed by this app.

The background tool is a manual transparency brush. It operates on the
selected local image and is intended for images the user owns or is authorized
to edit. It does not remove watermarks.
