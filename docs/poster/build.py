"""Build the Rung poster: QR codes, a vector PDF at 24 x 36 inches, and a PNG preview.

    python3 docs/poster/build.py

Needs Google Chrome or Chromium on PATH and `pip install segno pypdf`.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import segno
from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
HTML = HERE / "poster.html"
PDF = HERE / "rung-poster.pdf"
PNG = HERE / "rung-poster.png"

QR_CODES = {
    "qr-repo.svg": "https://github.com/Hratchg/rung",
    "qr-video.svg": "https://github.com/Hratchg/rung/releases/latest",
}

WIDTH_IN, HEIGHT_IN = 24, 36
CSS_PX_PER_IN = 96


def chrome() -> str:
    for name in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser"):
        path = shutil.which(name)
        if path:
            return path
    sys.exit("Chrome or Chromium not found on PATH")


def run_chrome(*args: str) -> None:
    # A throwaway profile keeps headless Chrome from joining a desktop Chrome that is already open.
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [chrome(), "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
             "--no-first-run", f"--user-data-dir={profile}", "--virtual-time-budget=8000",
             *args, HTML.as_uri()],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120,
        )


def main() -> None:
    for name, url in QR_CODES.items():
        segno.make(url, error="m").save(HERE / name, kind="svg", border=2, omitsize=True, xmldecl=False, dark="#000")

    run_chrome("--no-pdf-header-footer", f"--print-to-pdf={PDF}")
    w = WIDTH_IN * CSS_PX_PER_IN
    h = HEIGHT_IN * CSS_PX_PER_IN
    run_chrome(f"--window-size={w},{h}", "--force-device-scale-factor=1", f"--screenshot={PNG}")

    pages = PdfReader(PDF).pages
    box = pages[0].mediabox
    width_in, height_in = float(box.width) / 72, float(box.height) / 72
    print(f"{PDF.name}: {len(pages)} page, {width_in:g} x {height_in:g} in")
    print(f"{PNG.name}: {w} x {h} px")
    if len(pages) != 1 or (round(width_in, 2), round(height_in, 2)) != (WIDTH_IN, HEIGHT_IN):
        sys.exit("PDF is not one 24 x 36 inch page")


if __name__ == "__main__":
    main()
