"""Render source/plan.html to Amco-Paints-Marketing-Plan.pdf with headless Chrome.

Usage: python build.py [--preview DIR]
With --preview, also writes low-resolution PNG contact sheets of every page to DIR.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'source' / 'plan.html'
OUTPUT = HERE / 'Amco-Paints-Marketing-Plan.pdf'
BROWSERS = [
    Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
]
FONT_WAIT_MS = 15000
PREVIEW_DPI = 60
SHEET_GAP = 8


def render_pdf():
    browser = next((path for path in BROWSERS if path.exists()), None)
    if browser is None:
        raise SystemExit('Chrome or Edge is needed to render the PDF.')
    subprocess.run(
        [
            str(browser), '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
            f'--virtual-time-budget={FONT_WAIT_MS}', '--run-all-compositor-stages-before-draw',
            f'--print-to-pdf={OUTPUT}', SOURCE.as_uri(),
        ],
        check=True, capture_output=True,
    )
    print(f'Wrote {OUTPUT}')


def contact_sheet(images, target, columns):
    from PIL import Image

    width = max(image.width for image in images)
    height = max(image.height for image in images)
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * (width + SHEET_GAP) + SHEET_GAP, rows * (height + SHEET_GAP) + SHEET_GAP), '#888888')
    for index, image in enumerate(images):
        sheet.paste(image, (SHEET_GAP + (index % columns) * (width + SHEET_GAP), SHEET_GAP + (index // columns) * (height + SHEET_GAP)))
    sheet.save(target)


def write_previews(directory):
    import fitz
    from PIL import Image

    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob('*.png'):
        old.unlink()

    portrait, landscape = [], []
    document = fitz.open(OUTPUT)
    for number, page in enumerate(document, start=1):
        pixmap = page.get_pixmap(dpi=PREVIEW_DPI)
        image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
        (landscape if page.rect.width > page.rect.height else portrait).append(image)
        print(number, 'landscape' if page.rect.width > page.rect.height else 'portrait', len(page.get_text()), 'chars')

    for start in range(0, len(portrait), 8):
        contact_sheet(portrait[start:start + 8], directory / f'portrait-{start // 8 + 1}.png', 4)
    if landscape:
        contact_sheet(landscape, directory / 'landscape.png', 2)
    print(f'{len(document)} pages; previews in {directory}')


if __name__ == '__main__':
    render_pdf()
    if '--preview' in sys.argv:
        write_previews(Path(sys.argv[sys.argv.index('--preview') + 1]))
