// 奶蛙云端养成网站 - 主应用状态机与 UI 交互控制器
(function () {
  'use strict';

  // Core State
  let token = localStorage.getItem('naiwa_token') || null;
  let currentUser = null;
  let currentPet = null;
  let shopCatalog = {};
  let feedMode = 'single'; // 'single' or 'batch'
  let pendingBatchItem = null;
  let currentPoseCursor = -1; // cycles 0..5 across the 6 NWP forms
  let cachedLeaderboards = null;
  let currentRankTab = 'weightList';

  let pet2d = null;
  let minigameMgr = new MinigameManager();
  let currentGameSession = null;
  let sleepIntervalId = null;

  // Web Audio Synthesizer (zero external audio dependencies)
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'boing') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.25);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'coin') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.setValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'splash') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.35);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.36);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (type === 'fanfare') {
      osc.type = 'square';
      [440, 554, 659, 880].forEach((freq, idx) => {
        const subOsc = audioCtx.createOscillator();
        const subGain = audioCtx.createGain();
        subOsc.connect(subGain);
        subGain.connect(audioCtx.destination);
        subOsc.frequency.setValueAtTime(freq, now + idx * 0.09);
        subGain.gain.setValueAtTime(0.18, now + idx * 0.09);
        subGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.2);
        subOsc.start(now + idx * 0.09);
        subOsc.stop(now + idx * 0.09 + 0.22);
      });
    } else if (type === 'munch') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  // API Request Wrapper
  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(endpoint, options);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '请求失败');
      }
      return data;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  // Toast Notification
  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '28px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = type === 'error' ? '#EF4444' : '#1E293B';
    toast.style.color = '#FFFFFF';
    toast.style.padding = '10px 22px';
    toast.style.borderRadius = '30px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '700';
    toast.style.boxShadow = '0 10px 28px rgba(0,0,0,0.22)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.3s ease';
    toast.innerText = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2600);
  }

  function showFloatingText(text, x, y) {
    if (!text) return;
    const elem = document.createElement('div');
    elem.className = 'floating-text';
    elem.innerText = text;
    elem.style.left = `${x || window.innerWidth / 2 - 40}px`;
    elem.style.top = `${y || window.innerHeight / 2 - 60}px`;
    document.body.appendChild(elem);
    setTimeout(() => elem.remove(), 1100);
  }

  // Active Action Tab Highlighting
  function setActiveActionTab(btnId) {
    document.querySelectorAll('.action-btn').forEach(btn => {
      if (btn.id === btnId) {
        btn.classList.add('primary');
      } else {
        btn.classList.remove('primary');
      }
    });
  }

  // Highlight active NWP 6-form pill button
  function setActivePosePill(poseIdx) {
    document.querySelectorAll('.pose-pill-btn').forEach(btn => {
      const p = parseInt(btn.getAttribute('data-pose'), 10);
      if (p === poseIdx) {
        btn.classList.add('bg-amber-400', 'text-stone-900', 'font-bold');
        btn.classList.remove('bg-stone-100', 'text-stone-600');
      } else {
        btn.classList.remove('bg-amber-400', 'text-stone-900', 'font-bold');
        btn.classList.add('bg-stone-100', 'text-stone-600');
      }
    });
  }

  window.addEventListener('DOMContentLoaded', async () => {
    pet2d = new Pet2DEngine('pet2d-canvas');
    window.onPet2DClick = (e) => handlePetPoke(null, e.clientX, e.clientY);

    bindUIEvents();
    startSleepCountdownTicker();

    if (token) {
      try {
        await loadPetData();
      } catch (e) {
        openAuthModal();
      }
    } else {
      openAuthModal();
    }
  });

  async function loadPetData() {
    const data = await apiCall('/api/pet');
    currentUser = data.user || null;
    currentPet = data.pet;
    shopCatalog = data.shopCatalog;
    renderPetUI();
  }

  // Render All UI Elements from currentPet
  function renderPetUI() {
    if (!currentPet) return;

    document.getElementById('header-pet-name').innerText = currentPet.pet_name;
    document.getElementById('header-level').innerText = `Lv.${currentPet.level}`;
    document.getElementById('header-coins').innerText = currentPet.coins;
    document.getElementById('header-weight').innerText = `${currentPet.weight} kg`;

    const ownerEl = document.getElementById('header-owner-name');
    if (ownerEl && currentUser) {
      ownerEl.innerText = currentUser.nickname || currentUser.username || '玩家';
    }

    // Daily Coin Cap Display
    const dailyCoins = currentPet.daily_coins || 0;
    const dailyCoinCap = currentPet.daily_coins_cap || 300;
    const coinCapEl = document.getElementById('header-daily-coins');
    if (coinCapEl) {
      coinCapEl.innerText = `${dailyCoins} / ${dailyCoinCap}`;
      coinCapEl.className = dailyCoins >= dailyCoinCap ? 'text-amber-600 font-black' : 'text-amber-600 font-bold';
    }

    // EXP Progress Bar & Daily EXP Cap Display
    const reqExp = currentPet.required_exp || (currentPet.level * 100);
    const curExp = currentPet.exp || 0;
    const expPct = Math.min(100, Math.max(0, Math.round((curExp / reqExp) * 100)));
    document.getElementById('header-exp-text').innerText = `${curExp} / ${reqExp} (${expPct}%)`;
    document.getElementById('bar-exp').style.width = `${expPct}%`;

    const dailyExp = currentPet.daily_exp || 0;
    const dailyExpCap = currentPet.daily_exp_cap || 500;
    const dailyEl = document.getElementById('header-daily-exp');
    dailyEl.innerText = `${dailyExp} / ${dailyExpCap}`;
    dailyEl.className = dailyExp >= dailyExpCap ? 'text-amber-600 font-black' : 'text-emerald-700 font-bold';

    // 4 Core Status Bars
    updateBar('bar-hunger', currentPet.hunger, '#FA5252');
    updateBar('bar-mood', currentPet.mood, '#40C057');
    updateBar('bar-clean', currentPet.cleanliness, '#228BE6');
    updateBar('bar-energy', currentPet.energy, '#FAB005');

    // Sleep Mode UI & Banner
    const sleepBanner = document.getElementById('sleep-info-banner');
    if (currentPet.is_sleeping === 1) {
      document.body.classList.add('sleeping-mode');
      document.getElementById('btn-sleep-text').innerText = '开灯唤醒';
      setActiveActionTab('btn-sleep');
      sleepBanner.classList.remove('hidden');
      updateSleepCountdownDisplay();
    } else {
      document.body.classList.remove('sleeping-mode');
      document.getElementById('btn-sleep-text').innerText = '关灯睡觉';
      sleepBanner.classList.add('hidden');
    }

    if (pet2d) pet2d.updatePetData(currentPet);
  }

  function updateBar(elemId, val, color) {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.style.width = `${Math.min(100, Math.max(0, val))}%`;
    el.style.backgroundColor = color;
    const txt = el.parentElement.parentElement.querySelector('.stat-value');
    if (txt) txt.innerText = `${val}/100`;
  }

  // Real-time 1-Second Sleep Recovery Ticker & Wake-up Clock
  function startSleepCountdownTicker() {
    if (sleepIntervalId) clearInterval(sleepIntervalId);
    let secTick = 0;

    sleepIntervalId = setInterval(async () => {
      if (!currentPet || currentPet.is_sleeping !== 1) return;
      secTick++;

      if (secTick % 6 === 0 && currentPet.energy < 100) {
        try {
          const data = await apiCall('/api/pet');
          currentPet = data.pet;
          renderPetUI();
        } catch (e) {}
      } else {
        updateSleepCountdownDisplay();
      }
    }, 1000);
  }

  function updateSleepCountdownDisplay() {
    if (!currentPet || currentPet.is_sleeping !== 1) return;
    const countdownEl = document.getElementById('sleep-countdown-text');
    const clockEl = document.getElementById('sleep-wake-clock');

    const missingEnergy = Math.max(0, 100 - currentPet.energy);
    if (missingEnergy <= 0) {
      countdownEl.innerHTML = '✨ <strong>精力已完全恢复满格 (100/100)！</strong>随时可以开灯唤醒奶蛙啦！';
      clockEl.innerText = '已睡饱满格 100%';
      return;
    }

    const elapsedSec = Math.floor(Math.max(0, Date.now() - (currentPet.last_updated || Date.now())) / 1000) % 6;
    const totalRemainingSec = Math.max(1, missingEnergy * 6 - elapsedSec);
    const mins = Math.floor(totalRemainingSec / 60);
    const secs = totalRemainingSec % 60;

    const wakeDate = new Date(Date.now() + totalRemainingSec * 1000);
    const hh = String(wakeDate.getHours()).padStart(2, '0');
    const mm = String(wakeDate.getMinutes()).padStart(2, '0');
    const ss = String(wakeDate.getSeconds()).padStart(2, '0');

    countdownEl.innerHTML = `⏳ 距离回满还需：<strong>${mins} 分 ${String(secs).padStart(2, '0')} 秒</strong> (当前精力 ${currentPet.energy}/100)`;
    clockEl.innerText = `⏰ 预计 ${hh}:${mm}:${ss} 满精力`;
  }

  // Handle Belly Poke & 6-Form Morph Switching
  async function handlePetPoke(explicitPoseIndex = null, clickX = null, clickY = null) {
    setActiveActionTab('btn-poke');

    if (!currentPet || currentPet.is_sleeping === 1) {
      setSpeech('呼……本蛙正在乖乖闭眼安睡呢 Zzz……');
      showToast('睡觉中奶蛙保持静止，请先开灯唤醒~');
      return;
    }

    if (typeof explicitPoseIndex === 'number') {
      currentPoseCursor = explicitPoseIndex % 6;
    } else {
      currentPoseCursor = (currentPoseCursor + 1) % 6;
    }

    setActivePosePill(currentPoseCursor);
    playSound('boing');

    if (pet2d) {
      pet2d.playNwpPose(currentPoseCursor, 3200);
      pet2d.spawnHeart(clickX, clickY);
    }

    try {
      const res = await apiCall('/api/pet/action', 'POST', {
        action: 'poke',
        poseIndex: currentPoseCursor
      });
      currentPet = res.pet;
      renderPetUI();
      setSpeech(res.speech);

      // When EXP is full, only show +X币 (never show "经验已满")
      const parts = [];
      if (res.actualCoinGain > 0) {
        parts.push(`+${res.actualCoinGain}币`);
      }
      if (res.actualExpGain > 0) {
        parts.push(`+${res.actualExpGain}经验`);
      }
      if (parts.length > 0) {
        showFloatingText(parts.join(' '), clickX, clickY);
      }

      if (res.leveledUp) {
        playSound('fanfare');
        showToast(`🎉 恭喜升级到 Lv.${currentPet.level}！奖励 +50 奶蛙币！`);
      }
    } catch (e) {}
  }

  function setSpeech(text) {
    const bubble = document.getElementById('speech-bubble');
    if (!bubble) return;
    bubble.innerText = text;
    bubble.style.opacity = '1';
  }

  function bindUIEvents() {
    // 6-Form Pose Selector Pills
    document.querySelectorAll('.pose-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const poseIdx = parseInt(btn.getAttribute('data-pose'), 10);
        handlePetPoke(poseIdx);
      });
    });

    // 5 Main Action Tab Buttons
    document.getElementById('btn-poke').addEventListener('click', () => {
      setActiveActionTab('btn-poke');
      handlePetPoke(null);
    });

    document.getElementById('btn-feed').addEventListener('click', () => {
      setActiveActionTab('btn-feed');
      openShopModal();
    });

    document.getElementById('btn-exercise').addEventListener('click', async () => {
      setActiveActionTab('btn-exercise');
      try {
        const res = await apiCall('/api/pet/action', 'POST', { action: 'exercise' });
        currentPet = res.pet;
        renderPetUI();
        setSpeech(res.speech);
        playSound('fanfare');
        const expPart = res.actualExpGain > 0 ? ` +${res.actualExpGain}经验` : '';
        showFloatingText(`-1.2kg${expPart}`);
        if (pet2d) pet2d.setState('running-right', 3000);
      } catch (e) {}
    });

    document.getElementById('btn-clean').addEventListener('click', async () => {
      setActiveActionTab('btn-clean');
      try {
        const res = await apiCall('/api/pet/action', 'POST', { action: 'clean' });
        currentPet = res.pet;
        renderPetUI();
        setSpeech(res.speech);
        playSound('splash');
        const expPart = res.actualExpGain > 0 ? ` +${res.actualExpGain}经验` : '';
        showFloatingText(`清洁满格!${expPart}`);
        if (pet2d) pet2d.triggerBath(5500);
      } catch (e) {}
    });

    document.getElementById('btn-sleep').addEventListener('click', async () => {
      setActiveActionTab('btn-sleep');
      try {
        const res = await apiCall('/api/pet/action', 'POST', { action: 'toggle_sleep' });
        currentPet = res.pet;
        renderPetUI();
        setSpeech(res.speech);
        playSound('boing');
      } catch (e) {}
    });

    // Single vs Batch Feed Mode Toggle in Shop
    const btnSingle = document.getElementById('btn-mode-single');
    const btnBatch = document.getElementById('btn-mode-batch');
    const modeDesc = document.getElementById('feed-mode-desc');

    btnSingle.addEventListener('click', () => {
      feedMode = 'single';
      btnSingle.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-white shadow-sm transition';
      btnBatch.className = 'px-3 py-1 rounded-lg text-xs font-semibold text-stone-600 hover:text-stone-900 transition';
      modeDesc.innerText = '单次模式：点击投喂后立即关闭弹窗，在主舞台播放投喂吃东西动画';
      renderShopItems();
    });

    btnBatch.addEventListener('click', () => {
      feedMode = 'batch';
      btnBatch.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-white shadow-sm transition';
      btnSingle.className = 'px-3 py-1 rounded-lg text-xs font-semibold text-stone-600 hover:text-stone-900 transition';
      modeDesc.innerText = '批量模式：点击投喂后询问投喂次数，确认后关闭弹窗并播放豪华投喂动画';
      renderShopItems();
    });

    // Batch Feed Dialog Controls
    const batchInput = document.getElementById('batch-count-input');
    document.getElementById('batch-minus').addEventListener('click', () => {
      batchInput.value = Math.max(1, parseInt(batchInput.value || 1, 10) - 1);
    });
    document.getElementById('batch-plus').addEventListener('click', () => {
      const maxVal = parseInt(batchInput.max || 99, 10);
      batchInput.value = Math.min(maxVal, parseInt(batchInput.value || 1, 10) + 1);
    });
    document.getElementById('batch-max').addEventListener('click', () => {
      batchInput.value = batchInput.max || 1;
    });
    document.getElementById('btn-confirm-batch-feed').addEventListener('click', async () => {
      if (!pendingBatchItem) return;
      const count = Math.max(1, parseInt(batchInput.value || 1, 10));
      document.getElementById('modal-batch-feed').classList.remove('active');
      await executeFeeding(pendingBatchItem, count);
    });

    // Rename Pet
    document.getElementById('btn-rename').addEventListener('click', async () => {
      const name = prompt('请输入奶蛙的新大名：', currentPet?.pet_name || '小奶蛙');
      if (name && name.trim()) {
        const res = await apiCall('/api/pet/action', 'POST', { action: 'rename', newName: name.trim() });
        currentPet = res.pet;
        renderPetUI();
        setSpeech(res.speech);
      }
    });

    // Switch Account / Register Button
    const switchAccBtn = document.getElementById('btn-switch-account');
    if (switchAccBtn) {
      switchAccBtn.addEventListener('click', () => openAuthModal());
    }

    // Bottom Navigation
    document.getElementById('nav-shop').addEventListener('click', () => openShopModal());
    document.getElementById('nav-minigame').addEventListener('click', () => openMinigamesModal());
    document.getElementById('nav-social').addEventListener('click', () => openSocialModal());
    document.getElementById('nav-ai-chat').addEventListener('click', () => toggleChatPanel());

    // Close Modal Buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-backdrop');
        if (modal) modal.classList.remove('active');
        if (currentGameSession) {
          currentGameSession.cleanup();
          currentGameSession = null;
        }
      });
    });

    // Leaderboard Tab Switcher
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rank-tab-btn').forEach(b => {
          b.className = 'rank-tab-btn flex-1 py-1.5 rounded-xl bg-stone-100 font-semibold text-xs text-stone-600';
        });
        btn.className = 'rank-tab-btn flex-1 py-1.5 rounded-xl bg-amber-400 font-bold text-xs text-stone-900 shadow-sm';
        currentRankTab = btn.getAttribute('data-rank');
        if (cachedLeaderboards) renderLeaderboards(cachedLeaderboards);
      });
    });

    // AI Chat Send
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // Execute Feeding (Closes Shop Dialog -> Plays Main Stage Animation)
  async function executeFeeding(itemId, count = 1) {
    try {
      const res = await apiCall('/api/pet/action', 'POST', {
        action: 'feed',
        itemId,
        count
      });
      currentPet = res.pet;
      renderPetUI();

      // Close shop dialog immediately so user sees the stage feeding animation!
      document.getElementById('modal-shop').classList.remove('active');
      document.getElementById('modal-batch-feed').classList.remove('active');

      playSound('munch');
      setSpeech(res.speech);

      const food = shopCatalog[itemId] || { icon: '🍢' };
      if (pet2d) {
        pet2d.triggerFeedAnimation(food.icon, count, itemId === 'chili');
      }

      const expStr = res.actualExpGain > 0 ? ` +${res.actualExpGain}经验` : '';
      showFloatingText(`${food.icon}×${count} 饱腹+${res.totalHunger}${expStr}`);

      if (res.leveledUp) {
        setTimeout(() => {
          playSound('fanfare');
          showToast(`🎉 升级啦！当前等级 Lv.${currentPet.level}，奖励 +50 奶蛙币！`);
        }, 500);
      }
    } catch (e) {}
  }

  // ----------------- Shop Modal Logic (Pure Food Shop) -----------------
  function openShopModal() {
    renderShopItems();
    document.getElementById('modal-shop').classList.add('active');
  }

  function renderShopItems() {
    const container = document.getElementById('shop-items-grid');
    container.innerHTML = '';

    const inventory = JSON.parse(currentPet?.inventory_json || '{}');

    Object.values(shopCatalog).forEach(item => {
      if (item.type !== 'food') return;

      const ownedCount = inventory[item.id] || 0;

      const card = document.createElement('div');
      card.className = 'glass-panel p-3.5 flex flex-col items-center justify-between gap-1.5 border-2 border-amber-200/60 hover:border-amber-400 transition-all';
      card.innerHTML = `
        <div class="text-4xl my-1">${item.icon}</div>
        <div class="font-bold text-sm text-stone-800">${item.name}</div>
        <div class="text-[11px] text-stone-500 text-center line-clamp-2">${item.desc}</div>
        <div class="flex items-center gap-2 font-bold text-amber-600 text-xs mt-0.5">
          <span>🪙 ${item.price} 币</span>
          <span class="text-stone-600 bg-amber-100 px-2 py-0.5 rounded-md">库存: ${ownedCount}</span>
        </div>
        <div class="w-full mt-2 flex gap-1.5">
          <button class="btn-buy-item flex-1 py-1.5 px-2 bg-amber-400 hover:bg-amber-500 rounded-xl font-bold text-xs shadow text-stone-900" data-id="${item.id}">
            +购买
          </button>
          <button class="btn-feed-item flex-1 py-1.5 px-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs shadow ${ownedCount <= 0 ? 'opacity-40 pointer-events-none' : ''}" data-id="${item.id}" data-owned="${ownedCount}">
            ${feedMode === 'batch' ? '🍱 批量投喂' : '🍽️ 单次投喂'}
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    // Buy handler
    container.querySelectorAll('.btn-buy-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await apiCall('/api/shop/buy', 'POST', { itemId: id, count: 1 });
          currentPet = res.pet;
          renderPetUI();
          renderShopItems();
          playSound('coin');
          showToast(res.message);
        } catch (e) {}
      });
    });

    // Feed handler (Single vs Batch)
    container.querySelectorAll('.btn-feed-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const owned = parseInt(btn.getAttribute('data-owned') || 0, 10);
        if (owned <= 0) return;

        if (feedMode === 'single') {
          await executeFeeding(id, 1);
        } else {
          pendingBatchItem = id;
          const food = shopCatalog[id];
          document.getElementById('batch-feed-icon').innerText = food.icon;
          document.getElementById('batch-feed-title').innerText = `批量投喂【${food.name}】`;
          document.getElementById('batch-feed-owned').innerText = `当前背包拥有: ${owned} 份`;
          const countInput = document.getElementById('batch-count-input');
          countInput.max = owned;
          countInput.value = Math.min(owned, 3);
          document.getElementById('modal-batch-feed').classList.add('active');
        }
      });
    });
  }

  // ----------------- Minigames Modal -----------------
  function openMinigamesModal(keepBanner = false) {
    document.getElementById('modal-minigames').classList.add('active');
    document.getElementById('game-select-view').style.display = 'block';
    document.getElementById('game-play-view').style.display = 'none';

    const banner = document.getElementById('minigame-result-banner');
    if (banner && !keepBanner) {
      banner.classList.add('hidden');
    }

    document.getElementById('btn-start-catch-food').onclick = () => launchCatchFood();
    document.getElementById('btn-start-poke-belly').onclick = () => launchPokeBelly();
  }

  function showMinigameSummary(titleText, subText) {
    const banner = document.getElementById('minigame-result-banner');
    const titleEl = document.getElementById('minigame-result-title');
    const subEl = document.getElementById('minigame-result-sub');
    if (banner && titleEl && subEl) {
      titleEl.innerText = titleText;
      subEl.innerText = subText;
      banner.classList.remove('hidden');
    }
  }

  function launchCatchFood() {
    document.getElementById('game-select-view').style.display = 'none';
    document.getElementById('game-play-view').style.display = 'block';
    document.getElementById('catch-food-wrapper').style.display = 'flex';
    document.getElementById('poke-belly-wrapper').style.display = 'none';

    currentGameSession = minigameMgr.startCatchFood('catch-food-canvas', async (res) => {
      playSound('fanfare');
      const reward = await apiCall('/api/minigame/reward', 'POST', {
        gameType: 'catch_food',
        score: res.score
      });
      currentPet = reward.pet;
      renderPetUI();
      showMinigameSummary(`⏰ 时间到！接食物得分：${res.score} 分`, reward.message);
      showToast(reward.message);
      openMinigamesModal(true);
    });
  }

  function launchPokeBelly() {
    document.getElementById('game-select-view').style.display = 'none';
    document.getElementById('game-play-view').style.display = 'block';
    document.getElementById('catch-food-wrapper').style.display = 'none';
    document.getElementById('poke-belly-wrapper').style.display = 'flex';

    currentGameSession = minigameMgr.startPokeBelly(
      'btn-belly-poke-target',
      'poke-belly-timer',
      'poke-belly-score',
      async (res) => {
        playSound('fanfare');
        const totalClicks = res.clicks ?? res.score;
        const reward = await apiCall('/api/minigame/reward', 'POST', {
          gameType: 'poke_belly',
          score: totalClicks
        });
        currentPet = reward.pet;
        renderPetUI();
        const clickMsg = `⏰ 时间到！你点击了 ${totalClicks} 次！`;
        showMinigameSummary(clickMsg, reward.message);
        showToast(`${clickMsg} ${reward.message}`);
        openMinigamesModal(true);
      }
    );
  }

  // ----------------- Social & Leaderboard Modal -----------------
  async function openSocialModal() {
    document.getElementById('modal-social').classList.add('active');
    cachedLeaderboards = await apiCall('/api/social/leaderboard');
    renderLeaderboards(cachedLeaderboards);
  }

  function renderLeaderboards(data) {
    const listElem = document.getElementById('leaderboard-list');
    listElem.innerHTML = '';

    const list = data[currentRankTab] || data.weightList || [];
    list.forEach((item, index) => {
      let metricBadge = `体重: ${item.weight} kg · Lv.${item.level}`;
      if (currentRankTab === 'levelList') {
        metricBadge = `等级: Lv.${item.level} · 体重: ${item.weight} kg`;
      } else if (currentRankTab === 'likesList') {
        metricBadge = `收到点赞: ❤️ ${item.likes_count || 0} 次 · Lv.${item.level}`;
      }

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-3 rounded-xl bg-amber-50 hover:bg-amber-100/70 border border-amber-200/60 transition-all';
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-full flex items-center justify-center font-black ${index === 0 ? 'bg-amber-400 text-stone-900 shadow' : 'bg-stone-200 text-stone-600'}">
            ${index + 1}
          </div>
          <div>
            <div class="font-bold text-stone-900 text-sm">${item.pet_name} <span class="text-xs font-normal text-stone-500">(@${item.nickname})</span></div>
            <div class="text-xs text-amber-700 font-semibold">${metricBadge}</div>
          </div>
        </div>
        <button class="py-1.5 px-3 bg-amber-400 hover:bg-amber-500 rounded-lg text-xs font-bold text-stone-900 shadow">
          串门访问 🚪
        </button>
      `;
      row.querySelector('button').addEventListener('click', () => visitUserRoom(item.user_id));
      listElem.appendChild(row);
    });
  }

  async function visitUserRoom(targetUserId) {
    const data = await apiCall(`/api/social/visit/${targetUserId}`);

    document.getElementById('modal-social').classList.remove('active');
    const visitModal = document.getElementById('modal-visit-room');
    visitModal.classList.add('active');

    document.getElementById('visit-title').innerText = `${data.user.nickname} 的奶蛙房间`;
    document.getElementById('visit-pet-info').innerText = `宠物名: ${data.pet.pet_name} · 体重: ${data.pet.weight} kg · 收到点赞: ${data.pet.likes_count}`;

    renderGuestbook(data.guestbook);

    document.getElementById('btn-visit-poke').onclick = async () => {
      const res = await apiCall('/api/social/interact', 'POST', {
        targetUserId,
        type: 'poke'
      });
      playSound('boing');
      showToast(res.feedback);
      currentPet = res.myPet;
      renderPetUI();
      renderGuestbook(res.guestbook);
    };

    document.getElementById('btn-visit-gift').onclick = async () => {
      const res = await apiCall('/api/social/interact', 'POST', {
        targetUserId,
        type: 'gift_food'
      });
      playSound('coin');
      showToast(res.feedback);
      currentPet = res.myPet;
      renderPetUI();
      renderGuestbook(res.guestbook);
    };

    document.getElementById('btn-visit-msg-send').onclick = async () => {
      const input = document.getElementById('visit-msg-input');
      const text = input.value.trim();
      if (!text) return;
      const res = await apiCall('/api/social/interact', 'POST', {
        targetUserId,
        type: 'message',
        content: text
      });
      input.value = '';
      showToast('留言已送达！');
      renderGuestbook(res.guestbook);
    };
  }

  function renderGuestbook(messages) {
    const container = document.getElementById('visit-guestbook-list');
    container.innerHTML = '';
    (messages || []).forEach(msg => {
      const item = document.createElement('div');
      item.className = 'p-2 rounded-lg bg-stone-100 text-xs text-stone-800 border-l-4 border-amber-400';
      item.innerHTML = `<strong>${msg.author_name}</strong>: ${msg.content}`;
      container.appendChild(item);
    });
  }

  // ----------------- AI Chat Panel (Server-Configured Only) -----------------
  function toggleChatPanel() {
    const panel = document.getElementById('ai-chat-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      if (pet2d && !currentPet?.is_sleeping) pet2d.setState('thinking', 3000);
      document.getElementById('chat-input').focus();
    }
  }

  async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    appendChatMessage('user', msg);
    input.value = '';

    if (pet2d && !currentPet?.is_sleeping) pet2d.setState('thinking');

    try {
      const res = await apiCall('/api/chat', 'POST', { message: msg });
      appendChatMessage('assistant', res.reply);
      setSpeech(res.reply);
      if (pet2d && !currentPet?.is_sleeping) pet2d.setState('waving', 2500);
      playSound('coin');
    } catch (e) {
      appendChatMessage('assistant', '呱哈哈~ 奶蛙刚打了个烤串饱嗝，请再说一遍吧！');
    }
  }

  function appendChatMessage(role, text) {
    const box = document.getElementById('chat-messages-box');
    const msgElem = document.createElement('div');
    msgElem.className = `flex gap-2 ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    msgElem.innerHTML = `
      <div class="max-w-[82%] p-3 rounded-2xl text-xs leading-relaxed ${role === 'user' ? 'bg-amber-400 text-stone-900 font-semibold rounded-br-none' : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-sm'}">
        ${text}
      </div>
    `;
    box.appendChild(msgElem);
    box.scrollTop = box.scrollHeight;
  }

  // ----------------- Authentication Modal -----------------
  function openAuthModal() {
    const modal = document.getElementById('modal-auth');
    modal.classList.add('active');

    document.getElementById('btn-guest-login').onclick = async () => {
      const res = await apiCall('/api/auth/guest', 'POST');
      token = res.token;
      localStorage.setItem('naiwa_token', token);
      modal.classList.remove('active');
      loadPetData();
      showToast(`欢迎体验！已为你领养【${res.pet.pet_name}】`);
    };

    document.getElementById('auth-submit-btn').onclick = async () => {
      const u = document.getElementById('auth-username').value.trim();
      const p = document.getElementById('auth-password').value.trim();
      const isReg = document.getElementById('auth-is-register').checked;

      if (!u || !p) {
        showToast('请输入用户名与密码', 'error');
        return;
      }

      const endpoint = isReg ? '/api/auth/register' : '/api/auth/login';
      const body = { username: u, password: p };
      if (isReg) {
        body.nickname = document.getElementById('auth-nickname').value.trim() || u;
        body.petName = document.getElementById('auth-petname').value.trim() || '小奶蛙';
      }

      try {
        const res = await apiCall(endpoint, 'POST', body);
        token = res.token;
        localStorage.setItem('naiwa_token', token);
        modal.classList.remove('active');
        loadPetData();
        showToast(isReg ? '注册成功！' : '登录成功！');
      } catch (e) {}
    };

    document.getElementById('auth-is-register').onchange = (e) => {
      const regFields = document.getElementById('auth-register-extra');
      const submitBtn = document.getElementById('auth-submit-btn');
      if (e.target.checked) {
        regFields.style.display = 'block';
        submitBtn.innerText = '立即注册开启养成';
      } else {
        regFields.style.display = 'none';
        submitBtn.innerText = '登录';
      }
    };
  }

})();
