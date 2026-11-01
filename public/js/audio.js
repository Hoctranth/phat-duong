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
    this._ttsChunkResolve = null;
    this.woodenFishLoopTimer = null;

    // Hàng đợi đọc TTS tuần tự từng User 1 (Speech Queue) & hiển thị Quote
    this.speechQueue = [];
    this.isSpeakingQueue = false;
    this._speechQueueGen = 0;
    this.currentSpeechItem = null;
    this.externalQuoteState = null;
    this.maxSpeechQueueSize = 50;
    this._ttsDelayTimer = null;
    this._ttsDelayResolve = null;

    // Bộ đệm tiếng ồn sấm sét dựng sẵn & bộ giới hạn tần suất âm thanh (Cooldown)
    this._thunderNoiseBuffer = null;
    this._lastSoundAt = {};
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this._thunderNoiseBuffer && this.ctx) {
      this._getThunderNoiseBuffer();
    }
  }

  /**
   * Kiểm tra cooldown để tránh chồng chéo quá nhiều hiệu ứng âm thanh cùng lúc gây rè/lag
   */
  _canPlaySfx(key, cooldownMs = 0) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this._lastSoundAt[key] || 0;
    if (now - last < cooldownMs) {
      return false;
    }
    this._lastSoundAt[key] = now;
    return true;
  }

  /**
   * Khởi tạo 1 lần và tái sử dụng AudioBuffer cho tiếng sấm sét (tránh tính toán 64.000 mẫu mỗi lần gọi)
   */
  _getThunderNoiseBuffer() {
    if (this._thunderNoiseBuffer) return this._thunderNoiseBuffer;
    if (!this.ctx) return null;
    const durationSec = 0.95;
    const bufferSize = Math.floor(this.ctx.sampleRate * durationSec);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, 1.75);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    this._thunderNoiseBuffer = noiseBuffer;
    return this._thunderNoiseBuffer;
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
    if (!this._canPlaySfx('grandBell', 1200)) return;
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
    if (!this._canPlaySfx('lotusChime', 700)) return;
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
    if (!this._canPlaySfx('woodenFish', beats === 1 ? 200 : 90)) return;
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
    if (!this._canPlaySfx('waterSplash', 300)) return;
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
   * Đã tối ưu hóa tái sử dụng _getThunderNoiseBuffer() + cooldown chống giật lag
   */
  playThunderStrike() {
    if (this.muted) return;
    if (!this._canPlaySfx('thunder', 220)) return;
    this.init();

    const now = this.ctx.currentTime;
    const noiseBuffer = this._getThunderNoiseBuffer();

    // 1. Tiếng nổ tia sét xé gió (Cached noise + lowpass mượt mà)
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1150, now);
      filter.frequency.exponentialRampToValueAtTime(95, now + 0.88);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.24 * this.volume, now + 0.018);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.92);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.95);
    }

    // 2. Tiếng sấm trầm rền dưới đáy (Sub-bass rumble ấm áp, không bị rè)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(86, now);
    subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.88);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.18 * this.volume, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.92);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.95);
  }

  /**
   * Tiếng Phi Kiếm Ngân Vang (Vạn Kiếm Quy Tông)
   */
  playSwordWhoosh() {
    if (this.muted) return;
    if (!this._canPlaySfx('sword', 180)) return;
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
      gain.gain.linearRampToValueAtTime(0.11 * this.volume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.52);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.56);
    });
  }

  /**
   * Tiếng Cổ Cầm & Ngọc Bội Tu Tiên khi đệ tử Nhập Môn / Tương tác (Hoàn toàn KHÔNG có tiếng mõ chùa)
   */
  playTuTienJoinSound() {
    if (this.muted) return;
    if (!this._canPlaySfx('tutienJoin', 180)) return;
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
      filter.frequency.setValueAtTime(2600, t0);
      filter.frequency.exponentialRampToValueAtTime(650, t0 + 0.72);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.14 * this.volume, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.85);
    });
  }

  /**
   * Âm Thanh Đột Phá Cảnh Giới / Thăng Cấp Tu Tiên Hoành Tráng
   * (Cổ Cầm vuốt dây Ngũ Cung + Chấn động Đan Điền + Kiếm Ngân Cửu Thiên)
   */
  playBreakthroughSound() {
    if (this.muted) return;
    if (!this._canPlaySfx('breakthrough', 220)) return;
    this.init();

    const now = this.ctx.currentTime;

    // 1. Chấn động Linh Khí Đan Điền (Deep Aura Boom)
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(110, now);
    boomOsc.frequency.exponentialRampToValueAtTime(38, now + 0.85);
    boomGain.gain.setValueAtTime(0.001, now);
    boomGain.gain.linearRampToValueAtTime(0.24 * this.volume, now + 0.03);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    boomOsc.connect(boomGain);
    boomGain.connect(this.ctx.destination);
    boomOsc.start(now);
    boomOsc.stop(now + 1.0);

    // 2. Cổ Cầm Vuốt Dây Thăng Thiên (5 nốt Ngũ Cung thanh thoát, chống quá tải AudioContext)
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    scale.forEach((f, idx) => {
      const t0 = now + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.14 * this.volume, t0 + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.05);
    });

    // 3. Tiếng Tiên Kiếm Ngân Vang Ở Đỉnh Cảnh Giới
    const swordTime = now + 0.32;
    [1567.98, 2093.0, 2637.02].forEach((sf, i) => {
      const sOsc = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      sOsc.type = 'sine';
      sOsc.frequency.setValueAtTime(sf, swordTime);
      sGain.gain.setValueAtTime(0.0001, swordTime);
      sGain.gain.linearRampToValueAtTime((0.12 / (i + 1)) * this.volume, swordTime + 0.015);
      sGain.gain.exponentialRampToValueAtTime(0.0001, swordTime + 1.35);
      sOsc.connect(sGain);
      sGain.connect(this.ctx.destination);
      sOsc.start(swordTime);
      sOsc.stop(swordTime + 1.4);
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
   * Đồng bộ lời khấn từ Hàng Đợi Lên Khấn (runnerQueue / bowQueue) lên Khung Quote (#tts-quote-widget)
   * kể cả khi TTS đang tắt hoặc không đọc bình luận thường
   */
  setExternalPrayerQuote({
    active = false,
    text = '',
    author = '',
    tag = '🙏 ĐANG LÊN KHẤN',
    queueLength = 0,
    queuePreview = []
  } = {}) {
    this.externalQuoteState = active
      ? {
          active: true,
          text: String(text || '').trim(),
          author: String(author || '').trim(),
          tag: String(tag || '🙏 ĐANG LÊN KHẤN').trim(),
          queueLength: Math.max(0, Number(queueLength) || 0),
          queuePreview: Array.isArray(queuePreview) ? queuePreview : []
        }
      : null;
    this._emitQuoteState();
  }

  showPrayerQuoteBanner(options = {}) {
    return this.setExternalPrayerQuote({ active: true, ...options });
  }

  /**
   * Phát sự kiện cập nhật trạng thái Quote đang đọc và hàng đợi chờ đọc cho giao diện Overlay
   */
  _emitQuoteState() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    const serializeItem = (it) =>
      it
        ? {
            text: it.text,
            author: it.author || '',
            tag: it.tag || '',
            priority: Boolean(it.priority)
          }
        : null;

    const ext = this.externalQuoteState;
    const hasSpeech = Boolean(this.currentSpeechItem);
    const hasExt = Boolean(ext);

    let detail;
    if (hasSpeech) {
      detail = {
        active: true,
        current: serializeItem(this.currentSpeechItem),
        queueLength: Math.max(this.speechQueue.length, ext?.queueLength || 0),
        queuePreview: ext?.queuePreview || [],
        queue: this.speechQueue.slice(0, 5).map(serializeItem)
      };
    } else if (hasExt) {
      detail = {
        active: true,
        current: {
          text: ext.text,
          author: ext.author,
          tag: ext.tag,
          priority: true
        },
        queueLength: ext.queueLength || 0,
        queuePreview: ext.queuePreview || [],
        queue: this.speechQueue.slice(0, 5).map(serializeItem)
      };
    } else {
      detail = {
        active: false,
        current: null,
        queueLength: this.speechQueue.length,
        queuePreview: [],
        queue: this.speechQueue.slice(0, 5).map(serializeItem)
      };
    }

    window.dispatchEvent(
      new CustomEvent('sacred-quote-update', {
        detail
      })
    );
  }

  /**
   * Đưa câu đọc của từng User vào Hàng Đợi (`this.speechQueue`) và đọc tuần tự từng người một qua Server Proxy (/api/tts?text=...)
   * Mặc định (`interrupt = false`): Tuyệt đối không cắt ngang hay bỏ sót người đang đọc dở.
   */
  speakChant(
    text,
    {
      withWoodenFish = true,
      onStart,
      onEnd,
      priority = false,
      interrupt = false,
      author = '',
      tag = ''
    } = {}
  ) {
    const chunks = this.splitSentences(text);
    const cleanText = chunks.join(' ').trim();
    if (!cleanText || chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    if (this.muted) {
      if (onEnd) onEnd();
      return;
    }

    this.init();

    const normAuthor = String(author || '').trim();

    if (interrupt) {
      this.stopSpeech(true);
    } else {
      // Giới hạn kích thước hàng đợi tối đa (50 người) để bảo vệ bộ nhớ khi phòng quá đông
      if (this.speechQueue.length >= this.maxSpeechQueueSize) {
        if (priority) {
          const normalIdx = this.speechQueue.findIndex((q) => !q.priority);
          if (normalIdx !== -1) {
            const removed = this.speechQueue.splice(normalIdx, 1)[0];
            if (removed?.onEnd) {
              try {
                removed.onEnd();
              } catch (_e) {}
            }
          } else {
            const removed = this.speechQueue.shift();
            if (removed?.onEnd) {
              try {
                removed.onEnd();
              } catch (_e) {}
            }
          }
        } else {
          const removed = this.speechQueue.shift();
          if (removed?.onEnd) {
            try {
              removed.onEnd();
            } catch (_e) {}
          }
        }
      }
    }

    const item = {
      text: cleanText,
      chunks,
      withWoodenFish,
      onStart,
      onEnd,
      priority: Boolean(priority),
      author: normAuthor,
      tag: String(tag || '').trim()
    };

    if (priority) {
      // Đưa lên trước các phần tử thường trong hàng đợi nhưng vẫn xếp sau các phần tử ưu tiên trước đó
      const firstNormalIdx = this.speechQueue.findIndex((q) => !q.priority);
      if (firstNormalIdx === -1) {
        this.speechQueue.push(item);
      } else {
        this.speechQueue.splice(firstNormalIdx, 0, item);
      }
    } else {
      this.speechQueue.push(item);
    }

    this._emitQuoteState();
    this._processSpeechQueue();
  }

  enqueueSpeech(text, options = {}) {
    return this.speakChant(text, options);
  }

  async _processSpeechQueue() {
    if (this.isSpeakingQueue || this.speechQueue.length === 0 || this.muted) {
      return;
    }

    this.isSpeakingQueue = true;
    const runGen = ++this._speechQueueGen;

    try {
      while (this.speechQueue.length > 0 && !this.muted && this._speechQueueGen === runGen) {
        const item = this.speechQueue.shift();
        if (!item) continue;

        this.currentSpeechItem = item;
        this.ttsCancelled = false;
        this._emitQuoteState();

        const isTuTien = Number(this.themeId) === 7;
        // Chỉ gảy âm báo mở đầu nhẹ nhàng nếu cách lần báo trước >= 2.2s để tránh dồn dập khi đọc liên tiếp
        if (this._canPlaySfx('ttsIntroChime', 2200)) {
          if (isTuTien) {
            this.playTuTienJoinSound();
          } else {
            this.playLotusChime();
          }
        }

        if (item.onStart) {
          try {
            item.onStart();
          } catch (_e) {}
        }

        if (item.withWoodenFish && !isTuTien) {
          const intervalMs = Math.max(680, Math.round((60 / Math.max(25, this.woodenFishBpm)) * 1000));
          if (this.woodenFishLoopTimer) {
            clearInterval(this.woodenFishLoopTimer);
          }
          this.woodenFishLoopTimer = setInterval(() => {
            if (!this.ttsCancelled && !this.muted && this._speechQueueGen === runGen) {
              this.playWoodenFish(1);
            }
          }, intervalMs);
        }

        const rate = Math.max(0.72, Math.min(1.25, 1.0 + this.speedPct / 120));

        try {
          for (let i = 0; i < item.chunks.length; i++) {
            if (this.ttsCancelled || this.muted || this._speechQueueGen !== runGen) break;
            await new Promise((resolve) => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                if (this._ttsChunkResolve === finish) {
                  this._ttsChunkResolve = null;
                }
                resolve();
              };
              this._ttsChunkResolve = finish;

              const audio = new Audio(`/api/tts?text=${encodeURIComponent(item.chunks[i])}`);
              this.ttsAudioEl = audio;
              audio.volume = Math.min(1, this.volume);
              audio.playbackRate = rate;
              audio.preservesPitch = false; // Cho phép giọng trầm ấm hơn khi giảm tốc độ
              audio.onended = finish;
              audio.onerror = finish;
              audio.play().catch(finish);
            });
          }
        } finally {
          if (this.woodenFishLoopTimer) {
            clearInterval(this.woodenFishLoopTimer);
            this.woodenFishLoopTimer = null;
          }
          if (
            !this.ttsCancelled &&
            !this.muted &&
            this._speechQueueGen === runGen &&
            this.speechQueue.length === 0 &&
            !isTuTien
          ) {
            this.playLotusChime();
          }
          if (item.onEnd) {
            try {
              item.onEnd();
            } catch (_e) {}
          }
        }

        // Nghỉ nhịp ngắn ~260ms giữa 2 user trong hàng đợi để phân tách câu đọc rõ ràng, trang nghiêm
        if (this.speechQueue.length > 0 && !this.muted && !this.ttsCancelled && this._speechQueueGen === runGen) {
          this.currentSpeechItem = item;
          this._emitQuoteState();
          await new Promise((resolve) => {
            this._ttsDelayResolve = resolve;
            this._ttsDelayTimer = setTimeout(() => {
              this._ttsDelayTimer = null;
              this._ttsDelayResolve = null;
              resolve();
            }, 260);
          });
        }
      }
    } finally {
      if (this._speechQueueGen === runGen) {
        this.currentSpeechItem = null;
        this.isSpeakingQueue = false;
        this._emitQuoteState();
      }
    }
  }

  _cancelCurrentChunkAudio() {
    this.ttsCancelled = true;
    if (this._ttsDelayTimer) {
      clearTimeout(this._ttsDelayTimer);
      this._ttsDelayTimer = null;
    }
    if (this._ttsDelayResolve) {
      const resolveDelay = this._ttsDelayResolve;
      this._ttsDelayResolve = null;
      resolveDelay();
    }
    if (this.ttsAudioEl) {
      try {
        this.ttsAudioEl.onended = null;
        this.ttsAudioEl.onerror = null;
        this.ttsAudioEl.pause();
        this.ttsAudioEl.src = '';
      } catch (_e) {}
      this.ttsAudioEl = null;
    }
    if (this._ttsChunkResolve) {
      const resolve = this._ttsChunkResolve;
      this._ttsChunkResolve = null;
      resolve();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.woodenFishLoopTimer) {
      clearInterval(this.woodenFishLoopTimer);
      this.woodenFishLoopTimer = null;
    }
  }

  clearSpeechQueue() {
    this._speechQueueGen++;
    const pendingItems = this.speechQueue.splice(0, this.speechQueue.length);
    this.speechQueue = [];
    this.isSpeakingQueue = false;
    this.currentSpeechItem = null;
    this._cancelCurrentChunkAudio();
    pendingItems.forEach((removed) => {
      if (removed?.onEnd) {
        try {
          removed.onEnd();
        } catch (_e) {}
      }
    });
    this._emitQuoteState();
  }

  stopSpeech(clearQueue = true) {
    if (clearQueue) {
      this.clearSpeechQueue();
      return;
    }
    this._cancelCurrentChunkAudio();
    this._emitQuoteState();
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
