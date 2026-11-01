(function () {
  // 1. Tự động co giãn khung chuẩn 9:16 (1080x1920)
  function updateStageScale() {
    const scale = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    document.documentElement.style.setProperty('--stage-scale', scale.toFixed(4));
  }
  window.addEventListener('resize', updateStageScale);
  updateStageScale();

  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-hide-dock');
  }

  // =========================================================================
  // 2. PRELOAD BỘ SPRITE NHÂN VẬT NAM & NỮ (ĐÃ CẮT SẠCH NỀN & CĂN TRỤC CHUẨN)
  // =========================================================================
  const SPRITE_VER = '?v=straight2';
  const SPRITE_SETS = {
    nam: {
      stand: '/assets/sprites/male_back_idle.png' + SPRITE_VER,
      standBow: '/assets/sprites/male_back_bow.png' + SPRITE_VER,
      walkL: '/assets/sprites/male_back_walk_l.png' + SPRITE_VER,
      walkR: '/assets/sprites/male_back_walk_r.png' + SPRITE_VER,
      kneel: '/assets/sprites/male_back_kneel.png' + SPRITE_VER,
      kneelGold: '/assets/sprites/male_back_kneel_gold.png' + SPRITE_VER,
      kneelBow1: '/assets/sprites/male_back_kneel_bow1.png' + SPRITE_VER,
      kneelBow2: '/assets/sprites/male_back_kneel_bow2.png' + SPRITE_VER,
      prostrate: '/assets/sprites/male_prostrate.png' + SPRITE_VER,
      meditate: '/assets/sprites/male_meditate.png' + SPRITE_VER
    },
    nu: {
      stand: '/assets/sprites/female_back_idle.png' + SPRITE_VER,
      standBow: '/assets/sprites/female_back_bow.png' + SPRITE_VER,
      walkL: '/assets/sprites/female_back_walk_l.png' + SPRITE_VER,
      walkR: '/assets/sprites/female_back_walk_r.png' + SPRITE_VER,
      kneel: '/assets/sprites/female_back_kneel.png' + SPRITE_VER,
      kneelGold: '/assets/sprites/female_back_kneel_gold.png' + SPRITE_VER,
      kneelBow1: '/assets/sprites/female_back_kneel_bow1.png' + SPRITE_VER,
      kneelBow2: '/assets/sprites/female_back_kneel_bow2.png' + SPRITE_VER,
      prostrate: '/assets/sprites/female_prostrate.png' + SPRITE_VER,
      meditate: '/assets/sprites/female_meditate.png' + SPRITE_VER
    }
  };

  Object.values(SPRITE_SETS).forEach((set) => {
    Object.values(set).forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  });

  // Preload bộ Sprite Hồ Sen Phóng Sanh (Cá Chép Đỏ, Cá Koi Vàng, Cá Koi Ngũ Sắc, Rùa Vàng, Lá Sen)
  const POND_SPRITE_URLS = {
    carp_red: '/assets/sprites/fish_carp_red.png?v=pond3',
    koi_gold: '/assets/sprites/fish_koi_gold.png?v=pond3',
    koi_calico: '/assets/sprites/fish_koi_calico.png?v=pond3',
    turtle_gold: '/assets/sprites/turtle_gold.png?v=pond3',
    lotus_pad: '/assets/sprites/lotus_pad.png?v=pond3'
  };
  const POND_IMAGES = {};
  Object.entries(POND_SPRITE_URLS).forEach(([key, url]) => {
    const img = new Image();
    img.src = url;
    POND_IMAGES[key] = img;
  });

  function getSpriteSetForPerson(person, fallbackIdx = 0) {
    if (person && (person.skin === 'nu' || person.skin === 'ni')) {
      return SPRITE_SETS.nu;
    }
    if (person && (person.skin === 'nam' || person.skin === 'su' || person.skin === 'tieu' || person.skin === 'caotang')) {
      return SPRITE_SETS.nam;
    }
    const seed = person?.userId ? String(person.userId).charCodeAt(0) : fallbackIdx;
    return seed % 2 === 1 ? SPRITE_SETS.nu : SPRITE_SETS.nam;
  }

  // =========================================================================
  // 3. DOM ELEMENTS
  // =========================================================================
  const stageWrapper = document.getElementById('stage-wrapper');
  const backdropImg = document.getElementById('backdrop-img');
  const seatCounterEl = document.getElementById('seat-counter');
  const crowdLodSummaryPill = document.getElementById('crowd-lod-summary-pill');
  const crowdLodCanvas = document.getElementById('crowd-lod-canvas');
  const crowdLodCtx = crowdLodCanvas ? crowdLodCanvas.getContext('2d') : null;

  // Ảnh Sprite dùng cho Canvas Ảo Hóa Biển Người Hậu Cảnh (500 - 10.000+ người không lag DOM)
  const CROWD_LOD_IMAGES = {
    nam: new Image(),
    nu: new Image()
  };
  let lastLodSignature = '';
  CROWD_LOD_IMAGES.nam.onload = () => {
    lastLodSignature = '';
    if (lastState) renderMassiveCrowdBackdropCanvas(getEffectiveCrowdCount(lastState));
  };
  CROWD_LOD_IMAGES.nu.onload = () => {
    lastLodSignature = '';
    if (lastState) renderMassiveCrowdBackdropCanvas(getEffectiveCrowdCount(lastState));
  };
  CROWD_LOD_IMAGES.nam.src = SPRITE_SETS.nam.kneel;
  CROWD_LOD_IMAGES.nu.src = SPRITE_SETS.nu.kneel;

  // Giới hạn số DOM Actor tiền cảnh (có thẻ tên + avatar + di chuyển) để luôn đạt 60FPS tuyệt đối
  const MAX_DOM_CROWD_ACTORS = 42;

  function getEffectiveCrowdCount(stateObj = lastState) {
    if (!stateObj) return 0;
    const conn = stateObj.connection;
    if (Number.isFinite(Number(stateObj.totalCrowdCount)) && Number(stateObj.totalCrowdCount) > 0) {
      return Number(stateObj.totalCrowdCount);
    }
    if (conn && conn.status === 'connected' && Number.isFinite(Number(conn.viewerCount))) {
      return Number(conn.viewerCount);
    }
    return Array.isArray(stateObj.meditators) ? stateObj.meditators.length : 0;
  }

  /**
   * Vẽ Biển Người Hậu Cảnh (tới 5.000 - 10.000+ Phật tử) lên 1 lớp Static Canvas duy nhất (< 1ms, 0ms/frame khi chạy 60FPS)
   * Giúp phòng đông hàng ngàn người nhìn kín sân chùa mà KHÔNG tạo hàng ngàn thẻ DOM gây lag!
   */
  function renderMassiveCrowdBackdropCanvas(totalCrowdCount = 0) {
    if (!crowdLodCtx || !crowdLodCanvas) return;

    if (totalCrowdCount <= 60) {
      if (lastLodSignature !== 'empty') {
        crowdLodCtx.clearRect(0, 0, crowdLodCanvas.width, crowdLodCanvas.height);
        lastLodSignature = 'empty';
      }
      if (crowdLodSummaryPill) {
        crowdLodSummaryPill.style.display = 'none';
      }
      return;
    }

    if (crowdLodSummaryPill) {
      crowdLodSummaryPill.style.display = 'block';
      crowdLodSummaryPill.textContent = `🪷 Đại Pháp Hội ${totalCrowdCount.toLocaleString('vi-VN')} Phật Tử • Ảo Hóa Chống Lag 60FPS`;
    }

    const sig = `${currentThemeId}_${totalCrowdCount}`;
    if (sig === lastLodSignature) return;
    lastLodSignature = sig;

    crowdLodCtx.clearRect(0, 0, crowdLodCanvas.width, crowdLodCanvas.height);

    const maleImg = CROWD_LOD_IMAGES.nam;
    const femaleImg = CROWD_LOD_IMAGES.nu;
    if (!maleImg.complete || ! maleImg.naturalWidth) return;

    // Số lượng hình nhân hậu cảnh đại diện cho biển người (tối đa 360 hình trên 1 bitmap tĩnh)
    const visualSeaCount = Math.min(360, Math.max(80, Math.floor((totalCrowdCount - 42) * 0.35)));
    const isCourtyard = currentThemeId === 2 || currentThemeId === 4 || currentThemeId === 5;
    const isRedCarpet = currentThemeId === 3;
    const isPondMode = currentThemeId === 6;

    if (isCourtyard) {
      // Sân Chùa Đêm Trăng: Biển người ngồi kín hậu cảnh từ y=1090..1740
      const rows = 11;
      const cols = Math.ceil(visualSeaCount / rows);
      for (let r = 0; r < rows; r++) {
        const tRow = r / Math.max(1, rows - 1);
        const y = 1095 + tRow * 610;
        const sc = 0.42 + tRow * 0.22;
        const w = 90 * sc;
        const h = 122 * sc;
        const rowSpan = 780 + tRow * 220;
        for (let c = 0; c < cols; c++) {
          const tCol = cols <= 1 ? 0.5 : c / (cols - 1) - 0.5;
          const jitterX = ((r * 17 + c * 31) % 19) - 9;
          const x = 540 + tCol * rowSpan + jitterX;
          const img = (r + c) % 3 === 0 && femaleImg.complete ? femaleImg : maleImg;
          crowdLodCtx.globalAlpha = 0.72 + tRow * 0.18;
          crowdLodCtx.drawImage(img, x - w / 2, y - h, w, h);
        }
      }
      crowdLodCtx.globalAlpha = 1;
      return;
    }

    // Chế độ Đại Điện (Mẫu 1), Chánh Điện (Mẫu 3), hoặc Sân Đá Hồ Sen (Mẫu 6)
    const minY = isRedCarpet ? 1245 : isPondMode ? 812 : 920;
    const maxY = isRedCarpet ? 1690 : isPondMode ? 1005 : 1685;
    const rows = isPondMode ? 6 : 12;
    const colsPerSide = Math.max(6, Math.ceil(visualSeaCount / (rows * 2)));

    for (let r = 0; r < rows; r++) {
      const tRow = rows <= 1 ? 0 : r / (rows - 1);
      const y = minY + tRow * (maxY - minY);
      const sc = (isPondMode ? 0.42 : 0.46) + tRow * 0.16;
      const w = 90 * sc;
      const h = 122 * sc;
      const stagger = r % 2 === 1 ? 10 : -10;

      for (let side = 0; side < 2; side++) {
        const isLeft = side === 0;
        const xStart = isLeft ? 48 : isRedCarpet ? 730 : 698;
        const xEnd = isLeft ? (isRedCarpet ? 350 : 382) : 1032;

        for (let c = 0; c < colsPerSide; c++) {
          const tCol = colsPerSide <= 1 ? 0.5 : c / (colsPerSide - 1);
          const jitterX = ((r * 13 + c * 29 + side * 7) % 15) - 7;
          const x = xStart + tCol * (xEnd - xStart) + stagger + jitterX;
          const img = (r + c + side) % 3 === 0 && femaleImg.complete ? femaleImg : maleImg;
          crowdLodCtx.globalAlpha = 0.76 + tRow * 0.18;
          crowdLodCtx.drawImage(img, x - w / 2, y - h, w, h);
        }
      }
    }
    crowdLodCtx.globalAlpha = 1;
  }

  const tamLongListEl = document.getElementById('tam-long-list');
  const tamBaoBannerEl = document.getElementById('tam-bao-banner');
  const quybaiCharsLayer = document.getElementById('quybai-characters-layer');
  const quybaiRunnersLayer = document.getElementById('quybai-runners-layer');

  const hallTitleEl = document.getElementById('hall-title');
  const hallSubtitleEl = document.getElementById('hall-subtitle');
  const customRedBanner = document.getElementById('custom-red-banner');
  const woodenFishWidget = document.getElementById('wooden-fish-widget');
  const fishPlusPopup = document.getElementById('fish-plus-popup');
  const likeProgressFill = document.getElementById('like-progress-fill');
  const likeProgressText = document.getElementById('like-progress-text');
  const monkGreetingCard = document.getElementById('monk-greeting-card');
  const monkSpeechText = document.getElementById('monk-speech-text');
  const meritListEl = document.getElementById('merit-list');
  const bowingStage = document.getElementById('bowing-worship-stage');
  const bowingBannerToast = document.getElementById('bowing-banner-toast');
  const bowingCharRig = document.getElementById('bowing-character-rig');
  const courtyardStage = document.getElementById('courtyard-meditators-stage');

  const dockBtnAudio = document.getElementById('dock-btn-audio');
  const dockBtnMusic = document.getElementById('dock-btn-music');
  const dockBtnBell = document.getElementById('dock-btn-bell');
  const dockBtnChant = document.getElementById('dock-btn-chant');
  const themeButtons = document.querySelectorAll('.dock-btn[data-theme]');

  let currentSettings = {};
  let currentThemeId = 1;
  let activeBubbles = new Map();
  let lastCrowdSignature = '';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortenName(name, maxLen = 12) {
    const s = String(name || 'Phật Tử').trim();
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  }

  function renderAvatarBadge(avatarUrl, fallbackEmoji = '🙏', cls = 'pill-avatar-dot') {
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('http')) {
      return `<img src="${escapeHtml(avatarUrl)}" class="${cls} avatar-circle-img" referrerpolicy="no-referrer" alt="" />`;
    }
    return `<span class="${cls}">${fallbackEmoji}</span>`;
  }

  // =========================================================================
  // 4. DỰNG ĐẠI CHÚNG OPTION 1 (ĐẠI ĐIỆN THẢM XANH) & OPTION 3 (A DI ĐÀ THẢM ĐỎ)
  //    DÙNG SPRITE ĐẶC 100% (KHÔNG BÓNG MỜ, KHÔNG ĐÈ CHỮ, KHOẢNG CÁCH HÀNG CHUẨN)
  // =========================================================================
  function computeGrandHallDynamicSlot(i, remainingCount, isRedCarpetStage) {
    let colsPerSide = 3;
    let densityScale = 1.0;

    if (remainingCount > 170) {
      colsPerSide = 9;
      densityScale = 0.56;
    } else if (remainingCount > 100) {
      colsPerSide = 7;
      densityScale = 0.66;
    } else if (remainingCount > 54) {
      colsPerSide = 5;
      densityScale = 0.76;
    } else if (remainingCount > 30) {
      colsPerSide = 4;
      densityScale = 0.86;
    }

    if (currentThemeId === 6) {
      colsPerSide = Math.min(10, Math.max(5, colsPerSide + 2));
      densityScale = +(densityScale * 0.84).toFixed(3);
    }

    const totalRows = Math.max(1, Math.ceil(remainingCount / (colsPerSide * 2)));
    const isLeftSide = i % 2 === 0;
    const sideIdx = Math.floor(i / 2);
    const row = Math.floor(sideIdx / colsPerSide);
    const col = sideIdx % colsPerSide;

    const tRow = totalRows <= 1 ? 0 : row / (totalRows - 1);
    const tCol = colsPerSide <= 1 ? 0.5 : col / (colsPerSide - 1);
    const staggerX = totalRows > 5 && row % 2 === 1 ? (isLeftSide ? 12 : -12) : 0;

    let x;
    let y;
    let scale;

    if (isRedCarpetStage) {
      const ySpan = 370;
      const stepY = totalRows <= 4 ? 120 : ySpan / Math.max(1, totalRows - 1);
      y = Math.round(1305 + row * stepY);
      scale = +((0.78 + tRow * 0.18) * densityScale).toFixed(3);
      if (isLeftSide) {
        const leftInner = Math.round(334 - tRow * 32);
        x = Math.round(62 + tCol * (leftInner - 62) + staggerX);
      } else {
        const rightInner = Math.round(746 + tRow * 32);
        x = Math.round(rightInner + tCol * (1018 - rightInner) + staggerX);
      }
    } else if (currentThemeId === 6) {
      // Mẫu 6 (Khuôn Viên Hồ Sen Phóng Sanh Ngoài Sân Chùa):
      // Đại chúng đứng/quỳ trên sân gạch đá cổ truyền phía trên lan can đá bờ hồ (y=852..992)
      const ySpan = 140;
      const stepY = totalRows <= 2 ? 68 : ySpan / Math.max(1, totalRows - 1);
      y = Math.round(852 + row * stepY);
      scale = +((0.72 + tRow * 0.12) * densityScale).toFixed(3);
      if (isLeftSide) {
        const leftInner = Math.round(375 - tRow * 14);
        x = Math.round(68 + tCol * (leftInner - 68) + staggerX);
      } else {
        const rightInner = Math.round(705 + tRow * 14);
        x = Math.round(rightInner + tCol * (1012 - rightInner) + staggerX);
      }
    } else {
      const ySpan = 610;
      const stepY = totalRows <= 5 ? 142 : ySpan / Math.max(1, totalRows - 1);
      y = Math.round(1015 + row * stepY);
      scale = +((0.8 + tRow * 0.18) * densityScale).toFixed(3);
      if (isLeftSide) {
        const leftInner = Math.round(368 - tRow * 26);
        x = Math.round(72 + tCol * (leftInner - 72) + staggerX);
      } else {
        const rightInner = Math.round(712 + tRow * 26);
        x = Math.round(rightInner + tCol * (1008 - rightInner) + staggerX);
      }
    }

    return { x, y, scale, densityScale, zIndex: 20 + row * 2 };
  }

  function renderQuyBaiGrandHall(meditators = [], forceRebuild = false) {
    const total = meditators.length;
    updateLiveCounterBadge(meditators);

    if (total === 0) {
      quybaiCharsLayer.innerHTML = '';
      lastCrowdSignature = '';
      return;
    }

    const sig = `${currentThemeId}_${meditators.map((m) => `${m.userId}:${m.nickname}:${m.skin || ''}:${m.avatar || ''}`).join('|')}`;
    const bubblesSig = Array.from(activeBubbles.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
    const fullSig = `${sig}__${bubblesSig}`;
    if (!forceRebuild && fullSig === lastCrowdSignature && quybaiCharsLayer.children.length > 0) {
      return;
    }
    lastCrowdSignature = fullSig;

    let html = '';
    const isRedCarpetStage = currentThemeId === 3; // amitabha_stage.jpg

    // 1. HÀNG 6 ĐỆM QUỲ VIP: Đặt khớp chính xác lên 6 đệm nhung xanh (Mẫu 1), 6 đệm đỏ (Mẫu 3), hoặc 6 đệm sân chùa (Mẫu 6)
    const vipCushionCoords = isRedCarpetStage
      ? [
          { x: 140, y: 1188, rank: 1 },
          { x: 268, y: 1188, rank: 2 },
          { x: 392, y: 1188, rank: 3 },
          { x: 688, y: 1188, rank: 4 },
          { x: 812, y: 1188, rank: 5 },
          { x: 940, y: 1188, rank: 6 }
        ]
      : currentThemeId === 6
        ? [
            { x: 96, y: 758, rank: 1 },
            { x: 202, y: 758, rank: 2 },
            { x: 302, y: 758, rank: 3 },
            { x: 778, y: 758, rank: 4 },
            { x: 878, y: 758, rank: 5 },
            { x: 984, y: 758, rank: 6 }
          ]
        : [
            { x: 222, y: 858, rank: 1 },
            { x: 312, y: 858, rank: 2 },
            { x: 402, y: 858, rank: 3 },
            { x: 678, y: 858, rank: 4 },
            { x: 768, y: 858, rank: 5 },
            { x: 858, y: 858, rank: 6 }
          ];

    vipCushionCoords.forEach((slot, idx) => {
      const dev = meditators[idx];
      if (!dev) return;
      const bText = activeBubbles.get(dev.userId);
      const genderKey = getSpriteSetForPerson(dev, idx) === SPRITE_SETS.nu ? 'nu' : 'nam';
      const spriteSet = SPRITE_SETS[genderKey];
      html += `
        <div
          class="standing-pilgrim-node${bText ? ' just-interacted-glow' : ''}"
          style="left: ${slot.x}px; top: ${slot.y}px; --p-scale: ${isRedCarpetStage ? 0.94 : 0.88}; z-index: ${bText ? 55 : 14 + idx};"
        >
          ${bText ? `<div class="pilgrim-white-bubble">${escapeHtml(bText)}</div>` : ''}
          <img
            src="${spriteSet.kneel}"
            alt="VIP Devotee"
            class="devotee-sprite vip-kneeling-img"
            data-gender="${genderKey}"
          />
          <div class="pilgrim-foot-pill vip-platform">
            <span class="vip-badge-num">${slot.rank}</span>
            ${renderAvatarBadge(dev.avatar, '👑', 'pill-avatar-dot')}
            <span>${escapeHtml(shortenName(dev.nickname, 10))}</span>
          </div>
        </div>
      `;
    });

    // 2. ĐẠO TRÀNG PHẬT TỬ TIỀN CẢNH (Khi phòng > 60 người thì giới hạn 36 thẻ DOM tiền cảnh + Biển người Canvas hậu cảnh để 5.000 người vẫn 60FPS không đè chữ)
    const rest = meditators.slice(6, MAX_DOM_CROWD_ACTORS);
    const remainingCount = rest.length;

    for (let i = 0; i < remainingCount; i++) {
      const person = rest[i];
      const { x, y, scale, zIndex } = computeGrandHallDynamicSlot(i, remainingCount, isRedCarpetStage);
      const bubbleText = activeBubbles.get(person.userId);

      const genderKey = getSpriteSetForPerson(person, i + 1) === SPRITE_SETS.nu ? 'nu' : 'nam';
      const spriteSet = SPRITE_SETS[genderKey];

      html += `
        <div
          class="standing-pilgrim-node${bubbleText ? ' just-interacted-glow' : ''}"
          style="left: ${x}px; top: ${y}px; --p-scale: ${scale}; z-index: ${bubbleText ? 56 : zIndex};"
        >
          ${bubbleText ? `<div class="pilgrim-white-bubble">${escapeHtml(bubbleText)}</div>` : ''}
          <img
            src="${spriteSet.kneel}"
            alt="Phật tử"
            class="devotee-sprite kneeling-img"
            data-gender="${genderKey}"
          />
          <div class="pilgrim-foot-pill">
            ${renderAvatarBadge(person.avatar, '🙏', 'pill-avatar-dot')}
            <span>${escapeHtml(shortenName(person.nickname, remainingCount > 60 ? 9 : 11))}</span>
          </div>
        </div>
      `;
    }

    quybaiCharsLayer.innerHTML = html;
  }

  // =========================================================================
  // 5. DIỄN HOẠT KHI TẶNG QUÀ: BƯỚC LÊN -> QUỲ LẠY 3 LẠY -> ĐỨNG DẬY ĐI XUỐNG & TỰ ẨN BANNER
  // =========================================================================
  const runnerQueue = [];
  let activeRunnersCount = 0;
  let activeRunnerIntervals = [];
  let bannerHideTimer = null;

  function showTamBaoBanner(text, autoHideMs = 0) {
    if (!text) return;
    if (bannerHideTimer) {
      clearTimeout(bannerHideTimer);
      bannerHideTimer = null;
    }
    tamBaoBannerEl.textContent = text;
    tamBaoBannerEl.classList.add('visible');
    tamBaoBannerEl.classList.remove('pulse');
    void tamBaoBannerEl.offsetWidth;
    tamBaoBannerEl.classList.add('pulse');
    setTimeout(() => tamBaoBannerEl.classList.remove('pulse'), 1600);

    if (autoHideMs > 0) {
      bannerHideTimer = setTimeout(() => {
        if (activeRunnersCount === 0 && runnerQueue.length === 0) {
          tamBaoBannerEl.classList.remove('visible');
        }
      }, autoHideMs);
    }
  }

  function hideTamBaoBanner() {
    if (bannerHideTimer) {
      clearTimeout(bannerHideTimer);
      bannerHideTimer = null;
    }
    tamBaoBannerEl.classList.remove('visible', 'pulse');
  }

  function clearActiveRunnerTimers() {
    activeRunnerIntervals.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    activeRunnerIntervals = [];
  }

  function triggerRunUpAndProstrate(giftPayload) {
    const nickname = giftPayload.user?.nickname || 'Tín Chủ';
    const incenseCount = Math.max(1, Number(giftPayload.meritAdded) || 1);
    const isAscendPlatform = incenseCount >= 5 || (giftPayload.user && giftPayload.user.merit >= 5);
    const commentText = String(giftPayload.commentText || '').trim();
    const isGift = !commentText;

    // Nếu hàng đợi đang đông và đây chỉ là bình luận thường thì giới hạn 2 người chờ để ưu tiên quà tặng
    if (!isGift && runnerQueue.length >= 2) return;

    const bannerMsg = commentText
      ? `🙏 ${nickname} thành tâm khấn nguyện: "${commentText}"`
      : `${nickname} đã dâng ${incenseCount} nén hương lên Tam Bảo. Chúc tâm như hoa sen, thanh tịnh giữa đời.`;

    const entry = {
      ceremonyType: 'incense',
      nickname,
      incenseCount,
      isAscendPlatform,
      bannerMsg,
      commentText,
      giftIconUrl: giftPayload.giftIconUrl || '',
      user: giftPayload.user
    };

    if (isGift) {
      runnerQueue.unshift(entry);
    } else {
      runnerQueue.push(entry);
    }

    processRunnerQueue();
  }

  /**
   * Kịch bản Phật tử bước ra Bến Đá Phóng Sanh -> Xá Phật & thả Cá Chép / Cá Koi / Rùa Vàng xuống Hồ Sen
   * (Tên là tên Phật tử ở dưới chân người, Cá bơi dưới hồ KHÔNG có tên, và cá thả ra luôn bơi vĩnh viễn ở dưới hồ)
   */
  function triggerWalkOutAndReleaseFish(releasePayload = {}) {
    const nickname = releasePayload.user?.nickname || 'Phật Tử';
    const creatureLabel = releasePayload.creatureLabel || 'Cá Chép Đỏ Bình An';
    const commentText = String(releasePayload.commentText || '').trim();
    const isGift = !commentText;

    if (!isGift && runnerQueue.length >= 2) return;

    const creatures =
      Array.isArray(releasePayload.creatures) && releasePayload.creatures.length > 0
        ? releasePayload.creatures
        : [
            {
              id: `fish_local_${Date.now()}`,
              type: releasePayload.creatureType || 'carp_red',
              scale: 0.58
            }
          ];

    // Đánh dấu những con cá này đang chờ Phật tử bước ra bến thả xuống nước (chưa hiện ngay trước khi thả)
    creatures.forEach((c) => {
      if (c && c.id) {
        pendingReleaseIds.add(c.id);
      }
    });

    const bannerMsg = commentText
      ? `🐟 ${nickname} khấn nguyện: "${commentText}" • Phóng sanh ${creatureLabel} xuống Hồ Sen!`
      : `${nickname} thành tâm bước ra Bến Phóng Sanh thả ${creatureLabel} xuống Hồ Sen. Nguyện cầu bình an, phước báu vô lượng!`;

    const entry = {
      ceremonyType: 'release_fish',
      nickname,
      creatureLabel,
      creatures,
      bannerMsg,
      commentText,
      giftIconUrl: releasePayload.giftIconUrl || '',
      user: releasePayload.user
    };

    if (isGift) {
      runnerQueue.unshift(entry);
    } else {
      runnerQueue.push(entry);
    }

    processRunnerQueue();
  }

  function processRunnerQueue() {
    if (runnerQueue.length === 0 || activeRunnersCount >= 1) return;

    const item = runnerQueue.shift();
    activeRunnersCount++;
    clearActiveRunnerTimers();

    showTamBaoBanner(item.bannerMsg);

    const runnerId = `runner_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const imgId = `${runnerId}_img`;
    const spriteSet = getSpriteSetForPerson(item.user, Date.now());

    quybaiRunnersLayer.innerHTML = '';

    const runnerEl = document.createElement('div');
    runnerEl.className = 'runner-pilgrim-actor';

    if (item.ceremonyType === 'release_fish') {
      // KỊCH BẢN THẢ CÁ PHÓNG SANH NGOÀI SÂN CHÙA:
      // Phật tử bước từ sân chùa trước Lư Hương (y=815) đi dọc bậc thềm đá trung tâm xuống Bến Đá Hồ Sen (x=540, y=1172),
      // quỳ/xá xuống thả cá vào hồ nước (y=1265..1385), rồi đứng dậy đi trở về sân chùa.
      const startX = 540;
      const startY = 815;
      const pierX = 540;
      const pierY = 1172;

      runnerEl.style.left = `${startX}px`;
      runnerEl.style.top = `${startY}px`;
      runnerEl.style.transform = 'translate(-50%, -92%) scale(0.88)';

      const giftIconHtml = item.giftIconUrl
        ? `<img src="${escapeHtml(item.giftIconUrl)}" style="width:22px;height:22px;vertical-align:middle;margin-right:4px;" referrerpolicy="no-referrer" alt="" />`
        : '🐟 ';
      const bubbleLine = item.commentText
        ? `${giftIconHtml}${escapeHtml(item.commentText)}`
        : `${giftIconHtml}Con xin phóng sanh ${escapeHtml(item.creatureLabel)} 🙏`;

      runnerEl.innerHTML = `
        <div class="pilgrim-white-bubble" id="${runnerId}_bubble">${bubbleLine}</div>
        <img
          id="${imgId}"
          src="${spriteSet.walkL}"
          alt="Phật tử phóng sanh"
          class="devotee-sprite walker-img walking-stride-loop"
        />
        <div class="pilgrim-foot-pill vip-platform">
          ${renderAvatarBadge(item.user?.avatar, '🪷', 'pill-avatar-dot')}
          <span>${escapeHtml(shortenName(item.nickname, 14))}</span>
        </div>
      `;

      quybaiRunnersLayer.appendChild(runnerEl);

      // Pha 1 (0s -> 1.65s): Bước chân Trái - Phải tiến ra Bến Đá Phóng Sanh sát mép hồ (y=1098)
      const walkToPierTid = setTimeout(() => {
        runnerEl.style.transition = 'top 1.6s linear, left 1.6s linear, transform 1.6s linear, opacity 0.35s ease';
        runnerEl.style.left = `${pierX}px`;
        runnerEl.style.top = `${pierY}px`;
        runnerEl.style.transform = 'translate(-50%, -92%) scale(0.98)';
      }, 45);
      activeRunnerIntervals.push(walkToPierTid);

      for (let step = 1; step <= 7; step++) {
        const tid = setTimeout(() => {
          const imgEl = document.getElementById(imgId);
          if (imgEl) {
            imgEl.src = step % 2 === 0 ? spriteSet.walkL : spriteSet.walkR;
          }
        }, step * 210);
        activeRunnerIntervals.push(tid);
      }

      // Pha 2 (1.7s -> 4.5s): Tới mép hồ -> Hạ gối quỳ & cúi người thả từng chú cá / rùa vàng xuống mặt nước Hồ Sen
      const releaseTid = setTimeout(() => {
        const imgEl = document.getElementById(imgId);
        if (imgEl) {
          imgEl.className = 'devotee-sprite runner-kneel-img';
          imgEl.src = spriteSet.kneelBow1;
        }

        // Thả từng chú cá / rùa từ tay Phật tử ở bậc đá dưới cùng (540, 1152) vọt xuống mặt hồ (y=1270..1380)
        const list = item.creatures || [];
        list.forEach((creature, cIdx) => {
          const dropTid = setTimeout(() => {
            launchFishReleaseArc(creature, 540, 1152, cIdx, list.length);
          }, cIdx * 240);
          activeRunnerIntervals.push(dropTid);
        });

        // Sau khi thả xuống nước -> Chắp tay lạy tạ & hồi hướng công đức
        const bowSeq = [
          spriteSet.kneel,
          spriteSet.kneelBow1,
          spriteSet.kneelBow2,
          spriteSet.kneelBow1,
          spriteSet.kneel
        ];
        let bIdx = 0;
        const bowTimer = setInterval(() => {
          const curImg = document.getElementById(imgId);
          if (!curImg || bIdx >= bowSeq.length) {
            clearInterval(bowTimer);
            return;
          }
          curImg.src = bowSeq[bIdx++];
        }, 360);
        activeRunnerIntervals.push(bowTimer);

        const bubbleEl = document.getElementById(`${runnerId}_bubble`);
        if (bubbleEl) {
          setTimeout(() => {
            bubbleEl.style.opacity = '0';
            setTimeout(() => bubbleEl.remove(), 300);
          }, 2100);
        }
      }, 1700);
      activeRunnerIntervals.push(releaseTid);

      // Pha 3 (4.6s -> 6.3s): Đứng dậy Xá Phật rồi bước lùi/đi về lại thềm chùa (y=835)
      const walkBackTid = setTimeout(() => {
        const imgEl = document.getElementById(imgId);
        if (imgEl) {
          imgEl.className = 'devotee-sprite walker-img walking-stride-loop';
          imgEl.src = spriteSet.standBow;
        }

        const moveBackTid = setTimeout(() => {
          runnerEl.style.transition = 'top 1.45s linear, transform 1.45s linear, opacity 0.4s ease';
          runnerEl.style.top = `${startY}px`;
          runnerEl.style.transform = 'translate(-50%, -92%) scale(0.86)';
        }, 180);
        activeRunnerIntervals.push(moveBackTid);

        for (let step = 1; step <= 6; step++) {
          const tid = setTimeout(() => {
            const curImg = document.getElementById(imgId);
            if (curImg) {
              curImg.src = step % 2 === 0 ? spriteSet.walkL : spriteSet.walkR;
            }
          }, 160 + step * 210);
          activeRunnerIntervals.push(tid);
        }

        const fadeTid = setTimeout(() => {
          runnerEl.style.opacity = '0';
        }, 1250);
        activeRunnerIntervals.push(fadeTid);
      }, 4600);
      activeRunnerIntervals.push(walkBackTid);

      // Kết thúc lượt phóng sanh (6.4s)
      const finishReleaseTid = setTimeout(() => {
        runnerEl.remove();
        activeRunnersCount = Math.max(0, activeRunnersCount - 1);
        if (runnerQueue.length > 0) {
          processRunnerQueue();
        } else {
          hideTamBaoBanner();
        }
      }, 6400);
      activeRunnerIntervals.push(finishReleaseTid);
      return;
    }

    const targetX = 540;
    const targetY =
      currentThemeId === 3
        ? 1148
        : item.isAscendPlatform
        ? 798
        : 855;

    runnerEl.style.left = `${targetX}px`;
    runnerEl.style.top = '1660px';
    runnerEl.style.transform = 'translate(-50%, -92%) scale(1.04)';

    const giftIconHtml = item.giftIconUrl
      ? `<img src="${escapeHtml(item.giftIconUrl)}" style="width:22px;height:22px;vertical-align:middle;margin-right:4px;" referrerpolicy="no-referrer" alt="" />`
      : '🕯️ ';
    const incenseBubbleLine = item.commentText
      ? `${giftIconHtml}${escapeHtml(item.commentText)}`
      : `${giftIconHtml}Con xin dâng ${item.incenseCount} nén hương 🙏`;

    runnerEl.innerHTML = `
      <div class="pilgrim-white-bubble" id="${runnerId}_bubble">${incenseBubbleLine}</div>
      <img
        id="${imgId}"
        src="${spriteSet.walkL}"
        alt="Thí chủ dâng hương"
        class="devotee-sprite walker-img walking-stride-loop"
      />
      <div class="pilgrim-foot-pill vip-platform">
        ${renderAvatarBadge(item.user?.avatar, '🪷', 'pill-avatar-dot')}
        <span>${escapeHtml(shortenName(item.nickname, 14))}</span>
      </div>
    `;

    quybaiRunnersLayer.appendChild(runnerEl);

    // Pha 1 (0s -> 2.0s): Bước chân Trái - Phải (walkL <-> walkR) tiến dọc theo Thảm Xanh lên trước Lư Hương
    const moveUpTid = setTimeout(() => {
      runnerEl.style.transition = 'top 1.95s linear, left 1.95s linear, transform 1.95s linear, opacity 0.4s ease';
      runnerEl.style.top = `${targetY}px`;
      runnerEl.style.transform = 'translate(-50%, -92%) scale(0.96)';
    }, 50);
    activeRunnerIntervals.push(moveUpTid);

    for (let step = 1; step <= 8; step++) {
      const tid = setTimeout(() => {
        const imgEl = document.getElementById(imgId);
        if (imgEl) {
          imgEl.src = step % 2 === 0 ? spriteSet.walkL : spriteSet.walkR;
        }
      }, step * 230);
      activeRunnerIntervals.push(tid);
    }

    // Pha 2 (2.0s -> 5.75s): Khi lên tới trước Lư Hương -> Hạ gối quỳ xuống và thực hiện đúng 3 Lạy Tam Bảo
    const kneelTid = setTimeout(() => {
      const imgEl = document.getElementById(imgId);
      if (imgEl) {
        imgEl.className = 'devotee-sprite runner-kneel-img';
        imgEl.src = spriteSet.kneel;
      }
      const bubbleEl = document.getElementById(`${runnerId}_bubble`);
      if (bubbleEl) {
        setTimeout(() => {
          bubbleEl.style.opacity = '0';
          setTimeout(() => bubbleEl.remove(), 300);
        }, 1800);
      }
      spawnLotusBurst(540, 720, 28);

      const oneBowCycle = [
        spriteSet.kneelBow1,
        spriteSet.kneelBow2,
        spriteSet.kneelBow2,
        spriteSet.kneelBow1,
        spriteSet.kneel
      ];
      const threeBowsSequence = [...oneBowCycle, ...oneBowCycle, ...oneBowCycle];
      let bIdx = 0;
      const bowLoopId = setInterval(() => {
        const curImg = document.getElementById(imgId);
        if (!curImg || bIdx >= threeBowsSequence.length) {
          if (curImg) curImg.src = spriteSet.kneel;
          clearInterval(bowLoopId);
          return;
        }
        curImg.src = threeBowsSequence[bIdx];
        bIdx++;
      }, 240);
      activeRunnerIntervals.push(bowLoopId);
    }, 2000);
    activeRunnerIntervals.push(kneelTid);

    // Pha 3 (5.8s -> 7.75s): Đứng dậy Xá Phật rồi ĐI XUỐNG dọc theo thảm xanh và rời khỏi bục
    const walkDownStartTid = setTimeout(() => {
      const imgEl = document.getElementById(imgId);
      if (imgEl) {
        imgEl.className = 'devotee-sprite walker-img walking-stride-loop';
        imgEl.src = spriteSet.standBow;
      }

      // Sau 220ms xá Phật, bắt đầu bước chân Trái - Phải đi xuống cuối thảm xanh
      const stepDownMoveTid = setTimeout(() => {
        runnerEl.style.transition = 'top 1.65s linear, transform 1.65s linear, opacity 0.42s ease';
        runnerEl.style.top = '1700px';
        runnerEl.style.transform = 'translate(-50%, -92%) scale(1.05)';
      }, 220);
      activeRunnerIntervals.push(stepDownMoveTid);

      for (let step = 1; step <= 7; step++) {
        const tid = setTimeout(() => {
          const curImg = document.getElementById(imgId);
          if (curImg) {
            curImg.src = step % 2 === 0 ? spriteSet.walkL : spriteSet.walkR;
          }
        }, 200 + step * 220);
        activeRunnerIntervals.push(tid);
      }

      // Mờ dần khi đi xuống tới cuối thảm
      const fadeOutTid = setTimeout(() => {
        runnerEl.style.opacity = '0';
      }, 1500);
      activeRunnerIntervals.push(fadeOutTid);
    }, 5800);
    activeRunnerIntervals.push(walkDownStartTid);

    // Kết thúc lượt dâng hương (7.8s): Xóa nhân vật đi xuống & tự động ẩn bảng thông báo Tam Bảo nếu hết hàng đợi
    const finishTid = setTimeout(() => {
      runnerEl.remove();
      activeRunnersCount = Math.max(0, activeRunnersCount - 1);
      if (runnerQueue.length > 0) {
        processRunnerQueue();
      } else {
        hideTamBaoBanner();
      }
    }, 7800);
    activeRunnerIntervals.push(finishTid);
  }

  // =========================================================================
  // 6. OPTION 2: SÂN CHÙA ĐÊM TRĂNG (CHÙA ONLINE) VỚI SPRITE QUỲ HƯỚNG PHẬT + ĐÀI SEN
  // =========================================================================
  function getCourtyardMeditatorMarkup(
    { hasLotusSeat = false, isHoPhap = false, showPreviewIncense = false, person = null },
    uid = '0'
  ) {
    const spriteSet = getSpriteSetForPerson(person, typeof uid === 'number' ? uid : 0);
    const spriteUrl = isHoPhap ? spriteSet.kneelGold : spriteSet.kneel;
    const previewIncenseHtml = showPreviewIncense
      ? '<div class="head-incense-glow tier-preview-incense"></div>'
      : '';
    const lotusSvg = hasLotusSeat
      ? `
        <svg class="lotus-base-svg" viewBox="0 0 110 46">
          <ellipse cx="55" cy="36" rx="44" ry="10" fill="rgba(0,0,0,0.45)" />
          <path d="M12 32 Q22 12 38 28 Z" fill="#f472b6" stroke="#fbcfe8" stroke-width="1" />
          <path d="M98 32 Q88 12 72 28 Z" fill="#f472b6" stroke="#fbcfe8" stroke-width="1" />
          <path d="M22 36 Q34 14 50 34 Z" fill="#ec4899" stroke="#fbcfe8" stroke-width="1" />
          <path d="M88 36 Q76 14 60 34 Z" fill="#ec4899" stroke="#fbcfe8" stroke-width="1" />
          <path d="M38 38 Q55 12 72 38 Z" fill="#fbcfe8" stroke="#f472b6" stroke-width="1.2" />
        </svg>
      `
      : `
        <svg class="lotus-base-svg" viewBox="0 0 110 46">
          <ellipse cx="55" cy="36" rx="38" ry="10" fill="rgba(0,0,0,0.45)" />
          <ellipse cx="55" cy="32" rx="34" ry="9" fill="#92400e" stroke="#451a03" stroke-width="1.5" />
        </svg>
      `;

    return `
      <div class="lotus-seat-wrapper ${isHoPhap ? 'ho-phap-aura' : ''}">
        ${previewIncenseHtml}
        <img src="${spriteUrl}" alt="Phật tử" class="devotee-sprite" data-uid="${uid}" />
        ${lotusSvg}
      </div>
    `;
  }

  document.getElementById('preview-tier-1').innerHTML = getCourtyardMeditatorMarkup(
    { hasLotusSeat: false, isHoPhap: false, showPreviewIncense: true },
    0
  );
  document.getElementById('preview-tier-2').innerHTML = getCourtyardMeditatorMarkup(
    { hasLotusSeat: true, isHoPhap: false, showPreviewIncense: true },
    1
  );
  document.getElementById('preview-tier-3').innerHTML = getCourtyardMeditatorMarkup(
    { hasLotusSeat: true, isHoPhap: true, showPreviewIncense: true },
    0
  );

  const bowQueue = [];
  let isBowingNow = false;

  function enqueueBowToBuddha(giftPayload) {
    bowQueue.push(giftPayload);
    if (!isBowingNow) {
      runNextBowAnimation();
    }
  }

  function runNextBowAnimation() {
    if (bowQueue.length === 0) {
      isBowingNow = false;
      bowingStage.classList.remove('active');
      return;
    }
    isBowingNow = true;
    const item = bowQueue.shift();
    const nickname = item.user?.nickname || 'Tín Chủ';
    const merit = item.meritAdded || 1;
    const spriteSet = getSpriteSetForPerson(item.user, Date.now());

    bowingBannerToast.textContent = `${item.tierName || 'LÊN DÂNG HƯƠNG'} • ${nickname} (+${merit} công đức)`;
    bowingCharRig.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div class="head-incense-glow" style="height: 30px;"></div>
        <div class="person-name-pill vip-gold" style="margin-bottom: -4px; font-size: 18px;">🙏 ${escapeHtml(nickname)} đang lạy Phật</div>
        <img id="courtyard-bow-img" src="${spriteSet.kneel}" alt="Lạy Phật" class="devotee-sprite vip-kneeling-img" />
      </div>
    `;

    bowingStage.classList.add('active');
    spawnLotusBurst(540, 980, 26);

    const bowSeq = [spriteSet.kneelBow1, spriteSet.kneelBow2, spriteSet.kneelBow1, spriteSet.kneel];
    let stepIdx = 0;
    const bowTimer = setInterval(() => {
      const el = document.getElementById('courtyard-bow-img');
      if (el) {
        el.src = bowSeq[stepIdx % bowSeq.length];
        stepIdx++;
      }
    }, 360);

    setTimeout(() => {
      clearInterval(bowTimer);
      bowingStage.classList.remove('active');
      setTimeout(runNextBowAnimation, 400);
    }, 5200);
  }

  function renderUnlimitedCourtyard(meditators = []) {
    const visibleMeditators = meditators.slice(0, MAX_DOM_CROWD_ACTORS);
    const total = visibleMeditators.length;
    updateLiveCounterBadge(meditators);

    if (total === 0) {
      courtyardStage.innerHTML = '';
      return;
    }

    const row0Max = Math.min(6, total);
    const remaining = total - row0Max;

    let cols = 7;
    let baseScale = 1.0;
    if (remaining > 220) {
      cols = 16;
      baseScale = 0.56;
    } else if (remaining > 120) {
      cols = 13;
      baseScale = 0.66;
    } else if (remaining > 65) {
      cols = 10;
      baseScale = 0.78;
    } else if (remaining > 35) {
      cols = 8;
      baseScale = 0.88;
    }

    const extraRows = Math.max(1, Math.ceil(remaining / cols));
    let html = '';

    const row0XPositions = [175, 285, 395, 685, 795, 905];
    for (let i = 0; i < row0Max; i++) {
      const p = meditators[i];
      const x = row0XPositions[i];
      const y = 78;
      html += buildSeatNodeHtml(p, i, x, y, 0.96 * baseScale, 10);
    }

    for (let idx = row0Max; idx < total; idx++) {
      const rel = idx - row0Max;
      const r = Math.floor(rel / cols);
      const c = rel % cols;

      const itemsInThisRow = Math.min(cols, remaining - r * cols);
      const tRow = extraRows <= 1 ? 0.2 : r / Math.max(1, extraRows - 1);

      const y = 175 + tRow * Math.min(690, extraRows * 88);
      const rowWidth = 760 + tRow * 210;
      const colNorm = itemsInThisRow <= 1 ? 0 : c / (itemsInThisRow - 1) - 0.5;
      const staggerX = r % 2 === 1 && itemsInThisRow > 4 ? 14 : -14;
      const x = 540 + colNorm * rowWidth + staggerX;

      const scale = (0.86 + tRow * 0.24) * baseScale;
      const p = meditators[idx];
      html += buildSeatNodeHtml(p, idx, x, y, scale, 15 + r);
    }

    courtyardStage.innerHTML = html;
  }

  function buildSeatNodeHtml(person, idx, x, y, scale, zIndex) {
    const isVip = idx < 6 || person.merit >= 99;
    const hasLotus = isVip || person.hasLotusSeat || person.merit >= 10;
    const hasIncense = isVip || person.hasIncense || person.merit >= 1;
    const bubbleText = activeBubbles.get(person.userId);

    const bubbleHtml = bubbleText
      ? `<div class="courtyard-speech-bubble">${escapeHtml(bubbleText)}</div>`
      : '';
    const incenseHtml = hasIncense ? '<div class="head-incense-glow"></div>' : '';

    return `
      <div
        class="courtyard-seat-node"
        style="left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; --node-scale: ${scale.toFixed(3)}; z-index: ${zIndex};"
      >
        ${bubbleHtml}
        <div class="person-head-badge">
          ${incenseHtml}
          <div class="person-name-pill ${isVip ? 'vip-gold' : ''}">
            ${renderAvatarBadge(person.avatar, isVip ? '👑' : '🙏', 'mini-avatar-dot')}
            <span>${escapeHtml(shortenName(person.nickname, 11))}</span>
          </div>
        </div>
        ${getCourtyardMeditatorMarkup({ hasLotusSeat: hasLotus, isHoPhap: isVip, person }, idx)}
      </div>
    `;
  }

  // =========================================================================
  // 7. CHẾ ĐỘ PHẬT TỬ TỰ DO DI CHUYỂN & HÀNH LỄ (FREE ROAM AUTONOMOUS ENGINE)
  //    Đi lại kinh hành, tự lên lư hương thắp nhang, quỳ lạy, ngồi thiền, chào nhau
  // =========================================================================
  const freeRoamActors = new Map();
  let freeRoamContainerEl = null;
  let wasFreeRoamEnabled = false;

  const ROAM_DHARMA_QUOTES = [
    'Nam Mô A Di Đà Phật 🙏',
    'Cầu gia đạo bình an 🪷',
    'Tâm an vạn sự an 🌸',
    'Con xin dâng nén tâm hương 🕯️',
    'Hoan hỷ quá đạo hữu 🙏',
    'Nguyện cầu sức khỏe & bình an',
    'Chúc mọi người buổi tối an lành'
  ];

  function getStageWalkBounds() {
    if (currentThemeId === 2 || currentThemeId === 4 || currentThemeId === 5) {
      // Sân Chùa Đêm Trăng (courtyardStage tọa độ nội bộ)
      return {
        minX: 95,
        maxX: 985,
        minY: 95,
        maxY: 790,
        altarX: 540,
        altarY: 78,
        scaleMin: 0.76,
        scaleMax: 1.02
      };
    }
    if (currentThemeId === 3) {
      // Mẫu 3: Chánh Điện Thảm Đỏ
      return {
        minX: 78,
        maxX: 1002,
        minY: 1175,
        maxY: 1685,
        altarX: 540,
        altarY: 1148,
        scaleMin: 0.78,
        scaleMax: 0.98
      };
    }
    if (currentThemeId === 6) {
      // Mẫu 6: Hồ Sen Phóng Sanh Ngoài Sân Chùa (Phật tử đi lại trên sân gạch đá y=795..992)
      return {
        minX: 80,
        maxX: 1000,
        minY: 795,
        maxY: 992,
        altarX: 540,
        altarY: 785,
        scaleMin: 0.72,
        scaleMax: 0.88
      };
    }
    // Mẫu 1: Đại Điện Thảm Xanh
    return {
      minX: 84,
      maxX: 996,
      minY: 855,
      maxY: 1620,
      altarX: 540,
      altarY: 842,
      scaleMin: 0.78,
      scaleMax: 0.98
    };
  }

  function computeSeatHomePosition(idx, total, isCourtyardMode) {
    if (isCourtyardMode) {
      const row0XPositions = [175, 285, 395, 685, 795, 905];
      if (idx < 6) {
        return { x: row0XPositions[idx], y: 78 };
      }
      const cols = 7;
      const rel = idx - 6;
      const r = Math.floor(rel / cols);
      const c = rel % cols;
      const extraRows = Math.max(1, Math.ceil(Math.max(1, total - 6) / cols));
      const tRow = extraRows <= 1 ? 0.2 : r / Math.max(1, extraRows - 1);
      const y = 175 + tRow * Math.min(650, extraRows * 92);
      const rowWidth = 760 + tRow * 200;
      const colNorm = c / (cols - 1) - 0.5;
      const x = 540 + colNorm * rowWidth;
      return { x: Math.round(x), y: Math.round(y) };
    }

    const isRedCarpetStage = currentThemeId === 3;
    const vipCushionCoords = isRedCarpetStage
      ? [
          { x: 140, y: 1188 },
          { x: 268, y: 1188 },
          { x: 392, y: 1188 },
          { x: 688, y: 1188 },
          { x: 812, y: 1188 },
          { x: 940, y: 1188 }
        ]
      : currentThemeId === 6
        ? [
            { x: 96, y: 758 },
            { x: 202, y: 758 },
            { x: 302, y: 758 },
            { x: 778, y: 758 },
            { x: 878, y: 758 },
            { x: 984, y: 758 }
          ]
        : [
            { x: 222, y: 858 },
            { x: 312, y: 858 },
            { x: 402, y: 858 },
            { x: 678, y: 858 },
            { x: 768, y: 858 },
            { x: 858, y: 858 }
          ];

    if (idx < 6) {
      return vipCushionCoords[idx];
    }

    const i = idx - 6;
    const remainingCount = Math.max(1, total - 6);
    const slot = computeGrandHallDynamicSlot(i, remainingCount, isRedCarpetStage);
    return { x: slot.x, y: slot.y };
  }

  function getSpeedMultiplier() {
    const spd = currentSettings.freeRoamSpeed || 'normal';
    if (spd === 'calm') return 0.72;
    if (spd === 'lively') return 1.45;
    return 1.0;
  }

  function setActorActionTag(actor, text, durationMs = 2800) {
    actor.actionText = text || '';
    actor.actionExpireAt = text ? performance.now() + durationMs : 0;
    if (actor.actionEl) {
      if (text) {
        actor.actionEl.textContent = text;
        actor.actionEl.style.display = 'block';
      } else {
        actor.actionEl.style.display = 'none';
      }
    }
  }

  function startActorWalkTo(actor, tx, ty, afterState = 'kneel_idle', label = '') {
    const now = performance.now();
    const dist = Math.hypot(tx - actor.x, ty - actor.y);
    const basePxPerSec = 105 * getSpeedMultiplier();
    const durationMs = Math.max(900, Math.min(5200, (dist / basePxPerSec) * 1000));

    actor.state = 'walking';
    actor.afterWalkState = afterState;
    actor.startX = actor.x;
    actor.startY = actor.y;
    actor.tx = tx;
    actor.ty = ty;
    actor.moveStartMs = now;
    actor.moveDurationMs = durationMs;
    actor.lastStepSwapAt = now;
    actor.stepLeg = 0;

    const dx = tx - actor.x;
    actor.flipX = dx < -12 ? -1 : 1;

    if (actor.imgEl) {
      actor.imgEl.className = `devotee-sprite roam-walker-img walking-stride-loop${actor.flipX < 0 ? ' roam-flip-x' : ''}`;
      actor.imgEl.src = actor.spriteSet.walkL;
    }
    if (label) {
      setActorActionTag(actor, label, durationMs);
    }
  }

  function startActorBowSequence(actor, now, tagText = '🙇 Lễ Phật') {
    actor.state = 'bowing_3';
    actor.bowSeq = [
      actor.spriteSet.standBow,
      actor.spriteSet.kneel,
      actor.spriteSet.kneelBow1,
      actor.spriteSet.kneelBow2,
      actor.spriteSet.kneelBow1,
      actor.spriteSet.kneel,
      actor.spriteSet.kneelBow1,
      actor.spriteSet.kneelBow2,
      actor.spriteSet.kneelBow1,
      actor.spriteSet.kneel
    ];
    actor.bowIdx = 0;
    actor.lastBowFrameAt = now;
    actor.nextActionAt = now + 3200 + Math.random() * 1800;
    if (actor.imgEl) {
      actor.imgEl.className = 'devotee-sprite kneeling-img';
      actor.imgEl.src = actor.spriteSet.standBow;
    }
    if (tagText) {
      setActorActionTag(actor, tagText, 2900);
    }
  }

  function startActorMeditate(actor, now) {
    actor.state = 'meditate';
    actor.nextActionAt = now + (4200 + Math.random() * 4000) / getSpeedMultiplier();
    if (actor.imgEl) {
      actor.imgEl.className = 'devotee-sprite roam-meditate-img';
      actor.imgEl.src = actor.spriteSet.meditate;
    }
    setActorActionTag(actor, '🧘 Tọa thiền', 2500);
  }

  function startActorStandGreeting(actor, now) {
    actor.state = 'stand_bow';
    actor.nextActionAt = now + 2200 + Math.random() * 1800;
    if (actor.imgEl) {
      actor.imgEl.className = 'devotee-sprite roam-stand-img';
      actor.imgEl.src = actor.spriteSet.standBow;
    }
    if (Math.random() < 0.45 && !activeBubbles.has(actor.userId)) {
      const quote = ROAM_DHARMA_QUOTES[Math.floor(Math.random() * ROAM_DHARMA_QUOTES.length)];
      setActorActionTag(actor, quote, 2400);
    } else {
      setActorActionTag(actor, '🙏 Xá Phật', 2000);
    }
  }

  function pickRandomHallDestination(bounds) {
    // 70% đi ở hai bên hành lang / sân chùa, 30% đi ngang qua thảm giữa
    const crossCenter = Math.random() < 0.32;
    let tx;
    if (crossCenter) {
      tx = bounds.minX + 60 + Math.random() * (bounds.maxX - bounds.minX - 120);
    } else if (Math.random() < 0.5) {
      tx = bounds.minX + Math.random() * 290;
    } else {
      tx = bounds.maxX - Math.random() * 290;
    }
    const ty = bounds.minY + 35 + Math.random() * (bounds.maxY - bounds.minY - 50);
    return { tx: Math.round(tx), ty: Math.round(ty) };
  }

  function countActorsOfferingIncense() {
    let c = 0;
    freeRoamActors.forEach((a) => {
      if (a.state === 'offering_incense' || a.afterWalkState === 'offering_incense') c++;
    });
    return c;
  }

  function chooseNextAutonomousBehavior(actor, now) {
    const bounds = getStageWalkBounds();
    const behaviorMode = currentSettings.freeRoamBehavior || 'all';
    const r = Math.random();

    if (behaviorMode === 'kinh_hanh') {
      if (r < 0.72) {
        const { tx, ty } = pickRandomHallDestination(bounds);
        startActorWalkTo(actor, tx, ty, 'stand_bow', '🚶 Kinh hành');
      } else {
        startActorStandGreeting(actor, now);
      }
      return;
    }

    if (behaviorMode === 'thien_dinh') {
      if (r < 0.45) {
        startActorMeditate(actor, now);
      } else if (r < 0.8) {
        const { tx, ty } = pickRandomHallDestination(bounds);
        startActorWalkTo(actor, tx, ty, 'meditate', '🚶 Thiền hành');
      } else {
        startActorBowSequence(actor, now, '🙏 Lễ Phật');
      }
      return;
    }

    if (behaviorMode === 'le_phat') {
      if (r < 0.35 && countActorsOfferingIncense() < 3) {
        const altarX = bounds.altarX + Math.round((Math.random() - 0.5) * 90);
        const altarY = bounds.altarY + Math.round(Math.random() * 28);
        startActorWalkTo(actor, altarX, altarY, 'offering_incense', '🕯️ Lên dâng hương');
      } else if (r < 0.72) {
        startActorBowSequence(actor, now, '🙇 Quỳ lạy Tam Bảo');
      } else {
        const { tx, ty } = pickRandomHallDestination(bounds);
        startActorWalkTo(actor, tx, ty, 'bowing_3', '🚶 Đi lễ Phật');
      }
      return;
    }

    // Mặc định 'all': Kết hợp tự nhiên tất cả hoạt động (Đi bộ kinh hành, Lên lư hương, Quỳ lạy, Tọa thiền, Chào nhau)
    if (r < 0.16 && countActorsOfferingIncense() < 2) {
      const altarX = bounds.altarX + Math.round((Math.random() - 0.5) * 86);
      const altarY = bounds.altarY + Math.round(Math.random() * 26);
      startActorWalkTo(actor, altarX, altarY, 'offering_incense', '🕯️ Lên thắp hương');
    } else if (r < 0.54) {
      const { tx, ty } = pickRandomHallDestination(bounds);
      const nextPose = Math.random() < 0.45 ? 'stand_bow' : Math.random() < 0.5 ? 'bowing_3' : 'meditate';
      startActorWalkTo(actor, tx, ty, nextPose, '🚶 Dạo chùa');
    } else if (r < 0.72) {
      startActorBowSequence(actor, now, '🙇 Lễ Phật');
    } else if (r < 0.88) {
      startActorMeditate(actor, now);
    } else {
      startActorStandGreeting(actor, now);
    }
  }

  function clearFreeRoamActors() {
    freeRoamActors.forEach((actor) => {
      if (actor.el && actor.el.parentNode) {
        actor.el.remove();
      }
    });
    freeRoamActors.clear();
    freeRoamContainerEl = null;
  }

  function syncFreeRoamCrowd(meditators = []) {
    updateLiveCounterBadge(meditators);

    const isCourtyardMode = currentThemeId === 2 || currentThemeId === 4 || currentThemeId === 5;
    const targetContainer = isCourtyardMode ? courtyardStage : quybaiCharsLayer;

    if (freeRoamContainerEl !== targetContainer) {
      clearFreeRoamActors();
      targetContainer.innerHTML = '';
      freeRoamContainerEl = targetContainer;
    }

    // Giới hạn số Actor di chuyển DOM ở MAX_DOM_CROWD_ACTORS (42 người) để phòng 5.000+ người bật Tự Do Di Chuyển vẫn mượt 60FPS
    const visibleList = meditators.slice(0, MAX_DOM_CROWD_ACTORS);
    const activeIds = new Set(visibleList.map((m) => m.userId));

    // Xóa các actor không còn trong danh sách hiển thị
    Array.from(freeRoamActors.keys()).forEach((uid) => {
      if (!activeIds.has(uid)) {
        const old = freeRoamActors.get(uid);
        if (old && old.el) old.el.remove();
        freeRoamActors.delete(uid);
      }
    });

    const now = performance.now();
    const bounds = getStageWalkBounds();

    visibleList.forEach((person, idx) => {
      const home = computeSeatHomePosition(idx, visibleList.length, isCourtyardMode);
      const genderKey = getSpriteSetForPerson(person, idx) === SPRITE_SETS.nu ? 'nu' : 'nam';
      const spriteSet = SPRITE_SETS[genderKey];
      const isVip = idx < 6;

      let actor = freeRoamActors.get(person.userId);
      if (!actor) {
        const el = document.createElement('div');
        el.className = 'standing-pilgrim-node free-roam-actor';

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'pilgrim-white-bubble';
        bubbleEl.style.display = 'none';

        const actionEl = document.createElement('div');
        actionEl.className = 'roam-action-mini-tag';
        actionEl.style.display = 'none';

        const imgEl = document.createElement('img');
        imgEl.className = 'devotee-sprite kneeling-img';
        imgEl.src = spriteSet.kneel;
        imgEl.alt = 'Phật tử';

        const pillEl = document.createElement('div');
        pillEl.className = `pilgrim-foot-pill${isVip ? ' vip-platform' : ''}`;

        el.appendChild(bubbleEl);
        el.appendChild(actionEl);
        el.appendChild(imgEl);
        el.appendChild(pillEl);
        targetContainer.appendChild(el);

        actor = {
          userId: person.userId,
          person,
          idx,
          isVip,
          genderKey,
          spriteSet,
          el,
          bubbleEl,
          actionEl,
          imgEl,
          pillEl,
          homeX: home.x,
          homeY: home.y,
          x: home.x,
          y: home.y,
          startX: home.x,
          startY: home.y,
          tx: home.x,
          ty: home.y,
          state: 'kneel_idle',
          afterWalkState: 'kneel_idle',
          moveStartMs: now,
          moveDurationMs: 1000,
          lastStepSwapAt: now,
          stepLeg: 0,
          flipX: 1,
          bowSeq: [],
          bowIdx: 0,
          lastBowFrameAt: now,
          nextActionAt: now + 300 + (idx % 10) * 320,
          actionText: '',
          actionExpireAt: 0,
          lastRenderedPillKey: ''
        };

        freeRoamActors.set(person.userId, actor);

        // Khởi động ngay cho ~65% phật tử bắt đầu di chuyển / hành lễ luôn để thấy hiệu ứng tức thì
        if (idx % 3 !== 0) {
          chooseNextAutonomousBehavior(actor, now + (idx % 6) * 120);
        }
      } else {
        actor.person = person;
        actor.idx = idx;
        actor.isVip = isVip;
        actor.genderKey = genderKey;
        actor.spriteSet = spriteSet;
        actor.homeX = home.x;
        actor.homeY = home.y;
      }

      // Cập nhật bảng tên + avatar nếu có thay đổi
      const pillKey = `${isVip ? idx + 1 : 0}_${person.nickname}_${person.avatar || ''}`;
      if (actor.lastRenderedPillKey !== pillKey) {
        actor.lastRenderedPillKey = pillKey;
        actor.pillEl.className = `pilgrim-foot-pill${isVip ? ' vip-platform' : ''}`;
        actor.pillEl.innerHTML = `
          ${isVip ? `<span class="vip-badge-num">${idx + 1}</span>` : ''}
          ${renderAvatarBadge(person.avatar, isVip ? '👑' : '🙏', 'pill-avatar-dot')}
          <span>${escapeHtml(shortenName(person.nickname, isVip ? 10 : 11))}</span>
        `;
      }

      // Cập nhật bong bóng chat thật từ TikTok
      const bText = activeBubbles.get(person.userId);
      if (bText) {
        actor.bubbleEl.textContent = bText;
        actor.bubbleEl.style.display = 'block';
      } else {
        actor.bubbleEl.style.display = 'none';
      }

      // Cập nhật vị trí ban đầu (tự co giãn kích thước khi số người trên LIVE đông)
      const totalActors = visibleList.length;
      const densityFactor =
        totalActors > 176 ? 0.56 : totalActors > 106 ? 0.66 : totalActors > 60 ? 0.76 : totalActors > 36 ? 0.86 : 1.0;
      const tY = Math.max(0, Math.min(1, (actor.y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)));
      const scale = +((bounds.scaleMin + tY * (bounds.scaleMax - bounds.scaleMin)) * (isVip ? 1 : densityFactor)).toFixed(3);
      actor.el.style.left = `${actor.x.toFixed(1)}px`;
      actor.el.style.top = `${actor.y.toFixed(1)}px`;
      actor.el.style.setProperty('--p-scale', scale);
      actor.el.style.zIndex = String(15 + Math.round(tY * 30));
    });
  }

  function updateFreeRoamTick(now) {
    if (!currentSettings.freeRoamEnabled || freeRoamActors.size === 0) return;

    const bounds = getStageWalkBounds();
    const totalActors = freeRoamActors.size;
    const densityFactor =
      totalActors > 176 ? 0.56 : totalActors > 106 ? 0.66 : totalActors > 60 ? 0.76 : totalActors > 36 ? 0.86 : 1.0;
    const stepIntervalMs = Math.round(230 / Math.max(0.75, Math.min(1.35, getSpeedMultiplier())));

    freeRoamActors.forEach((actor) => {
      // Ẩn nhãn hành động phụ khi hết hạn
      if (actor.actionExpireAt > 0 && now >= actor.actionExpireAt) {
        setActorActionTag(actor, '', 0);
      }

      if (actor.state === 'walking') {
        const elapsed = now - actor.moveStartMs;
        const progress = Math.min(1, elapsed / Math.max(1, actor.moveDurationMs));
        // Làm mượt đầu-cuối nhẹ nhàng
        const smoothT = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        actor.x = actor.startX + (actor.tx - actor.startX) * smoothT;
        actor.y = actor.startY + (actor.ty - actor.startY) * smoothT;

        if (now - actor.lastStepSwapAt >= stepIntervalMs) {
          actor.lastStepSwapAt = now;
          actor.stepLeg = 1 - actor.stepLeg;
          if (actor.imgEl) {
            actor.imgEl.src = actor.stepLeg === 0 ? actor.spriteSet.walkL : actor.spriteSet.walkR;
          }
        }

        const tY = Math.max(0, Math.min(1, (actor.y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)));
        const scale = +((bounds.scaleMin + tY * (bounds.scaleMax - bounds.scaleMin)) * (actor.isVip ? 1 : densityFactor)).toFixed(3);
        actor.el.style.left = `${actor.x.toFixed(1)}px`;
        actor.el.style.top = `${actor.y.toFixed(1)}px`;
        actor.el.style.setProperty('--p-scale', scale);
        actor.el.style.zIndex = String(15 + Math.round(tY * 30));

        if (progress >= 1) {
          // Đã đi tới đích -> chuyển sang hành động tại đích
          if (actor.afterWalkState === 'offering_incense') {
            actor.state = 'offering_incense';
            actor.bowSeq = [
              actor.spriteSet.standBow,
              actor.spriteSet.kneel,
              actor.spriteSet.kneelBow1,
              actor.spriteSet.kneelBow2,
              actor.spriteSet.kneelBow1,
              actor.spriteSet.kneel,
              actor.spriteSet.kneelBow1,
              actor.spriteSet.kneelBow2,
              actor.spriteSet.kneelBow1,
              actor.spriteSet.kneel,
              actor.spriteSet.standBow
            ];
            actor.bowIdx = 0;
            actor.lastBowFrameAt = now;
            actor.nextActionAt = now + 3800;
            if (actor.imgEl) {
              actor.imgEl.className = 'devotee-sprite kneeling-img';
              actor.imgEl.src = actor.spriteSet.standBow;
            }
            setActorActionTag(actor, '🕯️ Thành tâm dâng hương 🙏', 3500);
            spawnLotusBurst(actor.x, actor.y - 65, 14);
          } else if (actor.afterWalkState === 'bowing_3') {
            startActorBowSequence(actor, now, '🙇 Lễ Tam Bảo');
          } else if (actor.afterWalkState === 'meditate') {
            startActorMeditate(actor, now);
          } else if (actor.afterWalkState === 'stand_bow') {
            startActorStandGreeting(actor, now);
          } else {
            actor.state = 'kneel_idle';
            actor.nextActionAt = now + (2600 + Math.random() * 3400) / getSpeedMultiplier();
            if (actor.imgEl) {
              actor.imgEl.className = `devotee-sprite ${actor.isVip ? 'vip-kneeling-img' : 'kneeling-img'}`;
              actor.imgEl.src = actor.isVip ? actor.spriteSet.kneelGold : actor.spriteSet.kneel;
            }
          }
        }
        return;
      }

      if (actor.state === 'bowing_3' || actor.state === 'offering_incense') {
        if (now - actor.lastBowFrameAt >= 280) {
          actor.lastBowFrameAt = now;
          if (actor.bowIdx < actor.bowSeq.length) {
            if (actor.imgEl) {
              actor.imgEl.src = actor.bowSeq[actor.bowIdx];
            }
            actor.bowIdx++;
          }
        }
        if (now >= actor.nextActionAt) {
          if (actor.state === 'offering_incense') {
            // Dâng hương xong ở lư hương -> tự động đi bộ trở về vị trí hoặc dạo quanh điện
            const dest = Math.random() < 0.65
              ? { tx: actor.homeX, ty: actor.homeY }
              : pickRandomHallDestination(bounds);
            startActorWalkTo(actor, dest.tx, dest.ty, 'kneel_idle', '');
          } else {
            chooseNextAutonomousBehavior(actor, now);
          }
        }
        return;
      }

      // Trạng thái tĩnh tạm thời (kneel_idle, meditate, stand_bow) -> tới giờ thì chọn hành động mới
      if (now >= actor.nextActionAt) {
        chooseNextAutonomousBehavior(actor, now);
      }
    });
  }

  function triggerFreeRoamGroupAction(action) {
    const now = performance.now();
    const bounds = getStageWalkBounds();

    if (!currentSettings.freeRoamEnabled) {
      currentSettings.freeRoamEnabled = true;
      wasFreeRoamEnabled = true;
      if (lastState) {
        syncFreeRoamCrowd(lastState.meditators || []);
      }
    }

    if (action === 'roam_all') {
      freeRoamActors.forEach((actor) => {
        const { tx, ty } = pickRandomHallDestination(bounds);
        startActorWalkTo(actor, tx, ty, 'stand_bow', '🚶 Kinh hành');
      });
    } else if (action === 'bow_all') {
      window.sacredAudio.playGrandBell(1);
      spawnLotusRain(25);
      freeRoamActors.forEach((actor) => {
        startActorBowSequence(actor, now, '🙇 Đồng lễ Tam Bảo');
      });
    } else if (action === 'incense_random') {
      const candidates = Array.from(freeRoamActors.values()).filter(
        (a) => a.state !== 'offering_incense'
      );
      const picks = candidates.sort(() => Math.random() - 0.5).slice(0, 2);
      picks.forEach((actor, idx) => {
        const altarX = bounds.altarX + (idx === 0 ? -38 : 38);
        const altarY = bounds.altarY + 12;
        startActorWalkTo(actor, altarX, altarY, 'offering_incense', '🕯️ Lên dâng hương');
      });
    } else if (action === 'settle_all') {
      freeRoamActors.forEach((actor) => {
        startActorWalkTo(actor, actor.homeX, actor.homeY, 'kneel_idle', '🧘 Về vị trí');
      });
    }
  }

  // =========================================================================
  // 8. CẬP NHẬT TRẠNG THÁI TỪ SERVER & CHUYỂN ĐỔI GIỮA CÁC OPTION
  // =========================================================================
  function updateLiveCounterBadge(meditators = []) {
    const exactTotal = getEffectiveCrowdCount(lastState) || meditators.length;
    seatCounterEl.textContent = Number(exactTotal).toLocaleString('vi-VN');
  }

  function renderCurrentModeCrowd(meditators = []) {
    const exactTotal = getEffectiveCrowdCount(lastState) || meditators.length;
    renderMassiveCrowdBackdropCanvas(exactTotal);

    if (currentSettings.freeRoamEnabled) {
      wasFreeRoamEnabled = true;
      syncFreeRoamCrowd(meditators);
      updateLiveCounterBadge(meditators);
      return;
    }

    if (wasFreeRoamEnabled) {
      wasFreeRoamEnabled = false;
      clearFreeRoamActors();
      lastCrowdSignature = '';
    }

    if (currentThemeId === 1 || currentThemeId === 3 || currentThemeId === 6) {
      renderQuyBaiGrandHall(meditators);
    } else {
      renderUnlimitedCourtyard(meditators);
    }
    updateLiveCounterBadge(meditators);
  }

  function updateBottomPlaquesForTheme(themeId) {
    const p1Title = document.getElementById('plaque-1-title');
    const p1Desc = document.getElementById('plaque-1-desc');
    const p2Title = document.getElementById('plaque-2-title');
    const p2Desc = document.getElementById('plaque-2-desc');
    const p3Title = document.getElementById('plaque-3-title');
    const p3Desc = document.getElementById('plaque-3-desc');
    if (!p1Title || !p1Desc) return;

    if (Number(themeId) === 6) {
      p1Title.textContent = '1 xu';
      p1Desc.textContent = 'thả cá chép';
      p2Title.textContent = '10 xu';
      p2Desc.textContent = 'thả đàn cá koi';
      p3Title.textContent = '99+ xu';
      p3Desc.textContent = 'thả rùa vàng';
    } else {
      p1Title.textContent = '1 xu';
      p1Desc.textContent = 'dâng hương';
      p2Title.textContent = '5 xu';
      p2Desc.textContent = 'lên bục';
      p3Title.textContent = '10+ xu';
      p3Desc.textContent = 'tăng công đức';
    }
  }

  function applyState(state) {
    if (!state) return;

    if (state.settings) {
      currentSettings = state.settings;
      window.sacredAudio.applySettings(state.settings);

      currentThemeId = Number(state.settings.themeId) || 1;
      const modeClass =
        currentThemeId === 1 || currentThemeId === 3 || currentThemeId === 6
          ? 'mode-quybai'
          : 'mode-chuaonline';
      stageWrapper.className = `${modeClass} theme-${currentThemeId}`;

      if (currentThemeId === 1) {
        backdropImg.src = '/assets/dai_dien_quy_bai_bg.jpg';
      } else if (currentThemeId === 3) {
        backdropImg.src = '/assets/amitabha_stage.jpg';
      } else if (currentThemeId === 6) {
        backdropImg.src = '/assets/ho_sen_phong_sanh_bg.jpg?v=outdoor1';
      } else {
        backdropImg.src = '/assets/chua_online_bg.jpg';
      }

      updateBottomPlaquesForTheme(currentThemeId);

      themeButtons.forEach((btn) => {
        btn.classList.toggle('active', Number(btn.getAttribute('data-theme')) === currentThemeId);
      });

      hallTitleEl.textContent = state.settings.hallTitle || '🙏 CHÙA ONLINE 🙏';
      hallSubtitleEl.textContent =
        state.settings.hallSubtitle || 'Comment để vào chùa • Tặng quà để ngồi gần Phật';

      if (state.settings.monkGreeting) {
        monkSpeechText.textContent = state.settings.monkGreeting;
      }

      if (state.settings.bannerText && state.settings.bannerText.trim()) {
        customRedBanner.textContent = state.settings.bannerText.trim();
        customRedBanner.classList.add('active');
      } else {
        customRedBanner.classList.remove('active');
      }
    }

    if (Array.isArray(state.pondCreatures)) {
      syncPondCreaturesFromState(state.pondCreatures);
    }

    if (state.altar) {
      const prog = Number(state.altar.likeProgress) || 100;
      const target = Number(state.altar.likeTarget) || 300;
      const pct = Math.min(100, Math.round((prog / target) * 100));
      likeProgressFill.style.width = `${pct}%`;
      likeProgressText.textContent = `${prog}/${target}`;
    }

    if (Array.isArray(state.leaderboard)) {
      const top3 =
        state.leaderboard.length > 0
          ? state.leaderboard.slice(0, 3)
          : Array.isArray(state.meditators) && state.meditators.length > 0
          ? state.meditators.slice(0, 3)
          : [];

      if (top3.length === 0) {
        tamLongListEl.innerHTML = '<div class="tam-long-row"><span class="tam-long-name">Đang chờ thí chủ hữu duyên...</span></div>';
      } else {
        tamLongListEl.innerHTML = top3
          .map(
            (item, idx) => `
            <div class="tam-long-row">
              <span class="tam-long-rank-badge rank-${idx + 1}">${idx + 1}</span>
              ${renderAvatarBadge(item.avatar, '🙏', 'tam-long-avatar')}
              <span class="tam-long-name">${escapeHtml(item.nickname)}</span>
              <span class="tam-long-xu">${item.merit || 0} xu</span>
            </div>
          `
          )
          .join('');
      }

      if (state.leaderboard.length === 0) {
        meritListEl.innerHTML = '<div class="leader-row"><span>Chưa có thí chủ</span></div>';
      } else {
        meritListEl.innerHTML = state.leaderboard
          .slice(0, 5)
          .map(
            (item, idx) => `
            <div class="leader-row">
              <span class="leader-name" style="display:inline-flex;align-items:center;gap:6px;">
                ${idx + 1}. ${renderAvatarBadge(item.avatar, '🙏', 'mini-avatar-dot')} ${escapeHtml(item.nickname)}
              </span>
              <span class="leader-score">${item.merit} 🪙</span>
            </div>
          `
          )
          .join('');
      }
    }

    renderCurrentModeCrowd(state.meditators || []);
  }

  // =========================================================================
  // 8. CANVAS KHÓI HƯƠNG, MƯA HOA SEN & HỒ SEN PHÓNG SANH 60FPS
  //    (Cá Koi / Cá Chép / Rùa Vàng bơi vĩnh viễn dưới hồ, KHÔNG có tên trên cá)
  // =========================================================================
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas.getContext('2d');
  const smokeList = [];
  const lotusPetals = [];

  // Trạng thái Hồ Sen Phóng Sanh (Mẫu 6)
  const pondSwimmers = new Map(); // id -> swimmer object
  const pendingReleaseIds = new Set(); // Các id cá đang chờ Phật tử bước ra bến thả xuống nước
  const releasingArcs = []; // Đường cong cá nhảy từ tay Phật tử xuống mặt hồ
  const waterRipples = []; // Vòng sóng nước lan tỏa khi cá chạm mặt hồ hoặc quẫy đuôi

  // 6 cụm lá sen & hoa sen nổi bồng bềnh hai bên bờ hồ (để trống vùng giữa hồ cho đàn cá bơi)
  const floatingLotusPads = [
    { x: 96, y: 1215, scale: 0.72, baseRot: 0.25, phase: 0.2 },
    { x: 185, y: 1282, scale: 0.52, baseRot: -0.45, phase: 1.4 },
    { x: 984, y: 1220, scale: 0.74, baseRot: -0.32, phase: 2.6 },
    { x: 892, y: 1290, scale: 0.54, baseRot: 0.55, phase: 3.8 },
    { x: 102, y: 1595, scale: 0.78, baseRot: 0.7, phase: 4.5 },
    { x: 978, y: 1610, scale: 0.76, baseRot: -0.6, phase: 5.7 }
  ];

  function createSwimmerObject(creature, customX, customY, customAngle) {
    const type = creature.type || 'carp_red';
    const isTurtle = type === 'turtle_gold';
    const x = Number.isFinite(customX) ? customX : 240 + Math.random() * 600;
    const y = Number.isFinite(customY) ? customY : 1260 + Math.random() * 430;
    const angle = Number.isFinite(customAngle) ? customAngle : Math.random() * Math.PI * 2;
    const baseSpeed = isTurtle ? 0.52 + Math.random() * 0.22 : 1.05 + Math.random() * 0.65;

    return {
      id: creature.id || `swimmer_${Date.now()}_${Math.random()}`,
      type,
      scale: Number(creature.scale) || (isTurtle ? 0.68 : 0.58),
      x,
      y,
      angle,
      targetAngle: angle,
      speed: baseSpeed,
      wigglePhase: Math.random() * Math.PI * 2,
      wiggleFreq: isTurtle ? 0.065 : 0.14 + Math.random() * 0.05,
      nextTurnAt: performance.now() + 1800 + Math.random() * 3200
    };
  }

  function syncPondCreaturesFromState(pondCreatures = []) {
    const validIds = new Set();
    pondCreatures.forEach((c) => {
      if (!c || !c.id) return;
      validIds.add(c.id);
      if (pendingReleaseIds.has(c.id)) {
        return; // Sẽ xuất hiện ngay khi Phật tử bước ra bến thả xuống nước
      }
      if (!pondSwimmers.has(c.id)) {
        pondSwimmers.set(c.id, createSwimmerObject(c));
      }
    });

    // Chỉ xóa khi server thực sự reset hồ (tránh xóa cá vừa được thả local)
    if (pondCreatures.length <= 6 && pondSwimmers.size > 12) {
      Array.from(pondSwimmers.keys()).forEach((id) => {
        if (!validIds.has(id)) {
          pondSwimmers.delete(id);
        }
      });
    }
  }

  function spawnWaterRipple(x, y, maxRadius = 64, alpha = 0.65, goldTint = false) {
    waterRipples.push({
      x,
      y,
      radius: 6,
      maxRadius,
      alpha,
      goldTint
    });
  }

  function launchFishReleaseArc(creature, startX, startY, idx = 0, total = 1) {
    const spread = (idx - (total - 1) / 2) * 68;
    const targetX = Math.max(250, Math.min(830, startX + spread + (Math.random() - 0.5) * 45));
    const targetY = 1265 + Math.random() * 95 + idx * 18;

    releasingArcs.push({
      creature,
      startX,
      startY,
      targetX,
      targetY,
      startTime: performance.now(),
      durationMs: 560
    });
  }

  function normalizeAngleDiff(diff) {
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  function renderPondCanvasLayer(now) {
    // 1. Vẽ các vòng sóng nước lan tỏa (waterRipples)
    for (let i = waterRipples.length - 1; i >= 0; i--) {
      const r = waterRipples[i];
      r.radius += 1.25;
      const progress = r.radius / r.maxRadius;
      const curAlpha = r.alpha * (1 - progress);
      if (progress >= 1 || curAlpha <= 0.01) {
        waterRipples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = r.goldTint
        ? `rgba(253, 224, 71, ${curAlpha.toFixed(3)})`
        : `rgba(167, 243, 208, ${curAlpha.toFixed(3)})`;
      ctx.lineWidth = r.goldTint ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Cập nhật & vẽ đàn Cá Chép Đỏ, Cá Koi, Rùa Vàng bơi lội vĩnh viễn dưới Hồ Sen (KHÔNG có tên trên cá)
    const minX = 215;
    const maxX = 865;
    const minY = 1245;
    const maxY = 1715; // Giữa hai bờ hoa sen hai bên và phía trên 3 bảng đỏ dưới đáy

    const swimmerArray = Array.from(pondSwimmers.values());
    pondSwimmers.forEach((swimmer) => {
      // Đổi hướng ngẫu nhiên mềm mại
      if (now >= swimmer.nextTurnAt) {
        swimmer.targetAngle += (Math.random() - 0.5) * 1.45;
        swimmer.nextTurnAt = now + 1800 + Math.random() * 2800;
      }

      // Lực tách đàn tự nhiên (Boids Separation): Không để cá chụm đè lên nhau một chỗ
      let avoidX = 0;
      let avoidY = 0;
      for (let k = 0; k < swimmerArray.length; k++) {
        const other = swimmerArray[k];
        if (other.id === swimmer.id) continue;
        const dx = swimmer.x - other.x;
        const dy = swimmer.y - other.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 105) {
          const weight = (105 - d) / 105;
          avoidX += (dx / d) * weight;
          avoidY += (dy / d) * weight;
        }
      }
      if (Math.hypot(avoidX, avoidY) > 0.15) {
        const sepAngle = Math.atan2(avoidY, avoidX);
        swimmer.targetAngle += normalizeAngleDiff(sepAngle - swimmer.targetAngle) * 0.18;
      }

      // Tự động lượn vào vùng hồ rộng nếu bơi gần sát bờ hồ
      const margin = 65;
      if (
        swimmer.x < minX + margin ||
        swimmer.x > maxX - margin ||
        swimmer.y < minY + margin ||
        swimmer.y > maxY - margin
      ) {
        const targetPoolX = 280 + Math.random() * 520;
        const targetPoolY = 1295 + Math.random() * 360;
        swimmer.targetAngle = Math.atan2(targetPoolY - swimmer.y, targetPoolX - swimmer.x);
      }

      const angleDiff = normalizeAngleDiff(swimmer.targetAngle - swimmer.angle);
      swimmer.angle += angleDiff * 0.055;

      swimmer.x += Math.cos(swimmer.angle) * swimmer.speed;
      swimmer.y += Math.sin(swimmer.angle) * swimmer.speed;
      swimmer.wigglePhase += swimmer.wiggleFreq;

      // Thỉnh thoảng tạo gợn nước nhỏ khi cá quẫy đuôi
      if (Math.random() < 0.004) {
        spawnWaterRipple(swimmer.x, swimmer.y, 34, 0.25, false);
      }

      const img = POND_IMAGES[swimmer.type] || POND_IMAGES.carp_red;
      if (img && img.complete && img.naturalWidth > 0) {
        const isTurtle = swimmer.type === 'turtle_gold';
        const drawW = img.naturalWidth * swimmer.scale;
        const drawH = img.naturalHeight * swimmer.scale;
        const swayAngle = Math.sin(swimmer.wigglePhase) * (isTurtle ? 0.045 : 0.075);
        const stretchX = 1 + Math.sin(swimmer.wigglePhase * 2) * 0.025;

        ctx.save();
        ctx.translate(swimmer.x, swimmer.y);
        ctx.rotate(swimmer.angle + swayAngle);
        ctx.scale(stretchX, 1);
        ctx.shadowColor = 'rgba(0, 16, 14, 0.52)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }
    });

    // 3. Vẽ đường cong phóng sanh khi cá / rùa đang nhảy từ tay Phật tử ở Bến Đá xuống nước
    for (let i = releasingArcs.length - 1; i >= 0; i--) {
      const arc = releasingArcs[i];
      const t = Math.min(1, (now - arc.startTime) / arc.durationMs);

      const curX = arc.startX + (arc.targetX - arc.startX) * t;
      const linearY = arc.startY + (arc.targetY - arc.startY) * t;
      const parabolaLift = -Math.sin(t * Math.PI) * 58;
      const curY = linearY + parabolaLift;

      const dx = arc.targetX - arc.startX;
      const dy = arc.targetY - arc.startY - Math.cos(t * Math.PI) * 140;
      const flightAngle = Math.atan2(dy, dx);

      const img = POND_IMAGES[arc.creature.type] || POND_IMAGES.carp_red;
      if (img && img.complete && img.naturalWidth > 0) {
        const sc = (Number(arc.creature.scale) || 0.6) * (0.85 + 0.25 * Math.sin(t * Math.PI));
        const w = img.naturalWidth * sc;
        const h = img.naturalHeight * sc;

        // Hào quang vàng kim theo đường thả cá
        ctx.save();
        ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
        ctx.beginPath();
        ctx.arc(curX, curY, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.translate(curX, curY);
        ctx.rotate(flightAngle);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }

      if (t >= 1) {
        // Cá chạm mặt nước Hồ Sen -> Phát tiếng nước tũm + Sóng nước lan tỏa + Bơi vĩnh viễn trong hồ!
        window.sacredAudio.playWaterSplash();
        spawnWaterRipple(arc.targetX, arc.targetY, 78, 0.85, true);
        spawnWaterRipple(arc.targetX, arc.targetY, 46, 0.65, false);
        spawnLotusBurst(arc.targetX, arc.targetY, 12);

        const fanTargetX = 260 + Math.random() * 560;
        const fanTargetY = 1330 + Math.random() * 340;
        const swimAngle = Math.atan2(fanTargetY - arc.targetY, fanTargetX - arc.targetX);
        if (arc.creature && arc.creature.id) {
          pendingReleaseIds.delete(arc.creature.id);
          pondSwimmers.set(
            arc.creature.id,
            createSwimmerObject(arc.creature, arc.targetX, arc.targetY, swimAngle)
          );
        }
        releasingArcs.splice(i, 1);
      }
    }
  }

  function spawnSubtleSmoke() {
    const originX = currentThemeId === 1 ? 520 : currentThemeId === 3 ? 540 : 498;
    const originY = currentThemeId === 1 ? 685 : currentThemeId === 3 ? 810 : 918;
    smokeList.push({
      x: originX + (Math.random() - 0.5) * 10,
      y: originY,
      vx: (Math.random() - 0.5) * 0.16,
      vy: -0.7 - Math.random() * 0.3,
      radius: 6 + Math.random() * 5,
      alpha: 0.09 + Math.random() * 0.04,
      life: 0,
      maxLife: 65 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2
    });
  }

  function spawnLotusRain(count = 45) {
    for (let i = 0; i < count; i++) {
      lotusPetals.push({
        x: 60 + Math.random() * 960,
        y: -20 - Math.random() * 260,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2.0 + Math.random() * 2.4,
        size: 9 + Math.random() * 11,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.05,
        alpha: 0.95,
        color: i % 2 === 0 ? '#f472b6' : '#fde047'
      });
    }
  }

  function spawnLotusBurst(originX, originY, count = 24) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 3.8;
      lotusPetals.push({
        x: originX,
        y: originY,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1.5,
        size: 6 + Math.random() * 7,
        angle: a,
        vAngle: 0.04,
        alpha: 1,
        isSparkle: true,
        color: '#fde047'
      });
    }
  }

  function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = performance.now();

    // Khi đang ở Mẫu 6 (Hồ Sen Phóng Sanh): Vẽ sóng nước, đàn Cá Chép / Cá Koi / Rùa Vàng bơi vĩnh viễn dưới hồ & Lá Sen nổi
    if (currentThemeId === 6) {
      renderPondCanvasLayer(now);
    }

    if (Math.random() < 0.2) {
      spawnSubtleSmoke();
    }

    for (let i = smokeList.length - 1; i >= 0; i--) {
      const s = smokeList[i];
      s.life += 1;
      s.x += s.vx + Math.sin(s.life * 0.06 + s.phase) * 0.35;
      s.y += s.vy;
      s.radius += 0.11;

      const a = s.alpha * (1 - s.life / s.maxLife);
      if (s.life >= s.maxLife || a <= 0.004) {
        smokeList.splice(i, 1);
        continue;
      }

      const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.radius);
      g.addColorStop(0, `rgba(255, 250, 235, ${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 250, 235, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = lotusPetals.length - 1; i >= 0; i--) {
      const p = lotusPetals[i];
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.vAngle;

      if (p.isSparkle) {
        p.alpha -= 0.022;
      } else if (p.y > 1930) {
        p.alpha = 0;
      }

      if (p.alpha <= 0.02) {
        lotusPetals.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 0.6, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    updateFreeRoamTick(performance.now());
    requestAnimationFrame(renderCanvas);
  }
  renderCanvas();

  // =========================================================================
  // 9. KẾT NỐI WEBSOCKET & XỬ LÝ SỰ KIỆN REALTIME
  // =========================================================================
  let ws = null;
  let lastState = null;

  function connectWs() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.state) {
          lastState = msg.state;
          applyState(msg.state);
        }
        handleEvent(msg.type, msg.payload || {});
      } catch (e) {
        console.error(e);
      }
    };

    ws.onclose = () => setTimeout(connectWs, 2000);
  }

  function showBubbleForUser(userId, text) {
    if (!userId || !text) return;
    activeBubbles.set(userId, text);
    if (lastState) renderCurrentModeCrowd(lastState.meditators || []);
    setTimeout(() => {
      activeBubbles.delete(userId);
      if (lastState) renderCurrentModeCrowd(lastState.meditators || []);
    }, 5000);
  }

  function flashMonkCard(speech, speakAloud = false) {
    if (speech) {
      monkSpeechText.textContent = speech;
    }
    monkGreetingCard.classList.remove('highlight');
    void monkGreetingCard.offsetWidth;
    monkGreetingCard.classList.add('highlight');
    setTimeout(() => monkGreetingCard.classList.remove('highlight'), 2200);

    if (speakAloud && currentSettings.ttsEnabled !== false) {
      window.sacredAudio.speakChant(speech, { withWoodenFish: true });
    }
  }

  function triggerWoodenFishVisual(count = 15) {
    woodenFishWidget.classList.remove('knock-anim');
    fishPlusPopup.classList.remove('pop');
    void woodenFishWidget.offsetWidth;
    woodenFishWidget.classList.add('knock-anim');
    fishPlusPopup.textContent = `+${count}`;
    fishPlusPopup.classList.add('pop');
    setTimeout(() => woodenFishWidget.classList.remove('knock-anim'), 200);
    window.sacredAudio.playWoodenFish(1);
  }

  woodenFishWidget.addEventListener('click', () => {
    window.sacredAudio.init();
    triggerWoodenFishVisual(15);
  });

  function handleEvent(type, payload) {
    switch (type) {
      case 'member': {
        window.sacredAudio.playWoodenFish(1);
        flashMonkCard(payload.monkSpeech, false);
        if (payload.monkSpeech && activeRunnersCount === 0 && runnerQueue.length === 0) {
          showTamBaoBanner(payload.monkSpeech, 4000);
        }
        if (payload.user) {
          showBubbleForUser(payload.user.userId, 'nam mô a di đà phật 🙏');
          if (currentSettings.freeRoamEnabled) {
            const actor = freeRoamActors.get(payload.user.userId);
            if (actor) {
              const bounds = getStageWalkBounds();
              const { tx, ty } = pickRandomHallDestination(bounds);
              startActorWalkTo(actor, tx, ty, 'bowing_3', '🚶 Mới vào chùa');
            }
          }
        }
        break;
      }
      case 'chat': {
        window.sacredAudio.playWoodenFish(1);
        flashMonkCard(payload.monkSpeech, false);
        if (payload.monkSpeech && activeRunnersCount === 0 && runnerQueue.length === 0 && !payload.walkUpBow) {
          showTamBaoBanner(payload.monkSpeech, 4500);
        }
        if (payload.user) {
          showBubbleForUser(payload.user.userId, payload.content || 'nam mô');
          if (payload.walkUpBow && (currentThemeId === 1 || currentThemeId === 3)) {
            triggerRunUpAndProstrate({
              user: payload.user,
              meritAdded: 1,
              commentText: payload.content
            });
          } else if (payload.walkUpBow && currentThemeId !== 6 && !isBowingNow) {
            enqueueBowToBuddha({
              user: payload.user,
              meritAdded: 1,
              tierName: `💬 "${shortenName(payload.content, 26)}"`
            });
          } else if (currentSettings.freeRoamEnabled) {
            const actor = freeRoamActors.get(payload.user.userId);
            if (actor && actor.state !== 'walking') {
              startActorBowSequence(actor, performance.now(), '🙏 Thành tâm');
            }
          }
        }
        break;
      }
      case 'feed_fish': {
        window.sacredAudio.playWaterSplash();
        const feedX = 540;
        const feedY = 1430;
        spawnWaterRipple(feedX, feedY, 92, 0.85, true);
        spawnLotusBurst(feedX, feedY, 18);
        pondSwimmers.forEach((sw) => {
          sw.targetAngle = Math.atan2(feedY - sw.y, feedX - sw.x) + (Math.random() - 0.5) * 0.25;
          sw.nextTurnAt = performance.now() + 2800;
        });
        if (payload.user) {
          showBubbleForUser(payload.user.userId, payload.content || 'Cho cá ăn 🌾');
          showTamBaoBanner(
            `🌾 ${payload.user.nickname} rải thức ăn vàng xuống Hồ Sen: "${payload.content || 'Cho đàn cá ăn'}"`,
            4200
          );
        }
        break;
      }
      case 'gift': {
        window.sacredAudio.playGrandBell(1);
        if (currentThemeId === 6) {
          triggerWalkOutAndReleaseFish({
            user: payload.user,
            creatures: payload.releasedCreatures,
            creatureLabel: payload.creatureLabel || 'Cá Chép Đỏ Bình An',
            giftIconUrl: payload.giftIconUrl
          });
        } else {
          triggerRunUpAndProstrate(payload);
          enqueueBowToBuddha(payload);
        }

        const nick = payload.user?.nickname || 'Tín Chủ';
        const count = Math.max(1, Number(payload.meritAdded) || 1);
        const speechText =
          currentThemeId === 6
            ? payload.dedicationText || `${nick} đã phát tâm phóng sanh xuống Hồ Sen, tăng ${count} công đức.`
            : currentThemeId === 1 || currentThemeId === 3
              ? `${nick} đã dâng ${count} nén hương lên Tam Bảo. Chúc tâm như hoa sen, thanh tịnh giữa đời.`
              : payload.dedicationText;
        const shouldSpeakGift =
          currentSettings.giftTtsEnabled !== false && currentSettings.ttsEnabled !== false;
        flashMonkCard(speechText, shouldSpeakGift);
        break;
      }
      case 'fish_released': {
        if (currentThemeId === 6) {
          triggerWalkOutAndReleaseFish(payload);
        } else {
          window.sacredAudio.playWaterSplash();
        }
        const shouldSpeakFish =
          currentSettings.giftTtsEnabled !== false && currentSettings.ttsEnabled !== false;
        if (payload.dedicationText) {
          flashMonkCard(payload.dedicationText, shouldSpeakFish);
        }
        break;
      }
      case 'like': {
        triggerWoodenFishVisual(payload.count || 15);
        if (payload.lotusRainTriggered) {
          window.sacredAudio.playLotusChime();
          spawnLotusRain(55);
        }
        break;
      }
      case 'chant_start': {
        const text = payload.text || currentSettings.chantText;
        if (text) {
          showTamBaoBanner(text, 9000);
        }
        flashMonkCard(text, true);
        break;
      }
      case 'bell_strike': {
        window.sacredAudio.playGrandBell(1);
        spawnLotusRain(30);
        break;
      }
      case 'wooden_fish_strike': {
        triggerWoodenFishVisual(15);
        break;
      }
      case 'free_roam_action': {
        triggerFreeRoamGroupAction(payload.action || 'roam_all');
        break;
      }
    }
  }

  dockBtnAudio.addEventListener('click', () => {
    window.sacredAudio.init();
    const muted = window.sacredAudio.setMuted(!window.sacredAudio.muted);
    dockBtnAudio.textContent = muted ? '🔇 Âm Thanh: TẮT' : '🔊 Âm Thanh: BẬT';
    if (!muted) {
      window.sacredAudio.playLotusChime();
    }
  });

  dockBtnMusic.addEventListener('click', () => {
    window.sacredAudio.init();
    const running = window.sacredAudio.toggleAmbient();
    dockBtnMusic.textContent = running ? '🎵 Nhạc Chùa: BẬT' : '🎵 Nhạc Chùa: TẮT';
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const themeId = Number(btn.getAttribute('data-theme')) || 1;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'set_theme', themeId }));
      }
    });
  });

  dockBtnBell.addEventListener('click', () => {
    window.sacredAudio.init();
    window.sacredAudio.playGrandBell(1);
    spawnLotusRain(28);
  });

  dockBtnChant.addEventListener('click', () => {
    window.sacredAudio.init();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chant' }));
    }
  });

  connectWs();
})();
