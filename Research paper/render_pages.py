import fitz
from pathlib import Path

pdf = fitz.open("AaharIQ_Research_Paper.pdf")
print("pages:", pdf.page_count)
out = Path("page_previews")
out.mkdir(exist_ok=True)
for i, page in enumerate(pdf):
    pix = page.get_pixmap(dpi=100)
    pix.save(out / f"page_{i+1:02d}.png")
print("wrote", out)
