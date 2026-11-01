import os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

ASSET_DIR = r"e:\D\CODE\tiktok-live\public\assets\asset"
OUT_DIR = r"e:\D\CODE\tiktok-live\public\assets\sprites"
os.makedirs(OUT_DIR, exist_ok=True)


def extract_character_rgba(img_pil, crop_box, bg_thresh=232, dist_thresh=24.0):
    """
    Cắt vùng nhân vật từ sprite sheet, xóa nền trắng/kem và các đường kẻ mảnh (callout lines)
    bằng thuật toán Flood-Fill từ biên ngoài + lọc thành phần liên thông lớn nhất (nhân vật chính)
    + lấp kín 100% lỗ hổng bên trong nhân vật để nhân vật đặc 100% không bị thủng.
    """
    sub = img_pil.crop(crop_box).convert("RGB")
    arr = np.array(sub, dtype=np.float32)
    h, w, _ = arr.shape

    # Ước lượng màu nền giấy bằng phân vị sáng (92nd percentile) để không bị ảnh hưởng bởi hình ở góc
    bg_color = np.percentile(arr, 92, axis=(0, 1))

    # Khoảng cách màu so với nền trắng/kem
    dist = np.linalg.norm(arr - bg_color, axis=2)
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

    # Pixel là nền nếu rất sáng và gần màu nền
    is_bg_candidate = (dist < dist_thresh) & (lum > bg_thresh)

    # Bước 1: Xóa các đường kẻ chỉ dẫn mỏng (callout lines rộng 1-2px nằm ngoài nhân vật)
    # Một pixel tiền cảnh mà cả 2 phía ngang HOẶC cả 2 phía dọc cách 2px đều là nền -> đó là đường kẻ mảnh 1-2px
    fg_raw = ~is_bg_candidate
    fg_clean = fg_raw.copy()
    for _ in range(2):
        # Kiểm tra độ dày ngang và dọc
        horiz_thin = np.zeros_like(fg_clean)
        vert_thin = np.zeros_like(fg_clean)
        horiz_thin[:, 2:w-2] = (~fg_clean[:, 0:w-4]) & (~fg_clean[:, 4:w])
        vert_thin[2:h-2, :] = (~fg_clean[0:h-4, :]) & (~fg_clean[4:h, :])
        # Chỉ xóa nếu không phải nét vẽ đậm màu đen (lum < 120)
        is_callout_line = (horiz_thin | vert_thin) & (lum > 145)
        fg_clean[is_callout_line] = False

    # Bước 2: Giữ lại thành phần liên thông lớn nhất (nhân vật chính), loại bỏ mọi chữ hoặc rác rời rạc
    visited = np.zeros((h, w), dtype=bool)
    best_comp = []
    for y in range(h):
        for x in range(w):
            if fg_clean[y, x] and not visited[y, x]:
                comp = []
                q = deque([(y, x)])
                visited[y, x] = True
                while q:
                    cy, cx = q.popleft()
                    comp.append((cy, cx))
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and fg_clean[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            q.append((ny, nx))
                if len(comp) > len(best_comp):
                    best_comp = comp

    char_mask = np.zeros((h, w), dtype=bool)
    for cy, cx in best_comp:
        char_mask[cy, cx] = True

    # Bước 3: Lấp kín 100% bên trong nhân vật bằng cách Flood-Fill phần nền từ 4 cạnh biên ngoài vào
    exterior_bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        if not char_mask[0, x]:
            exterior_bg[0, x] = True
            q.append((0, x))
        if not char_mask[h - 1, x]:
            exterior_bg[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(h):
        if not char_mask[y, 0] and not exterior_bg[y, 0]:
            exterior_bg[y, 0] = True
            q.append((y, 0))
        if not char_mask[y, w - 1] and not exterior_bg[y, w - 1]:
            exterior_bg[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        cy, cx = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not exterior_bg[ny, nx] and not char_mask[ny, nx]:
                exterior_bg[ny, nx] = True
                q.append((ny, nx))

    solid_fg = ~exterior_bg

    # Bước 4: Khử răng cưa (Anti-aliasing) nhẹ ở đúng 1px viền ngoài cùng của nhân vật
    alpha = (solid_fg.astype(np.uint8) * 255)
    alpha_pil = Image.fromarray(alpha, mode="L")
    # Làm mượt nhẹ biên 1px
    alpha_smooth = alpha_pil.filter(ImageFilter.GaussianBlur(radius=0.65))
    alpha_arr = np.array(alpha_smooth, dtype=np.float32)
    # Đảm bảo bên trong đặc 100% (255) và bên ngoài trong suốt 100% (0)
    alpha_arr = np.clip((alpha_arr - 35.0) * (255.0 / 210.0), 0, 255).astype(np.uint8)

    # Cắt gọn theo bounding box thực tế của nhân vật
    ys, xs = np.where(alpha_arr > 10)
    if len(ys) == 0:
        return Image.new("RGBA", (64, 64), (0, 0, 0, 0))

    y0, y1 = max(0, ys.min() - 2), min(h, ys.max() + 3)
    x0, x1 = max(0, xs.min() - 2), min(w, xs.max() + 3)

    rgb_cropped = np.array(sub, dtype=np.uint8)[y0:y1, x0:x1]
    a_cropped = alpha_arr[y0:y1, x0:x1]

    # Khử viền sáng ở các pixel bán trong suốt sát biên
    edge_mask = (a_cropped > 0) & (a_cropped < 240)
    rgb_cropped[edge_mask] = (rgb_cropped[edge_mask].astype(np.float32) * 0.78).astype(np.uint8)

    rgba = np.dstack([rgb_cropped, a_cropped])
    return Image.fromarray(rgba, mode="RGBA")


def place_on_canvas(sprite_rgba, canvas_w=320, canvas_h=520, bottom_pad=12):
    """
    Đặt nhân vật vào khung chuẩn (canvas_w x canvas_h), căn giữa theo trục ngang trọng tâm cơ thể
    và đặt chân/đầu gối cố định tại (canvas_h - bottom_pad) để khi chuyển frame không bao giờ bị lệch!
    """
    arr = np.array(sprite_rgba)
    a = arr[:, :, 3]
    ys, xs = np.where(a > 128)
    if len(xs) == 0:
        return Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    # Tính trục trọng tâm ngang của nửa trên cơ thể (vai & đầu) để khi bước chân không bị lắc ngang
    h_sp, w_sp = a.shape
    upper_ys, upper_xs = np.where(a[:int(h_sp * 0.65), :] > 128)
    center_x = int(np.median(upper_xs)) if len(upper_xs) > 0 else w_sp // 2

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    paste_x = (canvas_w // 2) - center_x
    paste_y = canvas_h - bottom_pad - h_sp
    canvas.paste(sprite_rgba, (paste_x, paste_y), sprite_rgba)
    return canvas


# Danh sách tọa độ cắt các tư thế từ 6 sheet (1376 x 768)
EXTRACTIONS = [
    # Sheet 1: Mặt sau Đứng & Quỳ góc 3/4 (Nam & Nữ)
    ("sheet_1.jpg", (92, 40, 360, 748), "male_back_stand_s1.png", (320, 710)),
    ("sheet_1.jpg", (370, 232, 682, 748), "male_back_kneel_s1.png", (340, 520)),
    ("sheet_1.jpg", (732, 40, 962, 748), "female_back_stand_s1.png", (320, 710)),
    ("sheet_1.jpg", (946, 282, 1282, 748), "female_back_kneel_s1.png", (340, 520)),

    # Sheet 4: Phật Tử Nam - Mặt Lưng (Đứng, Cúi Xá, Bước Đi)
    ("sheet_4.jpg", (75, 40, 355, 745), "male_back_idle.png", (320, 710)),
    ("sheet_4.jpg", (395, 95, 685, 748), "male_back_bow.png", (320, 710)),
    ("sheet_4.jpg", (710, 40, 1000, 745), "male_back_walk_l.png", (320, 710)),

    # Sheet 5: Phật Tử Nữ - Mặt Lưng (Đứng, Cúi Xá, Bước Đi)
    ("sheet_5.jpg", (160, 36, 415, 740), "female_back_idle.png", (320, 710)),
    ("sheet_5.jpg", (570, 88, 860, 740), "female_back_bow.png", (320, 710)),
    ("sheet_5.jpg", (1010, 36, 1285, 740), "female_back_walk_l.png", (320, 710)),

    # Sheet 3: Phật Tử Nam - Lạy, Quỳ, Ngồi Thiền
    ("sheet_3.jpg", (20, 370, 575, 680), "male_prostrate.png", (560, 380)),
    ("sheet_3.jpg", (605, 58, 980, 682), "male_kneel_pray.png", (380, 620)),
    ("sheet_3.jpg", (990, 165, 1362, 675), "male_meditate.png", (380, 520)),

    # Sheet 6: Phật Tử Nữ - Quỳ, Lạy, Ngồi Thiền
    ("sheet_6.jpg", (98, 65, 450, 678), "female_kneel_pray.png", (380, 620)),
    ("sheet_6.jpg", (470, 310, 920, 678), "female_prostrate.png", (480, 380)),
    ("sheet_6.jpg", (940, 95, 1330, 678), "female_meditate.png", (400, 560)),

    # Sheet 2: Bước đi góc nghiêng / 3/4
    ("sheet_2.jpg", (45, 50, 345, 735), "male_walk_3q.png", (320, 680)),
    ("sheet_2.jpg", (360, 50, 655, 735), "male_walk_side.png", (320, 680)),
    ("sheet_2.jpg", (685, 155, 905, 735), "female_walk_pray.png", (300, 600)),
    ("sheet_2.jpg", (912, 155, 1112, 735), "female_walk_side.png", (300, 600)),
]


def make_straight_kneeling_sprite(idle_rgba_pil, canvas_w=340, canvas_h=520, bottom_pad=12):
    """
    Tạo tư thế QUỲ XOAY THẲNG 100% HƯỚNG CHÍNH DIỆN VÀO PHẬT từ sprite đứng mặt lưng chuẩn
    (male_back_idle / female_back_idle) bằng phép biến đổi ngược nội suy tuyến tính (bilinear inverse warp):
    - Giữ nguyên 100% phần Đầu + Cổ + Vai + Hai tay chắp + Lưng trên nhìn thẳng cân đối.
    - Tà áo dài (từ hông xuống gấu áo có viền mực đen) hạ thấp và mở nhẹ sang hai bên đầu gối.
    - Phần ống quần đứng thu gọn lại thành nếp gấp cổ chân và hai đế giày xếp gọn gàng dưới gấu áo.
    """
    arr = np.array(idle_rgba_pil, dtype=np.float32)
    h_in, w_in, _ = arr.shape
    a = arr[:, :, 3]
    ys, xs = np.where(a > 128)
    if len(ys) == 0:
        return Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    top_y = float(ys.min())
    bot_y = float(ys.max())
    full_h = bot_y - top_y
    cx_in = float(np.median(xs))

    # Các mốc giải phẫu trên ảnh gốc (tính theo tỷ lệ chiều cao full_h):
    # - 0.00 -> 0.48: Đầu, cổ, vai, khuỷu tay chắp trước ngực, lưng trên
    # - 0.48 -> 0.855: Thân áo lam dài xuống hết đường viền gấu áo
    # - 0.855 -> 0.940: Ống quần đứng (thu gọn khi gập gối quỳ)
    # - 0.940 -> 1.00: Hai bàn chân/đế giày + bóng đổ dưới đệm
    s0 = top_y
    s1 = top_y + full_h * 0.480
    s2 = top_y + full_h * 0.855
    s3 = top_y + full_h * 0.940
    s4 = bot_y

    d_h1 = (s1 - s0) * 0.90
    d_h2 = (s2 - s1) * 0.45
    d_h3 = (s3 - s2) * 0.10
    d_h4 = (s4 - s3) * 0.62

    total_dst_h = int(round(d_h1 + d_h2 + d_h3 + d_h4))
    dst_bot_y = canvas_h - bottom_pad
    dst_top_y = dst_bot_y - total_dst_h
    cx_out = canvas_w / 2.0

    d0 = float(dst_top_y)
    d1 = d0 + d_h1
    d2 = d1 + d_h2
    d3 = d2 + d_h3
    d4 = float(dst_bot_y)

    out = np.zeros((canvas_h, canvas_w, 4), dtype=np.float32)

    for dy in range(max(0, int(d0)), min(canvas_h, int(d4) + 1)):
        # 1. Tính tọa độ nguồn sy liên tục theo từng đoạn giải phẫu
        if dy <= d1:
            t = (dy - d0) / max(1.0, d1 - d0)
            sy = s0 + t * (s1 - s0)
            flare = 1.0
        elif dy <= d2:
            t = (dy - d1) / max(1.0, d2 - d1)
            # Nén mượt phần tà áo xuống đầu gối
            sy = s1 + (t ** 0.95) * (s2 - s1)
            # Đường cong S-curve mượt (đạo hàm = 0 tại thắt lưng t=0) giúp tà áo mở tự nhiên không bị gãy góc
            smooth_s = 0.5 - 0.5 * np.cos(min(1.0, t * 1.15) * np.pi)
            flare = 1.0 + 0.16 * smooth_s
        elif dy <= d3:
            t = (dy - d2) / max(1.0, d3 - d2)
            sy = s2 + t * (s3 - s2)
            flare = 1.14 - 0.18 * t
        else:
            t = (dy - d3) / max(1.0, d4 - d3)
            sy = s3 + t * (s4 - s3)
            # Hai bàn chân thu gần nhau hơn một chút khi quỳ
            flare = 0.92

        sy = np.clip(sy, 0.0, h_in - 1.001)
        y0 = int(np.floor(sy))
        y1 = min(h_in - 1, y0 + 1)
        wy = sy - y0

        # Vector hóa theo trục ngang dx với nội suy song tuyến tính (bilinear)
        dx_arr = np.arange(canvas_w, dtype=np.float32)
        sx_arr = cx_in + (dx_arr - cx_out) / flare
        valid = (sx_arr >= 0.0) & (sx_arr < w_in - 1.001)
        sx_v = sx_arr[valid]
        x0 = np.floor(sx_v).astype(np.int32)
        x1 = np.minimum(w_in - 1, x0 + 1)
        wx = (sx_v - x0)[:, None]

        top_row = (1.0 - wx) * arr[y0, x0] + wx * arr[y0, x1]
        bot_row = (1.0 - wx) * arr[y1, x0] + wx * arr[y1, x1]
        out[dy, valid] = (1.0 - wy) * top_row + wy * bot_row

    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), mode="RGBA")


def make_kneel_bow_frame(aligned_kneel_pil, bow_depth=0.22):
    """
    Tạo frame cúi lạy mượt từ tư thế quỳ mặt lưng (male_back_kneel / female_back_kneel):
    - Giữ cố định 100% phần chân, bàn chân và tà áo dưới đang quỳ trên đệm.
    - Nửa thân trên, vai và đầu hạ thấp xuống phía trước theo đúng phối cảnh nhìn từ sau lưng.
    """
    arr = np.array(aligned_kneel_pil, dtype=np.uint8)
    h, w, _ = arr.shape
    a = arr[:, :, 3]
    ys, xs = np.where(a > 128)
    if len(ys) == 0:
        return aligned_kneel_pil

    top_y = int(ys.min())
    bot_y = int(ys.max())
    char_h = bot_y - top_y
    # Điểm bản lề thắt lưng/hông khi quỳ (khoảng 62% từ đỉnh đầu xuống chân)
    hip_y = top_y + int(char_h * 0.62)

    out = np.zeros_like(arr)
    # 1. Giữ nguyên phần từ hông xuống bàn chân
    out[hip_y:, :, :] = arr[hip_y:, :, :]

    # 2. Phần thân trên (từ top_y đến hip_y) nén dọc xuống theo bow_depth và hơi mở nhẹ lưng
    upper_h = hip_y - top_y
    new_upper_h = max(10, int(upper_h * (1.0 - bow_depth)))
    new_top_y = hip_y - new_upper_h

    cx = w / 2.0
    for dst_y in range(new_top_y, hip_y):
        # t = 0 tại hip_y, t = 1 tại đỉnh đầu
        t = (hip_y - dst_y) / float(new_upper_h)
        # Phi tuyến nhẹ để phần đầu cúi gập xuống nhiều hơn phần thắt lưng
        src_t = t ** (1.0 - bow_depth * 0.35)
        src_y = int(round(hip_y - src_t * upper_h))
        src_y = max(top_y, min(hip_y - 1, src_y))

        # Khi cúi về phía trước, phần lưng giữa hơi bè ngang nhẹ (perspective foreshortening)
        width_scale = 1.0 + bow_depth * 0.18 * np.sin(t * np.pi)
        for dst_x in range(w):
            src_x = int(round(cx + (dst_x - cx) / width_scale))
            if 0 <= src_x < w:
                out[dst_y, dst_x] = arr[src_y, src_x]

    return Image.fromarray(out, mode="RGBA")


for sheet_name, box, out_name, (cw, ch) in EXTRACTIONS:
    sheet_path = os.path.join(ASSET_DIR, sheet_name)
    img = Image.open(sheet_path)
    bg_t = 214 if sheet_name == "sheet_6.jpg" else 232
    dist_t = 32.0 if sheet_name == "sheet_6.jpg" else 24.0
    raw_rgba = extract_character_rgba(img, box, bg_thresh=bg_t, dist_thresh=dist_t)
    aligned = place_on_canvas(raw_rgba, cw, ch, bottom_pad=10)
    out_path = os.path.join(OUT_DIR, out_name)
    aligned.save(out_path, "PNG")
    print(f"Saved {out_name} ({aligned.size})")

    # Tạo thêm frame bước chân phải (mirror ngang) cho walk_l để bước chân trái - phải mượt 100%
    if out_name.endswith("_walk_l.png"):
        mirrored_raw = raw_rgba.transpose(Image.FLIP_LEFT_RIGHT)
        mirrored_aligned = place_on_canvas(mirrored_raw, cw, ch, bottom_pad=10)
        r_name = out_name.replace("_walk_l.png", "_walk_r.png")
        mirrored_aligned.save(os.path.join(OUT_DIR, r_name), "PNG")
        print(f"Saved {r_name} ({mirrored_aligned.size})")

    # Tạo bộ Quỳ Xoay Thẳng 100% Hướng Chính Diện Vào Phật (kneel, kneel_bow1, kneel_bow2, kneel_gold) từ _back_idle.png
    if out_name.endswith("_back_idle.png"):
        kneel_straight = make_straight_kneeling_sprite(aligned, 340, 520, bottom_pad=12)
        k_name = out_name.replace("_back_idle.png", "_back_kneel.png")
        kneel_straight.save(os.path.join(OUT_DIR, k_name), "PNG")

        bow1 = make_kneel_bow_frame(kneel_straight, bow_depth=0.18)
        bow2 = make_kneel_bow_frame(kneel_straight, bow_depth=0.36)
        b1_name = out_name.replace("_back_idle.png", "_back_kneel_bow1.png")
        b2_name = out_name.replace("_back_idle.png", "_back_kneel_bow2.png")
        bow1.save(os.path.join(OUT_DIR, b1_name), "PNG")
        bow2.save(os.path.join(OUT_DIR, b2_name), "PNG")

        # Tạo thêm phiên bản Áo Hoàng Kim (Hộ Pháp 99+ xu) cho tư thế quỳ xoay thẳng mặt lưng
        arr_k = np.array(kneel_straight, dtype=np.float32)
        r, g, b, a = arr_k[:, :, 0], arr_k[:, :, 1], arr_k[:, :, 2], arr_k[:, :, 3]
        ys_k = np.where(a > 128)[0]
        top_k, bot_k = int(ys_k.min()), int(ys_k.max())
        h_k = bot_k - top_k
        collar_y = top_k + int(h_k * 0.208)
        hem_y = top_k + int(h_k * 0.924)
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
        yy = np.arange(arr_k.shape[0])[:, None]
        is_robe = (a > 128) & (yy >= collar_y) & (yy <= hem_y) & (chroma < 18.0) & (lum > 55.0) & (lum < 215.0)
        gold_arr = arr_k.copy()
        gold_arr[is_robe, 0] = np.clip(lum[is_robe] * 1.34 + 16.0, 0, 255)
        gold_arr[is_robe, 1] = np.clip(lum[is_robe] * 1.05 + 4.0, 0, 255)
        gold_arr[is_robe, 2] = np.clip(lum[is_robe] * 0.34, 0, 255)
        gold_img = Image.fromarray(gold_arr.astype(np.uint8), mode="RGBA")
        g_name = out_name.replace("_back_idle.png", "_back_kneel_gold.png")
        gold_img.save(os.path.join(OUT_DIR, g_name), "PNG")
        print(f"Saved straight kneeling set: {k_name}, {b1_name}, {b2_name}, {g_name}")

print("ALL SPRITES EXTRACTED SUCCESSFULLY!")
