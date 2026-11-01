require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent, RouteConfig } = require('tiktok-live-connector');

// Override fetchRoomGifts để gọi trực tiếp TikTok Webcast API (signRequest = false)
// Không cần gói trả phí Euler Business mà vẫn lấy đủ ~728 quà TikTok thật và không làm lỗi khi connect!
if (RouteConfig) {
  RouteConfig.fetchRoomGifts = async ({ webClient, roomId }) => {
    const targetRoomId = roomId || webClient?.roomId || '7360000000000000000';
    const res = await webClient.getJsonObjectFromWebcastApi(
      'gift/list/',
      {
        ...webClient.clientParams,
        room_id: targetRoomId
      },
      false
    );
    return res?.data?.gifts || [];
  };
}

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Đảm bảo thư mục nhạc tồn tại
const musicDir = path.join(__dirname, 'public', 'music');
if (!fs.existsSync(musicDir)) {
  fs.mkdirSync(musicDir, { recursive: true });
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/control', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ============================================================================
// PROXY GIỌNG ĐỌC TIẾNG VIỆT CHUẨN (GOOGLE TRANSLATE TTS tl=vi)
// Khắc phục triệt để lỗi Windows không có giọng đọc tiếng Việt làm đọc sai
// ============================================================================
app.get('/api/tts', async (req, res) => {
  try {
    const rawText = String(req.query.text || '').trim().slice(0, 220);
    if (!rawText) {
      return res.status(400).send('Missing text');
    }
    const ttsUrl =
      'https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=vi&q=' +
      encodeURIComponent(rawText);

    const response = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('TTS upstream error');
    }

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[TTS Proxy Error]:', err.message);
    res.status(500).send('TTS error');
  }
});

// Danh sách file nhạc trong thư mục public/music
function getMusicFilesList() {
  try {
    return fs
      .readdirSync(musicDir)
      .filter((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(musicDir, f));
        return {
          fileName: f,
          name: f.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          url: `/music/${encodeURIComponent(f)}`,
          sizeKb: Math.round(stat.size / 1024)
        };
      });
  } catch (_e) {
    return [];
  }
}

app.get('/api/music-list', (_req, res) => {
  res.json({ ok: true, musicDir, files: getMusicFilesList() });
});

// Upload file nhạc nền (.mp3, .wav, .ogg, .m4a) tải về từ máy tính đưa thẳng vào public/music
app.post(
  '/api/music/upload',
  express.raw({ type: 'application/octet-stream', limit: '100mb' }),
  (req, res) => {
    try {
      const rawHeaderName = req.headers['x-file-name']
        ? decodeURIComponent(String(req.headers['x-file-name']))
        : `nhac_chua_${Date.now()}.mp3`;
      const safeName = path
        .basename(rawHeaderName)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim();
      const finalName = /\.(mp3|wav|ogg|m4a)$/i.test(safeName) ? safeName : `${safeName}.mp3`;
      const targetPath = path.join(musicDir, finalName);

      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, error: 'File nhạc rỗng' });
      }

      fs.writeFileSync(targetPath, req.body);
      const uploadedUrl = `/music/${encodeURIComponent(finalName)}`;
      appState.settings.bgMusicUrl = uploadedUrl;
      appState.settings.bgMusicPlaying = true;
      pushLog(`🎵 Đã đưa file nhạc nền "${finalName}" (${Math.round(req.body.length / 1024)} KB) vào thư mục public/music!`);
      broadcast('music_updated', {
        uploadedUrl,
        fileName: finalName,
        files: getMusicFilesList()
      });

      res.json({
        ok: true,
        fileName: finalName,
        url: uploadedUrl,
        files: getMusicFilesList(),
        state: serializeState()
      });
    } catch (err) {
      console.error('[Music Upload Error]:', err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// ============================================================================
// DANH SÁCH PHẬT TỬ MẪU (HỖ TRỢ KHÔNG GIỚI HẠN SỐ NGƯỜI: 30 -> 300 -> 500+)
// ============================================================================
const BASE_NAMES = [
  'Chà 🌸', 'Trần Quân', 'Chris', 'Vânxingg❤️', 'Ông Chú U30',
  'Bin', 'Tiết', 'Công chúa', 'Cậu Út', 'Mr Phan',
  'Biên Thảo', 'nguyenlinh', 'thích trai', 'Lợi', 'Yuong Hanh',
  'Quang Huy', 'Enigma KFG', 'Ngân', 'hungw', 'Thư Lê',
  'Ngọc Trinh', 'Thanh Hương', 'Minh Tâm', 'An Nhiên', 'Hoàng Nam',
  'Bảo Ngọc', 'Diệu Linh', 'Tuệ Minh', 'Thu Hà', 'Ngọc Lan',
  'Đức Anh', 'Hải Đăng', 'Mai Anh', 'Phương Thảo', 'Trung Kiên',
  'thef', 'phú béo 🐵', 'Thiện Nhân', 'Mai Đức Long', 'Phạm Lê Duy',
  'Huỳnh Trân', 'Thỏ Yogi 🐇', 'Boss trắng', 'Ngọc Nhi', 'Kim Cương Phát',
  'Huyền Như', 'Tâm Đức', 'Diệu Âm', 'Chú Tiểu An', 'Minh Triết',
  'Hồng Phúc', 'Gia Bảo', 'Thanh Tùng', 'Bích Ngọc', 'Thiện Đức',
  'Mỹ Duyên', 'Hồng Ánh', 'Triệu Vy', 'Bình 220503', 'Nhoxinh',
  'Kiều Oanh', 'Linh Đan', 'Mạnh Toàn', 'Quốc Bảo', 'Duy Trọng'
];

const VALID_SKINS = ['nam', 'nu', 'su', 'tieu', 'ni', 'caotang'];
// Giới hạn tối đa số node Phật tử gửi qua WebSocket/DOM để phòng 5.000 - 50.000 người vẫn mượt 60FPS không lag
const MAX_ACTIVE_MEDITATOR_NODES = 160;

// ============================================================================
// HỆ THỐNG TU TIÊN: TIÊN MÔN VẤN ĐẠO (MẪU 7) - 10 CẢNH GIỚI & LINH CĂN
// ============================================================================
const SPIRIT_ROOTS = [
  { name: 'Hỏa linh căn', mult: 1.1, isProdigy: false, icon: '🔥' },
  { name: 'Thủy linh căn', mult: 1.1, isProdigy: false, icon: '💧' },
  { name: 'Mộc linh căn', mult: 1.1, isProdigy: false, icon: '🌿' },
  { name: 'Kim linh căn', mult: 1.1, isProdigy: false, icon: '⚔️' },
  { name: 'Thổ linh căn', mult: 1.0, isProdigy: false, icon: '⛰️' },
  { name: 'Lôi linh căn', mult: 1.3, isProdigy: true, icon: '⚡' },
  { name: 'Băng linh căn', mult: 1.3, isProdigy: true, icon: '❄️' },
  { name: 'Phong linh căn', mult: 1.3, isProdigy: true, icon: '🌪️' },
  { name: 'Kiếm linh căn', mult: 1.4, isProdigy: true, icon: '🗡️' },
  { name: 'Hỗn Độn linh căn', mult: 1.5, isProdigy: true, icon: '🌌' }
];

const TUTIEN_REALMS = [
  { level: 10, name: 'Chân Tiên', minCoins: 25000, minTuVi: 250000, robeTier: 8 },
  { level: 9, name: 'Độ Kiếp', minCoins: 10000, minTuVi: 100000, robeTier: 7 },
  { level: 8, name: 'Đại Thừa', minCoins: 4000, minTuVi: 40000, robeTier: 7 },
  { level: 7, name: 'Hợp Thể', minCoins: 1500, minTuVi: 15000, robeTier: 6 },
  { level: 6, name: 'Luyện Hư', minCoins: 600, minTuVi: 6000, robeTier: 5 },
  { level: 5, name: 'Hóa Thần', minCoins: 250, minTuVi: 2500, robeTier: 4 },
  { level: 4, name: 'Nguyên Anh', minCoins: 100, minTuVi: 1000, robeTier: 3 },
  { level: 3, name: 'Kim Đan', minCoins: 40, minTuVi: 400, robeTier: 3 },
  { level: 2, name: 'Trúc Cơ', minCoins: 12, minTuVi: 120, robeTier: 2 },
  { level: 1, name: 'Luyện Khí', minCoins: 2, minTuVi: 20, robeTier: 2 },
  { level: 0, name: 'Phàm Nhân', minCoins: 0, minTuVi: 0, robeTier: 1 }
];

function getCultivationRealm(merit = 0, tuVi = 0) {
  const effectiveTuVi = Math.max(Number(merit || 0) * 10, Number(tuVi || 0));
  for (const r of TUTIEN_REALMS) {
    if (effectiveTuVi >= r.minTuVi) {
      return r;
    }
  }
  return TUTIEN_REALMS[TUTIEN_REALMS.length - 1];
}

function pickSpiritRoot(seedStr = '', commentText = '') {
  const lower = String(commentText || '').toLowerCase();
  if (lower.includes('lôi')) return SPIRIT_ROOTS[5];
  if (lower.includes('băng')) return SPIRIT_ROOTS[6];
  if (lower.includes('phong')) return SPIRIT_ROOTS[7];
  if (lower.includes('kiếm')) return SPIRIT_ROOTS[8];
  if (lower.includes('hỗn độn')) return SPIRIT_ROOTS[9];
  if (lower.includes('hỏa')) return SPIRIT_ROOTS[0];
  if (lower.includes('thủy')) return SPIRIT_ROOTS[1];
  if (lower.includes('mộc')) return SPIRIT_ROOTS[2];
  if (lower.includes('kim')) return SPIRIT_ROOTS[3];

  let hash = 0;
  const s = String(seedStr || Date.now());
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return SPIRIT_ROOTS[hash % SPIRIT_ROOTS.length];
}

function detectSkinFromText(text = '') {
  const lower = String(text).toLowerCase().trim();
  if (!lower) return null;
  if (lower.includes('cao tăng') || lower.includes('cao tang') || lower.includes('caotang') || lower.includes('hộ pháp')) return 'caotang';
  if (lower.includes('chú tiểu') || lower.includes('chu tieu') || /\btiểu\b/i.test(lower) || lower === 'tieu') return 'tieu';
  if (lower.includes('sư cô') || lower.includes('ni cô') || /\bni\b/i.test(lower)) return 'ni';
  if (lower.includes('sư thầy') || /\bsư\b/i.test(lower) || lower === 'su') return 'su';
  if (/\bnữ\b/i.test(lower) || lower === 'nu') return 'nu';
  if (/\bnam\b/i.test(lower)) return 'nam';
  return null;
}

function generatePresetMeditators(count = 48) {
  const safeNodeCount = Math.min(MAX_ACTIVE_MEDITATOR_NODES, Math.max(0, Number(count) || 0));
  const now = Date.now();
  const list = [];
  const topMerits = [120, 68, 30, 22, 16, 12];
  const presetTopRealms = [
    { name: 'Chân Tiên', robeTier: 8, tuVi: 255000 },
    { name: 'Độ Kiếp', robeTier: 7, tuVi: 105000 },
    { name: 'Hợp Thể', robeTier: 6, tuVi: 17500 },
    { name: 'Luyện Hư', robeTier: 5, tuVi: 6800 },
    { name: 'Hóa Thần', robeTier: 4, tuVi: 3200 },
    { name: 'Nguyên Anh', robeTier: 3, tuVi: 1200 }
  ];
  for (let i = 0; i < safeNodeCount; i++) {
    const baseName = BASE_NAMES[i % BASE_NAMES.length];
    const nickname = i < BASE_NAMES.length ? baseName : `${baseName} ${i + 1}`;
    // Hàng đầu là các vị Đệ Nhất Chân Tiên, Độ Kiếp, Hợp Thể, Luyện Hư, Hóa Thần để khoe đủ 8 bậc pháp y
    let merit = 0;
    let skin = i % 3 === 0 ? 'nu' : 'nam';
    let hasLotusSeat = false;
    let hasIncense = false;

    if (i < 6) {
      merit = topMerits[i] || 12;
      skin = 'su';
      hasLotusSeat = true;
      hasIncense = true;
    } else if (i === 6) {
      merit = 10; // Kim Đan
      hasLotusSeat = true;
      hasIncense = true;
    } else if (i === 7) {
      merit = 8; // Hóa Thần ở hàng đệ tử
      hasLotusSeat = true;
      hasIncense = true;
    } else if (i === 8) {
      merit = 6; // Luyện Hư ở hàng đệ tử
      hasLotusSeat = true;
      hasIncense = true;
    } else if (i < 16) {
      merit = i % 2 === 0 ? 2 : 0; // Luyện Khí xen kẽ Phàm Nhân giống ảnh mẫu
      hasLotusSeat = merit >= 10;
      hasIncense = merit > 0;
    }

    const spiritRoot = pickSpiritRoot(`seed_${i + 1}`, '');
    let tuVi = merit * 100;
    let realm = getCultivationRealm(merit, tuVi);
    if (i < 6 && presetTopRealms[i]) {
      tuVi = presetTopRealms[i].tuVi;
      realm = { name: presetTopRealms[i].name, robeTier: presetTopRealms[i].robeTier };
    } else if (i === 6) {
      tuVi = 450;
      realm = { name: 'Kim Đan', robeTier: 3 };
    } else if (i === 7) {
      tuVi = 2600;
      realm = { name: 'Hóa Thần', robeTier: 4 };
    } else if (i === 8) {
      tuVi = 6200;
      realm = { name: 'Luyện Hư', robeTier: 5 };
    }

    list.push({
      userId: `seed_${i + 1}`,
      nickname,
      skin,
      merit,
      tuVi,
      spiritRoot,
      realmName: realm.name,
      robeTier: realm.robeTier,
      hasLotusSeat,
      hasIncense,
      joinedAt: now - (count - i) * 1000,
      lastComment: ''
    });
  }
  return list;
}

function generateInitialPondCreatures() {
  const initialTypes = [
    { type: 'carp_red', scale: 0.56 },
    { type: 'koi_calico', scale: 0.62 },
    { type: 'koi_gold', scale: 0.64 },
    { type: 'carp_red', scale: 0.52 },
    { type: 'koi_calico', scale: 0.58 },
    { type: 'turtle_gold', scale: 0.68 }
  ];
  const now = Date.now();
  return initialTypes.map((item, idx) => ({
    id: `pond_init_${idx + 1}`,
    type: item.type,
    scale: item.scale,
    spawnedAt: now - (initialTypes.length - idx) * 2000
  }));
}

function spawnPondCreatures(creatureType = 'carp_red', count = 1) {
  const spawned = [];
  const safeCount = Math.max(1, Math.min(12, Number(count) || 1));
  for (let i = 0; i < safeCount; i++) {
    let type = creatureType;
    if (creatureType === 'mixed_koi') {
      type = i % 2 === 0 ? 'koi_gold' : 'koi_calico';
    } else if (creatureType === 'royal_turtle_pack') {
      type = i === 0 ? 'turtle_gold' : i % 2 === 0 ? 'koi_gold' : 'koi_calico';
    }
    const baseScale =
      type === 'turtle_gold'
        ? 0.66 + Math.random() * 0.1
        : type === 'koi_gold'
          ? 0.58 + Math.random() * 0.12
          : type === 'koi_calico'
            ? 0.55 + Math.random() * 0.12
            : 0.5 + Math.random() * 0.1;

    const item = {
      id: `fish_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}`,
      type,
      scale: Number(baseScale.toFixed(2)),
      spawnedAt: Date.now()
    };
    appState.pondCreatures.push(item);
    spawned.push(item);
  }
  // Giữ tối đa 120 cá/rùa bơi đồng thời trên mặt hồ để luôn mượt 60FPS
  if (appState.pondCreatures.length > 120) {
    appState.pondCreatures = appState.pondCreatures.slice(appState.pondCreatures.length - 120);
  }
  appState.altar.fishReleasedCount = (appState.altar.fishReleasedCount || 0) + spawned.length;
  return spawned;
}

// ============================================================================
// TRẠNG THÁI CHÙA ONLINE / THIỀN ĐƯỜNG (STATE)
// ============================================================================
function createInitialState() {
  const initialMeditators = generatePresetMeditators(48);
  const leaderboardMap = new Map();

  initialMeditators.slice(0, 6).forEach((m) => {
    leaderboardMap.set(m.userId, {
      userId: m.userId,
      nickname: m.nickname,
      merit: m.merit
    });
  });

  return {
    startedAt: Date.now(),
    connection: {
      status: 'disconnected',
      username: process.env.TIKTOK_USERNAME || '@review.nghip.v',
      roomId: null,
      viewerCount: 300,
      errorMessage: null
    },
    settings: {
      themeId: 1, // 1..6 (Mẫu 6: Hồ Sen Phóng Sanh)
      hallTitle: '🙏 CHÙA ONLINE 🙏',
      hallSubtitle: 'Comment để vào chùa • Tặng quà để ngồi gần Phật',
      bannerText: '',
      slotMode: 'unlimited', // 'unlimited' | 24 | 48 | 100 | 300
      chantText:
        'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật. Nguyện cầu cho toàn thể chư vị Phật tử thân tâm thường an lạc, vạn sự cát tường như ý.',
      monkGreeting: 'Mèng méng đến rồi, chúc con một buổi tối an lành 🙏',
      voicePreset: 'male_deep',
      voicePitchHz: -10,
      voiceSpeedPct: -8,
      reverbPct: 25,
      woodenFishBpm: 46,
      bgMusicEnabled: true,
      woodenFishEnabled: true,
      autoChantEnabled: true,
      ttsEnabled: true,
      giftTtsEnabled: true,
      bgTrackId: 1,
      bgMusicUrl: '/music/01_Nhac_Thien_Dan_Tranh_432Hz.wav',
      bgMusicPlaying: false,
      bgMusicVolume: 0.55,
      freeRoamEnabled: false,
      freeRoamBehavior: 'all', // 'all' | 'kinh_hanh' | 'le_phat' | 'thien_dinh'
      freeRoamSpeed: 'normal' // 'calm' | 'normal' | 'lively'
    },
    altar: {
      incenseCount: 5,
      lotusCount: 12,
      bellCount: 0,
      fishReleasedCount: 6,
      likeProgress: 100,
      likeTarget: 300,
      totalLikes: 642,
      totalMerit: 973
    },
    pondCreatures: generateInitialPondCreatures(),
    tutienRelic: {
      name: 'Thái Cổ Long Châu',
      progress: 68,
      target: 100,
      lastMvp: 'Chà 🌸',
      stageLevel: 1
    },
    totalCrowdCount: initialMeditators.length,
    meditators: initialMeditators,
    leaderboardMap,
    logs: [
      `[${new Date().toLocaleTimeString('vi-VN')}] ☸ Khởi tạo Chùa Online (Chế độ không giới hạn số người)`
    ]
  };
}

let appState = createInitialState();
let tiktokConn = null;

// ============================================================================
// BỘ ĐỆM DANH SÁCH QUÀ TẶNG TIKTOK WEBCAST API (~728 QUÀ THẬT)
// ============================================================================
let cachedTikTokGifts = [
  { id: 5655, name: 'Hoa Hồng (Rose)', rawName: 'Rose', diamondCount: 1, iconUrl: '' },
  { id: 5269, name: 'TikTok', rawName: 'TikTok', diamondCount: 1, iconUrl: '' },
  { id: 7934, name: 'Heart Me', rawName: 'Heart Me', diamondCount: 1, iconUrl: '' },
  { id: 5487, name: 'Bắn Tim (Finger Heart)', rawName: 'Finger Heart', diamondCount: 5, iconUrl: '' },
  { id: 5658, name: 'Nước Hoa (Perfume)', rawName: 'Perfume', diamondCount: 20, iconUrl: '' },
  { id: 5660, name: 'Thiên Nga (Swan)', rawName: 'Swan', diamondCount: 699, iconUrl: '' }
];
const tiktokGiftsById = new Map();

async function fetchTikTokGiftCatalog(customRoomId) {
  try {
    const tempConn = tiktokConn || new TikTokLiveConnection('tiktok', { enableExtendedGiftInfo: false });
    const targetRoom = customRoomId || appState.connection.roomId || '7360000000000000000';
    const rawGifts = await RouteConfig.fetchRoomGifts({
      webClient: tempConn.webClient,
      roomId: targetRoom
    });

    if (Array.isArray(rawGifts) && rawGifts.length > 0) {
      const normalized = rawGifts
        .filter((g) => g && g.name && Number(g.diamond_count) > 0)
        .map((g) => {
          const rawName = String(g.name).trim();
          const displayName = rawName === 'Rose' ? 'Hoa Hồng (Rose)' : rawName;
          return {
            id: Number(g.id) || 0,
            name: displayName,
            rawName,
            diamondCount: Math.max(1, Number(g.diamond_count) || 1),
            iconUrl: g.icon?.url_list?.[0] || g.image?.url_list?.[0] || ''
          };
        })
        .sort((a, b) => {
          if (a.rawName === 'Rose' && b.rawName !== 'Rose') return -1;
          if (b.rawName === 'Rose' && a.rawName !== 'Rose') return 1;
          if (a.diamondCount !== b.diamondCount) return a.diamondCount - b.diamondCount;
          return a.name.localeCompare(b.name);
        });

      cachedTikTokGifts = normalized;
      tiktokGiftsById.clear();
      normalized.forEach((item) => {
        if (item.id) tiktokGiftsById.set(item.id, item);
      });

      pushLog(`🎁 Đã tự động nạp ${cachedTikTokGifts.length} quà tặng từ TikTok Webcast API!`);
      broadcast('gifts_loaded', { count: cachedTikTokGifts.length });
      return cachedTikTokGifts;
    }
  } catch (err) {
    console.error('[Gift Catalog Error]:', err.message);
  }
  return cachedTikTokGifts;
}

function pushLog(text) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${text}`;
  appState.logs.unshift(line);
  if (appState.logs.length > 60) appState.logs.length = 60;
  return line;
}

function getPersonPriorityBucket(person) {
  const uid = String(person?.userId || '');
  if (uid.startsWith('seed_')) return 2;
  if (uid.startsWith('anon_live_')) return 1;
  return 0; // Người xem thật có tên & avatar
}

function getEffectiveRankScore(person) {
  return Math.max((Number(person?.merit) || 0) * 100, Number(person?.tuVi) || 0);
}

function getTop3Snapshot() {
  sortMeditatorsByMerit();
  return appState.meditators.slice(0, 3).map((m) => ({
    userId: m.userId,
    nickname: m.nickname,
    merit: Number(m.merit) || 0,
    tuVi: Number(m.tuVi) || 0
  }));
}

function evaluateTop3Decree(person, meritAdded = 0, prevTop3Snapshot = []) {
  if (!person) return null;
  sortMeditatorsByMerit();
  const top3 = appState.meditators.slice(0, 3);
  const newIdx = top3.findIndex((m) => m.userId === person.userId);
  if (newIdx === -1) return null;

  const rank = newIdx + 1; // 1, 2, hoặc 3
  const prevIdx = prevTop3Snapshot.findIndex((m) => m.userId === person.userId);
  const prevRank = prevIdx === -1 ? 99 : prevIdx + 1;
  const climbedRank = rank < prevRank;

  // Chỉ phát thông báo đặc biệt khi: Vừa lọt vào / thăng hạng trong Top 1-2-3 HOẶC đang ở Top 1-2-3 và vừa nạp thêm quà (meritAdded > 0)
  if (!climbedRank && meritAdded <= 0) {
    return null;
  }

  const prevHolder = prevTop3Snapshot[rank - 1];
  const dethronedName =
    climbedRank && prevHolder && prevHolder.userId !== person.userId ? prevHolder.nickname : null;

  const roomMeta = {
    1: {
      roomName: 'PHÒNG RỒNG 🐉',
      title: 'ĐỆ NHẤT CHƯỞNG MÔN',
      beastIcon: '🐉',
      rewardSkin: 'Thần Y Chân Tiên (Lục Kiếm Hoàng Kim)'
    },
    2: {
      roomName: 'PHÒNG PHƯỢNG 🔥',
      title: 'ĐỆ NHỊ TÔN GIẢ',
      beastIcon: '🔥',
      rewardSkin: 'Pháp Y Độ Kiếp (Bát Quái Thần Long)'
    },
    3: {
      roomName: 'PHÒNG LÂN 🦄',
      title: 'ĐỆ TAM HỘ PHÁP',
      beastIcon: '🦄',
      rewardSkin: 'Pháp Y Hợp Thể (Đôi Cánh Hỏa Phượng)'
    }
  }[rank];

  const curMerit = Number(person.merit) || 0;
  const top1Merit = Number(top3[0]?.merit) || 0;
  const top2Merit = Number(top3[1]?.merit) || 0;

  let ctaDonateText = '';
  if (rank === 1) {
    ctaDonateText = `🔥 KHIÊU CHIẾN: Ai dám tặng quà vượt ${curMerit + 1} 💎 để soán ngôi Đệ Nhất Phòng Rồng của ${person.nickname}?!`;
  } else if (rank === 2) {
    const needTop1 = Math.max(1, top1Merit - curMerit + 1);
    ctaDonateText = `⚡ KÍCH THÍCH ĐUA TOP: Chỉ cần thêm +${needTop1} 💎 để ${person.nickname} soán ngôi TOP 1 Phòng Rồng!`;
  } else {
    const needTop2 = Math.max(1, top2Merit - curMerit + 1);
    ctaDonateText = `⚡ KÍCH THÍCH ĐUA TOP: Chỉ cần thêm +${needTop2} 💎 để ${person.nickname} bứt phá lên TOP 2 Phòng Phượng!`;
  }

  return {
    rank,
    prevRank,
    climbedRank,
    user: person,
    dethronedName,
    meritAdded,
    merit: curMerit,
    tuVi: Number(person.tuVi) || 0,
    roomName: roomMeta.roomName,
    rankTitle: roomMeta.title,
    beastIcon: roomMeta.beastIcon,
    rewardSkin: roomMeta.rewardSkin,
    ctaDonateText
  };
}

function sortMeditatorsByMerit() {
  if (!Array.isArray(appState.meditators) || appState.meditators.length <= 1) return;

  const now = Date.now();
  // Tầng 1: Top 6 vị Hộ Pháp / Trưởng Lão: Luôn xếp chuẩn xác từ cao xuống thấp theo số Kim Cương (merit 💎), sau đó tới Tu Vi
  const byMeritDesc = [...appState.meditators].sort((a, b) => {
    const meritA = Number(a.merit) || 0;
    const meritB = Number(b.merit) || 0;
    if (meritB !== meritA) return meritB - meritA;

    const scoreA = getEffectiveRankScore(a);
    const scoreB = getEffectiveRankScore(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    const bucketA = getPersonPriorityBucket(a);
    const bucketB = getPersonPriorityBucket(b);
    if (bucketA !== bucketB) return bucketA - bucketB;
    return (b.lastActiveAt || b.joinedAt || 0) - (a.lastActiveAt || a.joinedAt || 0);
  });

  const topVipSet = new Set();
  const topVips = [];
  for (const p of byMeritDesc) {
    if (topVips.length >= 6) break;
    if ((p.merit || 0) > 0 || topVips.length < 6) {
      topVips.push(p);
      topVipSet.add(p.userId);
    }
  }

  // Tầng 2: Những người xem thật (bucket 0) vừa mới tương tác (comment / vào phòng / thả cá / thả tim)
  // được ưu tiên đứng ngay hàng đầu đạo tràng tiền cảnh (vị trí 7..24) để dù phòng 5.000 người vẫn luôn hiện rõ Tên + Avatar + Bong bóng lời khấn!
  const remaining = appState.meditators.filter((p) => !topVipSet.has(p.userId));
  remaining.sort((a, b) => {
    const bucketA = getPersonPriorityBucket(a);
    const bucketB = getPersonPriorityBucket(b);
    const recentA = bucketA === 0 && now - (a.lastActiveAt || 0) < 180000 ? 1 : 0;
    const recentB = bucketB === 0 && now - (b.lastActiveAt || 0) < 180000 ? 1 : 0;
    if (recentA !== recentB) return recentB - recentA;
    if (recentA === 1 && recentB === 1) {
      return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
    }
    if (bucketA !== bucketB) return bucketA - bucketB;
    if ((b.merit || 0) !== (a.merit || 0)) return (b.merit || 0) - (a.merit || 0);
    const rankA = a.roomRank || 9999;
    const rankB = b.roomRank || 9999;
    if (rankA !== rankB) return rankA - rankB;
    return (b.lastActiveAt || b.joinedAt || 0) - (a.lastActiveAt || a.joinedAt || 0);
  });

  appState.meditators = [...topVips, ...remaining].slice(0, MAX_ACTIVE_MEDITATOR_NODES);
}

function purgeSeedMeditators() {
  const beforeCount = appState.meditators.length;
  appState.meditators = appState.meditators.filter((m) => !String(m.userId || '').startsWith('seed_'));
  for (const key of Array.from(appState.leaderboardMap.keys())) {
    if (String(key).startsWith('seed_')) {
      appState.leaderboardMap.delete(key);
    }
  }
  if (beforeCount !== appState.meditators.length) {
    pushLog('🧹 Đã xóa danh sách Phật tử mẫu để hiển thị đúng số người xem thật từ phiên LIVE!');
  }
}

function syncLiveViewerCount(rawCount) {
  const parsed = Number(rawCount);
  if (!Number.isFinite(parsed) || parsed < 0) return;

  const exactViewerCount = Math.max(0, Math.round(parsed));
  appState.connection.viewerCount = exactViewerCount;
  appState.totalCrowdCount = exactViewerCount;

  if (appState.connection.status !== 'connected') return;

  // Khóa số lượng object DOM/WebSocket tối đa ở MAX_ACTIVE_MEDITATOR_NODES (160) để phòng 5.000+ người không bao giờ bị lag
  const targetActiveNodes = Math.min(exactViewerCount, MAX_ACTIVE_MEDITATOR_NODES);

  // Tách danh sách người xem thật đã lộ tên/avatar và các vị trí người xem ẩn danh (chưa comment)
  const realNamedList = appState.meditators.filter((m) => getPersonPriorityBucket(m) === 0);
  const existingAnonList = appState.meditators.filter((m) => getPersonPriorityBucket(m) === 1);

  if (realNamedList.length < targetActiveNodes) {
    // Bù đúng số người xem đang có mặt trên LIVE nhưng chưa bình luận / chưa lộ tên (tối đa tới targetActiveNodes)
    const neededAnon = targetActiveNodes - realNamedList.length;
    const nextAnonList = [];
    const now = Date.now();
    for (let i = 0; i < neededAnon; i++) {
      if (existingAnonList[i]) {
        nextAnonList.push(existingAnonList[i]);
      } else {
        nextAnonList.push({
          userId: `anon_live_${i + 1}_${now}`,
          nickname: `Phật Tử #${realNamedList.length + i + 1}`,
          avatar: '',
          skin: (realNamedList.length + i) % 2 === 1 ? 'nu' : 'nam',
          merit: 0,
          hasLotusSeat: false,
          hasIncense: false,
          joinedAt: now - i * 500,
          lastActiveAt: now - i * 500,
          lastComment: ''
        });
      }
    }
    appState.meditators = [...realNamedList, ...nextAnonList];
  } else if (realNamedList.length >= targetActiveNodes) {
    realNamedList.sort((a, b) => {
      if (b.merit !== a.merit) return b.merit - a.merit;
      const rankA = a.roomRank || 9999;
      const rankB = b.roomRank || 9999;
      if (rankA !== rankB) return rankA - rankB;
      return (b.lastActiveAt || b.joinedAt || 0) - (a.lastActiveAt || a.joinedAt || 0);
    });
    appState.meditators = realNamedList.slice(0, targetActiveNodes);
  }
}

function serializeState() {
  if (appState.connection.status === 'connected' && appState.connection.viewerCount > 0) {
    syncLiveViewerCount(appState.connection.viewerCount);
  }
  sortMeditatorsByMerit();
  const leaderboard = Array.from(appState.leaderboardMap.values())
    .sort((a, b) => b.merit - a.merit)
    .slice(0, 8);

  const totalCrowd =
    appState.connection.status === 'connected'
      ? Number(appState.connection.viewerCount) || appState.meditators.length
      : Number(appState.totalCrowdCount) || appState.meditators.length;

  return {
    startedAt: appState.startedAt,
    connection: appState.connection,
    settings: appState.settings,
    altar: appState.altar,
    pondCreatures: appState.pondCreatures || [],
    tutienRelic: appState.tutienRelic || {
      name: 'Thái Cổ Long Châu',
      progress: 68,
      target: 100,
      lastMvp: 'Chà 🌸',
      stageLevel: 1
    },
    totalCrowdCount: totalCrowd,
    totalSlots: totalCrowd,
    meditators: appState.meditators,
    leaderboard,
    logs: appState.logs.slice(0, 35)
  };
}

function broadcast(type, payload = {}) {
  const message = JSON.stringify({
    type,
    payload,
    state: serializeState(),
    timestamp: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// ============================================================================
// QUẢN LÝ NGƯỜI NGỒI THIỀN & LÊN CẤP THEO QUÀ TẶNG
// ============================================================================
function extractImageUrl(imgObj) {
  if (!imgObj) return '';
  if (typeof imgObj === 'string') return imgObj;
  if (Array.isArray(imgObj)) return imgObj[0] || '';
  const list = imgObj.url || imgObj.urlList || imgObj.urls || imgObj.url_list;
  if (Array.isArray(list) && list.length > 0) {
    return (
      list.find((u) => typeof u === 'string' && u.includes('100x100') && u.includes('.webp')) ||
      list.find((u) => typeof u === 'string' && u.includes('100x100')) ||
      list[0] ||
      ''
    );
  }
  return imgObj.imageUrl || imgObj.uri || '';
}

function extractUserInfo(rawUser = {}) {
  const u = rawUser?.user || rawUser || {};
  const userId =
    u.displayId ||
    u.display_id ||
    u.uniqueId ||
    u.unique_id ||
    u.idStr ||
    u.id_str ||
    u.userId ||
    u.id ||
    `user_${Math.random().toString(36).slice(2, 7)}`;
  const nickname =
    u.nickname ||
    u.nickName ||
    u.displayId ||
    u.display_id ||
    u.uniqueId ||
    'Phật Tử Hữu Duyên';
  const avatar =
    extractImageUrl(u.avatarThumb) ||
    extractImageUrl(u.avatar_thumb) ||
    extractImageUrl(u.avatarMedium) ||
    extractImageUrl(u.avatar_medium) ||
    extractImageUrl(u.avatarLarge) ||
    extractImageUrl(u.avatar_large) ||
    extractImageUrl(u.profilePicture) ||
    u.profilePictureUrl ||
    u.avatarUrl ||
    u.avatar ||
    '';

  return { userId: String(userId), nickname: String(nickname), avatar: String(avatar) };
}

function upsertMeditator({ userId, nickname, avatar = '', preferredSkin, commentText, addMeritAmount = 0, addTuViAmount = 0 }) {
  const cleanName = String(nickname || 'Phật Tử').trim();
  const key = String(userId || cleanName).toLowerCase();

  const detectedSkin = preferredSkin || detectSkinFromText(commentText);
  let person = appState.meditators.find(
    (m) => String(m.userId).toLowerCase() === key || m.nickname.toLowerCase() === cleanName.toLowerCase()
  );

  const now = Date.now();
  let isNewSeat = false;
  if (!person) {
    isNewSeat = true;
    // Nếu đang có vị trí người xem ẩn danh (anon_live_*) thì thay thế 1 vị trí ẩn danh bằng người thật vừa tương tác
    const anonIdx = appState.meditators.findIndex((m) => String(m.userId || '').startsWith('anon_live_'));
    if (anonIdx !== -1) {
      appState.meditators.splice(anonIdx, 1);
    }
    const spiritRoot = pickSpiritRoot(key, commentText);
    person = {
      userId: key,
      nickname: cleanName,
      avatar: avatar || '',
      skin: VALID_SKINS.includes(detectedSkin) ? detectedSkin : 'nam',
      merit: 0,
      tuVi: 0,
      spiritRoot,
      realmName: 'Phàm Nhân',
      robeTier: 1,
      hasLotusSeat: false,
      hasIncense: false,
      joinedAt: now,
      lastActiveAt: now,
      lastComment: commentText || ''
    };
    appState.meditators.push(person);
  } else {
    person.nickname = cleanName;
    if (avatar) {
      person.avatar = avatar;
    }
    person.lastActiveAt = now;
    if (VALID_SKINS.includes(detectedSkin)) {
      person.skin = detectedSkin;
    }
    if (commentText) {
      person.lastComment = commentText;
    }
    if (!person.spiritRoot) {
      person.spiritRoot = pickSpiritRoot(key, commentText);
    }
  }

  const prevRealm = person.realmName || 'Phàm Nhân';
  const prevTuVi = Number(person.tuVi) || 0;

  if (addMeritAmount > 0) {
    person.merit += addMeritAmount;
    person.tuVi = (person.tuVi || 0) + addMeritAmount * 100;
    person.hasIncense = true;
    if (person.merit >= 99) {
      person.skin = 'su'; // Hộ pháp mặc áo vàng ngồi đài sen hàng đầu
      person.hasLotusSeat = true;
    } else if (person.merit >= 10) {
      person.hasLotusSeat = true; // Hoa sen
    }
  }

  if (addTuViAmount > 0) {
    const mult = person.spiritRoot?.mult || 1.1;
    person.tuVi = Math.round((person.tuVi || 0) + addTuViAmount * mult);
  }

  const tuViAdded = Math.max(0, (Number(person.tuVi) || 0) - prevTuVi);
  const curRealm = getCultivationRealm(person.merit, person.tuVi);
  person.realmName = curRealm.name;
  person.robeTier = curRealm.robeTier;
  const realmUpgraded = prevRealm !== curRealm.name && curRealm.level > 0;

  return { person, isNewSeat, skinChanged: Boolean(detectedSkin), realmUpgraded, prevRealm, curRealm, tuViAdded };
}

function addMeritLeaderboard(user, points) {
  const key = String(user.userId || user.nickname).toLowerCase();
  const existing = appState.leaderboardMap.get(key) || {
    userId: key,
    nickname: user.nickname,
    avatar: user.avatar || '',
    merit: 0
  };
  existing.nickname = user.nickname || existing.nickname;
  if (user.avatar) {
    existing.avatar = user.avatar;
  }
  existing.merit += points;
  appState.leaderboardMap.set(key, existing);
  appState.altar.totalMerit += points;
}

// ============================================================================
// XỬ LÝ SỰ KIỆN TỪ TIKTOK LIVE & GIẢ LẬP
// ============================================================================
function handleMemberEvent(rawUser) {
  const user = extractUserInfo(rawUser);
  const isTuTienTheme = Number(appState.settings.themeId) === 7;
  const { person, isNewSeat, realmUpgraded, curRealm, tuViAdded } = upsertMeditator({
    userId: user.userId,
    nickname: user.nickname,
    avatar: user.avatar,
    addTuViAmount: isTuTienTheme ? 35 : 0
  });

  const monkSpeech = isTuTienTheme
    ? `Chào mừng đạo hữu ${person.nickname} ngự kiếm nhập môn tu luyện ☯`
    : `${person.nickname} đến rồi, chúc con một buổi tối an lành 🙏`;
  appState.settings.monkGreeting = monkSpeech;

  if (isNewSeat) {
    pushLog(
      isTuTienTheme
        ? `☯ Đạo hữu ${person.nickname} đã bước vào Tiên Môn (Cảnh giới: ${person.realmName} · Tu vi: ${person.tuVi}).`
        : `🙏 ${person.nickname} đã vào chùa tọa thiền (Tổng: ${appState.meditators.length} người).`
    );
  }
  if (isTuTienTheme) {
    const sRoot = person.spiritRoot || { name: 'Hỏa linh căn', mult: 1.1, isProdigy: false };
    broadcast('tutien_event', {
      user: person,
      eventKind: realmUpgraded ? 'breakthrough' : 'join_sect',
      fxType: realmUpgraded ? 'breakthrough_thunder' : 'sword_rain',
      realmUpgraded,
      tuViAdded,
      totalTuVi: person.tuVi,
      headline: realmUpgraded ? '⚡ ĐỘT PHÁ CẢNH GIỚI ⚡' : '☯ ĐẠO HỮU NHẬP MÔN ☯',
      bigTitle: realmUpgraded && curRealm ? curRealm.name : sRoot.name,
      subLine: `${person.nickname} nhập môn · +${tuViAdded} Tu Vi (${person.realmName})`,
      pillLine: `☯ ${person.nickname} nhập môn · ${sRoot.name} (+${tuViAdded} Tu Vi)`,
      commentText: 'Đạo hữu xin nhập môn ☯'
    });
  }
  broadcast('member', {
    user: person,
    isNewSeat,
    monkSpeech
  });
}

function advanceTuTienRelic(person, delta = 12) {
  if (!appState.tutienRelic) {
    appState.tutienRelic = {
      name: 'Thái Cổ Long Châu',
      progress: 68,
      target: 100,
      lastMvp: 'Chà 🌸',
      stageLevel: 1
    };
  }
  const relic = appState.tutienRelic;
  relic.progress = Math.max(0, (Number(relic.progress) || 0) + delta);
  if (relic.progress >= relic.target) {
    relic.progress = 18;
    relic.stageLevel = (Number(relic.stageLevel) || 1) + 1;
    relic.lastMvp = person.nickname;
    person.tuVi = (Number(person.tuVi) || 0) + 800;
    // Chỉ giữ duy nhất 1 người đương nhiệm giữ Đạo Hiệu 「Long Châu Chi Chủ」
    appState.meditators.forEach((m) => {
      if (m.daoTitle === 'Long Châu Chi Chủ') {
        m.daoTitle = '';
      }
    });
    if (!person.customDaoTitle) {
      person.daoTitle = 'Long Châu Chi Chủ';
    }
    const curRealm = getCultivationRealm(person.merit, person.tuVi);
    person.realmName = curRealm.name;
    person.robeTier = curRealm.robeTier;
    pushLog(
      `🐉 [BÍ CẢNH KHAI MỞ] ${person.nickname} đã phá vỡ phong ấn Thái Cổ Long Châu (Tầng ${relic.stageLevel - 1}) -> Nhận +800 Tu Vi & Đạo Hiệu 「Long Châu Chi Chủ」!`
    );
    broadcast('sky_ride', {
      user: person,
      daoTitle: person.daoTitle || 'Long Châu Chi Chủ',
      reason: `🐉 PHÁ ẤN THÁI CỔ LONG CHÂU (+800 TU VI)`
    });
    return true;
  }
  return false;
}

function handleChatEvent(rawUser, content, forcedSkin) {
  const text = String(content || '').trim();
  const lower = text.toLowerCase();
  const user = extractUserInfo(rawUser);

  // Phát hiện các lệnh tương tác Tu Tiên qua Comment để cộng mạnh Tu Vi & dễ dàng lên cấp
  const isSkyRideCmd =
    lower.includes('ngự kiếm') ||
    lower.includes('ngu kiem') ||
    lower.includes('cưỡi kiếm') ||
    lower.includes('tuần thiên') ||
    lower.includes('bay lên');
  const isRelicSlashCmd =
    lower.includes('phá trận') ||
    lower.includes('pha tran') ||
    lower.includes('trảm') ||
    lower.includes('bảo vật') ||
    lower.includes('long châu');
  const daoTitleMatch = text.match(/(?:đạo hiệu|dao hieu|danh hiệu|danh hieu)\s+(.+)/i);
  const customDaoTitle = daoTitleMatch ? daoTitleMatch[1].trim().slice(0, 16) : null;

  const isThunderCmd =
    lower.includes('sấm') ||
    lower.includes('sam chop') ||
    lower.includes('sét') ||
    lower.includes('thiên lôi') ||
    lower.includes('thien loi') ||
    lower.includes('độ kiếp') ||
    lower.includes('do kiep') ||
    lower.includes('gọi sấm');
  const isBlossomCmd =
    lower.includes('mưa hoa') ||
    lower.includes('mua hoa') ||
    lower.includes('hoa rơi') ||
    lower.includes('hoa roi') ||
    lower.includes('đào hoa') ||
    lower.includes('dao hoa') ||
    lower.includes('hoa đào') ||
    lower.includes('hoa sen');
  const isSwordCmd =
    lower.includes('vạn kiếm') ||
    lower.includes('van kiem') ||
    lower.includes('phi kiếm') ||
    lower.includes('phi kiem') ||
    lower.includes('kiếm lai') ||
    lower.includes('kiem lai') ||
    lower.includes('kiếm');
  const isDuelCmd =
    lower.includes('đấu pháp') ||
    lower.includes('dau phap') ||
    lower.includes('tỷ thí') ||
    lower.includes('ty thi') ||
    lower.includes('luận kiếm') ||
    lower.includes('khiêu chiến') ||
    lower === 'pk' ||
    lower.includes(' pk ');

  // Tăng mạnh Tu Vi khi comment để khán giả comment vài câu là Đột Phá Cảnh Giới & Đổi Tiên Y Mới ngay!
  // Đồng thời có 45% tỉ lệ "Đốn Ngộ Tiên Duyên" bạo kích x2.2 Tu Vi!
  const isLuckyEnlightenment = Math.random() < 0.45;
  let baseTuVi = 120 + Math.floor(Math.random() * 75); // Mặc định 120..195 Tu Vi mỗi comment
  if (isRelicSlashCmd) baseTuVi = 350 + Math.floor(Math.random() * 110);
  else if (isSkyRideCmd) baseTuVi = 290 + Math.floor(Math.random() * 100);
  else if (isDuelCmd) baseTuVi = 320 + Math.floor(Math.random() * 120);
  else if (isThunderCmd) baseTuVi = 280 + Math.floor(Math.random() * 110);
  else if (isSwordCmd) baseTuVi = 250 + Math.floor(Math.random() * 90);
  else if (isBlossomCmd) baseTuVi = 210 + Math.floor(Math.random() * 80);
  else if (isLuckyEnlightenment) baseTuVi = Math.round(baseTuVi * 2.2);

  const prevTop3Snapshot = getTop3Snapshot();
  const { person, isNewSeat, skinChanged, realmUpgraded, prevRealm, curRealm, tuViAdded } = upsertMeditator({
    userId: user.userId,
    nickname: user.nickname,
    avatar: user.avatar,
    preferredSkin: forcedSkin,
    commentText: text,
    addTuViAmount: baseTuVi
  });
  if (customDaoTitle) {
    person.customDaoTitle = true;
    person.daoTitle = customDaoTitle;
  }
  const relicBroken = advanceTuTienRelic(person, isRelicSlashCmd ? 24 : 7);
  if (isSkyRideCmd && !relicBroken) {
    broadcast('sky_ride', {
      user: person,
      daoTitle: person.daoTitle || 'Tiêu Dao Kiếm Tiên',
      reason: `🗡️ NGỰ KIẾM TUẦN THIÊN · ${person.realmName.toUpperCase()}`
    });
  } else if (realmUpgraded && !relicBroken) {
    broadcast('sky_ride', {
      user: person,
      daoTitle: person.daoTitle || 'Thiên Đạo Kỳ Tài',
      reason: `⚡ ĐỘT PHÁ ${person.realmName.toUpperCase()} · NGỰ KIẾM PHI HÀNH`
    });
  }
  const top3Decree = evaluateTop3Decree(person, 0, prevTop3Snapshot);
  if (top3Decree) {
    pushLog(
      `👑 [TOP ${top3Decree.rank} ${top3Decree.roomName}] ${person.nickname} đoạt ngôi ${top3Decree.rankTitle} (${top3Decree.rewardSkin})!`
    );
    broadcast('top3_decree', top3Decree);
  }

  const isPondTheme = Number(appState.settings.themeId) === 6;
  const isTuTienTheme = Number(appState.settings.themeId) === 7;

  const monkSpeech = isTuTienTheme
    ? realmUpgraded
      ? `Chúc mừng đạo hữu ${person.nickname} đốn ngộ chân kinh, đột phá cảnh giới ${person.realmName}!`
      : `Đạo hữu ${person.nickname} thổ nạp linh khí, tăng ${tuViAdded} tu vi!`
    : `${person.nickname} thành tâm khấn nguyện: "${text}"`;
  appState.settings.monkGreeting = monkSpeech;

  if (skinChanged && !isTuTienTheme) {
    pushLog(`✨ ${person.nickname} đổi hình tướng [${person.skin.toUpperCase()}]: "${text}"`);
  } else if (!isTuTienTheme) {
    pushLog(`💬 ${person.nickname}: "${text}"`);
  }

  // Hỗ trợ tương tác hoàn toàn bằng COMMENT trên LIVE:
  let walkUpBow = true;
  const isFishKeyword =
    lower.includes('thả cá') ||
    lower.includes('tha ca') ||
    lower.includes('phóng sanh') ||
    lower.includes('phong sanh') ||
    lower.includes('phóng sinh') ||
    lower.includes('rùa') ||
    lower.includes('koi') ||
    lower.includes('cá chép') ||
    lower.includes('cá vàng');
  const isFeedFishKeyword =
    lower.includes('cho cá ăn') ||
    lower.includes('cho ăn') ||
    lower.includes('rải mồi') ||
    lower.includes('thả thính');

  if (!isTuTienTheme && lower.includes('chuông')) {
    broadcast('bell_strike', {});
  }
  if (!isTuTienTheme && (lower.includes('gõ mõ') || lower === 'mõ')) {
    broadcast('wooden_fish_strike', {});
  }

  if (isTuTienTheme || isThunderCmd || isSwordCmd || isDuelCmd || isBlossomCmd) {
    if (isTuTienTheme) {
      walkUpBow = false;
    }
    const sRoot = person.spiritRoot || { name: 'Hỏa linh căn', mult: 1.1, isProdigy: false };

    // Nếu người xem LÊN CẤP (realmUpgraded) nhờ comment -> Luôn ưu tiên nổ đại lễ ĐỘT PHÁ CẢNH GIỚI kèm Sấm Sét + Kiếm Bay!
    if (realmUpgraded && curRealm) {
      pushLog(
        `⚡ [THĂNG CẤP] ${person.nickname} bình luận "${text}" (+${tuViAdded} Tu Vi) -> Đột phá [${prevRealm} ➔ ${curRealm.name}] (Tổng: ${person.tuVi} TV)!`
      );
      broadcast('tutien_event', {
        user: person,
        eventKind: 'breakthrough',
        fxType: 'breakthrough_thunder',
        realmUpgraded: true,
        prevRealmName: prevRealm,
        newRealmName: curRealm.name,
        tuViAdded,
        totalTuVi: person.tuVi,
        headline: '⚡ ĐỘT PHÁ CẢNH GIỚI ⚡',
        bigTitle: curRealm.name,
        subLine: `${person.nickname} thăng cấp ${curRealm.name} · +${tuViAdded} Tu Vi (Đổi Tiên Y Mới)`,
        pillLine: `⬆️ ${person.nickname} đột phá ${curRealm.name} · +${tuViAdded} Tu Vi (Tổng: ${person.tuVi} TV)`,
        commentText: text
      });
    } else if (isDuelCmd) {
      const others = appState.meditators.filter((m) => m.userId !== person.userId);
      const opponent = others.length > 0 ? others[Math.floor(Math.random() * Math.min(20, others.length))] : null;
      pushLog(`🔥 ${person.nickname} luận kiếm tỷ thí cùng ${opponent ? opponent.nickname : 'Tiên Môn'} (+${tuViAdded} Tu Vi)!`);
      broadcast('tutien_event', {
        user: person,
        opponentUserId: opponent ? opponent.userId : null,
        opponentName: opponent ? opponent.nickname : 'Chưởng Môn',
        eventKind: 'duel',
        fxType: 'duel_clash',
        realmUpgraded: false,
        tuViAdded,
        totalTuVi: person.tuVi,
        headline: '🔥 LUẬN KIẾM TRANH HÙNG 🔥',
        bigTitle: 'Đấu Pháp Đỉnh Cao',
        subLine: `${person.nickname} ⚔️ ${opponent ? opponent.nickname : 'Tiên Môn'} · +${tuViAdded} Tu Vi (${person.realmName})`,
        pillLine: `⚔️ ${person.nickname} thắng tỷ thí · +${tuViAdded} Tu Vi (Tổng: ${person.tuVi} TV)`,
        commentText: text
      });
    } else if (isThunderCmd) {
      pushLog(`⚡ ${person.nickname} gọi Cửu Thiên Thần Lôi độ kiếp (+${tuViAdded} Tu Vi -> ${person.realmName})!`);
      broadcast('tutien_event', {
        user: person,
        eventKind: 'thunder',
        fxType: 'thunder_tribulation',
        realmUpgraded: false,
        tuViAdded,
        totalTuVi: person.tuVi,
        headline: '⚡ THIÊN LÔI ĐỘ KIẾP ⚡',
        bigTitle: 'Cửu Thiên Thần Lôi',
        subLine: `${person.nickname} dẫn Lôi Kiếp rèn thể · +${tuViAdded} Tu Vi (${person.realmName})`,
        pillLine: `⚡ ${person.nickname} gọi Thiên Lôi · +${tuViAdded} Tu Vi (Tổng: ${person.tuVi} TV)`,
        commentText: text
      });
    } else if (isSwordCmd) {
      pushLog(`⚔️ ${person.nickname} triệu hồi Vạn Kiếm Quy Tông (+${tuViAdded} Tu Vi)!`);
      broadcast('tutien_event', {
        user: person,
        eventKind: 'sword',
        fxType: 'sword_rain',
        realmUpgraded: false,
        tuViAdded,
        totalTuVi: person.tuVi,
        headline: '⚔️ VẠN KIẾM QUY TÔNG ⚔️',
        bigTitle: 'Kiếm Ý Thông Thiên',
        subLine: `${person.nickname} ngự Vạn Kiếm · +${tuViAdded} Tu Vi (${person.realmName})`,
        pillLine: `🗡️ ${person.nickname} ngự Vạn Kiếm · +${tuViAdded} Tu Vi (Tổng: ${person.tuVi} TV)`,
        commentText: text
      });
    } else if (isBlossomCmd) {
      pushLog(`🌸 ${person.nickname} triệu hồi Mưa Hoa Đào Tiên Giới (+${tuViAdded} Tu Vi)!`);
      broadcast('tutien_event', {
        user: person,
        eventKind: 'blossom',
        fxType: 'blossom_rain',
        realmUpgraded: false,
        tuViAdded,
        totalTuVi: person.tuVi,
        headline: '🌸 TIÊN GIỚI GIÁNG HOA 🌸',
        bigTitle: 'Mưa Hoa Đào',
        subLine: `${person.nickname} rải Đào Hoa chúc phúc · +${tuViAdded} Tu Vi`,
        pillLine: `🌸 ${person.nickname} triệu hồi Mưa Hoa Đào · +${tuViAdded} Tu Vi`,
        commentText: text
      });
    } else {
      pushLog(`☯ ${person.nickname} tu luyện [${sRoot.name} x${sRoot.mult}]: "${text}" (+${tuViAdded} Tu Vi -> ${person.tuVi} TV)`);
      // Mọi comment thông thường cũng luôn gọi Kiếm Bay hoặc Sấm Sét để màn hình cực kỳ sống động!
      const defaultFx = Math.random() < 0.5 ? 'sword_and_thunder' : 'thunder_tribulation';
      broadcast('tutien_event', {
        user: person,
        eventKind: isLuckyEnlightenment ? 'prodigy' : 'join_sect',
        fxType: defaultFx,
        realmUpgraded: false,
        tuViAdded,
        totalTuVi: person.tuVi,
        headline: isLuckyEnlightenment ? '✨ ĐỐN NGỘ TIÊN DUYÊN ✨' : sRoot.isProdigy ? 'KỲ TÀI XUẤT THẾ' : 'LINH KHÍ QUÁN ĐỈNH',
        bigTitle: sRoot.name,
        subLine: `${person.nickname} hấp thu linh khí · +${tuViAdded} Tu Vi (${person.realmName})`,
        pillLine: `☯ ${person.nickname} +${tuViAdded} Tu Vi · ${sRoot.name} (Tổng: ${person.tuVi} TV)`,
        commentText: text
      });
    }
  } else if (isFeedFishKeyword) {
    walkUpBow = false;
    pushLog(`🌾 ${person.nickname} bình luận "${text}" -> Rải thức ăn vàng xuống Hồ Sen cho đàn cá & rùa vàng!`);
    broadcast('feed_fish', {
      user: person,
      content: text
    });
  } else if (isPondTheme || isFishKeyword) {
    walkUpBow = false;
    let cType = 'carp_red';
    let cLabel = 'Cá Chép Đỏ Bình An';
    if (lower.includes('rùa') || lower.includes('linh quy')) {
      cType = 'turtle_gold';
      cLabel = 'Rùa Vàng Linh Quy';
    } else if (lower.includes('koi') || lower.includes('ngũ sắc')) {
      cType = 'koi_calico';
      cLabel = 'Cá Koi Ngũ Sắc';
    } else if (lower.includes('cá vàng') || lower.includes('hoàng kim')) {
      cType = 'koi_gold';
      cLabel = 'Cá Koi Hoàng Kim';
    }
    const spawned = spawnPondCreatures(cType, 1);
    pushLog(`🐟 ${person.nickname} bình luận "${text}" -> Bước ra bến phóng sanh thả ${cLabel} xuống Hồ Sen.`);
    broadcast('fish_released', {
      user: person,
      creatures: spawned,
      creatureType: cType,
      creatureLabel: cLabel,
      count: spawned.length,
      commentText: text,
      dedicationText: `${person.nickname} khấn nguyện: "${text}" • Phóng sanh ${cLabel} xuống Hồ Sen 🙏`
    });
  } else {
    person.hasIncense = true;
    walkUpBow = true;
  }

  broadcast('chat', {
    user: person,
    content: text,
    isNewSeat,
    skinChanged,
    monkSpeech,
    walkUpBow
  });
}

function handleGiftEvent({ rawUser, giftName = 'Hoa Hồng', giftIconUrl = '', diamondCount = 1, repeatCount = 1 }) {
  const user = extractUserInfo(rawUser);
  const count = Math.max(1, Number(repeatCount) || 1);
  const diamonds = Math.max(1, Number(diamondCount) || 1);
  const totalCoins = diamonds * count;
  const meritAdded = totalCoins;

  const prevTop3Snapshot = getTop3Snapshot();
  const { person, realmUpgraded, prevRealm, tuViAdded } = upsertMeditator({
    userId: user.userId,
    nickname: user.nickname,
    avatar: user.avatar,
    addMeritAmount: meritAdded
  });

  addMeritLeaderboard(user, meritAdded);

  const relicBroken = advanceTuTienRelic(person, Math.min(100, Math.max(25, meritAdded * 2)));
  const top3Decree = evaluateTop3Decree(person, meritAdded, prevTop3Snapshot);
  if (top3Decree) {
    pushLog(
      `👑 [TOP ${top3Decree.rank} ${top3Decree.roomName}] ${person.nickname} tặng ${giftName} (+${meritAdded} 💎) -> Đoạt ngôi ${top3Decree.rankTitle}!`
    );
    broadcast('top3_decree', top3Decree);
  }
  if (!relicBroken) {
    broadcast('sky_ride', {
      user: person,
      daoTitle: top3Decree ? top3Decree.rankTitle : person.daoTitle || 'Chân Tiên Chí Tôn',
      reason: `👑 ${person.nickname.toUpperCase()} NGỰ KIẾM TUẦN THIÊN (+${meritAdded} 💎)`
    });
  }

  // Phân cấp quà tặng:
  // Nếu đang ở Mẫu 6 (Hồ Sen Phóng Sanh): Phật tử bước ra bến hồ thả Cá Chép / Cá Koi / Rùa Vàng
  let tierName = 'LÊN DÂNG HƯƠNG';
  let releasedCreatures = [];
  let creatureLabel = '';

  if (Number(appState.settings.themeId) === 7) {
    tierName = `ĐỘT PHÁ ${person.realmName.toUpperCase()}`;
    broadcast('tutien_event', {
      user: person,
      eventKind: 'breakthrough',
      fxType: 'breakthrough_thunder',
      realmUpgraded: true,
      prevRealmName: prevRealm,
      newRealmName: person.realmName,
      tuViAdded,
      totalTuVi: person.tuVi,
      headline: totalCoins >= 100 ? '⚡ ĐẠI NĂNG ĐỘ KIẾP ⚡' : '⚡ ĐỘT PHÁ CẢNH GIỚI ⚡',
      bigTitle: person.realmName,
      subLine: `${person.nickname} hấp thu ${totalCoins} 💎 · +${tuViAdded} Tu Vi (Đạt ${person.realmName})`,
      pillLine: `⬆️ ${person.nickname} đột phá ${person.realmName} · +${tuViAdded} Tu Vi (Tổng: ${person.tuVi} TV)`
    });
  } else if (Number(appState.settings.themeId) === 6) {
    if (totalCoins >= 99) {
      tierName = 'PHÓNG SANH RÙA VÀNG LINH QUY';
      creatureLabel = 'Rùa Vàng Linh Quy & Đàn Cá Koi';
      releasedCreatures = spawnPondCreatures('royal_turtle_pack', 4);
    } else if (totalCoins >= 10) {
      tierName = 'PHÓNG SANH ĐÀN CÁ KOI';
      creatureLabel = 'Đàn Cá Koi Ngũ Sắc';
      releasedCreatures = spawnPondCreatures('mixed_koi', 3);
    } else {
      tierName = 'PHÓNG SANH CÁ CHÉP ĐỎ';
      creatureLabel = 'Cá Chép Đỏ Bình An';
      const fishCount = Math.min(3, Math.max(1, count));
      releasedCreatures = spawnPondCreatures('carp_red', fishCount);
    }
  } else {
    if (totalCoins >= 99) {
      tierName = 'THĂNG CẤP HỘ PHÁP';
    } else if (totalCoins >= 10) {
      tierName = 'DÂNG ĐÀI HOA SEN';
    }
  }

  const dedicationText =
    Number(appState.settings.themeId) === 7
      ? `Chúc mừng đạo hữu ${person.nickname} luyện hóa ${giftName}, tăng ${tuViAdded} tu vi, dẫn Cửu Thiên Thần Lôi đột phá cảnh giới ${person.realmName}!`
      : Number(appState.settings.themeId) === 6
      ? `Cảm tạ thí chủ ${person.nickname} đã phát tâm ${giftName}, phóng sanh ${creatureLabel} xuống Hồ Sen, tăng ${meritAdded} công đức. Chúc con và gia đình vạn sự bình an!`
      : `Cảm tạ thí chủ ${person.nickname} đã phát tâm ${giftName}, tăng ${meritAdded} công đức. Chúc con và gia đình vạn sự bình an, cát tường như ý!`;
  appState.settings.monkGreeting = dedicationText;

  if (Number(appState.settings.themeId) === 7) {
    pushLog(`⚡ ${person.nickname} hấp thu ${giftName} (+${meritAdded} 💎) -> Đạt cảnh giới [${person.realmName}] (Tu vi: ${person.tuVi})`);
  } else if (Number(appState.settings.themeId) === 6) {
    pushLog(`🐟 ${person.nickname} tặng ${giftName} x${count} -> Bước ra bến thả ${creatureLabel} (+${meritAdded} Công Đức)`);
  } else {
    pushLog(`🎁 ${person.nickname} tặng ${giftName} x${count} -> Đứng dậy lên lạy Phật (+${meritAdded} Công Đức)`);
  }

  broadcast('gift', {
    user: person,
    giftName,
    giftIconUrl,
    diamondCount: diamonds,
    repeatCount: count,
    meritAdded,
    tierName,
    dedicationText,
    releasedCreatures,
    creatureLabel
  });
}

function handleLikeEvent(rawUser, count = 15) {
  const user = extractUserInfo(rawUser);
  if (user.userId && !String(user.userId).startsWith('user_')) {
    upsertMeditator({
      userId: user.userId,
      nickname: user.nickname,
      avatar: user.avatar
    });
  }
  const delta = Math.max(1, Number(count) || 15);
  appState.altar.totalLikes += delta;
  appState.altar.likeProgress += delta;

  let lotusRainTriggered = false;
  if (appState.altar.likeProgress >= appState.altar.likeTarget) {
    lotusRainTriggered = true;
    appState.altar.likeProgress = appState.altar.likeProgress % appState.altar.likeTarget;
    pushLog(`🌸 Đạt mốc ${appState.altar.likeTarget} tim gõ mõ -> Kích hoạt Mưa Hoa Sen Cát Tường!`);
  }

  broadcast('like', {
    user,
    count: delta,
    likeProgress: appState.altar.likeProgress,
    likeTarget: appState.altar.likeTarget,
    lotusRainTriggered
  });
}

// ============================================================================
// KẾT NỐI TIKTOK-LIVE-CONNECTOR THẬT
// ============================================================================
let roomViewerPollTimer = null;

function stopRoomViewerPoll() {
  if (roomViewerPollTimer) {
    clearInterval(roomViewerPollTimer);
    roomViewerPollTimer = null;
  }
}

async function pollLiveRoomViewerCount() {
  if (!tiktokConn || appState.connection.status !== 'connected' || !appState.connection.roomId) {
    return;
  }
  try {
    const info = await RouteConfig.fetchRoomInfo({
      webClient: tiktokConn.webClient,
      roomId: appState.connection.roomId
    });
    const exactCount = Number(info?.data?.user_count ?? info?.user_count);
    if (Number.isFinite(exactCount) && exactCount >= 0) {
      const prevCount = appState.connection.viewerCount;
      syncLiveViewerCount(exactCount);
      if (prevCount !== exactCount) {
        broadcast('room_user', { viewerCount: appState.connection.viewerCount });
      }
    }
  } catch (_e) {}
}

function ingestRoomContributors(contributors = []) {
  if (!Array.isArray(contributors) || contributors.length === 0) return;
  contributors.forEach((entry, idx) => {
    const u = extractUserInfo(entry?.user || entry);
    const coins = Number(entry?.score ?? entry?.coinCount) || 0;
    const rankNum = Number(entry?.rank) || idx + 1;
    if (u.userId && !String(u.userId).startsWith('user_')) {
      const { person } = upsertMeditator({
        userId: u.userId,
        nickname: u.nickname,
        avatar: u.avatar
      });
      person.roomRank = rankNum;
      if (coins > person.merit) {
        person.merit = coins;
        person.hasIncense = true;
        if (coins >= 10) person.hasLotusSeat = true;
        if (coins >= 99) person.skin = 'su';
        appState.leaderboardMap.set(String(u.userId).toLowerCase(), {
          userId: String(u.userId).toLowerCase(),
          nickname: u.nickname,
          avatar: u.avatar,
          merit: coins
        });
      }
    }
  });
}

async function disconnectTikTok() {
  stopRoomViewerPoll();
  if (tiktokConn) {
    try {
      tiktokConn.removeAllListeners();
      await tiktokConn.disconnect();
    } catch (_e) {}
    tiktokConn = null;
  }
  appState.connection.status = 'disconnected';
  appState.connection.roomId = null;
  pushLog('⏹ Đã ngắt kết nối TikTok LIVE.');
  broadcast('connection_status', appState.connection);
}

async function connectToTikTok(username, signApiKey) {
  const cleanUsername = String(username || '').trim().replace(/^@/, '');
  if (!cleanUsername) throw new Error('Vui lòng nhập @ID kênh TikTok đang LIVE.');

  await disconnectTikTok();

  appState.connection.status = 'connecting';
  appState.connection.username = `@${cleanUsername}`;
  appState.connection.errorMessage = null;
  pushLog(`⏳ Đang kết nối tới kênh TikTok LIVE @${cleanUsername}...`);
  broadcast('connection_status', appState.connection);

  const options = {
    processInitialData: true,
    enableExtendedGiftInfo: true
  };
  if (signApiKey || process.env.SIGN_API_KEY) {
    options.signApiKey = signApiKey || process.env.SIGN_API_KEY;
  }

  const connection = new TikTokLiveConnection(cleanUsername, options);
  tiktokConn = connection;

  connection.on(ControlEvent.CONNECTED, (state) => {
    purgeSeedMeditators();
    appState.connection.status = 'connected';
    appState.connection.roomId = state?.roomId ? String(state.roomId) : 'live';
    const initViewers = Number(state?.roomInfo?.data?.user_count ?? state?.roomInfo?.user_count);
    if (Number.isFinite(initViewers) && initViewers >= 0) {
      syncLiveViewerCount(initViewers);
    }
    pushLog(
      `✅ Đã kết nối TikTok LIVE @${cleanUsername} (Room ID: ${appState.connection.roomId} • Đang xem: ${appState.connection.viewerCount} người)`
    );
    broadcast('connection_status', appState.connection);
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    stopRoomViewerPoll();
    appState.connection.status = 'disconnected';
    pushLog(`⚠️ Kết nối TikTok LIVE @${cleanUsername} đã đóng.`);
    broadcast('connection_status', appState.connection);
  });

  connection.on(ControlEvent.ERROR, (err) => {
    const msg = err?.exception?.message || err?.info || err?.message || JSON.stringify(err);
    pushLog(`❌ Lỗi TikTok Stream: ${msg}`);
  });

  connection.on(WebcastEvent.MEMBER, (event) => {
    // Chỉ cập nhật thông tin người mới vào phòng, KHÔNG lấy event.memberCount (vì memberCount là tổng tích lũy chứ không phải số người đang xem hiện tại)
    handleMemberEvent(event.user || event);
  });

  connection.on(WebcastEvent.CHAT, (event) => {
    handleChatEvent(event.user || event, event.content ?? event.comment);
  });

  connection.on(WebcastEvent.GIFT, (event) => {
    const giftObj = event.gift || event.extendedGiftInfo || {};
    const giftDetails = event.giftDetails || {};
    const giftType = giftDetails.giftType ?? giftObj.type ?? event.giftType;
    if (giftType === 1 && event.repeatEnd !== 1 && event.repeatEnd !== true) {
      return;
    }
    const cachedGift = tiktokGiftsById.get(Number(event.giftId || giftObj.id));
    const giftName =
      cachedGift?.name ||
      giftDetails.giftName ||
      giftObj.name ||
      event.extendedGiftInfo?.name ||
      `Lễ vật #${event.giftId || ''}`;
    const diamondCount =
      cachedGift?.diamondCount ??
      giftDetails.diamondCount ??
      giftObj.diamondCount ??
      event.extendedGiftInfo?.diamond_count ??
      1;
    const giftIconUrl =
      cachedGift?.iconUrl ||
      extractImageUrl(giftDetails.giftImage) ||
      extractImageUrl(giftObj.icon) ||
      extractImageUrl(giftObj.image) ||
      '';
    handleGiftEvent({
      rawUser: event.user || event,
      giftName,
      giftIconUrl,
      diamondCount,
      repeatCount: event.repeatCount || 1
    });
  });

  connection.on(WebcastEvent.LIKE, (event) => {
    handleLikeEvent(event.user || event, event.count || 5);
  });

  connection.on(WebcastEvent.ROOM_USER, (event) => {
    // 1. Nạp toàn bộ danh sách người xem thật từ ranks + seats (proto v3) và ranksList + topViewers
    const allContributors = [
      ...(Array.isArray(event?.ranks) ? event.ranks : []),
      ...(Array.isArray(event?.seats) ? event.seats : []),
      ...(Array.isArray(event?.ranksList) ? event.ranksList : []),
      ...(Array.isArray(event?.topViewers) ? event.topViewers : [])
    ];
    ingestRoomContributors(allContributors);

    // 2. Đồng bộ chính xác tổng số người đang xem LIVE (event.total trong proto v3)
    const rawTotal = Number(event?.total ?? event?.viewerCount ?? event?.popStr);
    if (Number.isFinite(rawTotal) && rawTotal >= 0) {
      syncLiveViewerCount(rawTotal);
    }
    broadcast('room_user', { viewerCount: appState.connection.viewerCount });
  });

  try {
    const state = await connection.connect();
    purgeSeedMeditators();
    appState.connection.status = 'connected';
    appState.connection.roomId = state?.roomId ? String(state.roomId) : 'live';
    const initViewers = Number(state?.roomInfo?.data?.user_count ?? state?.roomInfo?.user_count);
    if (Number.isFinite(initViewers) && initViewers >= 0) {
      syncLiveViewerCount(initViewers);
    }
    stopRoomViewerPoll();
    roomViewerPollTimer = setInterval(pollLiveRoomViewerCount, 8000);
    setTimeout(pollLiveRoomViewerCount, 1200);
    broadcast('connection_status', appState.connection);
    return state;
  } catch (err) {
    appState.connection.status = 'error';
    appState.connection.errorMessage = err?.message || 'Kênh hiện chưa bật LIVE hoặc bị chặn kết nối.';
    pushLog(`❌ Không kết nối được @${cleanUsername}: ${appState.connection.errorMessage}`);
    broadcast('connection_status', appState.connection);
    throw err;
  }
}

// ============================================================================
// REST API CHO BẢNG ĐIỀU KHIỂN
// ============================================================================
app.get('/api/state', (_req, res) => {
  res.json(serializeState());
});

app.get('/api/gifts', async (_req, res) => {
  if (cachedTikTokGifts.length <= 10) {
    await fetchTikTokGiftCatalog();
  }
  res.json({
    ok: true,
    count: cachedTikTokGifts.length,
    gifts: cachedTikTokGifts
  });
});

app.post('/api/gifts/refresh', async (_req, res) => {
  const gifts = await fetchTikTokGiftCatalog();
  res.json({
    ok: true,
    count: gifts.length,
    gifts,
    state: serializeState()
  });
});

app.post('/api/connect', async (req, res) => {
  try {
    await connectToTikTok(req.body?.username, req.body?.signApiKey);
    res.json({ ok: true, state: serializeState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message, state: serializeState() });
  }
});

app.post('/api/disconnect', async (_req, res) => {
  await disconnectTikTok();
  res.json({ ok: true, state: serializeState() });
});

app.post('/api/simulate', (req, res) => {
  const { eventType, data = {} } = req.body || {};
  const mockUser = {
    displayId: data.userId || data.nickname || `phat_tu_${Date.now()}`,
    nickname: data.nickname || 'Thiện Nhân'
  };

  switch (eventType) {
    case 'seat_or_skin':
      handleChatEvent(mockUser, data.content || 'Nam Mô A Di Đà Phật, cầu gia đình bình an', data.skin);
      break;
    case 'chat':
      handleChatEvent(mockUser, data.content || 'Nam Mô A Di Đà Phật');
      break;
    case 'member':
      handleMemberEvent(mockUser);
      break;
    case 'like':
      handleLikeEvent(mockUser, Number(data.count) || 25);
      break;
    case 'gift':
      handleGiftEvent({
        rawUser: mockUser,
        giftName: data.giftName || 'Hoa Hồng (Rose)',
        diamondCount: Number(data.diamondCount) || 1,
        repeatCount: Number(data.repeatCount) || 1
      });
      break;
    case 'fill_preset': {
      const targetCount = Math.max(0, Number(data.count) || 0);
      appState.totalCrowdCount = targetCount;
      appState.connection.viewerCount = targetCount;
      if (targetCount === 0) {
        appState.meditators = [];
        pushLog('🧹 Đã làm trống toàn bộ sân chùa.');
      } else {
        appState.meditators = generatePresetMeditators(targetCount);
        pushLog(
          `🧘 Đã kích hoạt Đại Pháp Hội ${targetCount.toLocaleString('vi-VN')} Phật tử (Chế độ ảo hóa chống lag 60FPS: ${appState.meditators.length} đại diện tiền cảnh + biển người hậu cảnh).`
        );
      }
      broadcast('meditators_updated', { count: targetCount });
      break;
    }
    case 'chant': {
      const text = data.text || appState.settings.chantText;
      appState.settings.monkGreeting = text;
      pushLog('📿 Phát khởi đọc kinh & chúc phúc trên Chánh Điện.');
      broadcast('chant_start', { text });
      break;
    }
    case 'bell': {
      appState.altar.bellCount += 1;
      pushLog('🔔 Thỉnh Đại Hồng Chung ngân vang.');
      broadcast('bell_strike', {});
      break;
    }
    case 'wooden_fish': {
      handleLikeEvent(mockUser, 15);
      pushLog('🪵 Gõ Mõ Tụng Kinh (+15 công đức thả tim).');
      broadcast('wooden_fish_strike', {});
      break;
    }
    case 'free_roam_action': {
      const action = data.action || 'roam_all';
      if (action === 'roam_all') {
        appState.settings.freeRoamEnabled = true;
        pushLog('🚶 Khởi hành Kinh Hành: Toàn thể Phật tử tự do đi lại, chiêm bái quanh chùa.');
      } else if (action === 'bow_all') {
        pushLog('🙇 Đại chúng đồng loạt chắp tay Quỳ Lạy Tam Bảo 3 lạy.');
      } else if (action === 'incense_random') {
        appState.settings.freeRoamEnabled = true;
        pushLog('🕯️ Phật tử hữu duyên tự bước lên trước Lư Hương dâng nén tâm hương.');
      } else if (action === 'settle_all') {
        pushLog('🧘 Đại chúng trở về vị trí đệm quỳ / đài sen tĩnh tâm.');
      }
      broadcast('free_roam_action', { action });
      break;
    }
    case 'release_fish': {
      if (data.autoSwitchTheme !== false) {
        appState.settings.themeId = 6;
      }
      const creatureType = data.creatureType || 'carp_red';
      const count = Math.max(1, Math.min(8, Number(data.count) || 1));
      if (creatureType === 'reset_pond') {
        appState.pondCreatures = generateInitialPondCreatures();
        appState.altar.fishReleasedCount = appState.pondCreatures.length;
        pushLog('🌊 Đã làm mới Hồ Sen Phóng Sanh về trạng thái ban đầu.');
        broadcast('pond_updated', { pondCreatures: appState.pondCreatures });
        break;
      }
      const { person } = upsertMeditator({
        userId: mockUser.displayId,
        nickname: mockUser.nickname,
        preferredSkin: data.skin
      });
      const labelMap = {
        carp_red: 'Cá Chép Đỏ Bình An',
        koi_calico: 'Cá Koi Ngũ Sắc',
        koi_gold: 'Cá Koi Hoàng Kim',
        mixed_koi: 'Đàn Cá Koi Ngũ Sắc',
        turtle_gold: 'Rùa Vàng Linh Quy',
        royal_turtle_pack: 'Rùa Vàng Linh Quy & Đàn Cá Koi'
      };
      const creatureLabel = labelMap[creatureType] || 'Cá Chép Đỏ Bình An';
      const spawned = spawnPondCreatures(creatureType, count);
      const speech = `${person.nickname} thành tâm bước ra bến phóng sanh thả ${creatureLabel} xuống Hồ Sen. Nguyện cầu bình an, phước báu vô lượng!`;
      appState.settings.monkGreeting = speech;
      pushLog(`🐟 ${person.nickname} bước ra bến thả ${creatureLabel} (x${spawned.length}) xuống Hồ Sen.`);
      broadcast('fish_released', {
        user: person,
        creatures: spawned,
        creatureType,
        creatureLabel,
        count: spawned.length,
        dedicationText: speech
      });
      break;
    }
    case 'tutien_action': {
      if (data.autoSwitchTheme !== false) {
        appState.settings.themeId = 7;
      }
      const action = data.action || 'thunder';
      if (action === 'thunder') {
        handleChatEvent(mockUser, 'Triệu hồi Cửu Thiên Thần Lôi sấm chớp độ kiếp!');
      } else if (action === 'blossom') {
        handleChatEvent(mockUser, 'Triệu hồi Mưa Hoa Đào Tiên Giới chúc phúc!');
      } else if (action === 'sword') {
        handleChatEvent(mockUser, 'Vạn Kiếm Quy Tông hộ pháp Tiên Môn!');
      } else if (action === 'duel') {
        handleChatEvent(mockUser, 'Xin chỉ giáo! Đấu pháp luận kiếm đỉnh cao!');
      }
      break;
    }
    default:
      return res.status(400).json({ ok: false, error: `Sự kiện không hợp lệ: ${eventType}` });
  }

  res.json({ ok: true, state: serializeState() });
});

app.post('/api/config', (req, res) => {
  const body = req.body || {};
  const prevFreeRoam = appState.settings.freeRoamEnabled;
  const prevGiftTts = appState.settings.giftTtsEnabled;
  Object.keys(body).forEach((k) => {
    if (k in appState.settings) {
      appState.settings[k] = body[k];
    }
  });
  if ('freeRoamEnabled' in body && body.freeRoamEnabled !== prevFreeRoam) {
    pushLog(
      body.freeRoamEnabled
        ? '🚶 Đã BẬT chế độ: Phật tử tự do di chuyển, kinh hành, thắp hương & lễ Phật.'
        : '🧘 Đã TẮT chế độ tự do di chuyển: Phật tử quỳ tĩnh tâm theo hàng lối.'
    );
  }
  if ('giftTtsEnabled' in body && body.giftTtsEnabled !== prevGiftTts) {
    pushLog(
      body.giftTtsEnabled
        ? '🔊 Đã BẬT đọc thành tiếng (TTS) khi có người tặng quà.'
        : '🔇 Đã TẮT đọc thành tiếng (TTS) khi có người tặng quà (Chỉ hiện chữ & lạy Phật).'
    );
  }
  broadcast('config_updated', appState.settings);
  res.json({ ok: true, state: serializeState() });
});

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'init',
      payload: {},
      state: serializeState(),
      timestamp: Date.now()
    })
  );

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'set_theme') {
        appState.settings.themeId = Number(msg.themeId) || 1;
        broadcast('config_updated', appState.settings);
      } else if (msg.type === 'bell') {
        broadcast('bell_strike', {});
      } else if (msg.type === 'chant') {
        broadcast('chant_start', { text: appState.settings.chantText });
      }
    } catch (_e) {}
  });
});

server.listen(PORT, () => {
  console.log('====================================================================');
  console.log(' 🙏 CHÙA ONLINE - THIỀN ĐƯỜNG TỊNH TÂM (KHÔNG GIỚI HẠN NGƯỜI) 🙏');
  console.log('====================================================================');
  console.log(` -> Cửa sổ Overlay 9:16 (OBS): http://localhost:${PORT}/overlay.html`);
  console.log(` -> Bảng Điều Khiển LIVE     : http://localhost:${PORT}/control.html`);
  console.log('====================================================================');
  fetchTikTokGiftCatalog();
});
