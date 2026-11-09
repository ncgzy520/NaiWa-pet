// 奶蛙 2D 全形态序列帧、浴室搓澡场景与投喂动画渲染引擎
class Pet2DEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    this.width = this.canvas.width;
    this.height = this.canvas.height;

    // Spritesheet (192x208 grid, 9 rows)
    this.spritesheet = new Image();
    this.spritesheetLoaded = false;
    this.spritesheet.src = '/assets/web-spritesheet.png';
    this.spritesheet.onload = () => {
      this.spritesheetLoaded = true;
    };

    this.actions = {
      'idle': { row: 0, frames: 6, fps: 8 },
      'running-right': { row: 1, frames: 8, fps: 12 },
      'running-left': { row: 2, frames: 8, fps: 12 },
      'waving': { row: 3, frames: 4, fps: 7 },
      'jumping': { row: 4, frames: 5, fps: 9 },
      'failed': { row: 5, frames: 8, fps: 7 },
      'review': { row: 6, frames: 6, fps: 7 },
      'thinking': { row: 7, frames: 6, fps: 6 },
      'waiting': { row: 8, frames: 6, fps: 6 }
    };

    // 6 Distinct NWP Laugh / Morph Poses from 素材.nwp (0000.png ~ 0421.png)
    this.nwpPoseSegments = [
      { id: 0, name: '仰头抚肚笑', start: 10, end: 62 },
      { id: 1, name: '弯腰捧腹笑', start: 76, end: 114 },
      { id: 2, name: '挺肚摇摆笑', start: 122, end: 172 },
      { id: 3, name: '双手抱头笑疯', start: 188, end: 234 },
      { id: 4, name: '前仰后合锤肚', start: 248, end: 308 },
      { id: 5, name: '仰面躺地打滚', start: 350, end: 418 }
    ];
    this.currentPoseIndex = 0;
    this.nwpFrameCache = {}; // frameNum -> HTMLImageElement
    this.isPlayingNwpPose = false;
    this.nwpCurrentFrame = 10;

    // Preload initial pose segment immediately, then lazy-preload others
    this.preloadNwpRange(10, 62);
    setTimeout(() => {
      for (let seg of this.nwpPoseSegments.slice(1)) {
        this.preloadNwpRange(seg.start, seg.end, 2);
      }
    }, 600);

    // NWP Look & Blink & Still Sleep Frame
    this.lookFrames = [];
    this.lookIndex = 5;
    this.preloadNwpLookFrames();

    this.blinkFrames = [];
    this.blinkIndex = 0;
    this.isBlinking = false;
    this.nextBlinkTime = Date.now() + 3000;
    this.preloadNwpBlinkFrames();

    // Still closed-eye frame for sleeping (blink/0/03.png has completely closed eyes)
    this.sleepStillImg = new Image();
    this.sleepStillImg.src = '/assets/nwp/blink/0/03.png';

    this.idleImg = new Image();
    this.idleImg.src = '/assets/nwp/idle.png';

    // Animation state
    this.currentState = 'idle';
    this.currentFrame = 0;
    this.lastFrameTime = 0;
    this.stateTimer = null;

    // Bath mode state (Bathtub + Water waves + Shower + Rubber duck + Soap bubbles)
    this.isBathing = false;
    this.bathWavePhase = 0;
    this.bathTimer = null;
    this.bathBubbles = [];
    this.waterDrops = [];

    // Feed projectile animation state
    this.flyingFoods = [];

    // Physics jelly oscillation
    this.isBouncing = false;
    this.bounceTime = 0;

    // Pet status
    this.weight = 20.0;
    this.isSleeping = false;
    this.particles = [];

    this.initEvents();
    this.startLoop();
  }

  getNwpFrame(frameNum) {
    const clamped = Math.max(0, Math.min(421, Math.floor(frameNum)));
    if (!this.nwpFrameCache[clamped]) {
      const img = new Image();
      img.src = `/assets/nwp/laugh/${String(clamped).padStart(4, '0')}.png`;
      this.nwpFrameCache[clamped] = img;
    }
    return this.nwpFrameCache[clamped];
  }

  preloadNwpRange(start, end, step = 1) {
    for (let i = start; i <= end; i += step) {
      this.getNwpFrame(i);
    }
  }

  preloadNwpLookFrames() {
    for (let i = 0; i <= 10; i++) {
      const img = new Image();
      img.src = `/assets/nwp/look/${String(i).padStart(2, '0')}.png`;
      this.lookFrames.push(img);
    }
  }

  preloadNwpBlinkFrames() {
    for (let i = 0; i <= 6; i++) {
      const img = new Image();
      img.src = `/assets/nwp/blink/0/${String(i).padStart(2, '0')}.png`;
      this.blinkFrames.push(img);
    }
  }

  initEvents() {
    window.addEventListener('mousemove', (e) => {
      if (this.isSleeping) return;
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      if (this.currentState === 'idle' && !this.isPlayingNwpPose && rect.width > 0) {
        const ratio = Math.max(0, Math.min(1, clientX / rect.width));
        this.lookIndex = Math.floor(ratio * 10);
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (window.onPet2DClick) {
        window.onPet2DClick(e);
      }
    });
  }

  triggerBounce() {
    if (this.isSleeping) return;
    this.isBouncing = true;
    this.bounceTime = 0;
  }

  // Switch and play one of the 6 distinct NWP laugh poses
  playNwpPose(poseIndex, durationMs = 3200) {
    if (this.isSleeping) return;
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }

    const idx = ((poseIndex % this.nwpPoseSegments.length) + this.nwpPoseSegments.length) % this.nwpPoseSegments.length;
    this.currentPoseIndex = idx;
    const seg = this.nwpPoseSegments[idx];

    this.preloadNwpRange(seg.start, seg.end, 1);

    this.isPlayingNwpPose = true;
    this.nwpCurrentFrame = seg.start;
    this.triggerBounce();

    if (durationMs > 0) {
      this.stateTimer = setTimeout(() => {
        this.isPlayingNwpPose = false;
        this.currentState = 'idle';
      }, durationMs);
    }
    return seg;
  }

  // Trigger immersive Bathtub & Shower scene
  triggerBath(durationMs = 5500) {
    if (this.isSleeping) return;
    this.isBathing = true;
    this.isPlayingNwpPose = false;
    this.currentState = 'waving';
    this.triggerBounce();

    this.bathBubbles = [];
    for (let i = 0; i < 22; i++) {
      this.bathBubbles.push(this.createSoapBubble());
    }
    this.waterDrops = [];
    for (let i = 0; i < 35; i++) {
      this.waterDrops.push({
        x: this.width / 2 + (Math.random() - 0.5) * 110,
        y: 45 + Math.random() * 220,
        vy: 6 + Math.random() * 4,
        len: 8 + Math.random() * 8
      });
    }

    if (this.bathTimer) clearTimeout(this.bathTimer);
    this.bathTimer = setTimeout(() => {
      this.isBathing = false;
      this.currentState = 'idle';
    }, durationMs);
  }

  createSoapBubble() {
    return {
      x: this.width / 2 + (Math.random() - 0.5) * 210,
      y: this.height * 0.72 + (Math.random() - 0.5) * 60,
      r: 7 + Math.random() * 14,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -0.8 - Math.random() * 1.6,
      hue: Math.floor(Math.random() * 360),
      alpha: 0.65 + Math.random() * 0.25
    };
  }

  // Trigger Single or Batch Feeding Projectile Animation
  triggerFeedAnimation(foodIcon = '🍢', count = 1, isChili = false) {
    if (this.isSleeping) return;
    const visualCount = Math.min(10, Math.max(1, count));
    const targetX = this.width / 2;
    const targetY = this.height * 0.45;

    for (let i = 0; i < visualCount; i++) {
      const startX = i % 2 === 0 ? 45 + Math.random() * 50 : this.width - 45 - Math.random() * 50;
      const startY = this.height - 30;
      this.flyingFoods.push({
        icon: foodIcon,
        badge: i === 0 && count > 1 ? `×${count}` : '',
        startX,
        startY,
        targetX: targetX + (Math.random() - 0.5) * 30,
        targetY: targetY + (Math.random() - 0.5) * 20,
        progress: -i * 0.12,
        speed: 0.032,
        isChili
      });
    }

    this.setState('jumping', 2600);
  }

  setState(state, durationMs = 0) {
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }

    if (this.isSleeping) {
      this.isPlayingNwpPose = false;
      this.isBathing = false;
      this.currentState = 'idle';
      return;
    }

    if (state === 'bath') {
      this.triggerBath(durationMs || 5500);
      return;
    }

    if (state === 'laugh') {
      this.playNwpPose(this.currentPoseIndex, durationMs || 3200);
      return;
    }

    this.isPlayingNwpPose = false;
    this.currentState = this.actions[state] ? state : 'idle';
    this.currentFrame = 0;
    this.triggerBounce();

    if (durationMs > 0) {
      this.stateTimer = setTimeout(() => {
        this.isPlayingNwpPose = false;
        this.currentState = 'idle';
        this.currentFrame = 0;
      }, durationMs);
    }
  }

  spawnHeart(x, y) {
    if (this.isSleeping) return;
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: x || this.width / 2 + (Math.random() - 0.5) * 80,
        y: y || this.height / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4 - 2,
        life: 1.0,
        decay: 0.022 + Math.random() * 0.015,
        type: Math.random() > 0.4 ? '❤️' : '✨',
        size: 18 + Math.random() * 8
      });
    }
  }

  spawnFireParticles() {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: this.width / 2 + (Math.random() - 0.5) * 50,
        y: this.height * 0.42,
        vx: (Math.random() - 0.5) * 7,
        vy: -Math.random() * 6 - 3,
        life: 1.0,
        decay: 0.03,
        type: '🔥',
        size: 24 + Math.random() * 12
      });
    }
  }

  updatePetData(pet) {
    if (!pet) return;
    this.weight = pet.weight || 20.0;
    const wasSleeping = this.isSleeping;
    this.isSleeping = pet.is_sleeping === 1;

    if (this.isSleeping) {
      // Strictly freeze all motion when sleeping
      this.isBouncing = false;
      this.isPlayingNwpPose = false;
      this.isBathing = false;
      this.isBlinking = false;
      this.currentState = 'idle';
    } else if (wasSleeping && !this.isSleeping) {
      this.setState('waving', 2000);
    }
  }

  update(now) {
    this.bathWavePhase += 0.08;

    // Fat scale based on weight
    const fatScaleX = Math.min(1.38, Math.max(0.88, 1 + (this.weight - 20) * 0.009));

    // If sleeping: completely still (no bounce, no frame cycling), only gentle Zzz particles
    if (this.isSleeping) {
      if (now - this.lastFrameTime > 900) {
        this.lastFrameTime = now;
        this.particles.push({
          x: this.width / 2 + 25 + (Math.random() - 0.5) * 16,
          y: this.height * 0.36,
          vx: 0.6,
          vy: -1.1,
          life: 1.0,
          decay: 0.012,
          type: '💤',
          size: 20
        });
      }
      this.updateParticles();
      return { scaleX: fatScaleX, scaleY: 1.0 };
    }

    // Awake jelly bounce physics
    let scaleX = 1.0;
    let scaleY = 1.0;
    if (this.isBouncing) {
      this.bounceTime += 0.05;
      const decay = Math.exp(-this.bounceTime * 3.5);
      scaleX = 1 + 0.16 * Math.sin(this.bounceTime * 18) * decay;
      scaleY = 1 - 0.13 * Math.sin(this.bounceTime * 18) * decay;
      if (decay < 0.02) {
        this.isBouncing = false;
        scaleX = 1.0;
        scaleY = 1.0;
      }
    }

    // Auto-blink in idle state
    if (this.currentState === 'idle' && !this.isPlayingNwpPose) {
      if (!this.isBlinking && Date.now() > this.nextBlinkTime) {
        this.isBlinking = true;
        this.blinkIndex = 0;
      }
      if (this.isBlinking && now - this.lastFrameTime > 70) {
        this.blinkIndex++;
        if (this.blinkIndex >= this.blinkFrames.length) {
          this.isBlinking = false;
          this.blinkIndex = 0;
          this.nextBlinkTime = Date.now() + 3200 + Math.random() * 3500;
        }
      }
    } else {
      this.isBlinking = false;
    }

    // Step NWP pose frames or Spritesheet frames
    const fps = this.isPlayingNwpPose ? 26 : (this.actions[this.currentState]?.fps || 8);
    const interval = 1000 / fps;

    if (now - this.lastFrameTime > interval) {
      this.lastFrameTime = now;
      if (this.isPlayingNwpPose) {
        const seg = this.nwpPoseSegments[this.currentPoseIndex];
        this.nwpCurrentFrame++;
        if (this.nwpCurrentFrame > seg.end) {
          this.nwpCurrentFrame = seg.start;
        }
      } else {
        const action = this.actions[this.currentState] || this.actions.idle;
        this.currentFrame = (this.currentFrame + 1) % action.frames;
      }
    }

    // Update Bath Bubbles & Shower Drops
    if (this.isBathing) {
      for (let b of this.bathBubbles) {
        b.x += b.vx + Math.sin(this.bathWavePhase + b.r) * 0.4;
        b.y += b.vy;
        if (b.y < 60) {
          Object.assign(b, this.createSoapBubble());
          b.y = this.height * 0.75;
        }
      }
      for (let d of this.waterDrops) {
        d.y += d.vy;
        if (d.y > this.height * 0.72) {
          d.y = 48;
          d.x = this.width / 2 + (Math.random() - 0.5) * 100;
        }
      }
    }

    // Update Flying Food Projectiles
    for (let i = this.flyingFoods.length - 1; i >= 0; i--) {
      const f = this.flyingFoods[i];
      f.progress += f.speed;
      if (f.progress >= 1.0) {
        this.triggerBounce();
        if (f.isChili) this.spawnFireParticles();
        this.particles.push({
          x: f.targetX + (Math.random() - 0.5) * 30,
          y: f.targetY - 20,
          vx: (Math.random() - 0.5) * 3,
          vy: -2.5,
          life: 1.0,
          decay: 0.025,
          type: '😋',
          size: 24
        });
        this.flyingFoods.splice(i, 1);
      }
    }

    this.updateParticles();
    return { scaleX: scaleX * fatScaleX, scaleY };
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(scales) {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Soft Stage Rug / Mat
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(254, 243, 199, 0.55)';
    this.ctx.strokeStyle = 'rgba(245, 158, 11, 0.32)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.ellipse(this.width / 2, this.height * 0.87, 125, 26, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();

    // 2. If Bathing, render Rear Showerhead & Water Drops behind/around Naiwa
    if (this.isBathing) {
      this.renderBathBackground();
    }

    const { scaleX, scaleY } = scales;
    const cx = this.width / 2;
    const cy = this.height * 0.62;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.scale(scaleX, scaleY);

    // Ground shadow
    this.ctx.beginPath();
    this.ctx.ellipse(0, 142, 78 * scaleX, 18, 0, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    this.ctx.fill();

    const drawW = 260;
    const drawH = 290;
    const dx = -drawW / 2;
    const dy = -drawH / 2;

    let drewFrame = false;

    // A. Sleeping Mode: Strictly static closed-eye frame (no movement!)
    if (this.isSleeping) {
      if (this.sleepStillImg.complete && this.sleepStillImg.naturalWidth > 0) {
        this.ctx.drawImage(this.sleepStillImg, dx, dy - 16, drawW, drawH + 16);
        drewFrame = true;
      } else if (this.spritesheetLoaded) {
        this.ctx.drawImage(this.spritesheet, 2 * 192, 0, 192, 208, dx, dy, drawW, drawH);
        drewFrame = true;
      }
      this.renderSleepingBlanket();
    }
    // B. Multi-Pose NWP Laugh / Morph Sequence
    else if (this.isPlayingNwpPose) {
      const img = this.getNwpFrame(this.nwpCurrentFrame);
      if (img && img.complete && img.naturalWidth > 0) {
        this.ctx.drawImage(img, dx, dy - 16, drawW, drawH + 16);
        drewFrame = true;
      }
    }
    // C. Awake Idle Mode with Blink & Gaze Tracking
    else if (this.currentState === 'idle') {
      if (this.isBlinking && this.blinkFrames[this.blinkIndex]?.complete) {
        this.ctx.drawImage(this.blinkFrames[this.blinkIndex], dx, dy - 16, drawW, drawH + 16);
        drewFrame = true;
      } else if (this.lookFrames[this.lookIndex]?.complete) {
        this.ctx.drawImage(this.lookFrames[this.lookIndex], dx, dy - 16, drawW, drawH + 16);
        drewFrame = true;
      } else if (this.idleImg?.complete) {
        this.ctx.drawImage(this.idleImg, dx, dy - 16, drawW, drawH + 16);
        drewFrame = true;
      }
    }

    // D. Fallback / Action Spritesheet Frame
    if (!drewFrame && this.spritesheetLoaded) {
      const action = this.actions[this.currentState] || this.actions.idle;
      const sx = this.currentFrame * 192;
      const sy = action.row * 208;
      this.ctx.drawImage(this.spritesheet, sx, sy, 192, 208, dx, dy, drawW, drawH);
    }

    this.ctx.restore();

    // 3. If Bathing, render Foreground Porcelain Bathtub, Animated Water Waves, Rubber Duck & Bubbles
    if (this.isBathing) {
      this.renderBathForeground();
    }

    // 4. Render Flying Food Projectiles
    this.renderFlyingFoods();

    // 5. Render Floating Particles
    this.renderParticles();
  }

  renderSleepingBlanket() {
    const ctx = this.ctx;
    ctx.save();
    const grad = ctx.createLinearGradient(-85, 20, 85, 130);
    grad.addColorStop(0, '#60A5FA');
    grad.addColorStop(1, '#3B82F6');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#1E3A8A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-82, 45);
    ctx.quadraticCurveTo(0, 22, 82, 45);
    ctx.lineTo(88, 122);
    ctx.quadraticCurveTo(0, 138, -88, 122);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#EFF6FF';
    ctx.beginPath();
    ctx.moveTo(-82, 45);
    ctx.quadraticCurveTo(0, 22, 82, 45);
    ctx.quadraticCurveTo(0, 38, -82, 58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FDE047';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⭐   🌙   ⭐', 0, 88);
    ctx.restore();
  }

  renderBathBackground() {
    const ctx = this.ctx;
    ctx.save();
    const cx = this.width / 2;

    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx + 80, 15);
    ctx.lineTo(cx + 80, 35);
    ctx.quadraticCurveTo(cx + 80, 20, cx, 28);
    ctx.stroke();

    ctx.fillStyle = '#CBD5E1';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, 34, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const d of this.waterDrops) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderBathForeground() {
    const ctx = this.ctx;
    ctx.save();
    const cx = this.width / 2;
    const tubTopY = this.height * 0.67;
    const tubBottomY = this.height * 0.91;
    const tubHalfW = 142;

    // 1. Animated Translucent Blue Water Waves inside Tub
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - tubHalfW + 8, tubTopY + 8);
    for (let x = -tubHalfW + 8; x <= tubHalfW - 8; x += 10) {
      const wy = tubTopY + Math.sin((x * 0.05) + this.bathWavePhase) * 6;
      ctx.lineTo(cx + x, wy);
    }
    ctx.lineTo(cx + tubHalfW - 18, tubBottomY);
    ctx.lineTo(cx - tubHalfW + 18, tubBottomY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.52)';
    ctx.fill();
    ctx.restore();

    // 2. White Fluffy Foam Clusters along Water Rim
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#BAE6FD';
    ctx.lineWidth = 2;
    for (let x = -tubHalfW + 22; x <= tubHalfW - 22; x += 26) {
      const fy = tubTopY + Math.sin((x * 0.06) + this.bathWavePhase) * 4;
      ctx.beginPath();
      ctx.arc(cx + x, fy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Cute Floating Yellow Rubber Duck
    const duckX = cx + 82;
    const duckY = tubTopY - 6 + Math.sin(this.bathWavePhase * 1.2) * 5;
    ctx.font = '34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🦆', duckX, duckY);

    // 4. Porcelain White Bathtub Body
    const tubGrad = ctx.createLinearGradient(cx, tubTopY, cx, tubBottomY);
    tubGrad.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
    tubGrad.addColorStop(1, 'rgba(226, 232, 240, 0.95)');
    ctx.fillStyle = tubGrad;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3.5;

    ctx.beginPath();
    ctx.moveTo(cx - tubHalfW, tubTopY + 10);
    ctx.lineTo(cx + tubHalfW, tubTopY + 10);
    ctx.quadraticCurveTo(cx + tubHalfW - 6, tubBottomY + 6, cx + tubHalfW - 38, tubBottomY + 6);
    ctx.lineTo(cx - tubHalfW + 38, tubBottomY + 6);
    ctx.quadraticCurveTo(cx - tubHalfW + 6, tubBottomY + 6, cx - tubHalfW, tubTopY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rolled Bathtub Lip Rim
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.roundRect(cx - tubHalfW - 8, tubTopY + 2, (tubHalfW + 8) * 2, 14, 8);
    ctx.fill();
    ctx.stroke();

    // Gold Claw Feet
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(cx - tubHalfW + 42, tubBottomY + 10, 8, 0, Math.PI * 2);
    ctx.arc(cx + tubHalfW - 42, tubBottomY + 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Label on Bathtub
    ctx.fillStyle = '#0284C7';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛁 奶蛙泡泡浴 SPA', cx, (tubTopY + tubBottomY) / 2 + 12);

    // 5. Floating Iridescent Soap Bubbles
    for (const b of this.bathBubbles) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${b.hue}, 85%, 85%, 0.35)`;
      ctx.strokeStyle = `hsla(${b.hue}, 90%, 60%, ${b.alpha})`;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  renderFlyingFoods() {
    const ctx = this.ctx;
    for (const f of this.flyingFoods) {
      if (f.progress < 0) continue;
      const t = Math.min(1, f.progress);
      const x = f.startX + (f.targetX - f.startX) * t;
      const arcHeight = -110 * Math.sin(Math.PI * t);
      const y = f.startY + (f.targetY - f.startY) * t + arcHeight;
      const scale = 1 + 0.35 * Math.sin(Math.PI * t);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.font = '38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 8;
      ctx.fillText(f.icon, 0, 0);

      if (f.badge) {
        ctx.fillStyle = '#EF4444';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.font = '900 18px sans-serif';
        ctx.strokeText(f.badge, 24, -16);
        ctx.fillText(f.badge, 24, -16);
      }
      ctx.restore();
    }
  }

  renderParticles() {
    for (const p of this.particles) {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.font = `${p.size}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(p.type, p.x, p.y);
      this.ctx.restore();
    }
  }

  startLoop() {
    const loop = (time) => {
      const scales = this.update(time);
      this.render(scales);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.Pet2DEngine = Pet2DEngine;
