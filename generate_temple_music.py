import os
import wave
import numpy as np

MUSIC_DIR = os.path.join(os.path.dirname(__file__), "public", "music")
os.makedirs(MUSIC_DIR, exist_ok=True)

SR = 22050  # 22.05kHz mono/stereo nhẹ, tương thích mọi trình duyệt


def save_wav(filename, samples_float):
    path = os.path.join(MUSIC_DIR, filename)
    clipped = np.clip(samples_float, -0.98, 0.98)
    pcm16 = (clipped * 32767.0).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm16.tobytes())
    print(f"Saved {path} ({len(pcm16) / SR:.1f}s)")


def synth_track_1_dan_tranh_432hz(duration=24.0):
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    # Hòa âm nền 108Hz + 216Hz + 324Hz
    pad = (
        0.18 * np.sin(2 * np.pi * 108.0 * t)
        + 0.12 * np.sin(2 * np.pi * 216.0 * t) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.12 * t))
        + 0.07 * np.sin(2 * np.pi * 324.0 * t)
    )
    # Giai điệu ngũ cung Đàn Tranh & Chuông Xoay
    notes = [288.0, 324.0, 384.0, 432.0, 486.0, 576.0, 486.0, 432.0, 384.0, 324.0, 288.0, 216.0]
    out = pad.copy()
    step_sec = 2.0
    for idx, freq in enumerate(notes):
        t0 = idx * step_sec
        mask = (t >= t0) & (t < min(duration, t0 + 3.2))
        dt = t[mask] - t0
        env = np.exp(-dt * 1.45) * (1.0 - np.exp(-dt * 45.0))
        pluck = (
            0.28 * np.sin(2 * np.pi * freq * dt)
            + 0.14 * np.sin(2 * np.pi * freq * 2.0 * dt) * np.exp(-dt * 2.5)
            + 0.06 * np.sin(2 * np.pi * freq * 3.0 * dt) * np.exp(-dt * 4.0)
        )
        out[mask] += pluck * env
    # Fade in / fade out mượt để loop không bị khựng
    fade_len = int(SR * 1.2)
    out[:fade_len] *= np.linspace(0, 1, fade_len)
    out[-fade_len:] *= np.linspace(1, 0, fade_len)
    return out


def synth_track_2_chuong_chua_tinh_tam(duration=24.0):
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    pad = (
        0.22 * np.sin(2 * np.pi * 130.81 * t)
        + 0.12 * np.sin(2 * np.pi * 196.0 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.1 * t))
        + 0.08 * np.sin(2 * np.pi * 261.63 * t)
    )
    out = pad.copy()
    # Tiếng Đại Hồng Chung & Chuông Gia Trì điểm nhịp
    bell_times = [0.5, 6.5, 12.5, 18.5]
    for bt in bell_times:
        mask = (t >= bt) & (t < min(duration, bt + 5.5))
        dt = t[mask] - bt
        bell = (
            0.32 * np.sin(2 * np.pi * 130.81 * dt) * np.exp(-dt * 0.7)
            + 0.20 * np.sin(2 * np.pi * 261.63 * dt) * np.exp(-dt * 1.1)
            + 0.12 * np.sin(2 * np.pi * 392.4 * dt) * np.exp(-dt * 1.6)
            + 0.10 * np.sin(2 * np.pi * 523.25 * dt) * np.exp(-dt * 2.2)
        ) * (1.0 - np.exp(-dt * 60.0))
        out[mask] += bell
    fade_len = int(SR * 1.2)
    out[:fade_len] *= np.linspace(0, 1, fade_len)
    out[-fade_len:] *= np.linspace(1, 0, fade_len)
    return out


def synth_track_3_sao_truc_thien_vien(duration=24.0):
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    pad = 0.14 * np.sin(2 * np.pi * 144.0 * t) + 0.10 * np.sin(2 * np.pi * 216.0 * t)
    out = pad.copy()
    melody = [288.0, 324.0, 384.0, 432.0, 384.0, 324.0, 288.0, 243.0]
    step_sec = 3.0
    for idx, freq in enumerate(melody):
        t0 = idx * step_sec
        mask = (t >= t0) & (t < min(duration, t0 + 2.8))
        dt = t[mask] - t0
        # Vibrato nhẹ của tiếng sáo trúc
        vib = 1.0 + 0.006 * np.sin(2 * np.pi * 5.2 * dt)
        env = np.sin(np.pi * (dt / 2.8)) ** 0.8
        flute = (
            0.25 * np.sin(2 * np.pi * freq * vib * dt)
            + 0.08 * np.sin(2 * np.pi * (freq * 2.0) * vib * dt)
        )
        out[mask] += flute * env
    fade_len = int(SR * 1.2)
    out[:fade_len] *= np.linspace(0, 1, fade_len)
    out[-fade_len:] *= np.linspace(1, 0, fade_len)
    return out


if __name__ == "__main__":
    save_wav("01_Nhac_Thien_Dan_Tranh_432Hz.wav", synth_track_1_dan_tranh_432hz())
    save_wav("02_Tieng_Chuong_Chua_Tinh_Tam.wav", synth_track_2_chuong_chua_tinh_tam())
    save_wav("03_Sao_Truc_Thien_Vien_Dem_Trang.wav", synth_track_3_sao_truc_thien_vien())
