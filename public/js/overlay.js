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

  // Preload bộ Sprite Tu Tiên: Tiên Môn Vấn Đạo (Mẫu 7) - 8 Cấp Tiên Y (Phàm Nhân -> Chân Tiên)
  const TUTIEN_SPRITE_URLS = {
    1: '/assets/sprites/tutien_tier1.png?v=tt3',
    2: '/assets/sprites/tutien_tier2.png?v=tt3',
    3: '/assets/sprites/tutien_tier3.png?v=tt3',
    4: '/assets/sprites/tutien_tier4.png?v=tt3',
    5: '/assets/sprites/tutien_tier5.png?v=tt3',
    6: '/assets/sprites/tutien_tier6.png?v=tt3',
    7: '/assets/sprites/tutien_tier7.png?v=tt3',
    8: '/assets/sprites/tutien_tier8.png?v=tt3'
  };
  const TUTIEN_IMAGES = {};
  Object.entries(TUTIEN_SPRITE_URLS).forEach(([key, url]) => {
    const img = new Image();
    img.onload = () => {
      lastLodSignature = '';
      if (lastState && currentThemeId === 7) {
        renderMassiveCrowdBackdropCanvas(getEffectiveCrowdCount(lastState));
      }
    };
    img.src = url;
    TUTIEN_IMAGES[key] = img;
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

  // Giới hạn số DOM Actor tiền cảnh (có thẻ tên + avatar + di chuyển) để tự động co giãn đội hình tới 300 người
  const MAX_DOM_CROWD_ACTORS = 300;
  // Giới hạn riêng cho Mẫu 1 & Mẫu 3 (6 đệm VIP + tối đa 32 Phật tử tiền cảnh) để nhân vật to rõ, thoáng đãng và 100% không lag
  const MAX_QUYBAI_DOM_ACTORS = 38;

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
   * Tắt lớp bóng mờ Canvas hậu cảnh để tránh vẽ các hình nhân không tên đè lên Phật tử thật trên sân
   */
  function renderMassiveCrowdBackdropCanvas(_totalCrowdCount = 0) {
    if (!crowdLodCtx || !crowdLodCanvas) return;

    if (crowdLodSummaryPill) {
      crowdLodSummaryPill.style.display = 'none';
    }

    if (lastLodSignature !== 'empty') {
      crowdLodCtx.clearRect(0, 0, crowdLodCanvas.width, crowdLodCanvas.height);
      lastLodSignature = 'empty';
    }
  }

  const tamLongListEl = document.getElementById('tam-long-list');
  const tamLongCardEl = document.querySelector('.tam-long-thanh-card:not(.quybai-chat-card)');
  const quybaiChatCardEl = document.getElementById('quybai-chat-card');
  const quybaiChatListEl = document.getElementById('quybai-chat-list');
  const quybaiDonateToastEl = document.getElementById('quybai-donate-toast');
  const quybaiDonateAvatarEl = document.getElementById('quybai-donate-avatar');
  const quybaiDonateXuEl = document.getElementById('quybai-donate-xu');
  const quybaiDonateNameEl = document.getElementById('quybai-donate-name');
  const quybaiDonateGiftEl = document.getElementById('quybai-donate-gift');
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
  const bubbleTimers = new Map();
  let lastCrowdSignature = '';
  let recentChatMessages = [];
  let lastAnimatedChatId = '';
  let lastDonatedUserId = '';
  let donateToastHideTimer = null;
  let chatCardFlashTimer = null;
  let tamLongFlashTimer = null;
  const donateToastQueue = [];
  let isShowingDonateToast = false;

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

  function renderQuyBaiChatList(flashNewest = false) {
    if (!quybaiChatListEl) return;
    const topChats = recentChatMessages.slice(0, 3);
    if (topChats.length === 0) {
      quybaiChatListEl.innerHTML =
        '<div class="quybai-chat-row"><div class="quybai-chat-content"><span class="quybai-chat-text" style="color:#fde68a;">Đang chờ lời khấn nguyện...</span></div></div>';
      return;
    }

    quybaiChatListEl.innerHTML = topChats
      .map((item, idx) => {
        const isNew = flashNewest && idx === 0;
        return `
          <div class="quybai-chat-row${isNew ? ' chat-row-flash' : ''}">
            ${renderAvatarBadge(item.avatar, '🙏', 'tam-long-avatar')}
            <div class="quybai-chat-content">
              <span class="quybai-chat-name">${escapeHtml(shortenName(item.nickname, 15))}</span>
              <span class="quybai-chat-text">${escapeHtml(item.content)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    if (flashNewest && quybaiChatCardEl) {
      quybaiChatCardEl.classList.remove('card-flash');
      void quybaiChatCardEl.offsetWidth;
      quybaiChatCardEl.classList.add('card-flash');
      if (chatCardFlashTimer) clearTimeout(chatCardFlashTimer);
      chatCardFlashTimer = setTimeout(() => quybaiChatCardEl.classList.remove('card-flash'), 1200);
    }
  }

  function showQuyBaiDonateToast(giftPayload, durationMs = 6800) {
    if (!quybaiDonateToastEl || !giftPayload) return;
    donateToastQueue.push({ giftPayload, durationMs });
    if (!isShowingDonateToast) {
      processNextDonateToast();
    }
  }

  function processNextDonateToast() {
    if (!quybaiDonateToastEl || donateToastQueue.length === 0) {
      isShowingDonateToast = false;
      if (quybaiDonateToastEl) {
        quybaiDonateToastEl.classList.remove('visible', 'pulse');
      }
      return;
    }

    isShowingDonateToast = true;
    const { giftPayload, durationMs } = donateToastQueue.shift();
    const effectiveDuration =
      donateToastQueue.length >= 4
        ? 2600
        : donateToastQueue.length >= 2
          ? 3800
          : durationMs;

    const nickname = giftPayload.user?.nickname || 'Tín Chủ';
    const avatar = giftPayload.user?.avatar || '';
    const giftName = giftPayload.giftName || 'Hoa Sen Công Đức';
    const repeatCount = Math.max(1, Number(giftPayload.repeatCount) || 1);
    const meritAdded = Math.max(1, Number(giftPayload.meritAdded) || 1);
    const giftIconUrl = giftPayload.giftIconUrl || '';

    if (quybaiDonateAvatarEl) {
      if (avatar && typeof avatar === 'string' && avatar.startsWith('http')) {
        quybaiDonateAvatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" class="avatar-circle-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" referrerpolicy="no-referrer" alt="" />`;
      } else {
        quybaiDonateAvatarEl.textContent = '🪷';
      }
    }
    if (quybaiDonateXuEl) {
      quybaiDonateXuEl.textContent = `+${meritAdded} xu`;
    }
    if (quybaiDonateNameEl) {
      quybaiDonateNameEl.textContent = shortenName(nickname, 16);
    }
    if (quybaiDonateGiftEl) {
      const iconHtml = giftIconUrl
        ? `<img src="${escapeHtml(giftIconUrl)}" class="donate-gift-icon-inline" referrerpolicy="no-referrer" alt="" />`
        : '🌹 ';
      quybaiDonateGiftEl.innerHTML = `${iconHtml}${escapeHtml(giftName)} x${repeatCount}`;
    }

    if (donateToastHideTimer) {
      clearTimeout(donateToastHideTimer);
      donateToastHideTimer = null;
    }

    quybaiDonateToastEl.classList.add('visible');
    quybaiDonateToastEl.classList.remove('pulse');
    void quybaiDonateToastEl.offsetWidth;
    quybaiDonateToastEl.classList.add('pulse');
    setTimeout(() => quybaiDonateToastEl.classList.remove('pulse'), 1600);

    if (tamLongCardEl) {
      tamLongCardEl.classList.remove('card-flash');
      void tamLongCardEl.offsetWidth;
      tamLongCardEl.classList.add('card-flash');
      if (tamLongFlashTimer) clearTimeout(tamLongFlashTimer);
      tamLongFlashTimer = setTimeout(() => tamLongCardEl.classList.remove('card-flash'), 1500);
    }

    donateToastHideTimer = setTimeout(() => {
      quybaiDonateToastEl.classList.remove('visible', 'pulse');
      isShowingDonateToast = false;
      if (donateToastQueue.length > 0) {
        setTimeout(processNextDonateToast, 220);
      }
    }, effectiveDuration);
  }

  // =========================================================================
  // 4. DỰNG ĐẠI CHÚNG OPTION 1 (ĐẠI ĐIỆN THẢM XANH) & OPTION 3 (A DI ĐÀ THẢM ĐỎ)
  //    DÙNG SPRITE ĐẶC 100% (KHÔNG BÓNG MỜ, KHÔNG ĐÈ CHỮ, KHOẢNG CÁCH HÀNG CHUẨN)
  // =========================================================================
  function computeGrandHallDynamicSlot(i, remainingCount, isRedCarpetStage) {
    let colsPerSide = 3;
    let densityScale = 1.0;

    if (currentThemeId === 6) {
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
      colsPerSide = Math.min(10, Math.max(5, colsPerSide + 2));
      densityScale = +(densityScale * 0.84).toFixed(3);
    } else {
      colsPerSide = remainingCount > 24 ? 4 : 3;
      densityScale = remainingCount <= 12 ? 1.06 : remainingCount <= 24 ? 1.0 : 0.95;
    }

    const totalRows = Math.max(1, Math.ceil(remainingCount / (colsPerSide * 2)));
    const isLeftSide = i % 2 === 0;
    const sideIdx = Math.floor(i / 2);
    const row = Math.floor(sideIdx / colsPerSide);
    const col = sideIdx % colsPerSide;

    const tRow = totalRows <= 1 ? 0 : row / (totalRows - 1);
    const tCol = colsPerSide <= 1 ? 0.5 : col / (colsPerSide - 1);
    const staggerX = row % 2 === 1 ? (isLeftSide ? 14 : -14) : 0;

    let x;
    let y;
    let scale;

    if (isRedCarpetStage) {
      const ySpan = 370;
      const stepY = totalRows <= 4 ? 120 : ySpan / Math.max(1, totalRows - 1);
      y = Math.round(1305 + row * stepY + (col % 2 === 1 ? 8 : 0));
      scale = +Math.min(1.12, Math.max(0.88, (0.86 + tRow * 0.2) * densityScale)).toFixed(3);
      if (isLeftSide) {
        const leftInner = Math.round(342 - (1 - tRow) * 18);
        x = Math.max(76, Math.min(352, Math.round(76 + tCol * (leftInner - 76) + staggerX)));
      } else {
        const rightInner = Math.round(738 + (1 - tRow) * 18);
        x = Math.max(728, Math.min(1004, Math.round(rightInner + tCol * (1004 - rightInner) + staggerX)));
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
      // Mẫu 1 (Đại Điện Quỳ Bái): Giữ thoáng thảm xanh trung tâm (x = 380..700), hàng lối rộng rãi, nhân vật to rõ (0.90..1.16)
      const leftMinX = 86;
      const leftMaxX = 355;
      const rightMinX = 725;
      const rightMaxX = 994;
      const minY = 980;
      const maxY = 1545;
      const ySpan = maxY - minY;
      const stepY = totalRows <= 1 ? 0 : Math.min(182, ySpan / Math.max(1, totalRows - 1));
      const staggerY = col % 2 === 1 ? 10 : 0;
      y = Math.min(maxY, Math.round(minY + row * stepY + staggerY));
      scale = +Math.min(1.16, Math.max(0.9, (0.88 + tRow * 0.22) * densityScale)).toFixed(3);
      if (isLeftSide) {
        const leftInner = Math.round(leftMaxX - (1 - tRow) * 16);
        const rawX = leftMinX + tCol * (leftInner - leftMinX) + staggerX;
        x = Math.max(leftMinX, Math.min(leftMaxX, Math.round(rawX)));
      } else {
        const rightInner = Math.round(rightMinX + (1 - tRow) * 16);
        const rawX = rightInner + tCol * (rightMaxX - rightInner) + staggerX;
        x = Math.max(rightMinX, Math.min(rightMaxX, Math.round(rawX)));
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

    const maxDomActors = currentThemeId === 6 ? MAX_DOM_CROWD_ACTORS : MAX_QUYBAI_DOM_ACTORS;
    const visibleMeditators = meditators.slice(0, maxDomActors);

    const sig = `${currentThemeId}_${visibleMeditators.map((m) => `${m.userId}:${m.nickname}:${m.skin || ''}:${m.avatar || ''}`).join('|')}`;
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
    const vipScale = isRedCarpetStage ? 0.98 : currentThemeId === 6 ? 0.88 : 1.06;

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
      const dev = visibleMeditators[idx];
      if (!dev) return;
      const bText = activeBubbles.get(dev.userId);
      const genderKey = getSpriteSetForPerson(dev, idx) === SPRITE_SETS.nu ? 'nu' : 'nam';
      const spriteSet = SPRITE_SETS[genderKey];
      html += `
        <div
          class="standing-pilgrim-node${bText ? ' just-interacted-glow' : ''}"
          style="left: ${slot.x}px; top: ${slot.y}px; --p-scale: ${vipScale}; z-index: ${bText ? 55 : 14 + idx};"
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

    // 2. ĐẠO TRÀNG PHẬT TỬ TIỀN CẢNH (Giới hạn ở MAX_QUYBAI_DOM_ACTORS cho Mẫu 1/3 để thoáng đãng, nhân vật to rõ, không lag)
    const rest = visibleMeditators.slice(6);
    const remainingCount = rest.length;

    for (let i = 0; i < remainingCount; i++) {
      const person = rest[i];
      const { x, y, scale, zIndex } = computeGrandHallDynamicSlot(i, remainingCount, isRedCarpetStage);
      const bubbleText = activeBubbles.get(person.userId);

      const genderKey = getSpriteSetForPerson(person, i + 1) === SPRITE_SETS.nu ? 'nu' : 'nam';
      const spriteSet = SPRITE_SETS[genderKey];
      const maxNameLen =
        remainingCount > 170 ? 6 : remainingCount > 100 ? 7 : remainingCount > 54 ? 8 : remainingCount > 30 ? 9 : 11;
      const pillInlineStyle =
        remainingCount > 170
          ? ' style="font-size: 12px; padding: 2px 6px 2px 4px; max-width: 104px; transform: scale(0.74); transform-origin: center top;"'
          : remainingCount > 100
            ? ' style="font-size: 12.5px; padding: 2px 7px 2px 4px; max-width: 116px; transform: scale(0.8); transform-origin: center top;"'
            : remainingCount > 54
              ? ' style="font-size: 13px; padding: 2px 8px 2px 5px; max-width: 128px; transform: scale(0.86); transform-origin: center top;"'
              : '';

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
          <div class="pilgrim-foot-pill"${pillInlineStyle}>
            ${renderAvatarBadge(person.avatar, '🙏', 'pill-avatar-dot')}
            <span>${escapeHtml(shortenName(person.nickname, maxNameLen))}</span>
          </div>
        </div>
      `;
    }

    quybaiCharsLayer.innerHTML = html;
  }

  // =========================================================================
  // 5. DIỄN HOẠT KHI TẶNG QUÀ & BÌNH LUẬN KHẤN NGUYỆN:
  //    XẾP HÀNG LÊN KHẤN -> BƯỚC LÊN -> HIỆN QUOTE LỜI KHẤN -> QUỲ LẠY 3 LẠY -> ĐI XUỐNG
  // =========================================================================
  const MAX_PRAYER_QUEUE = 20;
  const runnerQueue = [];
  let activeRunnersCount = 0;
  let activeRunnerIsGift = false;
  let activeRunnerIntervals = [];
  let bannerHideTimer = null;
  let currentActivePrayerItem = null;

  function buildPrayerQuoteForItem(item = {}) {
    const nickname = item.nickname || item.user?.nickname || 'Tín Chủ';
    const merit = Math.max(1, Number(item.incenseCount || item.meritAdded) || 1);
    const cleanComment = String(item.commentText || '').trim();

    if (item.ceremonyType === 'release_fish') {
      const cLabel = item.creatureLabel || 'Cá Chép Đỏ Bình An';
      const rawQuote = cleanComment
        ? cleanComment
        : item.giftName && item.giftName !== 'Chia Sẻ Lan Tỏa Pháp Âm'
          ? `Con xin thành tâm dâng ${item.giftName} (+${merit} công đức), phóng sanh ${cLabel} xuống Hồ Sen, nguyện cầu bình an phước báu!`
          : `Con xin thành tâm phóng sanh ${cLabel} xuống Hồ Sen, nguyện cầu bình an phước báu!`;
      return {
        author: nickname,
        tag: '🐟 KHẤN NGUYỆN PHÓNG SANH',
        rawText: rawQuote,
        text: `« ${rawQuote} »`
      };
    }

    const isGift = Boolean(item.isGift) || Boolean(item.giftName);
    if (isGift) {
      const gName = item.giftName || 'Lễ Vật Công Đức';
      const rawQuote =
        item.prayerQuote ||
        `Con xin thành tâm dâng ${gName} (+${merit} công đức) lên Tam Bảo, nguyện cầu bình an cát tường!`;
      return {
        author: nickname,
        tag: '🎁 DÂNG LỄ TAM BẢO',
        rawText: rawQuote,
        text: `« ${rawQuote} »`
      };
    }

    const rawQuote =
      cleanComment ||
      item.prayerQuote ||
      'Nam Mô A Di Đà Phật, con xin thành tâm kính lễ Tam Bảo 🙏';
    return {
      author: nickname,
      tag: '🙏 ĐANG LÊN KHẤN PHẬT',
      rawText: rawQuote,
      text: `« ${rawQuote} »`
    };
  }

  function getActiveTemplePrayerQueue() {
    if (currentThemeId === 2 || currentThemeId === 4 || currentThemeId === 5) {
      return bowQueue;
    }
    return runnerQueue;
  }

  function renderTtsQuoteWidget(opts = {}) {
    const widgetEl = document.getElementById('tts-quote-widget');
    if (!widgetEl) return;
    const tagTextEl = document.getElementById('tts-quote-tag-text');
    const authorEl = document.getElementById('tts-quote-author');
    const queueEl = document.getElementById('tts-quote-queue');
    const textEl = document.getElementById('tts-quote-text');
    const waitingLineEl = document.getElementById('tts-quote-waiting-line');

    const rawText = String(opts.text || '').trim();
    const cleanText = rawText.replace(/^[«"\s]+|[»"\s]+$/g, '').trim();

    if (opts.active && cleanText) {
      const isTempleMode = currentThemeId !== 7;
      const defaultTag = isTempleMode ? '🙏 ĐANG LÊN KHẤN PHẬT' : '🔊 XƯỚNG DANH TU TIÊN';
      if (tagTextEl) {
        tagTextEl.textContent = opts.tag || defaultTag;
      }
      if (authorEl) {
        authorEl.textContent = opts.author ? `· ${opts.author}` : '';
      }

      const qLen = Math.max(0, Number(opts.queueLength) || 0);
      if (queueEl) {
        if (qLen > 0) {
          queueEl.textContent = isTempleMode ? `Xếp hàng: +${qLen}` : `Hàng đợi: +${qLen}`;
          queueEl.classList.add('visible');
        } else {
          queueEl.classList.remove('visible');
        }
      }

      if (textEl) {
        textEl.textContent = cleanText;
      }

      if (waitingLineEl) {
        const previewArr = Array.isArray(opts.queuePreview)
          ? opts.queuePreview.filter(Boolean)
          : [];
        if (isTempleMode && qLen > 0 && previewArr.length > 0) {
          const namesChain = previewArr
            .slice(0, 4)
            .map((name) => `🙏 ${shortenName(name, 14)}`)
            .join(' → ');
          const extraCount = qLen - Math.min(4, previewArr.length);
          const extraSuffix = extraCount > 0 ? ` … (+${extraCount})` : '';
          waitingLineEl.textContent = `⏳ Đang xếp hàng lên khấn (+${qLen}): ${namesChain}${extraSuffix}`;
          waitingLineEl.classList.add('visible');
        } else {
          waitingLineEl.textContent = '';
          waitingLineEl.classList.remove('visible');
        }
      }

      widgetEl.classList.add('active');
    } else {
      widgetEl.classList.remove('active');
      if (queueEl) queueEl.classList.remove('visible');
      if (waitingLineEl) {
        waitingLineEl.textContent = '';
        waitingLineEl.classList.remove('visible');
      }
    }
  }

  function syncActivePrayerQuoteUI() {
    if (currentThemeId === 7 || !currentActivePrayerItem) {
      return;
    }
    const quoteInfo = buildPrayerQuoteForItem(currentActivePrayerItem);
    const activeQ = getActiveTemplePrayerQueue();
    const queueLength = activeQ.length;
    const queuePreview = activeQ
      .slice(0, 4)
      .map((x) => x.nickname || x.user?.nickname || 'Tín Chủ');

    const payload = {
      active: true,
      text: quoteInfo.text,
      author: quoteInfo.author,
      tag: quoteInfo.tag,
      queueLength,
      queuePreview
    };

    if (
      window.sacredAudio &&
      typeof window.sacredAudio.setExternalPrayerQuote === 'function'
    ) {
      try {
        window.sacredAudio.setExternalPrayerQuote(payload);
      } catch (_e) {}
    }

    renderTtsQuoteWidget({
      active: true,
      text: quoteInfo.rawText,
      author: quoteInfo.author,
      tag: quoteInfo.tag,
      queueLength,
      queuePreview
    });
  }

  function clearActivePrayerQuoteUI() {
    currentActivePrayerItem = null;
    if (
      window.sacredAudio &&
      typeof window.sacredAudio.setExternalPrayerQuote === 'function'
    ) {
      try {
        window.sacredAudio.setExternalPrayerQuote({ active: false });
      } catch (_e) {}
    }
    if (!window.sacredAudio?.currentSpeechItem) {
      renderTtsQuoteWidget({ active: false });
    }
  }

  function renderWaitingPrayerLine() {
    if (!quybaiRunnersLayer) return;
    quybaiRunnersLayer
      .querySelectorAll('.waiting-pilgrim-node, .waiting-overflow-banner')
      .forEach((el) => el.remove());

    if (
      currentThemeId === 7 ||
      currentThemeId === 2 ||
      currentThemeId === 4 ||
      currentThemeId === 5 ||
      runnerQueue.length === 0
    ) {
      return;
    }

    const waitingSlots =
      currentThemeId === 6
        ? [
            { x: 448, y: 805, scale: 0.76 },
            { x: 632, y: 805, scale: 0.76 },
            { x: 448, y: 860, scale: 0.78 }
          ]
        : [
            { x: 456, y: 1485, scale: 0.82 },
            { x: 624, y: 1535, scale: 0.84 },
            { x: 456, y: 1595, scale: 0.86 }
          ];

    const topWaiting = runnerQueue.slice(0, 3);
    topWaiting.forEach((wItem, idx) => {
      const slot = waitingSlots[idx];
      if (!slot) return;
      const wSpriteSet = getSpriteSetForPerson(wItem.user, idx + 1);
      const wNick = shortenName(wItem.nickname || wItem.user?.nickname || 'Tín Chủ', 11);
      const isGift = Boolean(wItem.isGift);
      const node = document.createElement('div');
      node.className = 'waiting-pilgrim-node';
      node.style.left = `${slot.x}px`;
      node.style.top = `${slot.y}px`;
      node.style.setProperty('--w-scale', String(slot.scale));
      node.style.zIndex = String(44 + idx);

      node.innerHTML = `
        <div class="waiting-order-tag${isGift ? ' is-gift' : ''}">
          ${isGift ? '🎁' : '⏳'} Xếp hàng #${idx + 2} · ${escapeHtml(wNick)}
        </div>
        <img
          src="${wSpriteSet.standBow}"
          alt="Đang xếp hàng lên khấn"
          class="devotee-sprite waiting-bow-img"
        />
        <div class="pilgrim-foot-pill${isGift ? ' vip-platform' : ''}">
          ${renderAvatarBadge(wItem.user?.avatar, isGift ? '🎁' : '🙏', 'pill-avatar-dot')}
          <span>${escapeHtml(wNick)}</span>
        </div>
      `;
      quybaiRunnersLayer.appendChild(node);
    });

    if (runnerQueue.length > 3) {
      const extraCount = runnerQueue.length - 3;
      const overflowEl = document.createElement('div');
      overflowEl.className = 'waiting-overflow-banner';
      if (currentThemeId === 6) {
        overflowEl.style.top = '885px';
      }
      overflowEl.textContent = `⏳ Còn +${extraCount} tín chủ đang xếp hàng chờ tới lượt lên khấn`;
      quybaiRunnersLayer.appendChild(overflowEl);
    }
  }

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

  function enqueueRunnerEntry(entry) {
    if (!entry) return;
    const uid = entry.user?.userId ? String(entry.user.userId) : '';

    // Chống trùng lặp: Nếu là bình luận khấn thường (!entry.isGift) và userId đã có trong runnerQueue -> cập nhật lại lời khấn
    if (!entry.isGift && uid) {
      const existingIdx = runnerQueue.findIndex(
        (q) => !q.isGift && q.user?.userId && String(q.user.userId) === uid
      );
      if (existingIdx !== -1) {
        const target = runnerQueue[existingIdx];
        target.commentText = entry.commentText || target.commentText;
        target.bannerMsg = entry.bannerMsg || target.bannerMsg;
        target.prayerQuote = entry.prayerQuote || target.prayerQuote;
        target.monkSpeech = entry.monkSpeech || target.monkSpeech;
        target.nickname = entry.nickname || target.nickname;
        target.user = entry.user || target.user;
        renderWaitingPrayerLine();
        syncActivePrayerQuoteUI();
        return;
      }
    }

    if (entry.isGift) {
      let insertIdx = 0;
      while (insertIdx < runnerQueue.length && runnerQueue[insertIdx].isGift) {
        insertIdx++;
      }
      runnerQueue.splice(insertIdx, 0, entry);
      if (runnerQueue.length > MAX_PRAYER_QUEUE) {
        for (let i = runnerQueue.length - 1; i >= 0; i--) {
          if (!runnerQueue[i].isGift) {
            runnerQueue.splice(i, 1);
            break;
          }
        }
      }
    } else {
      if (runnerQueue.length >= MAX_PRAYER_QUEUE) {
        let replaced = false;
        for (let i = runnerQueue.length - 1; i >= 0; i--) {
          if (!runnerQueue[i].isGift) {
            runnerQueue[i] = entry;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          runnerQueue.push(entry);
        }
      } else {
        runnerQueue.push(entry);
      }
    }

    if (activeRunnersCount >= 1) {
      renderWaitingPrayerLine();
      syncActivePrayerQuoteUI();
    } else {
      processRunnerQueue();
    }
  }

  function triggerRunUpAndProstrate(giftPayload) {
    if (!giftPayload) return;
    const nickname = giftPayload.user?.nickname || 'Tín Chủ';
    const incenseCount = Math.max(1, Number(giftPayload.meritAdded) || 1);
    const isAscendPlatform = incenseCount >= 5 || (giftPayload.user && giftPayload.user.merit >= 5);
    const commentText = String(giftPayload.commentText || '').trim();
    const isGift = Boolean(giftPayload.giftName);
    const giftName = isGift ? String(giftPayload.giftName).trim() : '';
    const repeatCount = Math.max(1, Number(giftPayload.repeatCount) || 1);

    const bannerMsg = isGift
      ? `🎁 ${nickname} đã dâng ${giftName} x${repeatCount} (+${incenseCount} xu) lên Tam Bảo. Chúc tâm như hoa sen, vạn sự bình an!`
      : `🙏 ${nickname} thành tâm khấn nguyện: "${commentText || 'Nam Mô A Di Đà Phật'}"`;

    const prayerQuote = isGift
      ? `Con xin thành tâm dâng ${giftName} (+${incenseCount} công đức) lên Tam Bảo, nguyện cầu bình an cát tường!`
      : commentText || 'Nam Mô A Di Đà Phật, con xin thành tâm kính lễ Tam Bảo 🙏';

    const entry = {
      ceremonyType: 'incense',
      nickname,
      incenseCount,
      isAscendPlatform,
      isGift,
      giftName,
      repeatCount,
      bannerMsg,
      commentText,
      prayerQuote,
      monkSpeech: giftPayload.monkSpeech || '',
      giftIconUrl: giftPayload.giftIconUrl || '',
      user: giftPayload.user
    };

    enqueueRunnerEntry(entry);
  }

  /**
   * Kịch bản Phật tử bước ra Bến Đá Phóng Sanh -> Xá Phật & thả Cá Chép / Cá Koi / Rùa Vàng xuống Hồ Sen
   * (Tên là tên Phật tử ở dưới chân người, Cá bơi dưới hồ KHÔNG có tên, và cá thả ra luôn bơi vĩnh viễn ở dưới hồ)
   */
  function triggerWalkOutAndReleaseFish(releasePayload = {}) {
    const nickname = releasePayload.user?.nickname || 'Phật Tử';
    const creatureLabel = releasePayload.creatureLabel || 'Cá Chép Đỏ Bình An';
    const giftName = String(releasePayload.giftName || '').trim();
    const repeatCount = Math.max(1, Number(releasePayload.repeatCount) || 1);
    const meritAdded = Math.max(1, Number(releasePayload.meritAdded) || 1);
    const commentText = String(releasePayload.commentText || '').trim();
    const isGift = Boolean(giftName && !releasePayload.isShare);

    const creatures =
      Array.isArray(releasePayload.creatures) && releasePayload.creatures.length > 0
        ? releasePayload.creatures
        : [
            {
              id: `fish_local_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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

    const bannerMsg = giftName
      ? `🎁 ${nickname} đã dâng ${giftName} x${repeatCount} (+${meritAdded} xu) • Bước ra Bến Phóng Sanh thả ${creatureLabel} xuống Hồ Sen!`
      : `🐟 ${nickname} thành tâm bước ra Bến Phóng Sanh thả ${creatureLabel} xuống Hồ Sen. Nguyện cầu bình an, phước báu vô lượng!`;

    const prayerQuote =
      commentText ||
      `Con xin thành tâm phóng sanh ${creatureLabel} xuống Hồ Sen, nguyện cầu bình an phước báu!`;

    const entry = {
      ceremonyType: 'release_fish',
      nickname,
      creatureLabel,
      creatures,
      isGift,
      giftName,
      repeatCount,
      meritAdded,
      bannerMsg,
      commentText,
      prayerQuote,
      monkSpeech: releasePayload.monkSpeech || releasePayload.dedicationText || '',
      giftIconUrl: releasePayload.giftIconUrl || '',
      user: releasePayload.user
    };

    enqueueRunnerEntry(entry);
  }

  function processRunnerQueue() {
    if (runnerQueue.length === 0 || activeRunnersCount >= 1) return;

    const item = runnerQueue.shift();
    activeRunnersCount++;
    activeRunnerIsGift = Boolean(item.isGift);
    currentActivePrayerItem = item;
    clearActiveRunnerTimers();

    // Tốc độ thích ứng (Adaptive Speed) khi hàng đợi đông để xử lý từng user 1 mượt mà, không ứ đọng hay sót người
    const qLen = runnerQueue.length;
    const speedFactor = qLen >= 10 ? 0.38 : qLen >= 6 ? 0.48 : qLen >= 3 ? 0.65 : 1.0;

    if (item.monkSpeech) {
      flashMonkCard(item.monkSpeech, false);
    }
    showTamBaoBanner(item.bannerMsg);

    const runnerId = `runner_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const imgId = `${runnerId}_img`;
    const spriteSet = getSpriteSetForPerson(item.user, Date.now());

    quybaiRunnersLayer
      .querySelectorAll('.runner-pilgrim-actor')
      .forEach((el) => el.remove());

    renderWaitingPrayerLine();
    syncActivePrayerQuoteUI();

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
        : '🎁 ';
      const bubbleCls = 'pilgrim-white-bubble gift-gold-bubble';
      const bubbleLine = item.giftName
        ? `${giftIconHtml}Dâng ${escapeHtml(item.giftName)} x${item.repeatCount || 1} (+${item.meritAdded || 1} xu) • Thả ${escapeHtml(item.creatureLabel)} 🙏`
        : `🐟 Con xin phóng sanh ${escapeHtml(item.creatureLabel)} 🙏`;

      runnerEl.innerHTML = `
        <div class="${bubbleCls}" id="${runnerId}_bubble">${bubbleLine}</div>
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

      const walkToPierSec = (1.6 * speedFactor).toFixed(2);
      const stepPierMs = Math.round(210 * speedFactor);
      const releaseAtMs = Math.round(1700 * speedFactor);
      const dropGapMs = Math.round(240 * speedFactor);
      const bowFrameMs = Math.round(360 * speedFactor);
      const bubbleHideMs = Math.round(2100 * speedFactor);
      const walkBackAtMs = Math.round(4600 * speedFactor);
      const walkBackSec = (1.45 * speedFactor).toFixed(2);
      const fadeBackAtMs = Math.round(1250 * speedFactor);
      const finishReleaseAtMs = Math.round(6400 * speedFactor);

      // Pha 1: Bước chân Trái - Phải tiến ra Bến Đá Phóng Sanh sát mép hồ
      const walkToPierTid = setTimeout(() => {
        runnerEl.style.transition = `top ${walkToPierSec}s linear, left ${walkToPierSec}s linear, transform ${walkToPierSec}s linear, opacity 0.35s ease`;
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
        }, step * stepPierMs);
        activeRunnerIntervals.push(tid);
      }

      // Pha 2: Tới mép hồ -> Hạ gối quỳ & cúi người thả từng chú cá / rùa vàng xuống mặt nước Hồ Sen
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
          }, cIdx * dropGapMs);
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
        }, bowFrameMs);
        activeRunnerIntervals.push(bowTimer);

        const bubbleEl = document.getElementById(`${runnerId}_bubble`);
        if (bubbleEl) {
          const bHideTid = setTimeout(() => {
            bubbleEl.style.opacity = '0';
            setTimeout(() => bubbleEl.remove(), 300);
          }, bubbleHideMs);
          activeRunnerIntervals.push(bHideTid);
        }
      }, releaseAtMs);
      activeRunnerIntervals.push(releaseTid);

      // Pha 3: Đứng dậy Xá Phật rồi bước lùi/đi về lại thềm chùa (y=835)
      const walkBackTid = setTimeout(() => {
        const imgEl = document.getElementById(imgId);
        if (imgEl) {
          imgEl.className = 'devotee-sprite walker-img walking-stride-loop';
          imgEl.src = spriteSet.standBow;
        }

        const moveBackTid = setTimeout(() => {
          runnerEl.style.transition = `top ${walkBackSec}s linear, transform ${walkBackSec}s linear, opacity 0.4s ease`;
          runnerEl.style.top = `${startY}px`;
          runnerEl.style.transform = 'translate(-50%, -92%) scale(0.86)';
        }, Math.round(180 * speedFactor));
        activeRunnerIntervals.push(moveBackTid);

        for (let step = 1; step <= 6; step++) {
          const tid = setTimeout(() => {
            const curImg = document.getElementById(imgId);
            if (curImg) {
              curImg.src = step % 2 === 0 ? spriteSet.walkL : spriteSet.walkR;
            }
          }, Math.round(160 * speedFactor) + step * stepPierMs);
          activeRunnerIntervals.push(tid);
        }

        const fadeTid = setTimeout(() => {
          runnerEl.style.opacity = '0';
        }, fadeBackAtMs);
        activeRunnerIntervals.push(fadeTid);
      }, walkBackAtMs);
      activeRunnerIntervals.push(walkBackTid);

      // Kết thúc lượt phóng sanh
      const finishReleaseTid = setTimeout(() => {
        runnerEl.remove();
        activeRunnersCount = Math.max(0, activeRunnersCount - 1);
        activeRunnerIsGift = false;
        if (runnerQueue.length > 0) {
          processRunnerQueue();
        } else {
          renderWaitingPrayerLine();
          hideTamBaoBanner();
          clearActivePrayerQuoteUI();
        }
      }, finishReleaseAtMs);
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
    runnerEl.style.top = '1620px';
    runnerEl.style.transform = 'translate(-50%, -92%) scale(1.02)';

    const giftIconHtml = item.giftIconUrl
      ? `<img src="${escapeHtml(item.giftIconUrl)}" style="width:22px;height:22px;vertical-align:middle;margin-right:4px;" referrerpolicy="no-referrer" alt="" />`
      : '🕯️ ';
    const bubbleCls = item.isGift ? 'pilgrim-white-bubble gift-gold-bubble' : 'pilgrim-white-bubble';
    const incenseBubbleLine = item.isGift
      ? `${giftIconHtml}Dâng ${escapeHtml(item.giftName || 'Lễ vật')} x${item.repeatCount || 1} (+${item.incenseCount} xu) 🙏`
      : item.commentText
      ? `${giftIconHtml}${escapeHtml(item.commentText)}`
      : `${giftIconHtml}Con xin dâng ${item.incenseCount} nén hương 🙏`;

    runnerEl.innerHTML = `
      <div class="${bubbleCls}" id="${runnerId}_bubble">${incenseBubbleLine}</div>
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

    const moveUpSec = (1.95 * speedFactor).toFixed(2);
    const stepUpMs = Math.round(230 * speedFactor);
    const kneelAtMs = Math.round(2000 * speedFactor);
    const bubbleFadeMs = Math.round(1800 * speedFactor);
    const bowFrameMs = Math.round(240 * speedFactor);
    const walkDownAtMs = Math.round(5800 * speedFactor);
    const moveDownSec = (1.65 * speedFactor).toFixed(2);
    const stepDownMs = Math.round(220 * speedFactor);
    const fadeOutAtMs = Math.round(1500 * speedFactor);
    const finishAtMs = Math.round(7800 * speedFactor);

    // Pha 1: Bước chân Trái - Phải (walkL <-> walkR) tiến dọc theo Thảm Xanh lên trước Lư Hương
    const moveUpTid = setTimeout(() => {
      runnerEl.style.transition = `top ${moveUpSec}s linear, left ${moveUpSec}s linear, transform ${moveUpSec}s linear, opacity 0.4s ease`;
      runnerEl.style.left = `${targetX}px`;
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
      }, step * stepUpMs);
      activeRunnerIntervals.push(tid);
    }

    // Pha 2: Khi lên tới trước Lư Hương -> Hạ gối quỳ xuống và thực hiện đúng 3 Lạy Tam Bảo
    const kneelTid = setTimeout(() => {
      const imgEl = document.getElementById(imgId);
      if (imgEl) {
        imgEl.className = 'devotee-sprite runner-kneel-img';
        imgEl.src = spriteSet.kneel;
      }
      const bubbleEl = document.getElementById(`${runnerId}_bubble`);
      if (bubbleEl) {
        const bHideTid = setTimeout(() => {
          bubbleEl.style.opacity = '0';
          setTimeout(() => bubbleEl.remove(), 300);
        }, bubbleFadeMs);
        activeRunnerIntervals.push(bHideTid);
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
      }, bowFrameMs);
      activeRunnerIntervals.push(bowLoopId);
    }, kneelAtMs);
    activeRunnerIntervals.push(kneelTid);

    // Pha 3: Đứng dậy Xá Phật rồi ĐI XUỐNG dọc theo thảm xanh và rời khỏi bục
    const walkDownStartTid = setTimeout(() => {
      const imgEl = document.getElementById(imgId);
      if (imgEl) {
        imgEl.className = 'devotee-sprite walker-img walking-stride-loop';
        imgEl.src = spriteSet.standBow;
      }

      // Sau khi xá Phật, bắt đầu bước chân Trái - Phải đi xuống cuối thảm xanh
      const stepDownMoveTid = setTimeout(() => {
        runnerEl.style.transition = `top ${moveDownSec}s linear, transform ${moveDownSec}s linear, opacity 0.42s ease`;
        runnerEl.style.top = '1700px';
        runnerEl.style.transform = 'translate(-50%, -92%) scale(1.05)';
      }, Math.round(220 * speedFactor));
      activeRunnerIntervals.push(stepDownMoveTid);

      for (let step = 1; step <= 7; step++) {
        const tid = setTimeout(() => {
          const curImg = document.getElementById(imgId);
          if (curImg) {
            curImg.src = step % 2 === 0 ? spriteSet.walkL : spriteSet.walkR;
          }
        }, Math.round(200 * speedFactor) + step * stepDownMs);
        activeRunnerIntervals.push(tid);
      }

      // Mờ dần khi đi xuống tới cuối thảm
      const fadeOutTid = setTimeout(() => {
        runnerEl.style.opacity = '0';
      }, fadeOutAtMs);
      activeRunnerIntervals.push(fadeOutTid);
    }, walkDownAtMs);
    activeRunnerIntervals.push(walkDownStartTid);

    // Kết thúc lượt dâng hương: Xóa nhân vật đi xuống & tự động ẩn bảng thông báo Tam Bảo nếu hết hàng đợi
    const finishTid = setTimeout(() => {
      runnerEl.remove();
      activeRunnersCount = Math.max(0, activeRunnersCount - 1);
      activeRunnerIsGift = false;
      if (runnerQueue.length > 0) {
        processRunnerQueue();
      } else {
        renderWaitingPrayerLine();
        hideTamBaoBanner();
        clearActivePrayerQuoteUI();
      }
    }, finishAtMs);
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

  function updateCourtyardBowWaitingBadge() {
    const badgeEl = document.getElementById('courtyard-bow-waiting-pill');
    if (!badgeEl) return;
    if (bowQueue.length > 0) {
      const nextNames = bowQueue
        .slice(0, 3)
        .map((x, idx) => `#${idx + 2} ${shortenName(x.user?.nickname || x.nickname || 'Tín Chủ', 10)}`)
        .join(' · ');
      badgeEl.textContent = `⏳ Xếp hàng (+${bowQueue.length}): ${nextNames}`;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.textContent = '';
      badgeEl.style.display = 'none';
    }
  }

  function enqueueBowToBuddha(giftPayload) {
    if (!giftPayload) return;
    const isGift = Boolean(giftPayload.giftName) || Boolean(giftPayload.isGift);
    const entry = {
      ...giftPayload,
      isGift,
      nickname: giftPayload.user?.nickname || giftPayload.nickname || 'Tín Chủ'
    };
    const uid = entry.user?.userId ? String(entry.user.userId) : '';

    // Chống trùng lặp cho bình luận thường trong bowQueue
    if (!isGift && uid) {
      const existingIdx = bowQueue.findIndex(
        (q) => !q.isGift && !q.giftName && q.user?.userId && String(q.user.userId) === uid
      );
      if (existingIdx !== -1) {
        const target = bowQueue[existingIdx];
        target.commentText = entry.commentText || target.commentText;
        target.tierName = entry.tierName || target.tierName;
        target.prayerQuote = entry.prayerQuote || target.prayerQuote;
        target.monkSpeech = entry.monkSpeech || target.monkSpeech;
        target.nickname = entry.nickname || target.nickname;
        target.user = entry.user || target.user;
        updateCourtyardBowWaitingBadge();
        syncActivePrayerQuoteUI();
        return;
      }
    }

    if (isGift) {
      let insertIdx = 0;
      while (
        insertIdx < bowQueue.length &&
        (Boolean(bowQueue[insertIdx].giftName) || Boolean(bowQueue[insertIdx].isGift))
      ) {
        insertIdx++;
      }
      bowQueue.splice(insertIdx, 0, entry);
      if (bowQueue.length > MAX_PRAYER_QUEUE) {
        for (let i = bowQueue.length - 1; i >= 0; i--) {
          if (!bowQueue[i].isGift && !bowQueue[i].giftName) {
            bowQueue.splice(i, 1);
            break;
          }
        }
      }
    } else {
      if (bowQueue.length >= MAX_PRAYER_QUEUE) {
        let replaced = false;
        for (let i = bowQueue.length - 1; i >= 0; i--) {
          if (!bowQueue[i].isGift && !bowQueue[i].giftName) {
            bowQueue[i] = entry;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          bowQueue.push(entry);
        }
      } else {
        bowQueue.push(entry);
      }
    }

    if (!isBowingNow) {
      runNextBowAnimation();
    } else {
      updateCourtyardBowWaitingBadge();
      syncActivePrayerQuoteUI();
    }
  }

  function runNextBowAnimation() {
    if (bowQueue.length === 0) {
      isBowingNow = false;
      bowingStage.classList.remove('active');
      clearActivePrayerQuoteUI();
      return;
    }
    isBowingNow = true;
    const item = bowQueue.shift();
    currentActivePrayerItem = item;
    const nickname = item.user?.nickname || item.nickname || 'Tín Chủ';
    const merit = item.meritAdded || 1;
    const spriteSet = getSpriteSetForPerson(item.user, Date.now());
    const meditatorCount = Array.isArray(lastState?.meditators) ? lastState.meditators.length : 0;
    const bowScale = meditatorCount > 150 ? 0.78 : meditatorCount > 70 ? 0.86 : 0.95;
    bowingStage.style.setProperty('--bow-scale', bowScale);

    if (item.monkSpeech) {
      flashMonkCard(item.monkSpeech, false);
    }

    // Tốc độ thích ứng cho bowQueue để xử lý mượt từng user 1 không bị ứ đọng
    const qLen = bowQueue.length;
    const bowDuration = qLen >= 10 ? 1850 : qLen >= 6 ? 2250 : qLen >= 3 ? 2900 : 4600;
    const bowFrameMs = qLen >= 10 ? 160 : qLen >= 6 ? 200 : qLen >= 3 ? 250 : 340;
    const nextGapMs = qLen >= 3 ? 140 : 320;

    bowingBannerToast.textContent = `${item.tierName || 'LÊN DÂNG HƯƠNG'} • ${nickname} (+${merit} công đức)`;
    bowingCharRig.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div class="head-incense-glow" style="height: 18px;"></div>
        <div class="person-name-pill vip-gold" style="font-size: 13.5px; padding: 2px 10px; margin-bottom: -2px;">🙏 ${escapeHtml(nickname)} đang lạy Phật</div>
        <div class="lotus-seat-wrapper" style="height: auto;">
          <img id="courtyard-bow-img" src="${spriteSet.kneel}" alt="Lạy Phật" class="devotee-sprite vip-kneeling-img" />
          <svg class="lotus-base-svg" viewBox="0 0 110 46">
            <ellipse cx="55" cy="36" rx="44" ry="10" fill="rgba(0,0,0,0.45)" />
            <path d="M12 32 Q22 12 38 28 Z" fill="#f472b6" stroke="#fbcfe8" stroke-width="1" />
            <path d="M98 32 Q88 12 72 28 Z" fill="#f472b6" stroke="#fbcfe8" stroke-width="1" />
            <path d="M22 36 Q34 14 50 34 Z" fill="#ec4899" stroke="#fbcfe8" stroke-width="1" />
            <path d="M88 36 Q76 14 60 34 Z" fill="#ec4899" stroke="#fbcfe8" stroke-width="1" />
            <path d="M38 38 Q55 12 72 38 Z" fill="#fbcfe8" stroke="#f472b6" stroke-width="1.2" />
          </svg>
        </div>
        <div id="courtyard-bow-waiting-pill" class="courtyard-bow-waiting-pill" style="display: none;"></div>
      </div>
    `;

    updateCourtyardBowWaitingBadge();
    syncActivePrayerQuoteUI();

    bowingStage.classList.add('active');
    spawnLotusBurst(540, 960, 22);

    const bowSeq = [spriteSet.kneelBow1, spriteSet.kneelBow2, spriteSet.kneelBow1, spriteSet.kneel];
    let stepIdx = 0;
    const bowTimer = setInterval(() => {
      const el = document.getElementById('courtyard-bow-img');
      if (el) {
        el.src = bowSeq[stepIdx % bowSeq.length];
        stepIdx++;
      }
    }, bowFrameMs);

    setTimeout(() => {
      clearInterval(bowTimer);
      bowingStage.classList.remove('active');
      setTimeout(runNextBowAnimation, nextGapMs);
    }, bowDuration);
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
        scaleMin: 0.9,
        scaleMax: 1.08
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
      minX: 86,
      maxX: 994,
      minY: 980,
      maxY: 1545,
      altarX: 540,
      altarY: 842,
      scaleMin: 0.92,
      scaleMax: 1.15
    };
  }

  function computeSeatHomePosition(idx, total, isCourtyardMode) {
    if (isCourtyardMode) {
      const row0Max = Math.min(6, total);
      const remaining = Math.max(0, total - row0Max);

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

      const row0XPositions = [175, 285, 395, 685, 795, 905];
      if (idx < 6) {
        return { x: row0XPositions[idx], y: 78, scale: +(0.96 * baseScale).toFixed(3) };
      }

      const extraRows = Math.max(1, Math.ceil(remaining / cols));
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
      const scale = +((0.86 + tRow * 0.24) * baseScale).toFixed(3);
      return { x: Math.round(x), y: Math.round(y), scale };
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
    return { x: slot.x, y: slot.y, scale: slot.scale };
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

  function pickRandomHallDestination(bounds, actor = null) {
    // Ở Mẫu 1 & Mẫu 3: Giữ Phật tử đi lại ở 2 cánh trái/phải (x < 360 hoặc x > 720) để không che lối thảm giữa
    if (currentThemeId === 1 || currentThemeId === 3) {
      const stayLeft = actor ? actor.homeX < 540 : Math.random() < 0.5;
      const tx = stayLeft
        ? bounds.minX + Math.random() * Math.max(40, 355 - bounds.minX)
        : 725 + Math.random() * Math.max(40, bounds.maxX - 725);
      const ty = bounds.minY + 25 + Math.random() * Math.max(40, bounds.maxY - bounds.minY - 40);
      return { tx: Math.round(tx), ty: Math.round(ty) };
    }

    // Các mẫu sân chùa khác: 70% đi ở hai bên hành lang / sân chùa, 30% đi ngang qua sân giữa
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
        const { tx, ty } = pickRandomHallDestination(bounds, actor);
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
        const { tx, ty } = pickRandomHallDestination(bounds, actor);
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
        const { tx, ty } = pickRandomHallDestination(bounds, actor);
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
      const { tx, ty } = pickRandomHallDestination(bounds, actor);
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

    // Giới hạn số Actor DOM ở MAX_QUYBAI_DOM_ACTORS (38 người) cho Mẫu 1/3 để sàn thoáng, nhân vật to và mượt 60FPS
    const maxRoamActors =
      currentThemeId === 1 || currentThemeId === 3 ? MAX_QUYBAI_DOM_ACTORS : MAX_DOM_CROWD_ACTORS;
    const visibleList = meditators.slice(0, maxRoamActors);
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

      // Cập nhật vị trí ban đầu (giữ nhân vật to rõ >= 0.92 cho Mẫu 1 & Mẫu 3)
      const totalActors = visibleList.length;
      const rawDensity =
        totalActors > 176 ? 0.56 : totalActors > 106 ? 0.66 : totalActors > 60 ? 0.76 : totalActors > 36 ? 0.86 : 1.0;
      const densityFactor =
        currentThemeId === 1 || currentThemeId === 3 ? Math.max(0.95, rawDensity) : rawDensity;
      const tY = Math.max(0, Math.min(1, (actor.y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)));
      const scale = +((bounds.scaleMin + tY * (bounds.scaleMax - bounds.scaleMin)) * (isVip ? 1.04 : densityFactor)).toFixed(3);
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
    const rawDensity =
      totalActors > 176 ? 0.56 : totalActors > 106 ? 0.66 : totalActors > 60 ? 0.76 : totalActors > 36 ? 0.86 : 1.0;
    const densityFactor =
      currentThemeId === 1 || currentThemeId === 3 ? Math.max(0.95, rawDensity) : rawDensity;
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
        const scale = +((bounds.scaleMin + tY * (bounds.scaleMax - bounds.scaleMin)) * (actor.isVip ? 1.04 : densityFactor)).toFixed(3);
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
              : pickRandomHallDestination(bounds, actor);
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

  const freeRoamActionQueue = [];
  let isProcessingFreeRoamAction = false;

  function enqueueFreeRoamUserAction(actionItem) {
    if (!actionItem || !actionItem.userId) return;
    freeRoamActionQueue.push(actionItem);
    if (!isProcessingFreeRoamAction) {
      processNextFreeRoamUserAction();
    }
  }

  function processNextFreeRoamUserAction() {
    if (!currentSettings.freeRoamEnabled || currentThemeId === 7 || freeRoamActionQueue.length === 0) {
      isProcessingFreeRoamAction = false;
      freeRoamActionQueue.length = 0;
      return;
    }

    isProcessingFreeRoamAction = true;
    const item = freeRoamActionQueue.shift();

    // Đảm bảo danh sách Actor đã đồng bộ nếu user vừa mới vào phòng
    if (!freeRoamActors.has(item.userId) && lastState && Array.isArray(lastState.meditators)) {
      syncFreeRoamCrowd(lastState.meditators);
    }

    const actor = freeRoamActors.get(item.userId);
    if (actor) {
      const bounds = getStageWalkBounds();
      const now = performance.now();
      if (item.type === 'gift_incense') {
        const offsetX = Math.round((Math.random() - 0.5) * 64);
        startActorWalkTo(
          actor,
          bounds.altarX + offsetX,
          bounds.altarY + 10,
          'offering_incense',
          `🎁 Dâng lễ +${item.count || 1} xu`
        );
      } else if (item.type === 'member_enter') {
        const { tx, ty } = pickRandomHallDestination(bounds, actor);
        startActorWalkTo(actor, tx, ty, 'bowing_3', '🚶 Mới vào chùa');
      } else if (item.type === 'chat_bow') {
        if (actor.state !== 'walking') {
          startActorBowSequence(actor, now, '🙏 Thành tâm');
        } else {
          actor.afterWalkState = 'bowing_3';
        }
      }
    }

    const stepDelayMs = freeRoamActionQueue.length >= 4 ? 260 : 520;
    setTimeout(() => {
      isProcessingFreeRoamAction = false;
      if (freeRoamActionQueue.length > 0) {
        processNextFreeRoamUserAction();
      }
    }, stepDelayMs);
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
        const { tx, ty } = pickRandomHallDestination(bounds, actor);
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
  const tutienCountEl = document.getElementById('tutien-count');
  const tutienTimerEl = document.getElementById('tutien-timer');
  const tutienGemsEl = document.getElementById('tutien-gems');
  const tutienWeeklyListEl = document.getElementById('tutien-weekly-list');
  const tutienBountyBoxEl = document.getElementById('tutien-top3-bounty-box');
  const tutienTop1ThroneEl = document.getElementById('tutien-top1-throne');
  const tutienEldersRowEl = document.getElementById('tutien-elders-row');
  const tutienCloudStageEl = document.getElementById('tutien-cloud-stage');
  const tutienHeraldEl = document.getElementById('tutien-center-herald');
  const tutienHeraldTopEl = document.getElementById('tutien-herald-top');
  const tutienHeraldBigEl = document.getElementById('tutien-herald-big');
  const tutienHeraldSubEl = document.getElementById('tutien-herald-sub');
  const tutienJoinPillEl = document.getElementById('tutien-join-pill');
  const tutienJoinPillTextEl = document.getElementById('tutien-join-pill-text');
  const tutienDecreeBannerEl = document.getElementById('tutien-top3-decree-banner');
  const tutienDecreeRibbonEl = document.getElementById('tutien-decree-ribbon');
  const tutienDecreeEmblemEl = document.getElementById('tutien-decree-emblem');
  const tutienDecreeTitleEl = document.getElementById('tutien-decree-title');
  const tutienDecreeSubEl = document.getElementById('tutien-decree-sub');
  const tutienDecreeStampEl = document.getElementById('tutien-decree-stamp');
  const tutienDecreeCtaEl = document.getElementById('tutien-decree-cta');
  const tutienRelicFillEl = document.getElementById('tutien-relic-fill');
  const tutienRelicPctEl = document.getElementById('tutien-relic-pct');
  const tutienRelicMvpEl = document.getElementById('tutien-relic-mvp');
  const tutienSkyRiderEl = document.getElementById('tutien-sky-rider');
  const tutienSkyRiderBannerEl = document.getElementById('tutien-sky-rider-banner');
  const tutienSkyRiderImgEl = document.getElementById('tutien-sky-rider-img');
  const ttsQuoteWidgetEl = document.getElementById('tts-quote-widget');
  const ttsQuoteTagTextEl = document.getElementById('tts-quote-tag-text');
  const ttsQuoteAuthorEl = document.getElementById('tts-quote-author');
  const ttsQuoteQueueEl = document.getElementById('tts-quote-queue');
  const ttsQuoteTextEl = document.getElementById('tts-quote-text');
  const tutienSeatPositions = new Map();
  let lastTuTienSignature = '';
  let lastHeraldUpdateAt = 0;
  let lastJoinPillUpdateAt = 0;
  let lastTribulationFxAt = 0;
  let heraldHideTimer = null;
  let joinPillHideTimer = null;
  let decreeHideTimer = null;
  let skyRiderHideTimer = null;

  // Hàng đợi tuần tự từng User 1 cho Chế độ Tu Tiên (Mẫu 7)
  const skyRideQueue = [];
  let isSkyRiding = false;
  const decreeQueue = [];
  let isShowingDecree = false;
  const tutienEventQueue = [];
  const tutienUserQueue = tutienEventQueue;
  let isProcessingTuTienEvent = false;
  let tutienEventTimer = null;

  // Lắng nghe sự kiện cập nhật Hàng Đợi Đọc Kinh / Xướng Danh / Lên Khấn từ SacredAudioEngine
  window.addEventListener('sacred-quote-update', (ev) => {
    const detail = (ev && ev.detail) || {};
    const cur = detail.current || detail;
    const text = String(cur?.text || '').trim();
    if (detail.active && text) {
      const isTempleMode = currentThemeId !== 7;
      const activeQ = isTempleMode ? getActiveTemplePrayerQueue() : [];
      const qLen = isTempleMode
        ? Math.max(Number(detail.queueLength) || 0, activeQ.length)
        : Number(detail.queueLength) || 0;
      const qPreview =
        Array.isArray(detail.queuePreview) && detail.queuePreview.length > 0
          ? detail.queuePreview
          : isTempleMode
            ? activeQ.slice(0, 4).map((x) => x.nickname || x.user?.nickname || 'Tín Chủ')
            : Array.isArray(detail.queue)
              ? detail.queue.map((q) => q?.author).filter(Boolean)
              : [];

      renderTtsQuoteWidget({
        active: true,
        text,
        author: cur.author || '',
        tag: cur.tag || (isTempleMode ? '🙏 ĐANG LÊN KHẤN PHẬT' : '🔊 XƯỚNG DANH TU TIÊN'),
        queueLength: qLen,
        queuePreview: qPreview
      });
    } else if (currentThemeId !== 7 && currentActivePrayerItem) {
      // Nếu TTS vừa đọc xong câu ngắn nhưng trên sân vẫn đang có tín chủ hành lễ khấn Phật -> giữ nguyên Quote khấn
      const quoteInfo = buildPrayerQuoteForItem(currentActivePrayerItem);
      const activeQ = getActiveTemplePrayerQueue();
      renderTtsQuoteWidget({
        active: true,
        text: quoteInfo.rawText,
        author: quoteInfo.author,
        tag: quoteInfo.tag,
        queueLength: activeQ.length,
        queuePreview: activeQ.slice(0, 4).map((x) => x.nickname || x.user?.nickname || 'Tín Chủ')
      });
    } else {
      renderTtsQuoteWidget({ active: false });
    }
  });

  function triggerSkySwordRide(payload = {}) {
    if (!tutienSkyRiderEl || !payload) return;
    skyRideQueue.push(payload);
    if (!isSkyRiding) {
      processNextSkySwordRide();
    }
  }

  function processNextSkySwordRide() {
    if (!tutienSkyRiderEl || skyRideQueue.length === 0) {
      isSkyRiding = false;
      if (tutienSkyRiderEl) {
        tutienSkyRiderEl.classList.remove('flying');
        tutienSkyRiderEl.style.animationDuration = '';
      }
      return;
    }

    isSkyRiding = true;
    const payload = skyRideQueue.shift();
    const user = payload.user || {};
    const rInfo = getRealmInfoForPerson(user);
    const spriteUrl = TUTIEN_SPRITE_URLS[Math.max(4, rInfo.tier || 4)] || TUTIEN_SPRITE_URLS[8];
    const nickUpper = shortenName(user.nickname || 'Đạo Hữu', 14).toUpperCase();
    const titleStr = payload.daoTitle || user.daoTitle || 'Tiêu Dao Kiếm Tiên';
    const actionLabel = payload.reason || `「${titleStr}」 NGỰ KIẾM TUẦN THIÊN`;
    const bannerStr = actionLabel.includes(nickUpper)
      ? actionLabel
      : `🗡️ ${nickUpper} · ${actionLabel.replace(/^🗡️\s*/, '')}`;

    if (tutienSkyRiderImgEl) {
      tutienSkyRiderImgEl.src = spriteUrl;
    }
    if (tutienSkyRiderBannerEl) {
      tutienSkyRiderBannerEl.textContent = bannerStr;
    }
    if (tutienHeraldEl) {
      tutienHeraldEl.classList.remove('active', 'pulse');
    }
    if (tutienDecreeBannerEl && !isShowingDecree) {
      tutienDecreeBannerEl.classList.remove('active');
    }

    if (window.sacredAudio && typeof window.sacredAudio.playSwordWhoosh === 'function') {
      window.sacredAudio.playSwordWhoosh();
    }

    const rideDurationMs = skyRideQueue.length >= 3 ? 4600 : 6500;
    tutienSkyRiderEl.style.animationDuration = `${(rideDurationMs / 1000).toFixed(2)}s`;
    tutienSkyRiderEl.classList.remove('flying');
    void tutienSkyRiderEl.offsetWidth;
    tutienSkyRiderEl.classList.add('flying');

    if (skyRiderHideTimer) clearTimeout(skyRiderHideTimer);
    skyRiderHideTimer = setTimeout(() => {
      tutienSkyRiderEl.classList.remove('flying');
      tutienSkyRiderEl.style.animationDuration = '';
      isSkyRiding = false;
      if (skyRideQueue.length > 0) {
        setTimeout(processNextSkySwordRide, 180);
      }
    }, rideDurationMs);
  }

  function showTop3DecreeBanner(decree, durationMs = 5400) {
    if (!tutienDecreeBannerEl || !decree) return;
    decreeQueue.push({ decree, durationMs });
    if (!isShowingDecree) {
      processNextDecreeBanner();
    }
  }

  function processNextDecreeBanner() {
    if (!tutienDecreeBannerEl || decreeQueue.length === 0) {
      isShowingDecree = false;
      if (tutienDecreeBannerEl) {
        tutienDecreeBannerEl.classList.remove('active');
      }
      return;
    }

    isShowingDecree = true;
    const { decree, durationMs } = decreeQueue.shift();
    const effectiveDuration = decreeQueue.length >= 2 ? Math.min(durationMs, 3600) : durationMs;
    const rank = Number(decree.rank) || 1;
    const nick = decree.user?.nickname || 'Đạo Hữu';
    const dethroned = decree.dethronedName;
    const merit = Number(decree.merit) || 0;
    const rewardSkin =
      decree.rewardSkin ||
      (rank === 1 ? 'Thần Y Chân Tiên' : rank === 2 ? 'Pháp Y Độ Kiếp' : 'Pháp Y Hợp Thể');

    tutienDecreeBannerEl.classList.remove('rank-1', 'rank-2', 'rank-3', 'active');
    void tutienDecreeBannerEl.offsetWidth;
    tutienDecreeBannerEl.classList.add(`rank-${rank}`, 'active');
    if (tutienHeraldEl) {
      tutienHeraldEl.classList.remove('active', 'pulse');
    }

    if (tutienDecreeRibbonEl) {
      tutienDecreeRibbonEl.textContent =
        rank === 1
          ? '👑 THIÊN BẢNG ĐOẠT NGÔI · TOP 1 PHÒNG RỒNG 🐉'
          : rank === 2
            ? '🔥 THIÊN BẢNG ĐOẠT NGÔI · TOP 2 PHÒNG PHƯỢNG 🔥'
            : '🦄 THIÊN BẢNG ĐOẠT NGÔI · TOP 3 PHÒNG LÂN 🦄';
    }
    if (tutienDecreeEmblemEl) {
      tutienDecreeEmblemEl.textContent = rank === 1 ? '🐉' : rank === 2 ? '🔥' : '🦄';
    }
    if (tutienDecreeTitleEl) {
      const actionVerb = rank === 1 ? 'ĐĂNG CƠ TOP 1!' : `ĐOẠT NGÔI TOP ${rank}!`;
      tutienDecreeTitleEl.textContent = `${shortenName(nick, 15).toUpperCase()} ${actionVerb}`;
    }
    if (tutienDecreeSubEl) {
      const usurpText = dethroned ? `Soán ngôi ${shortenName(dethroned, 12)} · ` : '';
      tutienDecreeSubEl.textContent = `${usurpText}Ban thưởng ${rewardSkin} (${merit} 💎)`;
    }
    if (tutienDecreeStampEl) {
      tutienDecreeStampEl.textContent = `TOP ${rank}`;
    }
    if (tutienDecreeCtaEl) {
      tutienDecreeCtaEl.textContent =
        decree.ctaDonateText ||
        `🔥 KHIÊU CHIẾN: Tặng quà vượt ${merit + 1} 💎 để soán ngôi TOP ${rank} ngay!`;
    }

    window.sacredAudio.playBreakthroughSound();
    const seat = (decree.user && tutienSeatPositions.get(decree.user.userId)) || {
      x: rank === 1 ? 540 : rank === 2 ? 405 : 675,
      y: rank === 1 ? 455 : 870
    };
    pushBaguaArray({
      x: seat.x,
      y: seat.y + 38,
      radius: 90,
      angle: 0,
      alpha: 0.92,
      color: '#facc15'
    });
    spawnFloatingTuTienText(
      seat.x,
      seat.y - 50,
      `👑 ĐOẠT NGÔI TOP ${rank} (${decree.roomName || 'PHÒNG RỒNG'})!`,
      '#fef08a',
      1.22
    );

    if (currentSettings.ttsEnabled !== false) {
      const roomName = decree.roomName || (rank === 1 ? 'Phòng Rồng' : rank === 2 ? 'Phòng Phượng' : 'Phòng Lân');
      const decreeQuote = `Thiên bảng chấn động! Chúc mừng đạo hữu ${nick} đăng cơ Top ${rank} ${roomName}!`;
      window.sacredAudio.speakChant(decreeQuote, {
        withWoodenFish: false,
        priority: true,
        author: nick,
        tag: `👑 ĐOẠT NGÔI TOP ${rank}`
      });
    }

    if (decreeHideTimer) clearTimeout(decreeHideTimer);
    decreeHideTimer = setTimeout(() => {
      tutienDecreeBannerEl.classList.remove('active');
      isShowingDecree = false;
      if (decreeQueue.length > 0) {
        setTimeout(processNextDecreeBanner, 220);
      }
    }, effectiveDuration);
  }

  function showTuTienHerald(topText, bigText, subText, durationMs = 4200) {
    const heraldEl = document.getElementById('tutien-center-herald');
    if (!heraldEl) return;
    // Nếu đang hiện Biển Chiếu Chỉ Đoạt Ngôi Top 1-2-3 hoặc Pháp Tướng Ngự Kiếm ở giữa màn hình thì nhường chỗ
    if (
      (tutienDecreeBannerEl && tutienDecreeBannerEl.classList.contains('active')) ||
      (tutienSkyRiderEl && tutienSkyRiderEl.classList.contains('flying'))
    ) {
      return;
    }
    lastHeraldUpdateAt = performance.now();

    if (tutienHeraldTopEl && topText) tutienHeraldTopEl.textContent = topText;
    if (tutienHeraldBigEl && bigText) tutienHeraldBigEl.textContent = bigText;
    if (tutienHeraldSubEl && subText) tutienHeraldSubEl.textContent = subText;

    heraldEl.classList.remove('pulse');
    void heraldEl.offsetWidth;
    heraldEl.classList.add('active', 'pulse');

    if (heraldHideTimer) clearTimeout(heraldHideTimer);
    heraldHideTimer = setTimeout(() => {
      heraldEl.classList.remove('active', 'pulse');
    }, durationMs);
  }

  function showTuTienJoinPill(pillText, durationMs = 3800) {
    if (!tutienJoinPillEl || !pillText) return;
    lastJoinPillUpdateAt = performance.now();

    if (tutienJoinPillTextEl) {
      tutienJoinPillTextEl.textContent = String(pillText).replace(/^☯\s*/, '');
    }
    tutienJoinPillEl.classList.add('active');
    if (joinPillHideTimer) clearTimeout(joinPillHideTimer);
    joinPillHideTimer = setTimeout(() => {
      tutienJoinPillEl.classList.remove('active');
    }, durationMs);
  }

  const MAX_TUTIEN_EVENT_QUEUE = 10;

  function enqueueTuTienEvent(payload = {}) {
    if (!payload) return;
    const isBreakthrough = Boolean(payload.realmUpgraded) || payload.eventKind === 'breakthrough';
    if (isBreakthrough) {
      let insertIdx = 0;
      while (
        insertIdx < tutienEventQueue.length &&
        (Boolean(tutienEventQueue[insertIdx].realmUpgraded) || tutienEventQueue[insertIdx].eventKind === 'breakthrough')
      ) {
        insertIdx++;
      }
      tutienEventQueue.splice(insertIdx, 0, payload);
      if (tutienEventQueue.length > MAX_TUTIEN_EVENT_QUEUE) {
        tutienEventQueue.pop();
      }
    } else if (tutienEventQueue.length < MAX_TUTIEN_EVENT_QUEUE) {
      tutienEventQueue.push(payload);
    } else {
      // Hàng đợi đã đạt tối đa 10 sự kiện: vẫn hiển thị bong bóng chat cho user nhưng không chất chồng hàng đợi gây trễ
      const msgText = payload.commentText || payload.content;
      if (payload.user && msgText) {
        showBubbleForUser(payload.user.userId, msgText);
      }
      return;
    }
    if (!isProcessingTuTienEvent) {
      processNextTuTienEvent();
    }
  }

  function processNextTuTienEvent() {
    if (tutienEventQueue.length === 0) {
      isProcessingTuTienEvent = false;
      return;
    }
    if (currentThemeId !== 7) {
      tutienEventQueue.length = 0;
      isProcessingTuTienEvent = false;
      return;
    }

    isProcessingTuTienEvent = true;
    const payload = tutienEventQueue.shift();

    const topText = payload.headline || payload.heraldTop;
    const bigText = payload.bigTitle || payload.heraldBig;
    const subText = payload.subLine || payload.heraldSub;
    const pillText = payload.pillLine || payload.joinPillText;
    const msgText = payload.commentText || payload.content;
    const fxType = payload.fxType || 'join_sect';
    const tuViAdded = Number(payload.tuViAdded) || 120;
    const isLevelUp = Boolean(payload.realmUpgraded) || payload.eventKind === 'breakthrough';

    // Xử lý tuần tự từng sự kiện một (mỗi sự kiện cách nhau ~650ms - 800ms để không dồn cục gây lag)
    const qLen = tutienEventQueue.length;
    const stepHoldMs =
      qLen >= 5
        ? 650
        : qLen >= 2
          ? 700
          : isLevelUp
            ? 800
            : 720;

    showTuTienHerald(topText, bigText, subText, Math.max(stepHoldMs + 1600, 2600));
    showTuTienJoinPill(pillText, Math.max(stepHoldMs + 1400, 2400));

    // Xác định vị trí ngồi thực tế của người vừa tương tác để giáng Sấm Chớp / Kiếm Bay / Thăng Cấp trúng người đó
    const userSeat = (payload.user && tutienSeatPositions.get(payload.user.userId)) || {
      x: 240 + Math.random() * 600,
      y: 1180 + Math.random() * 420
    };

    const nowFxMs = performance.now();
    const isFastQueue = qLen >= 4;

    if (isLevelUp) {
      spawnBreakthroughAscensionFX(
        userSeat.x,
        userSeat.y,
        payload.newRealmName || payload.user?.realmName || bigText || 'Kim Đan',
        tuViAdded
      );
    } else if (fxType === 'thunder_tribulation') {
      lastTribulationFxAt = nowFxMs;
      spawnLightningTribulation(userSeat.x, userSeat.y, 1, 'cyan', isFastQueue ? 1 : 2);
      spawnFloatingTuTienText(userSeat.x, userSeat.y - 35, `⚡ +${tuViAdded} Tu Vi`, '#38bdf8', 1.05);
    } else if (fxType === 'sword_rain' || fxType === 'sword_and_thunder') {
      lastTribulationFxAt = nowFxMs;
      spawnSwordRainFX(userSeat.x, userSeat.y, isFastQueue ? 5 : 6);
      spawnSingleLightningWave(userSeat.x, userSeat.y, 1, 'cyan');
      spawnFloatingTuTienText(userSeat.x, userSeat.y - 35, `⚔️ +${tuViAdded} Tu Vi`, '#fde047', 1.05);
    } else if (fxType === 'blossom_rain') {
      lastTribulationFxAt = nowFxMs;
      window.sacredAudio.playTuTienJoinSound();
      spawnBlossomRainFX(isFastQueue ? 12 : 18);
      spawnQiPillarFX(userSeat.x, userSeat.y, 'gold');
      spawnFloatingTuTienText(userSeat.x, userSeat.y - 35, `🌸 +${tuViAdded} Tu Vi`, '#f472b6', 1.05);
    } else if (fxType === 'duel_clash') {
      lastTribulationFxAt = nowFxMs;
      const oppSeat = (payload.opponentUserId && tutienSeatPositions.get(payload.opponentUserId)) || {
        x: 540,
        y: 460
      };
      spawnDuelClashFX(userSeat.x, userSeat.y, oppSeat.x, oppSeat.y);
      spawnSwordRainFX(userSeat.x, userSeat.y, isFastQueue ? 5 : 6, { silent: true });
      spawnFloatingTuTienText(userSeat.x, userSeat.y - 35, `🔥 THẮNG +${tuViAdded} TV`, '#fde047', 1.12);
    } else {
      // Nhánh mặc định (join_sect - comment thường): chỉ tụ cột linh khí nhẹ nhàng, không xả mưa kiếm tràn lan
      lastTribulationFxAt = nowFxMs;
      window.sacredAudio.playTuTienJoinSound();
      spawnQiPillarFX(userSeat.x, userSeat.y, 'cyan');
      spawnFloatingTuTienText(userSeat.x, userSeat.y - 35, `+${tuViAdded} Tu Vi`, '#38bdf8', 1.0);
    }

    if (payload.user && msgText) {
      showBubbleForUser(payload.user.userId, msgText);
    }

    // Đưa lời xướng danh / bình luận Tu Tiên vào Hàng Đợi Đọc (Quote Queue) tuần tự từng câu
    if (currentThemeId === 7 && currentSettings.ttsEnabled !== false) {
      const nick = payload.user?.nickname || 'Đạo Hữu';
      const ttsQLen = Array.isArray(window.sacredAudio?.speechQueue)
        ? window.sacredAudio.speechQueue.length
        : 0;
      if (isLevelUp) {
        const newRealm = payload.newRealmName || payload.user?.realmName || bigText || 'Kim Đan';
        const breakthroughQuote = `Chúc mừng đạo hữu ${nick} độ kiếp thành công, đột phá cảnh giới ${newRealm}!`;
        window.sacredAudio.speakChant(breakthroughQuote, {
          withWoodenFish: false,
          priority: true,
          author: nick,
          tag: '⚡ ĐỘT PHÁ CẢNH GIỚI'
        });
      } else if (ttsQLen < 5) {
        const cleanComment = String(msgText || '').trim();
        const quoteLine = cleanComment
          ? `Đạo hữu ${nick} vấn đạo: ${cleanComment}`
          : String(subText || pillText || '').trim();
        if (quoteLine) {
          const eventTag =
            payload.eventKind === 'relic_break'
              ? '🐉 ĐOẠT THÁI CỔ LONG CHÂU'
              : payload.eventKind === 'title_bestow'
                ? '👑 SẮC PHONG ĐẠO HIỆU'
                : '📜 ĐẠO HỮU VẤN ĐẠO';
          window.sacredAudio.speakChant(quoteLine, {
            withWoodenFish: false,
            priority: false,
            author: nick,
            tag: eventTag
          });
        }
      }
    }

    if (tutienEventTimer) clearTimeout(tutienEventTimer);
    tutienEventTimer = setTimeout(() => {
      isProcessingTuTienEvent = false;
      if (tutienEventQueue.length > 0) {
        processNextTuTienEvent();
      }
    }, stepHoldMs);
  }

  // Đồng hồ đếm thời gian mở sơn môn Tu Tiên
  const sectStartTime = Date.now() - (39 * 60 + 16) * 1000;
  setInterval(() => {
    if (!tutienTimerEl) return;
    const elapsedSec = Math.floor((Date.now() - sectStartTime) / 1000);
    const hh = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    tutienTimerEl.textContent = `${hh}:${mm}:${ss}`;
  }, 1000);

  function getRealmInfoForPerson(person) {
    if (person && person.realmName && person.robeTier) {
      return { name: person.realmName, tier: Number(person.robeTier) || 1 };
    }
    const effectiveTuVi = Math.max((Number(person?.merit) || 0) * 10, Number(person?.tuVi) || 0);
    if (effectiveTuVi >= 250000) return { name: 'Chân Tiên', tier: 8 };
    if (effectiveTuVi >= 100000) return { name: 'Độ Kiếp', tier: 7 };
    if (effectiveTuVi >= 40000) return { name: 'Đại Thừa', tier: 7 };
    if (effectiveTuVi >= 15000) return { name: 'Hợp Thể', tier: 6 };
    if (effectiveTuVi >= 6000) return { name: 'Luyện Hư', tier: 5 };
    if (effectiveTuVi >= 2500) return { name: 'Hóa Thần', tier: 4 };
    if (effectiveTuVi >= 1000) return { name: 'Nguyên Anh', tier: 3 };
    if (effectiveTuVi >= 400) return { name: 'Kim Đan', tier: 3 };
    if (effectiveTuVi >= 120) return { name: 'Trúc Cơ', tier: 2 };
    if (effectiveTuVi >= 20) return { name: 'Luyện Khí', tier: 2 };
    return { name: 'Phàm Nhân', tier: 1 };
  }

  function formatTuViShort(val) {
    const n = Math.max(0, Number(val) || 0);
    if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  // Giới hạn cố định tối đa 48 slot trên sân khấu Tu Tiên (Mẫu 7: 1 Chưởng Môn + 4 Trưởng Lão + 43 Đệ Tử Biển Mây)
  const MAX_TUTIEN_SLOTS = 48;

  function renderTuTienStage(meditators = []) {
    if (!tutienCloudStageEl) return;
    const tutienMeditators = meditators.slice(0, MAX_TUTIEN_SLOTS);
    const exactTotal = Math.min(
      MAX_TUTIEN_SLOTS,
      getEffectiveCrowdCount(lastState) || tutienMeditators.length
    );
    if (tutienCountEl) {
      tutienCountEl.textContent = Number(exactTotal).toLocaleString('vi-VN');
    }

    const totalGems = meditators.reduce((sum, m) => sum + (Number(m.merit) || 0), 0);
    if (tutienGemsEl) {
      tutienGemsEl.textContent = Math.max(2834, totalGems).toLocaleString('vi-VN');
    }

    // 0. Cập nhật Thanh Bí Cảnh Thái Cổ Long Châu
    const relic = lastState?.tutienRelic || { progress: 68, target: 100, lastMvp: 'Chà 🌸' };
    const pct = Math.min(100, Math.max(5, Math.round(((Number(relic.progress) || 68) / (Number(relic.target) || 100)) * 100)));
    if (tutienRelicFillEl) tutienRelicFillEl.style.width = `${pct}%`;
    if (tutienRelicPctEl) tutienRelicPctEl.textContent = `${pct}%`;
    if (tutienRelicMvpEl) tutienRelicMvpEl.textContent = shortenName(relic.lastMvp || 'Chà 🌸', 12);

    // Chống giật lag 60FPS: Kiểm tra chữ ký DOM Tu Tiên (tối đa 48 slot) trước khi gán lại innerHTML
    const top48Sig = tutienMeditators
      .map(
        (m) =>
          `${m.userId}:${m.nickname}:${m.merit || 0}:${m.tuVi || 0}:${m.realmName || ''}:${m.robeTier || ''}:${m.daoTitle || ''}:${m.avatar || ''}`
      )
      .join('|');
    const bubblesSig = Array.from(activeBubbles.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
    const relicSig = `${relic.progress || 0}:${relic.target || 100}:${relic.lastMvp || ''}`;
    const fullTuTienSig = `${tutienMeditators.length}__${top48Sig}__${bubblesSig}__${relicSig}`;
    if (
      fullTuTienSig === lastTuTienSignature &&
      (tutienMeditators.length === 0 ||
        (tutienTop1ThroneEl && tutienTop1ThroneEl.children.length > 0) ||
        tutienCloudStageEl.children.length > 0)
    ) {
      return;
    }
    lastTuTienSignature = fullTuTienSig;

    // 1. Bảng Tuần Top 5 (Rồng · Phượng · Lân) + Biển Treo Thưởng Đua Top 1-2-3
    if (tutienWeeklyListEl) {
      const top5 = tutienMeditators.slice(0, 5);
      const beasts = ['🐉 Rồng', '🔥 Phượng', '🦄 Lân', '', ''];
      tutienWeeklyListEl.innerHTML = top5
        .map((p, idx) => {
          const beastHtml = beasts[idx] ? `<span class="tutien-beast-tag">${beasts[idx]}</span>` : '';
          const crown = idx === 0 ? '👑 ' : '';
          const scoreLabel = (p.merit || 0) > 0 ? `${formatTuViShort(p.merit)} 💎` : `${formatTuViShort(p.tuVi || 0)} ⚡`;
          return `
            <div class="tutien-week-row">
              <span class="tutien-week-rank r-${idx + 1}">${idx + 1}</span>
              <div class="tutien-week-info">
                <span class="tutien-week-name">${crown}${escapeHtml(shortenName(p.nickname, 14))}</span>
                ${beastHtml}
              </div>
              <span class="tutien-week-gems">${scoreLabel}</span>
            </div>
          `;
        })
        .join('');
    }

    if (tutienBountyBoxEl) {
      const m1 = (Number(tutienMeditators[0]?.merit) || 0) + 1;
      const m2 = (Number(tutienMeditators[1]?.merit) || 0) + 1;
      const m3 = (Number(tutienMeditators[2]?.merit) || 0) + 1;
      tutienBountyBoxEl.innerHTML = `
        <div class="bounty-head">🔥 ĐẶC QUYỀN ĐOẠT TOP 1·2·3</div>
        <div class="bounty-row"><span>🐉 Top 1 Áo Chân Tiên</span><span class="b-need">&gt;${m1 - 1} 💎</span></div>
        <div class="bounty-row"><span>🔥 Top 2 Áo Độ Kiếp</span><span class="b-need">&gt;${m2 - 1} 💎</span></div>
        <div class="bounty-row"><span>🦄 Top 3 Cánh Phượng</span><span class="b-need">&gt;${m3 - 1} 💎</span></div>
        <div class="bounty-foot">🎁 Donate soán ngôi nổ Chiếu Chỉ!</div>
      `;
    }

    // Lưu tọa độ ngồi thực tế của từng tu sĩ trên màn hình để đánh Sấm Chớp Độ Kiếp / Cột Linh Khí chuẩn xác
    tutienSeatPositions.clear();

    // 2. Ngôi vị Đệ Nhất Chưởng Môn ở giữa 2 bảng (x=540, y=560) kèm Dị Tượng Pháp Luân Xoay 360° & Đạo Hiệu
    if (tutienTop1ThroneEl) {
      const top1 = tutienMeditators[0];
      if (!top1) {
        tutienTop1ThroneEl.innerHTML = '';
      } else {
        tutienSeatPositions.set(top1.userId, { x: 540, y: 455 });
        const bText = activeBubbles.get(top1.userId);
        const top1Sprite = TUTIEN_SPRITE_URLS[8];
        const tvVal = Math.max((top1.merit || 120) * 100, top1.tuVi || 0);
        const daoTitle = top1.daoTitle || 'VẠN CỔ ĐỘC TÔN';
        tutienTop1ThroneEl.innerHTML = `
          ${bText ? `<div class="pilgrim-white-bubble">${escapeHtml(bText)}</div>` : ''}
          <div class="dharma-wheel-halo halo-dragon"></div>
          <img src="${top1Sprite}" class="cultivator-sprite" alt="Đệ Nhất" />
          <div class="tutien-vip-crest crest-dragon">🐉 PHÒNG RỒNG · TOP 1 👑</div>
          <div class="tutien-throne-plaque">
            <div class="dao-title-tag">「${escapeHtml(daoTitle)}」</div>
            <div class="t-name">Đệ Nhất ${escapeHtml(shortenName(top1.nickname, 14))}</div>
            <div class="t-realm">Chân Tiên · 💎 ${top1.merit || 0} (${formatTuViShort(tvVal)} TV)</div>
          </div>
        `;
      }
    }

    // 3. Hàng 4 vị Trưởng Lão (Đệ Tứ - Đệ Nhị - Đệ Tam - Đệ Ngũ) kèm Pháp Luân & Đạo Hiệu
    if (tutienEldersRowEl) {
      const elderOrder = [
        { idx: 3, title: 'Đệ Tứ', x: 155, y: 155, throneTier: 5, throneRealm: 'Luyện Hư', defaultDao: 'LÔI ĐẾ TRUYỀN NHÂN', halo: '', crest: '' },
        { idx: 1, title: 'Đệ Nhị', x: 405, y: 155, throneTier: 7, throneRealm: 'Độ Kiếp', defaultDao: 'CỬU THIÊN TÔN GIẢ', halo: '<div class="dharma-wheel-halo halo-phoenix"></div>', crest: '<div class="tutien-vip-crest crest-phoenix">🔥 PHÒNG PHƯỢNG · TOP 2</div>' },
        { idx: 2, title: 'Đệ Tam', x: 675, y: 155, throneTier: 6, throneRealm: 'Hợp Thể', defaultDao: 'THÁI THƯỢNG HỘ PHÁP', halo: '<div class="dharma-wheel-halo halo-kirin"></div>', crest: '<div class="tutien-vip-crest crest-kirin">🦄 PHÒNG LÂN · TOP 3</div>' },
        { idx: 4, title: 'Đệ Ngũ', x: 925, y: 155, throneTier: 4, throneRealm: 'Hóa Thần', defaultDao: 'KIẾM ĐẠO KỲ TÀI', halo: '', crest: '' }
      ];
      tutienEldersRowEl.innerHTML = elderOrder
        .map((slot) => {
          const p = tutienMeditators[slot.idx];
          if (!p) return '';
          tutienSeatPositions.set(p.userId, { x: slot.x, y: 790 + slot.y - 75 });
          const bText = activeBubbles.get(p.userId);
          const elderSprite = TUTIEN_SPRITE_URLS[slot.throneTier] || TUTIEN_SPRITE_URLS[4];
          const tvVal = Math.max((p.merit || 20) * 100, p.tuVi || 0);
          const daoTitle = p.daoTitle || slot.defaultDao;
          return `
            <div class="tutien-elder-node" style="left: ${slot.x}px; top: ${slot.y}px;">
              ${bText ? `<div class="pilgrim-white-bubble">${escapeHtml(bText)}</div>` : ''}
              ${slot.halo}
              <img src="${elderSprite}" class="cultivator-sprite" alt="${slot.title}" />
              ${slot.crest}
              <div class="tutien-throne-plaque">
                <div class="dao-title-tag">「${escapeHtml(daoTitle)}」</div>
                <div class="t-name">${slot.title} ${escapeHtml(shortenName(p.nickname, 11))}</div>
                <div class="t-realm">${escapeHtml(slot.throneRealm)} · 💎 ${p.merit || 0} (${formatTuViShort(tvVal)} TV)</div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    // 4. Biển Mây Đệ Tử Nhập Môn (Tối đa 43 đệ tử = tổng 48 slot Tu Tiên, bố cục 4-6 hàng thoáng đẹp từ y=1160..1760)
    const disciples = tutienMeditators.slice(5, MAX_TUTIEN_SLOTS);
    const dCount = disciples.length;
    let rowConfigs;
    if (dCount <= 22) {
      rowConfigs = [
        { y: 1175, cols: 5, xMin: 125, xMax: 955, scale: 0.88 },
        { y: 1365, cols: 5, xMin: 115, xMax: 965, scale: 0.92 },
        { y: 1555, cols: 6, xMin: 105, xMax: 975, scale: 0.96 },
        { y: 1755, cols: 6, xMin: 95, xMax: 985, scale: 1.0 }
      ];
    } else if (dCount <= 33) {
      rowConfigs = [
        { y: 1165, cols: 6, xMin: 120, xMax: 960, scale: 0.84 },
        { y: 1315, cols: 6, xMin: 112, xMax: 968, scale: 0.87 },
        { y: 1465, cols: 7, xMin: 105, xMax: 975, scale: 0.90 },
        { y: 1615, cols: 7, xMin: 98, xMax: 982, scale: 0.92 },
        { y: 1760, cols: 7, xMin: 92, xMax: 988, scale: 0.94 }
      ];
    } else {
      // Tối đa 43 đệ tử (7 + 7 + 7 + 7 + 7 + 8 = 43 slot)
      rowConfigs = [
        { y: 1160, cols: 7, xMin: 115, xMax: 965, scale: 0.80 },
        { y: 1280, cols: 7, xMin: 110, xMax: 970, scale: 0.82 },
        { y: 1400, cols: 7, xMin: 105, xMax: 975, scale: 0.84 },
        { y: 1520, cols: 7, xMin: 100, xMax: 980, scale: 0.86 },
        { y: 1640, cols: 7, xMin: 95, xMax: 985, scale: 0.88 },
        { y: 1760, cols: 8, xMin: 88, xMax: 992, scale: 0.90 }
      ];
    }

    const maxDiscipleNameLen = dCount > 22 ? 10 : 12;
    const tagScaleStyle =
      dCount > 22 ? ' style="transform: scale(0.92); transform-origin: center top;"' : '';

    let html = '';
    let dIdx = 0;
    for (let r = 0; r < rowConfigs.length; r++) {
      const cfg = rowConfigs[r];
      for (let c = 0; c < cfg.cols; c++) {
        if (dIdx >= disciples.length) break;
        const p = disciples[dIdx];
        dIdx++;
        const tCol = cfg.cols <= 1 ? 0.5 : c / (cfg.cols - 1);
        const staggerX = r % 2 === 1 ? 14 : -14;
        const x = Math.round(cfg.xMin + tCol * (cfg.xMax - cfg.xMin) + staggerX);
        const y = cfg.y;
        tutienSeatPositions.set(p.userId, { x, y: y - 70 });
        const rInfo = getRealmInfoForPerson(p);
        const spriteUrl = TUTIEN_SPRITE_URLS[rInfo.tier] || TUTIEN_SPRITE_URLS[1];
        const bText = activeBubbles.get(p.userId);
        const tvText = (p.tuVi || 0) > 0 ? ` · ${formatTuViShort(p.tuVi)} TV` : '';

        html += `
          <div
            class="tutien-disciple-node${bText ? ' just-interacted-glow' : ''}"
            style="left: ${x}px; top: ${y}px; --c-scale: ${cfg.scale}; z-index: ${bText ? 58 : 25 + r * 3};"
          >
            ${bText ? `<div class="pilgrim-white-bubble">${escapeHtml(bText)}</div>` : ''}
            <img src="${spriteUrl}" class="cultivator-sprite" alt="Tu sĩ" />
            <div class="tutien-disciple-tag"${tagScaleStyle}>
              ${p.daoTitle ? `<div class="dao-title-tag">「${escapeHtml(p.daoTitle)}」</div>` : ''}
              <div class="tutien-name-pill tier-${rInfo.tier}">
                ${renderAvatarBadge(p.avatar, rInfo.tier >= 3 ? '⚡' : '☯', 'pill-avatar-dot')}
                <span>${escapeHtml(shortenName(p.nickname, maxDiscipleNameLen))}</span>
              </div>
              <div class="tutien-realm-sub tier-${rInfo.tier}">${escapeHtml(rInfo.name)}${escapeHtml(tvText)}</div>
            </div>
          </div>
        `;
      }
    }

    tutienCloudStageEl.innerHTML = html;
  }

  function updateLiveCounterBadge(meditators = []) {
    if (!seatCounterEl) return;
    const exactTotal = getEffectiveCrowdCount(lastState) || meditators.length;
    seatCounterEl.textContent = Number(exactTotal).toLocaleString('vi-VN');
  }

  let crowdRenderRafId = null;
  let pendingCrowdMeditators = null;

  function scheduleCrowdRender(meditators = null) {
    pendingCrowdMeditators = Array.isArray(meditators)
      ? meditators
      : lastState?.meditators || [];
    if (crowdRenderRafId !== null) return;
    crowdRenderRafId = requestAnimationFrame(() => {
      crowdRenderRafId = null;
      const list = pendingCrowdMeditators || lastState?.meditators || [];
      pendingCrowdMeditators = null;
      renderCurrentModeCrowd(list);
    });
  }

  function renderCurrentModeCrowd(meditators = []) {
    const exactTotal = getEffectiveCrowdCount(lastState) || meditators.length;
    renderMassiveCrowdBackdropCanvas(exactTotal);

    if (currentThemeId === 7) {
      if (wasFreeRoamEnabled) {
        wasFreeRoamEnabled = false;
        clearFreeRoamActors();
      }
      renderTuTienStage(meditators);
      updateLiveCounterBadge(meditators);
      return;
    }

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

    const prevThemeId = currentThemeId;
    if (state.settings) {
      currentSettings = state.settings;
      window.sacredAudio.applySettings(state.settings);

      currentThemeId = Number(state.settings.themeId) || 1;
      const modeClass =
        currentThemeId === 7
          ? 'mode-tutien'
          : currentThemeId === 1 || currentThemeId === 3 || currentThemeId === 6
          ? 'mode-quybai'
          : 'mode-chuaonline';
      stageWrapper.className = `${modeClass} theme-${currentThemeId}`;

      if (currentThemeId === 7) {
        backdropImg.src = '/assets/tien_mon_van_dao_bg.jpg?v=tt1';
      } else if (currentThemeId === 1) {
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

      if (state.settings.monkGreeting && !currentActivePrayerItem) {
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

    if (recentChatMessages.length === 0 && Array.isArray(state.chatHistory) && state.chatHistory.length > 0) {
      recentChatMessages = state.chatHistory.slice(0, 15);
      renderQuyBaiChatList(false);
    } else if (recentChatMessages.length === 0) {
      renderQuyBaiChatList(false);
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
            <div class="tam-long-row${lastDonatedUserId && item.userId === lastDonatedUserId ? ' just-donated-row' : ''}">
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

  const MAX_ACTIVE_PETALS = 34;

  function pushPetalCapped(petalObj) {
    if (lotusPetals.length >= MAX_ACTIVE_PETALS) {
      lotusPetals.shift();
    }
    lotusPetals.push(petalObj);
  }

  function spawnLotusRain(count = 28) {
    const safeCount = Math.min(count, 28);
    for (let i = 0; i < safeCount; i++) {
      pushPetalCapped({
        x: 60 + Math.random() * 960,
        y: -20 - Math.random() * 180,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 6.2 + Math.random() * 4.8,
        size: 5.5 + Math.random() * 5.5,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.08,
        alpha: 0.9,
        fastFade: true,
        color: i % 2 === 0 ? '#f472b6' : '#fde047'
      });
    }
  }

  function spawnLotusBurst(originX, originY, count = 14) {
    const safeCount = Math.min(count, 16);
    for (let i = 0; i < safeCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.4 + Math.random() * 5.2;
      pushPetalCapped({
        x: originX,
        y: originY,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1.5,
        size: 4.5 + Math.random() * 4.5,
        angle: a,
        vAngle: 0.06,
        alpha: 0.95,
        isSparkle: true,
        color: '#fde047'
      });
    }
  }

  // =========================================================================
  // 8B. ENGINE HIỆU ỨNG TU TIÊN 60FPS: SẤM CHỚP ĐỘ KIẾP · MƯA HOA ĐÀO · VẠN KIẾM · CỘT LINH KHÍ
  // =========================================================================
  const lightningBolts = []; // Tia sét Thiên Lôi Độ Kiếp
  const tribulationRings = []; // Vòng sóng Lôi Kiếp & Pháp Trận dưới chân tu sĩ
  const flyingSwords = []; // Phi Kiếm Vạn Kiếm Quy Tông
  const qiPillars = []; // Cột sáng Linh Khí Đột Phá
  const baguaArrays = []; // Pháp trận Bát Quái xoay dưới chân khi Thăng Cấp Cảnh Giới
  const floatingTexts = []; // Chữ nổi +Tu Vi & THĂNG CẤP bay lên tại vị trí nhân vật
  let skyFlashAlpha = 0;
  let skyFlashColor = '56, 189, 248';

  // 8 Thanh Phi Kiếm Hộ Pháp bay lượn tuần tra thường trực quanh Tiên Điện & Biển Mây
  const patrolSwords = Array.from({ length: 8 }, (_, idx) => ({
    phase: (idx * Math.PI * 2) / 8,
    speed: 0.014 + (idx % 3) * 0.004,
    cx: 540,
    cy: idx < 4 ? 465 : 1120 + (idx - 4) * 145,
    rx: idx < 4 ? 360 + idx * 35 : 430,
    ry: idx < 4 ? 135 + idx * 18 : 85,
    color: idx % 2 === 0 ? '#38bdf8' : '#fde047'
  }));

  const MAX_FLOATING_TEXTS = 4;
  const MAX_FLYING_SWORDS = 8;
  const MAX_SWORD_RAIN_QUEUE = 8;
  const SWORD_RAIN_BATCH_MIN = 5;
  const SWORD_RAIN_BATCH_MAX = 8;
  const SWORD_RAIN_BATCH_GAP_MS = 400;
  const MAX_QI_PILLARS = 3;
  const MAX_TRIBULATION_RINGS = 6;
  const MAX_BAGUA_ARRAYS = 3;
  const MAX_ACTIVE_BOLTS = 3;
  const swordRainQueue = [];
  let isSwordRainBatchActive = false;
  let swordRainGapTimer = null;

  function pushTribulationRing(ringObj) {
    if (tribulationRings.length >= MAX_TRIBULATION_RINGS) {
      tribulationRings.shift();
    }
    tribulationRings.push(ringObj);
  }

  function pushBaguaArray(baguaObj) {
    if (baguaArrays.length >= MAX_BAGUA_ARRAYS) {
      baguaArrays.shift();
    }
    baguaArrays.push(baguaObj);
  }

  function spawnFloatingTuTienText(x, y, text, color = '#fde047', scale = 1.0) {
    const safeX = Math.max(170, Math.min(910, Number(x) || 540));
    const safeY = Math.max(140, Math.min(1740, Number(y) || 620));

    // Nếu vừa mới có dòng chữ y hệt tại cùng vị trí đang còn sáng rõ thì làm mới alpha để tránh nhân đôi đè chữ
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const existing = floatingTexts[i];
      if (existing.text === text && Math.abs(existing.x - safeX) < 120 && existing.alpha > 0.68) {
        existing.alpha = 1.0;
        return;
      }
    }

    // Chống đè vị trí: đẩy các chữ cũ đang ở gần vị trí (safeX, safeY) dịch lên trên tối thiểu 44px để xếp tầng rõ ràng
    const minGapY = 44;
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      if (Math.abs(ft.x - safeX) < 340 && Math.abs(ft.y - safeY) < minGapY) {
        ft.y = Math.max(110, safeY - minGapY);
      }
    }
    for (let i = floatingTexts.length - 1; i > 0; i--) {
      const newer = floatingTexts[i];
      const older = floatingTexts[i - 1];
      if (Math.abs(newer.x - older.x) < 340 && Math.abs(newer.y - older.y) < minGapY) {
        older.y = Math.max(95, Math.min(older.y, newer.y - minGapY));
      }
    }

    while (floatingTexts.length >= MAX_FLOATING_TEXTS) {
      floatingTexts.shift();
    }

    floatingTexts.push({
      x: safeX,
      y: safeY,
      text,
      color,
      scale,
      vy: -1.65,
      alpha: 1.0
    });
  }

  function spawnBreakthroughAscensionFX(targetX, targetY, newRealmName = 'Kim Đan', tuViAdded = 150) {
    const nowMs = performance.now();
    const isThrottled = nowMs - lastTribulationFxAt < 550;

    if (!isThrottled) {
      lastTribulationFxAt = nowMs;
      // 1. Chỉ gọi 1 âm thanh Đột Phá Cảnh Giới chuẩn Tu Tiên (không chồng thêm tiếng sấm & tiếng kiếm cùng lúc)
      window.sacredAudio.playBreakthroughSound();
      spawnLightningTribulation(targetX, targetY, 1, 'gold', 2, { silent: true });
      spawnSwordRainFX(targetX, targetY, 6, { silent: true });

      // 2. Vòng Pháp Trận Bát Quái Hoàng Kim xoay dưới chân nhân vật vừa thăng cấp
      pushBaguaArray({
        x: targetX,
        y: targetY + 38,
        radius: 76,
        angle: 0,
        alpha: 0.85,
        color: '#facc15'
      });
    }

    spawnQiPillarFX(targetX, targetY, 'gold');

    // 3. Chữ nổi THĂNG CẤP CẢNH GIỚI bay lên ngay trên đầu nhân vật (xếp tầng không đè chữ)
    spawnFloatingTuTienText(
      targetX,
      targetY - 45,
      `⬆️ ĐỘT PHÁ ${String(newRealmName).toUpperCase()}! (+${tuViAdded} TV)`,
      '#fef08a',
      1.15
    );
  }

  function generateLightningSegments(x1, y1, x2, y2, displace = 34) {
    const pts = [{ x: x1, y: y1 }];
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const bx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * displace;
      const by = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 10;
      pts.push({ x: bx, y: by });
    }
    pts.push({ x: x2, y: y2 });
    return pts;
  }

  function spawnSingleLightningWave(targetX, targetY, boltCount = 1, colorMode = 'cyan') {
    // Chớp sáng rất dịu (0.08) để không gây chói mắt người xem
    skyFlashAlpha = 0.08;
    skyFlashColor = colorMode === 'gold' ? '250, 204, 21' : colorMode === 'purple' ? '192, 132, 252' : '56, 189, 248';

    const safeBoltCount = Math.min(2, Math.max(1, Number(boltCount) || 1));
    const startY = Math.max(95, targetY - 310);

    for (let b = 0; b < safeBoltCount; b++) {
      if (lightningBolts.length >= MAX_ACTIVE_BOLTS) {
        lightningBolts.shift();
      }
      const startX = Math.max(90, Math.min(990, targetX + (Math.random() - 0.5) * 75));
      const mainPts = generateLightningSegments(startX, startY, targetX + (Math.random() - 0.5) * 16, targetY, 32);

      // Chỉ tạo tối đa 2 nhánh sét nhỏ gọn để không chiếm màn hình
      const branches = [];
      for (let i = 3; i < mainPts.length - 3; i += 3) {
        if (branches.length < 2 && Math.random() < 0.55) {
          const bp = mainPts[i];
          const brEndX = bp.x + (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 38);
          const brEndY = bp.y + 34 + Math.random() * 48;
          branches.push(generateLightningSegments(bp.x, bp.y, brEndX, brEndY, 14));
        }
      }

      lightningBolts.push({
        mainPts,
        branches,
        alpha: 0.86,
        decay: 0.038 + b * 0.008,
        glowColor: colorMode === 'gold' ? '#facc15' : colorMode === 'purple' ? '#c084fc' : '#38bdf8',
        coreColor: '#ffffff'
      });
    }

    // Vòng sóng xung kích Lôi Kiếp gọn dưới chân tu sĩ
    pushTribulationRing({
      x: targetX,
      y: targetY + 25,
      radius: 10,
      maxRadius: 92,
      alpha: 0.65,
      color: colorMode === 'gold' ? '250, 204, 21' : '56, 189, 248'
    });

    // Tia lửa điện nhỏ gọn tại điểm sét đánh
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.2 + Math.random() * 4.5;
      pushPetalCapped({
        x: targetX,
        y: targetY,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1.5,
        size: 3 + Math.random() * 3.5,
        angle: a,
        vAngle: 0.1,
        alpha: 0.85,
        isSparkle: true,
        color: i % 2 === 0 ? '#38bdf8' : '#fef08a'
      });
    }
  }

  function spawnLightningTribulation(
    targetX = 540,
    targetY = 620,
    boltCount = 1,
    colorMode = 'cyan',
    waveCount = 2,
    options = {}
  ) {
    if (!options || !options.silent) {
      window.sacredAudio.playThunderStrike();
    }
    const allDelays = [0, 320, 660];
    const waveDelays = allDelays.slice(0, Math.min(3, Math.max(1, waveCount)));
    const waveColors = [colorMode, 'gold', 'purple'];
    waveDelays.forEach((delay, idx) => {
      setTimeout(() => {
        spawnSingleLightningWave(
          targetX + (Math.random() - 0.5) * 24,
          targetY,
          boltCount,
          waveColors[idx % waveColors.length]
        );
      }, delay);
    });
  }

  function spawnQiPillarFX(targetX = 540, targetY = 620, color = 'gold') {
    if (qiPillars.length >= MAX_QI_PILLARS) {
      qiPillars.shift();
    }
    qiPillars.push({
      x: targetX,
      y: targetY + 28,
      topY: Math.max(120, targetY - 240),
      width: 48,
      alpha: 0.38,
      color: color === 'cyan' ? '56, 189, 248' : '250, 204, 21'
    });
    pushTribulationRing({
      x: targetX,
      y: targetY + 26,
      radius: 10,
      maxRadius: 84,
      alpha: 0.58,
      color: color === 'cyan' ? '56, 189, 248' : '250, 204, 21'
    });
    spawnLotusBurst(targetX, targetY, 6);
  }

  function spawnBlossomRainFX(count = 22) {
    window.sacredAudio.playLotusChime();
    const safeCount = Math.min(count, 24);
    const palette = ['#f472b6', '#fbcfe8', '#fb7185', '#fde047', '#f9a8d4'];
    for (let i = 0; i < safeCount; i++) {
      pushPetalCapped({
        x: 30 + Math.random() * 1020,
        y: -20 - Math.random() * 240,
        vx: 0.9 + (Math.random() - 0.35) * 2.2,
        vy: 7.2 + Math.random() * 5.6,
        size: 5 + Math.random() * 5,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.08,
        alpha: 0.9,
        fastFade: true,
        color: palette[i % palette.length]
      });
    }
  }

  function spawnSwordRainFX(targetX = 540, targetY = 760, count = 6, options = {}) {
    if (currentThemeId !== 7) return;
    const batchCount = Math.min(
      SWORD_RAIN_BATCH_MAX,
      Math.max(SWORD_RAIN_BATCH_MIN, Number(count) || 6)
    );
    const silent = Boolean(options && options.silent);

    if (swordRainQueue.length >= MAX_SWORD_RAIN_QUEUE) {
      // Hàng đợi đã đạt tối đa 8 đợt chờ: gộp vào đợt cuối cùng để không tích tụ gây trễ hoặc giật lag
      const lastBatch = swordRainQueue[swordRainQueue.length - 1];
      if (lastBatch) {
        lastBatch.targetX = Math.round((lastBatch.targetX + (Number(targetX) || 540)) / 2);
        lastBatch.targetY = Math.round((lastBatch.targetY + (Number(targetY) || 760)) / 2);
        lastBatch.count = Math.min(SWORD_RAIN_BATCH_MAX, Math.max(lastBatch.count, batchCount));
        if (!silent) lastBatch.silent = false;
      }
      processSwordRainQueue();
      return;
    }

    swordRainQueue.push({
      targetX: Number(targetX) || 540,
      targetY: Number(targetY) || 760,
      count: batchCount,
      silent
    });
    processSwordRainQueue();
  }

  function processSwordRainQueue() {
    if (currentThemeId !== 7) {
      swordRainQueue.length = 0;
      isSwordRainBatchActive = false;
      if (swordRainGapTimer) {
        clearTimeout(swordRainGapTimer);
        swordRainGapTimer = null;
      }
      return;
    }

    // Chỉ khi đợt mưa kiếm trước đã rơi xong hoàn toàn (flyingSwords.length === 0) và hết khoảng nghỉ giữa 2 đợt
    if (isSwordRainBatchActive || flyingSwords.length > 0 || swordRainGapTimer !== null) {
      return;
    }

    if (swordRainQueue.length === 0) {
      return;
    }

    const batch = swordRainQueue.shift();
    isSwordRainBatchActive = true;

    if (!batch.silent && window.sacredAudio && typeof window.sacredAudio.playSwordWhoosh === 'function') {
      window.sacredAudio.playSwordWhoosh();
    }

    const safeCount = Math.min(
      SWORD_RAIN_BATCH_MAX,
      Math.max(1, Number(batch.count) || SWORD_RAIN_BATCH_MIN)
    );
    for (let i = 0; i < safeCount; i++) {
      if (flyingSwords.length >= MAX_FLYING_SWORDS) break;
      const startX = 80 + Math.random() * 920;
      const startY = -55 - i * 36;
      const destX = Math.max(110, Math.min(970, batch.targetX + (Math.random() - 0.5) * 380));
      const destY = Math.max(420, Math.min(1760, batch.targetY + (Math.random() - 0.5) * 340));
      const angle = Math.atan2(destY - startY, destX - startX);
      const speed = 17.5 + Math.random() * 7.5;
      flyingSwords.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        destY,
        angle,
        alpha: 1.0,
        impacted: false,
        color: i % 2 === 0 ? '#38bdf8' : '#fde047'
      });
    }
  }

  function spawnDuelClashFX(x1, y1, x2, y2) {
    const midX = Math.round((x1 + x2) / 2);
    const midY = Math.round((y1 + y2) / 2 - 45);
    spawnQiPillarFX(x1, y1, 'cyan');
    spawnQiPillarFX(x2, y2, 'gold');
    spawnLightningTribulation(midX, midY, 2, 'gold', 1);
  }

  function renderTuTienCanvasLayer() {
    // 1. Hoa đào tiên giới rơi nhanh, thoáng mắt (tối đa 10 cánh trên màn hình để không che nhân vật)
    if (lotusPetals.length < 10 && Math.random() < 0.14) {
      const isRightCliff = Math.random() < 0.55;
      pushPetalCapped({
        x: isRightCliff ? 680 + Math.random() * 380 : Math.random() * 400,
        y: -15,
        vx: isRightCliff ? -1.1 - Math.random() * 1.2 : 0.9 + Math.random() * 1.2,
        vy: 5.2 + Math.random() * 3.6,
        size: 4.5 + Math.random() * 4.5,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.06,
        alpha: 0.85,
        fastFade: true,
        color: Math.random() < 0.72 ? '#f472b6' : '#fbcfe8'
      });
    }

    // Hạt linh khí vàng/lam bay ngược từ biển mây lên trời
    if (lotusPetals.length < 22 && Math.random() < 0.18) {
      pushPetalCapped({
        x: 90 + Math.random() * 900,
        y: 1200 + Math.random() * 680,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -2.2 - Math.random() * 2.2,
        size: 3 + Math.random() * 3.5,
        angle: 0,
        vAngle: 0,
        alpha: 0.85,
        isSparkle: true,
        color: Math.random() < 0.55 ? '#38bdf8' : '#fde047'
      });
    }

    // 2. Chớp sáng bầu trời khi Thiên Lôi giáng xuống
    if (skyFlashAlpha > 0.01) {
      ctx.save();
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 1200);
      skyGrad.addColorStop(0, `rgba(${skyFlashColor}, ${skyFlashAlpha.toFixed(3)})`);
      skyGrad.addColorStop(1, `rgba(${skyFlashColor}, 0)`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, 1200);
      ctx.restore();
      skyFlashAlpha *= 0.84;
    }

    // 3. Vẽ Cột Sáng Linh Khí Đột Phá (Qi Pillars - gọn nhẹ vừa phải quanh tu sĩ)
    for (let i = qiPillars.length - 1; i >= 0; i--) {
      const qp = qiPillars[i];
      qp.alpha -= 0.024;
      if (qp.alpha <= 0.01) {
        qiPillars.splice(i, 1);
        continue;
      }
      ctx.save();
      const topY = qp.topY || Math.max(120, qp.y - 240);
      const grad = ctx.createLinearGradient(qp.x - qp.width / 2, 0, qp.x + qp.width / 2, 0);
      grad.addColorStop(0, `rgba(${qp.color}, 0)`);
      grad.addColorStop(0.5, `rgba(${qp.color}, ${(qp.alpha * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${qp.color}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(qp.x - qp.width / 2, topY, qp.width, qp.y - topY);
      ctx.restore();
    }

    // 4. Vẽ Vòng Sóng Lôi Kiếp & Pháp Trận dưới chân tu sĩ (Không dùng shadowBlur để giữ 60FPS)
    for (let i = tribulationRings.length - 1; i >= 0; i--) {
      const tr = tribulationRings[i];
      tr.radius += 3.8;
      const p = tr.radius / tr.maxRadius;
      const curA = tr.alpha * (1 - p);
      if (p >= 1 || curA <= 0.01) {
        tribulationRings.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = `rgba(${tr.color}, ${curA.toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(tr.x, tr.y, tr.radius, tr.radius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Vẽ Tia Sét Thiên Lôi Độ Kiếp (Mảnh, thanh thoát, không gây chói & không dùng shadowBlur nặng GPU)
    const drawBoltPath = (pts) => {
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(pts[k].x, pts[k].y);
      }
      ctx.stroke();
    };

    for (let i = lightningBolts.length - 1; i >= 0; i--) {
      const lb = lightningBolts[i];
      lb.alpha -= lb.decay;
      if (lb.alpha <= 0.02) {
        lightningBolts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, lb.alpha * 0.55);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Lớp hào quang điện quang bên ngoài
      ctx.strokeStyle = lb.glowColor;
      ctx.lineWidth = 5.2;
      drawBoltPath(lb.mainPts);

      // Lõi tia sét trắng mảnh bên trong
      ctx.globalAlpha = Math.max(0, lb.alpha);
      ctx.strokeStyle = lb.coreColor;
      ctx.lineWidth = 1.8;
      drawBoltPath(lb.mainPts);

      // Các nhánh sét phụ mảnh
      ctx.strokeStyle = lb.glowColor;
      ctx.lineWidth = 1.2;
      lb.branches.forEach((br) => drawBoltPath(br));
      ctx.restore();
    }

    // 6. Vẽ Vạn Kiếm Quy Tông (Flying Immortal Swords - Không dùng shadowBlur nặng GPU)
    for (let i = flyingSwords.length - 1; i >= 0; i--) {
      const sw = flyingSwords[i];
      if (!sw.impacted) {
        sw.x += sw.vx;
        sw.y += sw.vy;
        if (sw.y >= sw.destY) {
          sw.impacted = true;
          pushTribulationRing({
            x: sw.x,
            y: sw.y,
            radius: 6,
            maxRadius: 65,
            alpha: 0.75,
            color: sw.color === '#38bdf8' ? '56, 189, 248' : '250, 204, 21'
          });
        }
      } else {
        sw.alpha -= 0.065;
      }

      if (sw.alpha <= 0.02) {
        flyingSwords.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.translate(sw.x, sw.y);
      ctx.rotate(sw.angle);

      // Đuôi kiếm khí phát sáng
      const trailGrad = ctx.createLinearGradient(-95, 0, 18, 0);
      trailGrad.addColorStop(0, 'rgba(255,255,255,0)');
      trailGrad.addColorStop(1, sw.color);
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(-95, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();

      // Thân thanh cổ kiếm trắng ánh kim
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(-10, -4.5);
      ctx.lineTo(-10, 4.5);
      ctx.closePath();
      ctx.fill();

      // Chắn kiếm vàng kim
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-14, -10, 4, 20);
      ctx.restore();
    }

    // Khi đợt mưa kiếm hiện tại đã rơi xong hoàn toàn (flyingSwords.length === 0), nghỉ ngắn rồi mới xử lý đợt kế tiếp trong hàng đợi
    if (isSwordRainBatchActive && flyingSwords.length === 0 && swordRainGapTimer === null) {
      swordRainGapTimer = setTimeout(() => {
        swordRainGapTimer = null;
        isSwordRainBatchActive = false;
        processSwordRainQueue();
      }, SWORD_RAIN_BATCH_GAP_MS);
    } else if (
      !isSwordRainBatchActive &&
      flyingSwords.length === 0 &&
      swordRainGapTimer === null &&
      swordRainQueue.length > 0
    ) {
      processSwordRainQueue();
    }

    // 7. Vẽ 8 Thanh Phi Kiếm Hộ Pháp bay lượn tuần tra thường trực trên bầu trời Tiên Môn (Không dùng shadowBlur)
    patrolSwords.forEach((ps) => {
      ps.phase += ps.speed;
      const x = ps.cx + Math.cos(ps.phase) * ps.rx;
      const y = ps.cy + Math.sin(ps.phase * 2) * ps.ry;
      const dx = -Math.sin(ps.phase) * ps.rx * ps.speed;
      const dy = Math.cos(ps.phase * 2) * 2 * ps.ry * ps.speed;
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.globalAlpha = 0.86;
      ctx.translate(x, y);
      ctx.rotate(angle);

      const trailGrad = ctx.createLinearGradient(-85, 0, 16, 0);
      trailGrad.addColorStop(0, 'rgba(255,255,255,0)');
      trailGrad.addColorStop(1, ps.color);
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(-85, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-8, -4);
      ctx.lineTo(-8, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.fillRect(-11, -8, 3.5, 16);
      ctx.restore();
    });

    // Thỉnh thoảng tự động phóng tia sét Lôi Kiếp nhỏ trên tầng mây để khung cảnh luôn sống động
    if (lightningBolts.length === 0 && Math.random() < 0.008) {
      const rx = 180 + Math.random() * 720;
      const ry = 380 + Math.random() * 480;
      const pts = generateLightningSegments(rx + (Math.random() - 0.5) * 160, -10, rx, ry, 55);
      lightningBolts.push({
        mainPts: pts,
        branches: [],
        alpha: 0.75,
        decay: 0.028,
        glowColor: '#38bdf8',
        coreColor: '#ffffff'
      });
    }

    // 8. Vẽ Vòng Pháp Trận Bát Quái xoay dưới chân tu sĩ khi Thăng Cấp (Bagua Arrays - Không dùng shadowBlur)
    for (let i = baguaArrays.length - 1; i >= 0; i--) {
      const bg = baguaArrays[i];
      bg.angle += 0.045;
      bg.alpha -= 0.011;
      if (bg.alpha <= 0.02) {
        baguaArrays.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, bg.alpha);
      ctx.translate(bg.x, bg.y);
      ctx.scale(1, 0.45);
      ctx.rotate(bg.angle);
      ctx.strokeStyle = bg.color;
      ctx.lineWidth = 3.8;

      ctx.beginPath();
      ctx.arc(0, 0, bg.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, bg.radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();

      // Vẽ 8 cạnh Bát Quái bên trong pháp trận
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * bg.radius * 0.72, Math.sin(a) * bg.radius * 0.72);
        ctx.lineTo(Math.cos(a) * bg.radius, Math.sin(a) * bg.radius);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 9. Vẽ Chữ Nổi +Tu Vi & ĐỘT PHÁ CẢNH GIỚI bay lên tại vị trí nhân vật (Xếp tầng gọn, viền đậm sắc nét không shadowBlur)
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.016;
      if (ft.alpha <= 0.02) {
        floatingTexts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = `900 ${Math.round(23 * ft.scale)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  // Hoa sen & đốm sáng Phật quang rơi nhẹ liên tục ở Mẫu 1 & Mẫu 3 (tối đa 22 hạt, không shadowBlur, 0% lag)
  const quybaiAmbientPetals = [];
  const MAX_QUYBAI_AMBIENT_PETALS = 22;
  const QUYBAI_PETAL_COLORS = ['#f9a8d4', '#fbcfe8', '#f472b6', '#fde047'];

  function createQuyBaiAmbientParticle(randomY = false) {
    const roll = Math.random();
    const kind = roll < 0.24 ? 'bloom' : roll < 0.44 ? 'mote' : 'petal';
    const color =
      kind === 'mote'
        ? '#fde047'
        : QUYBAI_PETAL_COLORS[Math.floor(Math.random() * QUYBAI_PETAL_COLORS.length)];
    return {
      x: 70 + Math.random() * 940,
      y: randomY ? 70 + Math.random() * 1450 : 60 + Math.random() * 55,
      vx: (Math.random() - 0.5) * 0.28,
      vy: kind === 'mote' ? 0.38 + Math.random() * 0.42 : 0.62 + Math.random() * 0.68,
      swayAmp: 0.35 + Math.random() * 0.48,
      swaySpeed: 0.0016 + Math.random() * 0.0014,
      phase: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      vAngle: (Math.random() - 0.5) * 0.018,
      size:
        kind === 'bloom'
          ? 7.5 + Math.random() * 3.2
          : kind === 'mote'
            ? 3.2 + Math.random() * 2.2
            : 6.5 + Math.random() * 4.2,
      alpha: 0.68 + Math.random() * 0.24,
      color,
      kind
    };
  }

  function renderQuyBaiAmbientPetals(now) {
    if (quybaiAmbientPetals.length === 0) {
      for (let k = 0; k < 14; k++) {
        quybaiAmbientPetals.push(createQuyBaiAmbientParticle(true));
      }
    } else if (quybaiAmbientPetals.length < MAX_QUYBAI_AMBIENT_PETALS && Math.random() < 0.16) {
      quybaiAmbientPetals.push(createQuyBaiAmbientParticle(false));
    }

    for (let i = quybaiAmbientPetals.length - 1; i >= 0; i--) {
      const ap = quybaiAmbientPetals[i];
      ap.y += ap.vy;
      ap.x += ap.vx + Math.sin(now * ap.swaySpeed + ap.phase) * ap.swayAmp;
      ap.angle += ap.vAngle;

      if (ap.y > 1650 || ap.x < -40 || ap.x > 1120) {
        quybaiAmbientPetals.splice(i, 1);
        continue;
      }

      const fadeIn = ap.y < 130 ? Math.max(0.15, (ap.y - 60) / 70) : 1;
      const fadeOut = ap.y > 1470 ? Math.max(0, 1 - (ap.y - 1470) / 180) : 1;
      const curAlpha = ap.alpha * fadeIn * fadeOut;
      if (curAlpha <= 0.02) continue;

      ctx.save();
      ctx.globalAlpha = curAlpha;
      ctx.translate(ap.x, ap.y);

      if (ap.kind === 'mote') {
        const pulse = 0.78 + 0.22 * Math.sin(now * 0.004 + ap.phase);
        ctx.fillStyle = 'rgba(253, 224, 71, 0.26)';
        ctx.beginPath();
        ctx.arc(0, 0, ap.size * 2.1 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, ap.size * 0.85, 0, Math.PI * 2);
        ctx.fill();
      } else if (ap.kind === 'bloom') {
        ctx.rotate(ap.angle);
        ctx.fillStyle = ap.color;
        for (let k = 0; k < 5; k++) {
          const a = (k * Math.PI * 2) / 5;
          ctx.save();
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(0, -ap.size * 0.62, ap.size * 0.42, ap.size * 0.78, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(0, 0, ap.size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.rotate(ap.angle);
        ctx.fillStyle = ap.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, ap.size * 0.56, ap.size, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.beginPath();
        ctx.ellipse(-ap.size * 0.12, -ap.size * 0.18, ap.size * 0.22, ap.size * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = performance.now();

    // Khi đang ở Mẫu 6 (Hồ Sen Phóng Sanh): Vẽ sóng nước, đàn Cá Chép / Cá Koi / Rùa Vàng bơi vĩnh viễn dưới hồ & Lá Sen nổi
    if (currentThemeId === 6) {
      renderPondCanvasLayer(now);
    } else if (currentThemeId === 7) {
      renderTuTienCanvasLayer(now);
    } else if (currentThemeId === 1 || currentThemeId === 3) {
      renderQuyBaiAmbientPetals(now);
    }

    if (currentThemeId !== 7 && Math.random() < 0.2) {
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
        p.alpha -= 0.028;
      } else if (p.fastFade) {
        p.alpha -= 0.011;
      }
      if (p.y > 1860 || p.x < -80 || p.x > 1160) {
        p.alpha = 0;
      }

      if (p.alpha <= 0.03) {
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

  let monkHighlightTimer = null;

  function showBubbleForUser(userId, text) {
    if (!userId || !text) return;
    activeBubbles.set(userId, text);

    if (currentSettings.freeRoamEnabled && currentThemeId !== 7) {
      const actor = freeRoamActors.get(userId);
      if (actor && actor.bubbleEl) {
        actor.bubbleEl.textContent = text;
        actor.bubbleEl.style.display = 'block';
      }
    }

    if (lastState) scheduleCrowdRender(lastState.meditators || []);

    const prevTimer = bubbleTimers.get(userId);
    if (prevTimer) clearTimeout(prevTimer);

    const tid = setTimeout(() => {
      bubbleTimers.delete(userId);
      activeBubbles.delete(userId);
      if (currentSettings.freeRoamEnabled && currentThemeId !== 7) {
        const actor = freeRoamActors.get(userId);
        if (actor && actor.bubbleEl) {
          actor.bubbleEl.style.display = 'none';
        }
      }
      if (lastState) scheduleCrowdRender(lastState.meditators || []);
    }, 5000);
    bubbleTimers.set(userId, tid);
  }

  function flashMonkCard(speech, speakAloud = false, options = {}) {
    if (speech) {
      monkSpeechText.textContent = speech;
    }
    monkGreetingCard.classList.remove('highlight');
    void monkGreetingCard.offsetWidth;
    monkGreetingCard.classList.add('highlight');
    if (monkHighlightTimer) clearTimeout(monkHighlightTimer);
    monkHighlightTimer = setTimeout(() => monkGreetingCard.classList.remove('highlight'), 2200);

    if (speakAloud && currentSettings.ttsEnabled !== false && speech) {
      window.sacredAudio.speakChant(speech, {
        withWoodenFish: options.withWoodenFish !== false,
        priority: Boolean(options.priority),
        author: options.author || 'Sư Thầy',
        tag: options.tag || '📿 ĐANG TỤNG NIỆM'
      });
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

  const shareToastQueue = [];
  let isShowingShareToast = false;
  let shareToastHideTimer = null;

  function showShareCelestialToast(payload, durationMs = 5200) {
    if (!payload) return;
    shareToastQueue.push({ payload, durationMs });
    if (!isShowingShareToast) {
      processNextShareToast();
    }
  }

  function processNextShareToast() {
    const toastEl = document.getElementById('share-celestial-toast');
    if (!toastEl || shareToastQueue.length === 0) {
      isShowingShareToast = false;
      if (toastEl) toastEl.classList.remove('active', 'pulse');
      return;
    }

    isShowingShareToast = true;
    const { payload, durationMs } = shareToastQueue.shift();
    const adaptiveDuration =
      shareToastQueue.length >= 4 ? 2400 : shareToastQueue.length >= 2 ? 3400 : durationMs;

    const ribbonEl = document.getElementById('share-toast-ribbon');
    const emblemEl = document.getElementById('share-toast-emblem');
    const avatarEl = document.getElementById('share-toast-avatar');
    const usernameEl = document.getElementById('share-toast-username');
    const actionEl = document.getElementById('share-toast-action');
    const subEl = document.getElementById('share-toast-sub');
    const rewardEl = document.getElementById('share-toast-reward');

    let ribbonText = '✨ LAN TỎA PHÁP ÂM · GIEO DUYÊN LÀNH ✨';
    let emblemText = '🪷';
    let actionText = 'vừa chia sẻ phiên LIVE!';
    let subText = 'Gieo duyên lành lan tỏa ánh sáng từ bi khắp mười phương';
    let rewardText = `+${payload.meritAdded || 3} CÔNG ĐỨC`;

    if (currentThemeId === 7) {
      ribbonText = '☯️ NGỌC GIẢN TRUYỀN ĐẠO · VẠN GIỚI TRIỀU TÔNG ☯️';
      emblemText = '🌸';
      actionText = 'vừa chia sẻ truyền đạo!';
      subText = payload.user?.realmName
        ? `Đạo hạnh tinh tiến · Cảnh giới: ${payload.user.realmName} · Toàn tông môn cùng hưởng linh khí`
        : 'Gieo đạo duyên khắp vạn giới · Linh khí tụ hội tiên môn';
      rewardText = `+${payload.tuViAdded || 80} TU VI`;
    } else if (currentThemeId === 6) {
      ribbonText = '🐟 LAN TỎA TỪ BI · PHÓNG SANH SONG NGƯ 🐟';
      emblemText = '🐟';
      actionText = 'vừa chia sẻ phiên LIVE!';
      subText = 'Phóng sanh cặp Cá Koi Vàng Cát Tường xuống Hồ Sen Tịnh Độ';
      rewardText = `+${payload.meritAdded || 3} CÔNG ĐỨC`;
    } else if (currentThemeId === 2 || currentThemeId === 4 || currentThemeId === 5) {
      ribbonText = '🌕 LAN TỎA PHÁP ÂM · ÁNH ĐẠO ĐÊM TRĂNG 🌕';
      emblemText = '🪷';
      actionText = 'vừa chia sẻ phiên LIVE!';
      subText = 'Hoa sen cát tường nở rộ · Hồi hướng bình an tới gia quyến';
      rewardText = `+${payload.meritAdded || 3} CÔNG ĐỨC`;
    }

    if (ribbonEl) ribbonEl.textContent = ribbonText;
    if (emblemEl) emblemEl.textContent = emblemText;
    if (avatarEl) {
      avatarEl.innerHTML = renderAvatarBadge(
        payload.user?.avatar,
        currentThemeId === 7 ? '☯' : '🪷',
        'pill-avatar-dot'
      );
    }
    if (usernameEl) {
      usernameEl.textContent = shortenName(payload.user?.nickname || 'Thiện Nhân', 16);
    }
    if (actionEl) actionEl.textContent = actionText;
    if (subEl) subEl.textContent = subText;
    if (rewardEl) rewardEl.textContent = rewardText;

    toastEl.classList.remove('pulse');
    void toastEl.offsetWidth;
    toastEl.classList.add('active', 'pulse');

    if (shareToastHideTimer) {
      clearTimeout(shareToastHideTimer);
    }
    shareToastHideTimer = setTimeout(() => {
      toastEl.classList.remove('active', 'pulse');
      setTimeout(processNextShareToast, 180);
    }, adaptiveDuration);
  }

  function handleEvent(type, payload) {
    switch (type) {
      case 'member': {
        if (currentThemeId === 7) {
          window.sacredAudio.playTuTienJoinSound();
          if (payload.user) {
            showBubbleForUser(payload.user.userId, 'Đạo hữu xin nhập môn ☯');
          }
          break;
        }
        window.sacredAudio.playWoodenFish(1);

        if (payload.user) {
          const incomingEntry = payload.chatEntry || {
            id: `member_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: payload.user.userId,
            nickname: payload.user.nickname,
            avatar: payload.user.avatar || '',
            content: 'Con xin vào chùa lễ Phật, cầu bình an 🙏'
          };
          recentChatMessages = [
            incomingEntry,
            ...recentChatMessages.filter(
              (c) => !c.isSeed && c.id !== incomingEntry.id
            )
          ].slice(0, 15);
          renderQuyBaiChatList(true);
        }

        const qLen = window.sacredAudio.getSpeechQueueLength
          ? window.sacredAudio.getSpeechQueueLength()
          : 0;
        const isTempleBusy =
          activeRunnersCount > 0 ||
          runnerQueue.length > 0 ||
          isBowingNow ||
          bowQueue.length > 0;
        if (!isTempleBusy) {
          flashMonkCard(payload.monkSpeech, qLen < 3, {
            priority: false,
            author: payload.user?.nickname || 'Phật Tử',
            tag: '🙏 VÀO CHÙA LỄ PHẬT'
          });
          if (payload.monkSpeech) {
            showTamBaoBanner(payload.monkSpeech, 4000);
          }
        }
        if (payload.user) {
          showBubbleForUser(payload.user.userId, 'Nam Mô A Di Đà Phật 🙏');
          if ((currentThemeId === 1 || currentThemeId === 3) && runnerQueue.length < 4) {
            triggerRunUpAndProstrate({
              user: payload.user,
              meritAdded: 1,
              commentText: 'Con xin vào chùa lễ Phật 🙏',
              monkSpeech: payload.monkSpeech
            });
          } else if (currentThemeId !== 6 && currentThemeId !== 7 && bowQueue.length < 3) {
            enqueueBowToBuddha({
              user: payload.user,
              meritAdded: 1,
              commentText: 'Con xin vào chùa lễ Phật 🙏',
              monkSpeech: payload.monkSpeech,
              tierName: '🙏 MỚI VÀO CHÙA LỄ PHẬT'
            });
          }
          if (currentSettings.freeRoamEnabled && currentThemeId !== 7) {
            enqueueFreeRoamUserAction({
              userId: payload.user.userId,
              type: 'member_enter'
            });
          }
        }
        break;
      }
      case 'chat': {
        if (payload.user && payload.content) {
          const incomingEntry = payload.chatEntry || {
            id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: payload.user.userId,
            nickname: payload.user.nickname,
            avatar: payload.user.avatar || '',
            content: payload.content
          };
          recentChatMessages = [
            incomingEntry,
            ...recentChatMessages.filter(
              (c) => !c.isSeed && c.id !== incomingEntry.id
            )
          ].slice(0, 15);
          renderQuyBaiChatList(true);
        }

        if (currentThemeId === 7) {
          // Ở chế độ Tu Tiên, mọi hiệu ứng và âm thanh đã xử lý tuần tự trong case 'tutien_event'
          if (payload.user && payload.content) {
            showBubbleForUser(payload.user.userId, payload.content);
          }
          break;
        }
        window.sacredAudio.playWoodenFish(1);

        if (payload.user) {
          showBubbleForUser(payload.user.userId, payload.content || 'nam mô');
          if (currentThemeId === 6) {
            // Mẫu 6 (Hồ Sen Phóng Sanh): Bình luận hiện lời khấn, không tự bước ra thả cá
            if (activeRunnersCount === 0 && runnerQueue.length === 0) {
              flashMonkCard(payload.monkSpeech, false);
              if (payload.monkSpeech) {
                showTamBaoBanner(payload.monkSpeech, 4500);
              }
            }
            break;
          }

          if (currentThemeId === 1 || currentThemeId === 3) {
            triggerRunUpAndProstrate({
              user: payload.user,
              meritAdded: payload.meritAdded || 1,
              commentText: payload.content,
              monkSpeech: payload.monkSpeech
            });
          } else if (currentThemeId !== 7) {
            enqueueBowToBuddha({
              user: payload.user,
              meritAdded: payload.meritAdded || 1,
              commentText: payload.content,
              monkSpeech: payload.monkSpeech,
              tierName: `💬 "${shortenName(payload.content, 26)}"`
            });
          }

          if (currentSettings.freeRoamEnabled && currentThemeId !== 7) {
            enqueueFreeRoamUserAction({
              userId: payload.user.userId,
              type: 'chat_bow'
            });
          }
        }
        break;
      }
      case 'tutien_event': {
        enqueueTuTienEvent(payload);
        break;
      }
      case 'top3_decree': {
        showTop3DecreeBanner(payload, 5600);
        break;
      }
      case 'sky_ride': {
        triggerSkySwordRide(payload);
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
        if (currentThemeId === 7) {
          const shouldSpeakGift =
            currentSettings.giftTtsEnabled !== false && currentSettings.ttsEnabled !== false;
          if (shouldSpeakGift && payload.dedicationText) {
            window.sacredAudio.speakChant(payload.dedicationText, {
              withWoodenFish: false,
              priority: true,
              author: payload.user?.nickname || 'Tiên Hữu',
              tag: '🎁 CỐNG HIẾN LINH THẠCH'
            });
          }
          break;
        }
        if (payload.user?.userId) {
          lastDonatedUserId = payload.user.userId;
          if (lastState) applyState(lastState);
        }
        window.sacredAudio.playGrandBell(1);
        showQuyBaiDonateToast(payload, 7200);

        const nick = payload.user?.nickname || 'Tín Chủ';
        const count = Math.max(1, Number(payload.meritAdded) || 1);
        const speechText =
          currentThemeId === 6
            ? payload.dedicationText || `${nick} đã phát tâm phóng sanh xuống Hồ Sen, tăng ${count} công đức.`
            : currentThemeId === 1 || currentThemeId === 3
              ? `${nick} đã dâng ${count} nén hương lên Tam Bảo. Chúc tâm như hoa sen, thanh tịnh giữa đời.`
              : payload.dedicationText;

        if (currentThemeId === 6) {
          triggerWalkOutAndReleaseFish({
            user: payload.user,
            giftName: payload.giftName,
            repeatCount: payload.repeatCount || 1,
            meritAdded: payload.meritAdded || 1,
            creatures: payload.releasedCreatures,
            creatureLabel: payload.creatureLabel || 'Cá Chép Đỏ Bình An',
            giftIconUrl: payload.giftIconUrl,
            monkSpeech: speechText
          });
        } else if (currentThemeId === 1 || currentThemeId === 3) {
          triggerRunUpAndProstrate({
            ...payload,
            monkSpeech: speechText
          });
        } else {
          enqueueBowToBuddha({
            ...payload,
            monkSpeech: speechText
          });
        }

        if (currentSettings.freeRoamEnabled && (currentThemeId === 1 || currentThemeId === 3) && payload.user?.userId) {
          enqueueFreeRoamUserAction({
            userId: payload.user.userId,
            type: 'gift_incense',
            count
          });
        }
        const shouldSpeakGift =
          currentSettings.giftTtsEnabled !== false && currentSettings.ttsEnabled !== false;
        if (shouldSpeakGift && speechText) {
          window.sacredAudio.speakChant(speechText, {
            withWoodenFish: true,
            priority: true,
            author: nick,
            tag: '🎁 CÔNG ĐỨC DÂNG LỄ'
          });
        }
        break;
      }
      case 'fish_released': {
        if (currentThemeId === 6) {
          triggerWalkOutAndReleaseFish({
            ...payload,
            monkSpeech: payload.dedicationText
          });
        } else {
          window.sacredAudio.playWaterSplash();
        }
        const shouldSpeakFish =
          currentSettings.giftTtsEnabled !== false && currentSettings.ttsEnabled !== false;
        if (shouldSpeakFish && payload.dedicationText) {
          window.sacredAudio.speakChant(payload.dedicationText, {
            withWoodenFish: true,
            priority: true,
            author: payload.user?.nickname || 'Phật Tử',
            tag: '🐟 PHÓNG SANH CÔNG ĐỨC'
          });
        }
        break;
      }
      case 'like': {
        if (currentThemeId === 7) {
          const nowLikeMs = performance.now();
          if (nowLikeMs - lastTribulationFxAt >= 900 && swordRainQueue.length < 2) {
            lastTribulationFxAt = nowLikeMs;
            spawnSwordRainFX(540, 820, 6);
            if (payload.lotusRainTriggered) {
              spawnLightningTribulation(540, 620, 2, 'gold', 1, { silent: true });
              spawnBlossomRainFX(20);
            }
          }
          break;
        }
        triggerWoodenFishVisual(payload.count || 15);
        if (payload.lotusRainTriggered) {
          window.sacredAudio.playLotusChime();
          spawnLotusRain(55);
        }
        break;
      }
      case 'share': {
        showShareCelestialToast(payload, 5200);
        if (payload.user?.userId) {
          showBubbleForUser(
            payload.user.userId,
            currentThemeId === 7
              ? '🌸 Truyền đạo vạn giới (+80 Tu Vi)!'
              : '🪷 Đã chia sẻ lan tỏa Pháp Âm (+3 công đức)'
          );
        }

        if (currentThemeId === 7) {
          window.sacredAudio.playTuTienJoinSound();
          window.sacredAudio.playSwordWhoosh();
          spawnBlossomRainFX(24);
          const seat = (payload.user && tutienSeatPositions.get(payload.user.userId)) || {
            x: 540,
            y: 1365
          };
          spawnQiPillarFX(seat.x, seat.y, 'gold');
          pushBaguaArray({
            x: seat.x,
            y: seat.y + 18,
            radius: 74,
            angle: 0,
            alpha: 0.95,
            color: '#fde047'
          });
          spawnSwordRainFX(seat.x, seat.y, 6);
          spawnFloatingTuTienText(
            seat.x,
            seat.y - 36,
            `🌸 TRUYỀN ĐẠO +${payload.tuViAdded || 80} TU VI`,
            '#fde047',
            1.15
          );
          break;
        }

        if (currentThemeId === 6) {
          window.sacredAudio.playLotusChime();
          spawnLotusRain(32);
          spawnLotusBurst(540, 1150, 24);
          triggerWalkOutAndReleaseFish({
            user: payload.user,
            giftName: 'Chia Sẻ Lan Tỏa Pháp Âm',
            isShare: true,
            commentText: 'Con xin chia sẻ lan tỏa Pháp Âm, phóng sanh Song Ngư xuống Hồ Sen 🙏',
            creatures: payload.releasedCreatures,
            creatureLabel: payload.creatureLabel || 'Song Ngư Cát Tường (2 Cá Koi Vàng)',
            monkSpeech: payload.monkSpeech
          });
          break;
        }

        if (currentThemeId === 2 || currentThemeId === 4 || currentThemeId === 5) {
          window.sacredAudio.playLotusChime();
          spawnLotusRain(36);
          spawnLotusBurst(540, 960, 26);
          enqueueBowToBuddha({
            user: payload.user,
            meritAdded: payload.meritAdded || 3,
            tierName: '🌸 CHIA SẺ LAN TỎA PHÁP ÂM',
            commentText: 'Con xin chia sẻ phiên LIVE lan tỏa ánh sáng từ bi 🙏',
            monkSpeech: payload.monkSpeech
          });
          break;
        }

        window.sacredAudio.playLotusChime();
        spawnLotusRain(36);
        spawnLotusBurst(540, 720, 28);
        triggerRunUpAndProstrate({
          user: payload.user,
          meritAdded: payload.meritAdded || 3,
          tierName: '🌸 LAN TỎA PHÁP ÂM',
          commentText: '🙏 Con xin chia sẻ lan tỏa Phật pháp',
          monkSpeech: payload.monkSpeech
        });
        if (currentSettings.freeRoamEnabled && payload.user?.userId) {
          if (!freeRoamActors.has(payload.user.userId) && lastState && Array.isArray(lastState.meditators)) {
            syncFreeRoamCrowd(lastState.meditators);
          }
          const actor = freeRoamActors.get(payload.user.userId);
          if (actor) {
            startActorBowSequence(actor, performance.now(), '🌸 Lan tỏa Pháp Âm');
          }
        }
        break;
      }
      case 'chant_start': {
        const text = payload.text || currentSettings.chantText;
        if (text) {
          showTamBaoBanner(text, 9000);
        }
        flashMonkCard(text, true, {
          priority: true,
          author: currentThemeId === 7 ? 'Chưởng Môn' : 'Sư Thầy',
          tag: currentThemeId === 7 ? '📜 KHẨU QUYẾT TU TIÊN' : '📿 ĐANG TỤNG KINH'
        });
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
