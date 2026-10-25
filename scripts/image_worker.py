import argparse
import hashlib
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

MAX_PIXELS = 40_000_000
MAX_DIMENSION = 16_384
BACKGROUND_MODEL = "birefnet-general-lite.onnx"
UPSCALE_MODEL = "realesr-general-x4v3.onnx"
UPSCALE_MODEL_URL = (
    "https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/"
    "488e5dda07333179f229a6205d92135eea4c25e9/realesr-general-x4v3.onnx"
)
UPSCALE_MODEL_SHA256 = "09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4"
UPSCALE_MODEL_SIZE = 4_871_181


def get_model_directory() -> Path:
    configured = os.environ.get("STIKERIN_MODEL_DIR")
    if configured:
        return Path(configured).expanduser()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "Stikerin Studio" / "models"
    return Path.home() / ".cache" / "stikerin" / "models"


def get_background_model_path() -> Path:
    configured = os.environ.get("U2NET_HOME")
    model_home = Path(configured).expanduser() if configured else get_model_directory() / "u2net"
    return model_home / "models" / "birefnet-general-lite" / BACKGROUND_MODEL


def model_status() -> dict:
    return {
        "available": True,
        "backgroundAiReady": get_background_model_path().is_file(),
        "upscalerAiReady": (
            (get_model_directory() / UPSCALE_MODEL).is_file()
            and sha256_file(get_model_directory() / UPSCALE_MODEL) == UPSCALE_MODEL_SHA256
        ),
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def open_image(path: str) -> Image.Image:
    with Image.open(path) as source:
        if source.width * source.height > MAX_PIXELS:
            raise ValueError("Gambar melebihi batas aman 40 megapiksel.")
        image = ImageOps.exif_transpose(source)
        if image.width * image.height > MAX_PIXELS:
            raise ValueError("Gambar melebihi batas aman 40 megapiksel.")
        return image.convert("RGBA")


def check_output_dimensions(width: int, height: int, scale: int) -> tuple[int, int]:
    if scale not in (2, 4):
        raise ValueError("Skala AI yang didukung hanya 2x atau 4x.")
    output_width = width * scale
    output_height = height * scale
    if (
        output_width > MAX_DIMENSION
        or output_height > MAX_DIMENSION
        or output_width * output_height > MAX_PIXELS
    ):
        raise ValueError("Hasil melebihi batas aman 40 megapiksel.")
    return output_width, output_height


def get_upscale_model() -> Path:
    model_path = get_model_directory() / UPSCALE_MODEL
    model_path.parent.mkdir(parents=True, exist_ok=True)
    if model_path.is_file() and sha256_file(model_path) == UPSCALE_MODEL_SHA256:
        return model_path
    if model_path.exists():
        model_path.unlink()

    temporary_path = None
    try:
        request = urllib.request.Request(
            UPSCALE_MODEL_URL,
            headers={"User-Agent": "StikerinStudio/1.0 (local AI image model)"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            length = int(response.headers.get("Content-Length", "0"))
            if length and length != UPSCALE_MODEL_SIZE:
                raise ValueError("Ukuran model AI upscale tidak sesuai.")
            with tempfile.NamedTemporaryFile(
                dir=model_path.parent, prefix="upscaler-", suffix=".download", delete=False
            ) as download:
                temporary_path = Path(download.name)
                digest = hashlib.sha256()
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > UPSCALE_MODEL_SIZE:
                        raise ValueError("Model AI upscale melebihi ukuran yang diizinkan.")
                    digest.update(chunk)
                    download.write(chunk)
        if total != UPSCALE_MODEL_SIZE or digest.hexdigest() != UPSCALE_MODEL_SHA256:
            raise ValueError("Verifikasi model AI upscale gagal. Coba unduh ulang.")
        temporary_path.replace(model_path)
        return model_path
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def remove_background_ai(image: Image.Image) -> Image.Image:
    model_path = get_background_model_path()
    model_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(model_path.parent)

    from rembg import new_session, remove

    session = new_session("birefnet-general-lite", providers=["CPUExecutionProvider"])
    mask = remove(
        image.convert("RGB"),
        session=session,
        only_mask=True,
        post_process_mask=True,
    ).convert("L")
    image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return image


def upscale_ai(image: Image.Image, scale: int) -> Image.Image:
    output_width, output_height = check_output_dimensions(image.width, image.height, scale)

    import numpy as np
    import onnxruntime as ort

    model_path = get_upscale_model()
    options = ort.SessionOptions()
    options.intra_op_num_threads = min(8, os.cpu_count() or 4)
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(
        str(model_path), sess_options=options, providers=["CPUExecutionProvider"]
    )
    input_name = session.get_inputs()[0].name
    source = np.asarray(image.convert("RGB"), dtype=np.uint8)
    output = np.empty((image.height * 4, image.width * 4, 3), dtype=np.uint8)
    tile_size = 256
    overlap = 16

    for top in range(0, image.height, tile_size):
        bottom = min(top + tile_size, image.height)
        input_top = max(0, top - overlap)
        input_bottom = min(image.height, bottom + overlap)
        for left in range(0, image.width, tile_size):
            right = min(left + tile_size, image.width)
            input_left = max(0, left - overlap)
            input_right = min(image.width, right + overlap)
            tile = source[input_top:input_bottom, input_left:input_right]
            tensor = tile.astype(np.float32) / 255.0
            tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
            enhanced = session.run(None, {input_name: tensor})[0][0]
            enhanced = np.clip(
                np.transpose(enhanced, (1, 2, 0)) * 255.0, 0, 255
            ).astype(np.uint8)

            crop_top = (top - input_top) * 4
            crop_bottom = crop_top + (bottom - top) * 4
            crop_left = (left - input_left) * 4
            crop_right = crop_left + (right - left) * 4
            output[top * 4 : bottom * 4, left * 4 : right * 4] = enhanced[
                crop_top:crop_bottom, crop_left:crop_right
            ]

    result = Image.fromarray(output, mode="RGB")
    if scale == 2:
        result = result.resize((output_width, output_height), Image.Resampling.LANCZOS)
    alpha = image.getchannel("A")
    if alpha.getextrema() != (255, 255):
        result.putalpha(alpha.resize((output_width, output_height), Image.Resampling.LANCZOS))
    return result


def process_image(args: argparse.Namespace) -> None:
    image = open_image(args.input)

    if args.operation == "upscale":
        output_width, output_height = check_output_dimensions(
            image.width, image.height, args.scale
        )
        image = image.resize(
            (output_width, output_height), Image.Resampling.LANCZOS
        )
    elif args.operation == "upscale-ai":
        image = upscale_ai(image, args.scale)
    elif args.operation == "remove-background":
        if not args.mask:
            raise ValueError("Mask kuas diperlukan untuk menghapus latar.")
        with Image.open(args.mask) as source_mask:
            mask = ImageOps.exif_transpose(source_mask).convert("RGBA").getchannel("A")
        if mask.size != image.size:
            raise ValueError("Ukuran mask tidak cocok dengan ukuran gambar.")
        image.putalpha(ImageChops.multiply(image.getchannel("A"), ImageOps.invert(mask)))
    elif args.operation == "remove-background-ai":
        image = remove_background_ai(image)
    else:
        raise ValueError("Operasi gambar tidak dikenal.")

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="PNG", compress_level=4)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--operation",
        choices=("upscale", "upscale-ai", "remove-background", "remove-background-ai"),
    )
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--mask")
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--healthcheck", action="store_true")
    args = parser.parse_args()

    try:
        if args.healthcheck:
            print(json.dumps(model_status()))
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
