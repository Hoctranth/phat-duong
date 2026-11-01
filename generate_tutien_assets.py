from collections import deque
from pathlib import Path
from PIL import Image

BRAIN_DIR = Path(r"C:\Users\Admin\.gemini\antigravity\brain\26db4fd0-cacd-40f8-953d-f87f070506f9")
BG_SRC = BRAIN_DIR / "xianxia_cultivation_background_1793513433651.jpg"
SHEET_SRC = BRAIN_DIR / "xianxia_cultivator_spritesheet_1793513438033.jpg"
SHEET_HIGH_SRC = BRAIN_DIR / "xianxia_high_tier_cultivators_grid_1793516986943.jpg"

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


def extract_high_tier_character(crop_img: Image.Image, out_size=(270, 300), keep_inner_dark=False) -> Image.Image:
    rgba = crop_img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    visited = [[False] * w for _ in range(h)]
    q = deque()

    def is_bg_pixel(r, g, b, y_Ratio=0.5):
        lum = max(r, g, b)
        # Near the head/crown (top 36%), only pure black is background so dark hair is never clipped
        if y_Ratio < 0.36:
            return lum <= 18 and (r + g + b) <= 42
        if lum <= 38 and (r + g + b) <= 90:
            return True
        # Dark warm brown/amber void between wings/swords
        if lum <= 54 and r > b * 1.8 and g < 38 and b < 22:
            return True
        return False

    for x in range(w):
        for y in (0, 1, h - 2, h - 1):
            r, g, b, _ = px[x, y]
            if is_bg_pixel(r, g, b, y / h) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, 1, w - 2, w - 1):
            r, g, b, _ = px[x, y]
            if is_bg_pixel(r, g, b, y / h) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))

    # Also seed enclosed pockets between sword fan, wings, and ribbons on left/right/top sides
    if not keep_inner_dark:
        pocket_seeds = [
            (int(w * 0.22), int(h * 0.45)),
            (int(w * 0.78), int(h * 0.45)),
            (int(w * 0.28), int(h * 0.36)),
            (int(w * 0.72), int(h * 0.36)),
            (int(w * 0.33), int(h * 0.25)),
            (int(w * 0.67), int(h * 0.25)),
            (int(w * 0.38), int(h * 0.20)),
            (int(w * 0.62), int(h * 0.20)),
            (int(w * 0.26), int(h * 0.52)),
            (int(w * 0.74), int(h * 0.52)),
        ]
        for sx, sy in pocket_seeds:
            r, g, b, _ = px[sx, sy]
            if is_bg_pixel(r, g, b, sy / h) and not visited[sy][sx]:
                visited[sy][sx] = True
                q.append((sx, sy))

    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    while q:
        cx, cy = q.popleft()
        # Protect central torso/lotus while removing background between swords/wings
        in_torso = (abs(cx - w * 0.5) / (w * 0.145)) ** 2 + ((cy - h * 0.54) / (h * 0.24)) ** 2 < 1.0
        if in_torso:
            continue
        for dx, dy in dirs:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b, _ = px[nx, ny]
                if is_bg_pixel(r, g, b, ny / h):
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
        if cd >= 12:
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
                if d <= 10:
                    r, g, b, a = px[x, y]
                    lum = max(r, g, b)
                    if lum < 95:
                        # Smoothly convert dark outer glow to alpha-blended glow without any black ring
                        alpha = int(min(255, max(0, (lum - 18) * 3.2 * min(1.0, d / 5.0))))
                        px[x, y] = (r, g, b, alpha)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    cw, ch = out_size
    scale = min((cw - 8) / rgba.width, (ch - 8) / rgba.height)
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

    if SHEET_HIGH_SRC.exists():
        sheet2 = Image.open(SHEET_HIGH_SRC).convert("RGBA")
        sw2, sh2 = sheet2.size
        mx2, my2 = sw2 // 2, sh2 // 2

        quadrants_high = {
            "tutien_tier5.png": ((0, 0, mx2, my2), False),
            "tutien_tier6.png": ((mx2, 0, sw2, my2), False),
            "tutien_tier7.png": ((0, my2, mx2, sh2), True),
            "tutien_tier8.png": ((mx2, my2, sw2, sh2), False),
        }
        for name, (box, keep_dark) in quadrants_high.items():
            sub = sheet2.crop(box)
            out_img = extract_high_tier_character(sub, out_size=(270, 300), keep_inner_dark=keep_dark)
            out_path = SPRITES_DIR / name
            out_img.save(out_path)
            print("Saved high-tier sprite:", out_path)


if __name__ == "__main__":
    main()
