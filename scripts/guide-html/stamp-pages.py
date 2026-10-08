"""Stamp page numbers on guide PDF + set metadata.
Scheme (per pagination.md): cover = hidden page 1; body pages show 1,2,3...; ending page = no number.
"""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SRC = "/home/z/my-project/download/CSC_Services_Operator_Guide.pdf"

reader = PdfReader(SRC)
n = len(reader.pages)
w = float(reader.pages[0].mediabox.width)   # 540 pt
h = float(reader.pages[0].mediabox.height)  # 765 pt

# build overlay PDF: one page per source page (blank for cover/ending)
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(w, h))
for i in range(n):
    if 0 < i < n - 1:  # skip cover (0) and ending (last)
        num = str(i)   # body numbering starts at 1 on PDF page 2
        c.setFont("Helvetica", 9)
        c.setFillColorRGB(0x5d / 255, 0x6b / 255, 0x7e / 255)
        c.drawCentredString(w / 2, 20, num)
    c.showPage()
c.save()
buf.seek(0)

overlay = PdfReader(buf)
writer = PdfWriter()
for i, page in enumerate(reader.pages):
    if 0 < i < n - 1:
        page.merge_page(overlay.pages[i])
    writer.add_page(page)

writer.add_metadata({
    "/Title": "CSC Smart Seva - Services Operator Guide (16 Services)",
    "/Author": "CSC Smart Seva",
    "/Creator": "Z.ai",
    "/Subject": "Operator manual for 16 government services: WhatsApp field collection, documents, portal SOP, video-verified process facts, fees and tips",
})

with open(SRC, "wb") as f:
    writer.write(f)

print(f"stamped {n-2} body pages of {n}, metadata set")
