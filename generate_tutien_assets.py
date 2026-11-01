from collections import deque
from pathlib import Path
from PIL import Image

BRAIN_DIR = Path(r"C:\Users\Admin\.gemini\antigravity\brain\26db4fd0-cacd-40f8-953d-f87f070506f9")
BG_SRC = BRAIN_DIR / "xianxia_cultivation_background_1793513433651.jpg"
SHEET_SRC = BRAIN_DIR / "xianxia_cultivator_spritesheet_1793513438033.jpg"

PUBLIC_ASSETS = Path(r"e:\D\CODE\tiktok-live\public\assets")
SPRITES_DIR = PUBLIC_ASSETS / "sprites"
SPRITES_DIR.mkdir(parents=True, exist_ok=True)


def extract_clean_character_from_black(crop_img: Image.Image, out_size=(260, 290), seed_inside_halo=False) -> Image.Image:
    rgba = crop_img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    visited = [[False] * w for _ in range(h)]
    q = deque()

    def is_bg_pixel(r, g, b):
        return max(r, g, b) <= 11 and (r + g + b) <= 27

    for x in range(w):
        for y in (0, 1, h - 2, h - 1):
            r, g, b, _ = px[x, y]
            if is_bg_pixel(r, g, b) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, 1, w - 2, w - 1):
            r, g, b, _ = px[x, y]
            if is_bg_pixel(r, g, b) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))

    if seed_inside_halo:
        # Seed inside the closed golden halo ring (left and right of the head)
        for sx, sy in [(int(w * 0.34), int(h * 0.30)), (int(w * 0.66), int(h * 0.30))]:
            r, g, b, _ = px[sx, sy]
            if is_bg_pixel(r, g, b) and not visited[sy][sx]:
                visited[sy][sx] = True
                q.append((sx, sy))

    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    while q:
        cx, cy = q.popleft()
        for dx, dy in dirs:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b, _ = px[nx, ny]
                if is_bg_pixel(r, g, b):
                    visited[ny][nx] = True
                    q.append((nx, ny))

    dist = [[999] * w for _ in range(h)]
    dq = deque()
    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                dist[y][x] = 0
                dq.append((x, y))

    while dq:
        cx, cy = dq.popleft()
        cd = dist[cy][cx]
        if cd >= 4:
            continue
        for dx, dy in dirs:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and dist[ny][nx] > cd + 1:
                dist[ny][nx] = cd + 1
                dq.append((nx, ny))

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                px[x, y] = (0, 0, 0, 0)
            else:
                d = dist[y][x]
                if d <= 2:
                    r, g, b, a = px[x, y]
                    lum = max(r, g, b)
                    if lum < 45:
                        alpha = int(min(255, max(0, (lum - 8) * 6.5 * (d / 2.2))))
                        px[x, y] = (r, g, b, alpha)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    cw, ch = out_size
    scale = min((cw - 10) / rgba.width, (ch - 10) / rgba.height)
    nw = max(1, int(round(rgba.width * scale)))
    nh = max(1, int(round(rgba.height * scale)))
    resized = rgba.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ox = (cw - nw) // 2
    oy = ch - nh - 4
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def main():
    if BG_SRC.exists():
        bg = Image.open(BG_SRC).convert("RGB").resize((1080, 1920), Image.Resampling.LANCZOS)
        bg_out = PUBLIC_ASSETS / "tien_mon_van_dao_bg.jpg"
        bg.save(bg_out, quality=93)
        print("Saved:", bg_out)

    if SHEET_SRC.exists():
        sheet = Image.open(SHEET_SRC).convert("RGBA")
        sw, sh = sheet.size
        mx, my = sw // 2, sh // 2

        quadrants = {
            "tutien_tier1.png": ((0, 0, mx, my), False),
            "tutien_tier2.png": ((mx, 0, sw, my), False),
            "tutien_tier3.png": ((0, my, mx, sh), True),
            "tutien_tier4.png": ((mx, my, sw, sh), False),
        }
        for name, (box, seed_halo) in quadrants.items():
            sub = sheet.crop(box)
            out_img = extract_clean_character_from_black(sub, out_size=(260, 290), seed_inside_halo=seed_halo)
            out_path = SPRITES_DIR / name
            out_img.save(out_path)
            print("Saved sprite:", out_path)


if __name__ == "__main__":
    main()
