import os
import shutil
import numpy as np
from PIL import Image, ImageFilter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "public", "assets")
SPRITES_DIR = os.path.join(ASSETS_DIR, "sprites")
os.makedirs(SPRITES_DIR, exist_ok=True)

ARTIFACT_KOI_SHEET = r"C:\Users\Admin\.gemini\antigravity\brain\26db4fd0-cacd-40f8-953d-f87f070506f9\koi_fish_spritesheet_1793474327467.jpg"
ARTIFACT_TURTLE_SHEET = r"C:\Users\Admin\.gemini\antigravity\brain\26db4fd0-cacd-40f8-953d-f87f070506f9\aquatic_creatures_spritesheet_1793474247612.jpg"

LOCAL_KOI_SHEET = os.path.join(SPRITES_DIR, "_source_koi_sheet.jpg")
LOCAL_TURTLE_SHEET = os.path.join(SPRITES_DIR, "_source_turtle_sheet.jpg")


def flood_fill_exterior_background(binary_bg):
    """
    BFS flood-fill từ 4 cạnh viền ảnh để chỉ lấy vùng nền đen BÊN NGOÀI con cá,
    giữ nguyên 100% các đốm đen (sumi) và mắt đen BÊN TRONG thân cá Koi Ngũ Sắc!
    """
    h, w = binary_bg.shape
    visited = np.zeros((h, w), dtype=bool)
    queue = []

    for x in range(w):
        if binary_bg[0, x]:
            visited[0, x] = True
            queue.append((0, x))
        if binary_bg[h - 1, x]:
            visited[h - 1, x] = True
            queue.append((h - 1, x))
    for y in range(h):
        if binary_bg[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            queue.append((y, 0))
        if binary_bg[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            queue.append((y, w - 1))

    head = 0
    while head < len(queue):
        cy, cx = queue[head]
        head += 1
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and binary_bg[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    return visited


def extract_clean_sprite(crop_img, target_size=(220, 96), threshold=18):
    """
    Tách nền đen #000000 bên ngoài bằng Flood-Fill + khử viền mượt (feathering)
    và giữ nguyên 100% đốm đen bên trong thân cá.
    """
    rgba = crop_img.convert("RGBA")
    arr = np.array(rgba, dtype=np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    max_c = np.maximum(np.maximum(r, g), b)

    # Nền đen có độ sáng rất thấp (< threshold)
    is_dark = max_c < threshold
    exterior_bg = flood_fill_exterior_background(is_dark)

    # Mặt nạ vật thể (1.0 = cá/rùa, 0.0 = nền ngoài)
    fg_mask = (~exterior_bg).astype(np.float32)

    # Làm mượt biên 1.2px và dùng ramp độ sáng ở sát rìa ngoài để vây cá mềm mại không bị răng cưa
    mask_img = Image.fromarray((fg_mask * 255).astype(np.uint8), mode="L")
    eroded = mask_img.filter(ImageFilter.MinFilter(3))
    blurred = eroded.filter(ImageFilter.GaussianBlur(1.1))
    soft_alpha = np.array(blurred, dtype=np.float32) / 255.0

    # Ở vùng rìa vây cá (nơi fg_mask=1 nhưng soft_alpha < 0.95), kết hợp theo độ sáng max_c để không bị viền đen
    edge_zone = (fg_mask > 0.5) & (soft_alpha < 0.95)
    lum_alpha = np.clip((max_c - 8.0) / 48.0, 0.0, 1.0)
    final_alpha = np.where(edge_zone, np.minimum(soft_alpha, lum_alpha), soft_alpha)

    # Khử ám đen ở các pixel bán trong suốt sát rìa vây
    safe_a = np.maximum(final_alpha, 0.15)[..., None]
    unpremult_rgb = np.clip(arr[..., :3] / np.where(edge_zone[..., None], safe_a, 1.0), 0, 255)

    out_arr = np.zeros_like(arr, dtype=np.uint8)
    out_arr[..., :3] = unpremult_rgb.astype(np.uint8)
    out_arr[..., 3] = np.clip(final_alpha * 255.0, 0, 255).astype(np.uint8)

    # Cắt sát bounding box của vật thể và đặt vào khung chuẩn target_size
    alpha_channel = out_arr[..., 3]
    ys, xs = np.where(alpha_channel > 12)
    if len(xs) > 0 and len(ys) > 0:
        x0, x1 = max(0, xs.min() - 4), min(out_arr.shape[1], xs.max() + 5)
        y0, y1 = max(0, ys.min() - 4), min(out_arr.shape[0], ys.max() + 5)
        out_arr = out_arr[y0:y1, x0:x1]

    trimmed = Image.fromarray(out_arr, mode="RGBA")
    tw, th = target_size
    scale = min((tw - 8) / trimmed.width, (th - 8) / trimmed.height)
    new_w = max(1, int(round(trimmed.width * scale)))
    new_h = max(1, int(round(trimmed.height * scale)))
    resized = trimmed.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((tw - new_w) // 2, (th - new_h) // 2))
    return canvas


def build_all_realistic_pond_sprites():
    if os.path.exists(ARTIFACT_KOI_SHEET):
        shutil.copyfile(ARTIFACT_KOI_SHEET, LOCAL_KOI_SHEET)
    if os.path.exists(ARTIFACT_TURTLE_SHEET):
        shutil.copyfile(ARTIFACT_TURTLE_SHEET, LOCAL_TURTLE_SHEET)

    koi_sheet = Image.open(LOCAL_KOI_SHEET).convert("RGB")
    W, H = koi_sheet.size

    # 1. Cá Chép Đỏ / Koi Kohaku (Hàng 1: y = 0 .. 335)
    carp_crop = koi_sheet.crop((10, 5, W - 10, int(H * 0.33)))
    carp_sprite = extract_clean_sprite(carp_crop, target_size=(220, 96), threshold=20)
    carp_path = os.path.join(SPRITES_DIR, "fish_carp_red.png")
    carp_sprite.save(carp_path, "PNG")
    print("Saved realistic sprite:", carp_path)

    # 2. Cá Koi Hoàng Kim Yamabuki (Hàng 2: y = 335 .. 668)
    gold_crop = koi_sheet.crop((10, int(H * 0.33), W - 10, int(H * 0.66)))
    gold_sprite = extract_clean_sprite(gold_crop, target_size=(220, 96), threshold=20)
    gold_path = os.path.join(SPRITES_DIR, "fish_koi_gold.png")
    gold_sprite.save(gold_path, "PNG")
    print("Saved realistic sprite:", gold_path)

    # 3. Cá Koi Ngũ Sắc Showa/Sanke (Hàng 3: y = 668 .. H)
    calico_crop = koi_sheet.crop((10, int(H * 0.66), W - 10, H - 5))
    calico_sprite = extract_clean_sprite(calico_crop, target_size=(220, 96), threshold=22)
    calico_path = os.path.join(SPRITES_DIR, "fish_koi_calico.png")
    calico_sprite.save(calico_path, "PNG")
    print("Saved realistic sprite:", calico_path)

    # 4. Rùa Vàng Linh Quy (Góc dưới bên phải của _source_turtle_sheet.jpg)
    turtle_sheet = Image.open(LOCAL_TURTLE_SHEET).convert("RGB")
    TW, TH = turtle_sheet.size
    turtle_crop = turtle_sheet.crop((int(TW * 0.50), int(TH * 0.50), TW - 8, TH - 8))
    turtle_sprite = extract_clean_sprite(turtle_crop, target_size=(190, 155), threshold=20)
    turtle_path = os.path.join(SPRITES_DIR, "turtle_gold.png")
    turtle_sprite.save(turtle_path, "PNG")
    print("Saved realistic sprite:", turtle_path)


if __name__ == "__main__":
    build_all_realistic_pond_sprites()
