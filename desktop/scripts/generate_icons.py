#!/usr/bin/env python3
"""Generate PNG / ICO / ICNS icons for Tauri."""
from __future__ import annotations
import struct, zlib
from pathlib import Path

def png_bytes(w, h, rgba=(251, 114, 153, 255)):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    r, g, b, a = rgba
    cx, cy, rad = w / 2, h / 2, min(w, h) * 0.38
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 < rad:
                row.extend((r, g, b, a))
            else:
                row.extend((255, 255, 255, 255))
        rows.append(bytes(row))
    data = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(b"".join(rows), 6))
    data += chunk(b"IEND", b"")
    return b"\x89PNG\r\n\x1a\n" + data

def write_ico(path, sizes=(16, 32, 48, 256)):
    images = [(s, png_bytes(s, s)) for s in sizes]
    offset = 6 + 16 * len(images)
    out = struct.pack("<HHH", 0, 1, len(images))
    data = b""
    for s, png in images:
        wb = 0 if s >= 256 else s
        out += struct.pack("<BBBBHHII", wb, wb, 0, 0, 1, 32, len(png), offset)
        data += png
        offset += len(png)
    path.write_bytes(out + data)

def write_icns(path):
    png = png_bytes(512, 512)
    icon = b"ic09" + struct.pack(">I", len(png) + 8) + png
    path.write_bytes(b"icns" + struct.pack(">I", len(icon) + 8) + icon)

def main():
    icons = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    for name, s in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
        (icons / name).write_bytes(png_bytes(s, s))
    write_ico(icons / "icon.ico")
    write_icns(icons / "icon.icns")
    print("ok", icons)

if __name__ == "__main__":
    main()
