/**
 * Hệ thống Âm Thanh Chùa Online & Thiền Đường:
 * 1. Giọng đọc Tiếng Việt chuẩn 100% qua /api/tts (Google Vietnamese TTS tl=vi) + Nhịp Mõ
 * 2. Máy Phát Nhạc Thiền Đa Kênh (Giai điệu Ngũ Cung Đàn Tranh / Chuông Xoay / Sáo Thiền + Hỗ trợ nạp MP3)
 * 3. Đại Hồng Chung & Mõ Tụng Kinh
 */
class SacredAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.85;
    this.musicVolume = 0.45;
    this.pitchHz = -10;
    this.speedPct = -8;
    this.reverbPct = 25;
    this.woodenFishBpm = 46;

    this.ambientRunning = false;
    this.ambientTrackId = 1;
    this.ambientNodes = [];
    this.ambientTimer = null;

    this.customAudioEl = null;
    this.customTrackName = '';
    this.ttsAudioEl = null;
    this.ttsCancelled = false;
    this.woodenFishLoopTimer = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  applySettings(settings = {}) {
    if (typeof settings.themeId === 'number') this.themeId = settings.themeId;
    if (typeof settings.voicePitchHz === 'number') this.pitchHz = settings.voicePitchHz;
    if (typeof settings.voiceSpeedPct === 'number') this.speedPct = settings.voiceSpeedPct;
    if (typeof settings.reverbPct === 'number') this.reverbPct = settings.reverbPct;
    if (typeof settings.woodenFishBpm === 'number') this.woodenFishBpm = settings.woodenFishBpm;
    if (typeof settings.bgMusicVolume === 'number') {
      this.setMusicVolume(settings.bgMusicVolume);
    }
    if (typeof settings.bgTrackId === 'number' && settings.bgTrackId !== this.ambientTrackId) {
      this.ambientTrackId = settings.bgTrackId;
      if (this.ambientRunning && !this.customAudioEl) {
        this.stopAmbient();
        this.startAmbient();
      }
    }
    if (typeof settings.bgMusicUrl === 'string') {
      if (settings.bgMusicUrl.startsWith('synth:')) {
        const trackNum = Number(settings.bgMusicUrl.split(':')[1]) || 1;
        this.clearCustomAudio();
        this.ambientTrackId = trackNum;
      } else if (settings.bgMusicUrl && this.currentCustomUrl !== settings.bgMusicUrl) {
        this.currentCustomUrl = settings.bgMusicUrl;
        if (this.customAudioEl) {
          this.customAudioEl.pause();
        }
        this.customAudioEl = new Audio(settings.bgMusicUrl);
        this.customAudioEl.loop = true;
        this.customAudioEl.volume = this.musicVolume;
        this.customTrackName = decodeURIComponent(settings.bgMusicUrl.split('/').pop() || 'Nhạc nền');
        if (this.ambientRunning && !this.muted) {
          this.customAudioEl.play().catch(() => {});
        }
      }
    }
    if (typeof settings.bgMusicPlaying === 'boolean') {
      if (settings.bgMusicPlaying && !this.ambientRunning) {
        this.startAmbient();
      } else if (!settings.bgMusicPlaying && this.ambientRunning) {
        this.stopAmbient();
      }
    }
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, Number(vol) || 0.45));
    if (this.customAudioEl) {
      this.customAudioEl.volume = this.musicVolume;
    }
    if (this.ambientMaster && this.ctx) {
      this.ambientMaster.gain.setTargetAtTime(0.14 * this.musicVolume, this.ctx.currentTime, 0.1);
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.stopAmbient();
      this.stopSpeech();
    }
    return this.muted;
  }

  /**
   * Tiếng Đại Hồng Chung trầm ấm
   */
  playGrandBell(strikes = 1) {
    if (this.muted) return;
    this.init();

    const triggerSingle = (delaySec = 0) => {
      const now = this.ctx.currentTime + delaySec;
      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.42 * this.volume, now);
      master.connect(this.ctx.destination);

      const baseFreq = 130.81;
      const partials = [
        { ratio: 0.5, amp: 0.5, decay: 5.8 },
        { ratio: 1.0, amp: 0.85, decay: 5.0 },
        { ratio: 1.004, amp: 0.45, decay: 4.8 },
        { ratio: 1.189, amp: 0.5, decay: 3.9 },
        { ratio: 1.5, amp: 0.35, decay: 3.2 },
        { ratio: 2.0, amp: 0.55, decay: 2.8 }
      ];

      partials.forEach((p) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * p.ratio, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(p.amp, now + 0.016);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(gain);
        gain.connect(master);
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    };

    for (let i = 0; i < strikes; i++) {
      triggerSingle(i * 1.55);
    }
  }

  /**
   * Tiếng Chuông Gia Trì 432Hz
   */
  playLotusChime() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.3 * this.volume, now);
    master.connect(this.ctx.destination);

    const freqs = [432, 433.5, 648, 864, 1296];
    const amps = [0.6, 0.3, 0.35, 0.25, 0.12];
    const decays = [3.2, 3.0, 2.4, 1.8, 1.1];

    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(amps[idx], now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decays[idx]);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + decays[idx] + 0.05);
    });
  }

  /**
   * Tiếng Mõ Tụng Kinh
   */
  playWoodenFish(beats = 1) {
    if (this.muted) return;
    this.init();

    const triggerKnock = (delaySec = 0) => {
      const now = this.ctx.currentTime + delaySec;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(425, now);
      osc.frequency.exponentialRampToValueAtTime(308, now + 0.035);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(360, now);
      filter.Q.setValueAtTime(4.8, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.52 * this.volume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    };

    for (let i = 0; i < beats; i++) {
      triggerKnock(i * 0.26);
    }
  }

  /**
   * Tiếng nước rơi tũm nhẹ & chuông ngọc khi Phật tử thả cá / rùa phóng sanh xuống hồ
   */
  playWaterSplash() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;

    // 1. Giọt nước tũm xuống hồ (pitch bend lên nhẹ như bong bóng nước)
    const dropOsc = this.ctx.createOscillator();
    const dropGain = this.ctx.createGain();
    dropOsc.type = 'sine';
    dropOsc.frequency.setValueAtTime(240, now);
    dropOsc.frequency.exponentialRampToValueAtTime(620, now + 0.14);

    dropGain.gain.setValueAtTime(0.0001, now);
    dropGain.gain.linearRampToValueAtTime(0.32 * this.volume, now + 0.02);
    dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    dropOsc.connect(dropGain);
    dropGain.connect(this.ctx.destination);
    dropOsc.start(now);
    dropOsc.stop(now + 0.25);

    // 2. Tiếng chuông nước thanh tịnh ngân nhẹ sau khi cá chạm mặt hồ
    const chimeOsc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(528, now + 0.08);
    chimeGain.gain.setValueAtTime(0.0001, now + 0.08);
    chimeGain.gain.linearRampToValueAtTime(0.22 * this.volume, now + 0.11);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.ctx.destination);
    chimeOsc.start(now + 0.08);
    chimeOsc.stop(now + 1.45);
  }

  /**
   * Tiếng Sấm Chớp Thiên Lôi Độ Kiếp (Tia sét giáng + Tiếng sấm rền vang)
   */
  playThunderStrike() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;

    // 1. Tiếng nổ tia sét xé gió (White noise bandpass + high-freq crack)
    const bufferSize = Math.floor(this.ctx.sampleRate * 1.45);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, 1.6);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1650, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + 1.35);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.58 * this.volume, now + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 1.45);

    // 2. Tiếng sấm trầm rền dưới đáy (Sub-bass rumble)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(92, now);
    subOsc.frequency.exponentialRampToValueAtTime(34, now + 1.15);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.36 * this.volume, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 1.3);
  }

  /**
   * Tiếng Phi Kiếm Ngân Vang (Vạn Kiếm Quy Tông)
   */
  playSwordWhoosh() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;
    const freqs = [880, 1320, 1760, 2640];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.055;
      osc.frequency.setValueAtTime(f * 0.85, t0);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t0 + 0.18);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.2 * this.volume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });
  }

  /**
   * Tiếng Cổ Cầm & Ngọc Bội Tu Tiên khi đệ tử Nhập Môn / Tương tác (Hoàn toàn KHÔNG có tiếng mõ chùa)
   */
  playTuTienJoinSound() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;
    // Tiếng gảy dây Cổ Cầm (Guqin/Guzheng pluck) + tiếng Ngọc Bội thanh mảnh
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t0 = now + idx * 0.065;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = idx < 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t0);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, t0);
      filter.frequency.exponentialRampToValueAtTime(650, t0 + 0.75);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.24 * this.volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.9);
    });
  }

  /**
   * Âm Thanh Đột Phá Cảnh Giới / Thăng Cấp Tu Tiên Hoành Tráng
   * (Cổ Cầm vuốt dây Ngũ Cung + Chấn động Đan Điền + Kiếm Ngân Cửu Thiên)
   */
  playBreakthroughSound() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;

    // 1. Chấn động Linh Khí Đan Điền (Deep Aura Boom)
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(115, now);
    boomOsc.frequency.exponentialRampToValueAtTime(38, now + 0.95);
    boomGain.gain.setValueAtTime(0.001, now);
    boomGain.gain.linearRampToValueAtTime(0.48 * this.volume, now + 0.03);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    boomOsc.connect(boomGain);
    boomGain.connect(this.ctx.destination);
    boomOsc.start(now);
    boomOsc.stop(now + 1.15);

    // 2. Cổ Cầm Vuốt Dây Thăng Thiên (Ascending Pentatonic Guzheng Glissando)
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5, 1567.98];
    scale.forEach((f, idx) => {
      const t0 = now + idx * 0.048;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.22 * this.volume, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.2);
    });

    // 3. Tiếng Tiên Kiếm Ngân Vang Ở Đỉnh Cảnh Giới
    const swordTime = now + 0.38;
    [1567.98, 2093.0, 2637.02].forEach((sf, i) => {
      const sOsc = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      sOsc.type = 'sine';
      sOsc.frequency.setValueAtTime(sf, swordTime);
      sGain.gain.setValueAtTime(0.0001, swordTime);
      sGain.gain.linearRampToValueAtTime((0.22 / (i + 1)) * this.volume, swordTime + 0.015);
      sGain.gain.exponentialRampToValueAtTime(0.0001, swordTime + 1.65);
      sOsc.connect(sGain);
      sGain.connect(this.ctx.destination);
      sOsc.start(swordTime);
      sOsc.stop(swordTime + 1.7);
    });
  }

  /**
   * Tách câu dài thành các đoạn <= 170 ký tự để phát qua Google Vietnamese TTS chuẩn xác
   */
  splitSentences(text) {
    const clean = String(text || '')
      .replace(/[🙏🪷☸✨🌸❤️🪙🐟🐢🐠]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return [];
    const rawParts = clean.split(/(?<=[.!?।,;])\s+/);
    const chunks = [];
    let current = '';

    rawParts.forEach((part) => {
      if ((current + ' ' + part).trim().length <= 175) {
        current = (current + ' ' + part).trim();
      } else {
        if (current) chunks.push(current);
        current = part.slice(0, 175);
      }
    });
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Đọc Tiếng Việt chuẩn 100% qua Server Proxy (/api/tts?text=...)
   * Không bao giờ bị giọng tiếng Anh đọc sai chữ Việt!
   */
  async speakChant(text, { withWoodenFish = true, onStart, onEnd } = {}) {
    if (this.muted) {
      if (onEnd) onEnd();
      return;
    }
    this.init();
    this.stopSpeech();
    this.ttsCancelled = false;

    const chunks = this.splitSentences(text);
    if (chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    const isTuTien = Number(this.themeId) === 7;
    if (isTuTien) {
      this.playTuTienJoinSound();
    } else {
      this.playLotusChime();
    }
    if (onStart) onStart();

    if (withWoodenFish && !isTuTien) {
      const intervalMs = Math.max(680, Math.round((60 / Math.max(25, this.woodenFishBpm)) * 1000));
      this.woodenFishLoopTimer = setInterval(() => {
        if (!this.ttsCancelled && !this.muted) {
          this.playWoodenFish(1);
        }
      }, intervalMs);
    }

    const rate = Math.max(0.72, Math.min(1.25, 1.0 + this.speedPct / 120));

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (this.ttsCancelled || this.muted) break;
        await new Promise((resolve) => {
          const audio = new Audio(`/api/tts?text=${encodeURIComponent(chunks[i])}`);
          this.ttsAudioEl = audio;
          audio.volume = Math.min(1, this.volume);
          audio.playbackRate = rate;
          audio.preservesPitch = false; // Cho phép giọng trầm ấm hơn khi giảm tốc độ
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });
      }
    } finally {
      if (this.woodenFishLoopTimer) {
        clearInterval(this.woodenFishLoopTimer);
        this.woodenFishLoopTimer = null;
      }
      if (!this.ttsCancelled && !this.muted) {
        this.playLotusChime();
      }
      if (onEnd) onEnd();
    }
  }

  stopSpeech() {
    this.ttsCancelled = true;
    if (this.ttsAudioEl) {
      try {
        this.ttsAudioEl.pause();
        this.ttsAudioEl.src = '';
      } catch (_e) {}
      this.ttsAudioEl = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.woodenFishLoopTimer) {
      clearInterval(this.woodenFishLoopTimer);
      this.woodenFishLoopTimer = null;
    }
  }

  /**
   * Bật / Tắt Nhạc Nền Thiền Đường
   */
  toggleAmbient() {
    if (this.ambientRunning) {
      this.stopAmbient();
      return false;
    }
    this.startAmbient();
    return true;
  }

  startAmbient() {
    if (this.muted || this.ambientRunning) return;
    this.init();
    this.ambientRunning = true;

    if (this.customAudioEl) {
      this.customAudioEl.volume = this.musicVolume;
      this.customAudioEl.play().catch(() => {});
      return;
    }

    const now = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.14 * this.musicVolume, now + 1.8);
    masterGain.connect(this.ctx.destination);
    this.ambientMaster = masterGain;

    // Nền hòa âm 432Hz êm dịu
    const baseFreqs = this.ambientTrackId === 2 ? [144, 216, 288] : [108, 162, 216, 324];
    this.ambientNodes = baseFreqs.map((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(idx === 0 ? 0.45 : 0.18 / idx, now);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      return { osc, gain };
    });

    // Giai điệu Đàn Tranh / Chuông Thiền Ngũ Cung (Pentatonic Zen Melody)
    const pentatonicScale =
      this.ambientTrackId === 2
        ? [288, 324, 384, 432, 486, 576, 648] // Giai điệu Sáo Trúc thanh tao
        : [216, 243, 288, 324, 384, 432, 486, 576]; // Giai điệu Chuông Xoay & Cổ Cầm

    let step = 0;
    const melodyPattern = [0, 2, 3, 4, 3, 5, 4, 2, 1, 3, 2, 0];

    const playMelodyNote = () => {
      if (!this.ambientRunning || this.muted || this.customAudioEl) return;
      const idx = melodyPattern[step % melodyPattern.length];
      step++;
      const freq = pentatonicScale[idx % pentatonicScale.length];
      const t = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = this.ambientTrackId === 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11 * this.musicVolume, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);

      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 2.9);
    };

    playMelodyNote();
    this.ambientTimer = setInterval(playMelodyNote, 2400);
  }

  stopAmbient() {
    this.ambientRunning = false;
    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.ambientMaster && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.ambientMaster.gain.linearRampToValueAtTime(0.0001, now + 0.4);
        setTimeout(() => {
          this.ambientNodes.forEach((n) => {
            try {
              n.osc.stop();
            } catch (_e) {}
          });
          this.ambientNodes = [];
        }, 450);
      } catch (_e) {}
    }
  }

  loadCustomMp3File(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    this.loadCustomAudioUrl(url, file.name);
  }

  loadCustomAudioUrl(url, name = 'Nhạc MP3') {
    if (!url) return;
    this.stopAmbient();
    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
    this.currentCustomUrl = url;
    this.customAudioEl = new Audio(url);
    this.customAudioEl.loop = true;
    this.customAudioEl.volume = this.musicVolume;
    this.customTrackName = name;
    this.ambientRunning = true;
    this.customAudioEl.play().catch(() => {});
  }

  clearCustomAudio() {
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl = null;
      this.customTrackName = '';
      this.currentCustomUrl = '';
    }
  }
}

window.sacredAudio = new SacredAudioEngine();
