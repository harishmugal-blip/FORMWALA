#!/usr/bin/env python3
"""Merge cover + body into final Go-Live guide PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.2 or abs(h - A4_H) > 0.2:
        page.scale_to(A4_W, A4_H)
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

writer = PdfWriter()
cover_page = PdfReader('/home/z/my-project/scripts/golive-cover.pdf').pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader('/home/z/my-project/scripts/golive-body.pdf').pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    '/Title': 'CSC Smart Seva - Go-Live Deployment Guide',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'WhatsApp seva kendra production deployment: server, Supabase, WhatsApp production, Razorpay, admin portal',
})
out = '/home/z/my-project/download/CSC_GoLive_Deployment_Guide.pdf'
with open(out, 'wb') as f:
    writer.write(f)
print('Merged:', out, '| pages:', len(writer.pages))
