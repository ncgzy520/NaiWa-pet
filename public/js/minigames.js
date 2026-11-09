// 奶蛙内置小游戏系统：《奶蛙接食物大作战》与《狂戳大肚皮》
class MinigameManager {
  constructor() {
    this.activeGame = null;
    this.spritesheet = new Image();
    this.spritesheet.src = '/assets/web-spritesheet.png';

    // Preload NWP belly laugh frames for《狂戳大肚皮手速王》
    this.pokeFrameUrls = [
      '/assets/nwp/laugh/0025.png',
      '/assets/nwp/laugh/0090.png',
      '/assets/nwp/laugh/0150.png',
      '/assets/nwp/laugh/0210.png',
      '/assets/nwp/laugh/0275.png',
      '/assets/nwp/laugh/0380.png'
    ];
    this.pokeFrameUrls.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }

  // ================= 游戏 1：奶蛙接食物大作战 =================
  startCatchFood(canvasId, onFinish) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    let timeLeft = 30;
    let score = 0;
    let gameOver = false;
    let shakeAmount = 0;

    // Player Naiwa
    const player = {
      x: W / 2 - 40,
      y: H - 110,
      w: 80,
      h: 90,
      vx: 0,
      speed: 7,
      direction: 'idle', // 'left', 'right', 'idle'
      frame: 0
    };

    // Falling items
    const items = [];
    const itemTypes = [
      { type: 'skewers', icon: '🍢', score: 10, speed: 3.0, prob: 0.35 },
      { type: 'drumstick', icon: '🍗', score: 15, speed: 3.5, prob: 0.25 },
      { type: 'milktea', icon: '🧋', score: 12, speed: 2.8, prob: 0.20 },
      { type: 'bomb', icon: '💣', score: -20, speed: 4.2, prob: 0.12, isHazard: true },
      { type: 'dumbbell', icon: '🏋️', score: -10, speed: 4.8, prob: 0.08, isHazard: true }
    ];

    // Controls
    const keys = {};
    const onKeyDown = (e) => { keys[e.code] = true; };
    const onKeyUp = (e) => { keys[e.code] = false; };
    const onTouchMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const touchX = (e.touches[0].clientX - rect.left) * (W / rect.width);
      player.x = Math.max(0, Math.min(W - player.w, touchX - player.w / 2));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });

    // Spawn timer
    let spawnTimer = 0;
    let frameCount = 0;

    // 1-second interval timer
    const clockInterval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
      } else {
        gameOver = true;
        clearInterval(clockInterval);
        cleanup();
        if (onFinish) onFinish({ score: Math.max(0, score) });
      }
    }, 1000);

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchmove', onTouchMove);
      cancelAnimationFrame(animId);
      clearInterval(clockInterval);
    };

    let animId;
    const loop = () => {
      if (gameOver) return;

      frameCount++;
      ctx.save();

      // Screen shake
      if (shakeAmount > 0) {
        ctx.translate((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);
        shakeAmount *= 0.9;
        if (shakeAmount < 0.5) shakeAmount = 0;
      }

      // Background
      ctx.fillStyle = '#FFF9DB';
      ctx.fillRect(0, 0, W, H);

      // Floor line
      ctx.fillStyle = '#FFE066';
      ctx.fillRect(0, H - 24, W, 24);

      // Move player
      player.direction = 'idle';
      if (keys['ArrowLeft'] || keys['KeyA']) {
        player.x -= player.speed;
        player.direction = 'left';
      }
      if (keys['ArrowRight'] || keys['KeyD']) {
        player.x += player.speed;
        player.direction = 'right';
      }
      player.x = Math.max(0, Math.min(W - player.w, player.x));

      // Spawn falling items
      spawnTimer++;
      if (spawnTimer > 35) {
        spawnTimer = 0;
        const rand = Math.random();
        let cumulative = 0;
        let chosen = itemTypes[0];
        for (const it of itemTypes) {
          cumulative += it.prob;
          if (rand <= cumulative) {
            chosen = it;
            break;
          }
        }
        items.push({
          ...chosen,
          x: Math.random() * (W - 40) + 10,
          y: -30,
          size: 28
        });
      }

      // Update & draw items
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += item.speed;

        ctx.font = `${item.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(item.icon, item.x, item.y);

        // Check collision with Naiwa
        if (
          item.y + item.size / 2 >= player.y &&
          item.y - item.size / 2 <= player.y + player.h &&
          item.x >= player.x - 10 &&
          item.x <= player.x + player.w + 10
        ) {
          score += item.score;
          if (item.isHazard) {
            shakeAmount = 14;
          }
          items.splice(i, 1);
          continue;
        }

        // Remove out-of-bounds items
        if (item.y > H + 20) {
          items.splice(i, 1);
        }
      }

      // Draw Naiwa
      if (this.spritesheet.complete) {
        let row = 0; // idle
        let frames = 6;
        if (player.direction === 'left') {
          row = 2; // running-left
          frames = 8;
        } else if (player.direction === 'right') {
          row = 1; // running-right
          frames = 8;
        }
        const frameIdx = Math.floor(frameCount / 6) % frames;
        ctx.drawImage(
          this.spritesheet,
          frameIdx * 192,
          row * 208,
          192,
          208,
          player.x,
          player.y,
          player.w,
          player.h
        );
      }

      // Draw UI Header (Score & Time)
      ctx.fillStyle = '#212529';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🍢 得分: ${score}`, 16, 32);

      ctx.textAlign = 'right';
      ctx.fillStyle = timeLeft <= 5 ? '#E03131' : '#212529';
      ctx.fillText(`⏱️ 倒计时: ${timeLeft}s`, W - 16, 32);

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return { cleanup };
  }

  // ================= 游戏 2：狂戳大肚皮手速王 =================
  startPokeBelly(buttonId, timerElemId, scoreElemId, onFinish) {
    const btn = document.getElementById(buttonId);
    const timerElem = document.getElementById(timerElemId);
    const scoreElem = document.getElementById(scoreElemId);
    const pokeImg = document.getElementById('belly-poke-img');

    let timeLeft = 12;
    let clickCount = 0;
    let gameOver = false;

    if (timerElem) timerElem.innerText = `⏱️ ${timeLeft}s`;
    if (scoreElem) scoreElem.innerHTML = `🔥 已点击: <strong>0</strong> 次`;
    if (pokeImg) pokeImg.src = '/assets/nwp/idle.png';

    const onBtnClick = () => {
      if (gameOver) return;
      clickCount++;

      if (scoreElem) {
        scoreElem.innerHTML = `🔥 已点击: <strong>${clickCount}</strong> 次`;
      }

      if (pokeImg && this.pokeFrameUrls.length > 0) {
        pokeImg.src = this.pokeFrameUrls[clickCount % this.pokeFrameUrls.length];
      }

      // Squash animation on button
      btn.classList.remove('jelly-active');
      void btn.offsetWidth;
      btn.classList.add('jelly-active');
    };

    btn.addEventListener('click', onBtnClick);

    const clock = setInterval(() => {
      timeLeft--;
      if (timerElem) timerElem.innerText = `⏱️ ${timeLeft}s`;

      if (timeLeft <= 0) {
        gameOver = true;
        clearInterval(clock);
        btn.removeEventListener('click', onBtnClick);
        if (onFinish) onFinish({ score: clickCount, clicks: clickCount });
      }
    }, 1000);

    return {
      cleanup: () => {
        clearInterval(clock);
        btn.removeEventListener('click', onBtnClick);
      }
    };
  }
}

window.MinigameManager = MinigameManager;
