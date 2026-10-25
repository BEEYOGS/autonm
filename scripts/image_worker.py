import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

MAX_PIXELS = 40_000_000
MAX_DIMENSION = 16_384


def open_image(path: str) -> Image.Image:
    with Image.open(path) as source:
        if source.width * source.height > MAX_PIXELS:
            raise ValueError("Gambar melebihi batas aman 40 megapiksel.")
        image = ImageOps.exif_transpose(source)
        if image.width * image.height > MAX_PIXELS:
            raise ValueError("Gambar melebihi batas aman 40 megapiksel.")
        return image.convert("RGBA")


def process_image(args: argparse.Namespace) -> None:
    image = open_image(args.input)

    if args.operation == "upscale":
        if args.scale not in (2, 3, 4):
            raise ValueError("Skala yang didukung hanya 2x, 3x, atau 4x.")
        width = image.width * args.scale
        height = image.height * args.scale
        if width > MAX_DIMENSION or height > MAX_DIMENSION or width * height > MAX_PIXELS:
            raise ValueError("Hasil melebihi batas aman 40 megapiksel.")
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    elif args.operation == "remove-background":
        if not args.mask:
            raise ValueError("Mask kuas diperlukan untuk menghapus latar.")
        with Image.open(args.mask) as source_mask:
            mask = ImageOps.exif_transpose(source_mask).convert("RGBA").getchannel("A")
        if mask.size != image.size:
            raise ValueError("Ukuran mask tidak cocok dengan ukuran gambar.")
        alpha = ImageChops.multiply(image.getchannel("A"), ImageOps.invert(mask))
        image.putalpha(alpha)
    else:
        raise ValueError("Operasi gambar tidak dikenal.")

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="PNG", compress_level=4)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--operation", choices=("upscale", "remove-background"))
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--mask")
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--healthcheck", action="store_true")
    args = parser.parse_args()

    try:
        if args.healthcheck:
            print("ready")
            return 0
        if not args.input or not args.output:
            raise ValueError("File input dan output diperlukan.")
        process_image(args)
        return 0
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
