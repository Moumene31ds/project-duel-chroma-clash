import { Particle, TrailPoint } from './types';

export class JuiceEngine {
  private trauma: number = 0;
  private maxOffset: number = 24; // max pixel shake
  private maxRoll: number = 0.05; // max radians
  private decayRate: number = 1.6; // trauma decay per second
  private shakeTime: number = 0;

  // Flash & Chromatic Aberration
  private flashColor: string = '#ffffff';
  private flashAlpha: number = 0;
  private flashDecay: number = 5.0;

  // Bullet-Time Slow Motion
  public timeScale: number = 1.0;
  private slowMoTimer: number = 0;

  // Shockwaves
  private shockwaves: Array<{
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    color: string;
    width: number;
    alpha: number;
  }> = [];

  // Particle Pool (Pre-allocated 500 particles for 0-allocation runtime)
  private particlePool: Particle[] = [];
  private activeParticles: Particle[] = [];
  private poolCapacity: number = 500;

  // Trails
  private trails: Map<string, TrailPoint[]> = new Map();

  // Cached static background gradients for drawCyberGrid (per arena size)
  private gridGradientCache: Map<string, {
    auraP1: CanvasGradient;
    auraP2: CanvasGradient;
    glassGrad: CanvasGradient;
    depthGrad: CanvasGradient;
  }> = new Map();

  // Cached CRT scanline tile (per height) so the overlay is 2 blits,
  // not ~200 fillRects per frame
  private crtTileCache: Map<number, HTMLCanvasElement> = new Map();

  // Ambient holographic data motes for the Holo-Arena floor (pre-computed, deterministic)
  private motes: Array<{ x: number; y: number; r: number; speed: number; drift: number }> = [];

  constructor() {
    for (let i = 0; i < this.poolCapacity; i++) {
      this.particlePool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 4,
        color: '#00F0FF',
        alpha: 1,
        shape: 'spark',
        rotation: 0,
        rotSpeed: 0
      });
    }

    // Deterministic ambient motes: two allegiance colors + neutral core
    for (let i = 0; i < 30; i++) {
      const x = Math.random();
      this.motes.push({
        x,
        y: Math.random(),
        r: 1.2 + Math.random() * 2.2,
        speed: 0.006 + Math.random() * 0.02,
        drift: Math.random() * Math.PI * 2
      });
    }
  }

  public addTrauma(amount: number) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public triggerSlowMo(durationSec: number = 0.45, scale: number = 0.25) {
    this.slowMoTimer = durationSec;
    this.timeScale = scale;
  }

  public triggerFlash(color: string = '#ffffff', alpha: number = 0.45) {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  public triggerShockwave(x: number, y: number, color: string = '#00F0FF', maxRadius: number = 120) {
    // Cap concurrent shockwaves: array is append-only per event and old
    // devices can accumulate them during heavy juice moments.
    if (this.shockwaves.length >= 12) this.shockwaves.shift();
    this.shockwaves.push({
      x,
      y,
      radius: 5,
      maxRadius,
      color,
      width: 6,
      alpha: 1.0
    });
  }

  public emitSparks(x: number, y: number, color: string, count: number = 16, speed: number = 300, life: number = 0.35) {
    for (let i = 0; i < count; i++) {
      if (this.particlePool.length === 0) break;
      const p = this.particlePool.pop()!;
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.life = life * (0.6 + Math.random() * 0.8);
      p.maxLife = p.life;
      p.size = 2 + Math.random() * 4;
      p.color = color;
      p.alpha = 1.0;
      p.shape = Math.random() > 0.4 ? 'spark' : 'circle';
      p.rotation = angle;
      p.rotSpeed = (Math.random() - 0.5) * 15;

      this.activeParticles.push(p);
    }
  }

  public emitExplosion(x: number, y: number, color: string, count: number = 32) {
    this.emitSparks(x, y, color, count, 480, 0.6);
    this.addTrauma(0.65);
    this.triggerFlash(color, 0.4);
    this.triggerShockwave(x, y, color, 140);
  }

  public addTrailPoint(id: string, x: number, y: number, color: string, width: number = 10) {
    let list = this.trails.get(id);
    if (!list) {
      list = [];
      this.trails.set(id, list);
    }
    list.push({
      x,
      y,
      alpha: 1.0,
      width,
      color,
      time: performance.now()
    });

    if (list.length > 20) {
      list.shift();
    }
  }

  public clearTrail(id: string) {
    this.trails.delete(id);
  }

  public update(realDt: number) {
    // Bullet-Time update
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDt;
      if (this.slowMoTimer <= 0) {
        this.timeScale = 1.0;
      }
    }

    const dt = realDt * this.timeScale;

    // Screen Shake Decay
    this.shakeTime += dt * 35;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - this.decayRate * dt);
    }

    // Flash Decay
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - this.flashDecay * dt);
    }

    // Shockwaves Update
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += (sw.maxRadius - sw.radius) * 12 * dt;
      sw.alpha -= 1.8 * dt;
      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius * 0.96) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.activeParticles.splice(i, 1);
        this.particlePool.push(p);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1.0 - 1.5 * dt);
      p.vy *= (1.0 - 1.5 * dt);
      p.rotation += p.rotSpeed * dt;
      p.alpha = p.life / p.maxLife;
    }

    // Update Trails
    const now = performance.now();
    for (const [key, pts] of this.trails.entries()) {
      for (let i = pts.length - 1; i >= 0; i--) {
        const ageSec = (now - pts[i].time) / 1000;
        pts[i].alpha = Math.max(0, 1.0 - (ageSec / 0.15));
        if (pts[i].alpha <= 0) {
          pts.splice(i, 1);
        }
      }
      if (pts.length === 0) {
        this.trails.delete(key);
      }
    }
  }

  public applyCameraShake(ctx: CanvasRenderingContext2D, centerX: number, centerY: number) {
    if (this.trauma <= 0) return;
    const shakePower = this.trauma * this.trauma;
    const offsetX = shakePower * this.maxOffset * Math.sin(this.shakeTime * 1.3);
    const offsetY = shakePower * this.maxOffset * Math.cos(this.shakeTime * 1.7);
    const roll = shakePower * this.maxRoll * Math.sin(this.shakeTime * 0.9);

    ctx.translate(centerX + offsetX, centerY + offsetY);
    ctx.rotate(roll);
    ctx.translate(-centerX, -centerY);
  }

  public renderJuice(ctx: CanvasRenderingContext2D, width: number, height: number) {
    // 1. Render Ribbon Trails
    ctx.save();
    for (const pts of this.trails.values()) {
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = p1.color;
        ctx.globalAlpha = p1.alpha * 0.7;
        ctx.lineWidth = p1.width * (i / pts.length);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Render Shockwaves
    ctx.save();
    for (const sw of this.shockwaves) {
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.width * sw.alpha;
      ctx.globalAlpha = sw.alpha * 0.8;
      ctx.stroke();
    }
    ctx.restore();

    // 3. Render Particles
    ctx.save();
    for (const p of this.activeParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'spark') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size * 1.5, -p.size * 0.4, p.size * 3, p.size * 0.8);
        ctx.restore();
      } else if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.shape === 'line') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size * 2.2, -p.size * 0.25, p.size * 4.4, p.size * 0.5);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 4. Screen Impact Flash Overlay
    if (this.flashAlpha > 0.01) {
      ctx.save();
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  public drawCyberGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const now = performance.now() * 0.001;
    const w = width;
    const h = height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();

    // ============ 1. Dual-Allegiance Ambient Aura (cached: static per size) ====
    const cacheKey = `${Math.round(w)}x${Math.round(h)}`;
    let cached = this.gridGradientCache.get(cacheKey);
    if (!cached) {
      // Evict stale sizes (arena resizes) so the cache never grows
      if (this.gridGradientCache.size > 3) this.gridGradientCache.clear();
      const auraP1 = ctx.createRadialGradient(cx, h * 0.92, 10, cx, h * 0.92, w * 0.62);
      auraP1.addColorStop(0, 'rgba(255, 0, 85, 0.09)');
      auraP1.addColorStop(0.55, 'rgba(255, 0, 85, 0.02)');
      auraP1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      const auraP2 = ctx.createRadialGradient(cx, h * 0.08, 10, cx, h * 0.08, w * 0.62);
      auraP2.addColorStop(0, 'rgba(0, 132, 255, 0.09)');
      auraP2.addColorStop(0.55, 'rgba(0, 132, 255, 0.02)');
      auraP2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      const glassGrad = ctx.createLinearGradient(0, cy - 26, 0, cy + 26);
      glassGrad.addColorStop(0, 'rgba(255, 0, 85, 0)');
      glassGrad.addColorStop(0.5, 'rgba(230, 230, 255, 0.05)');
      glassGrad.addColorStop(1, 'rgba(0, 132, 255, 0)');
      const depthGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, Math.max(w, h) * 0.72);
      depthGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      depthGrad.addColorStop(0.72, 'rgba(0, 0, 0, 0.05)');
      depthGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      cached = { auraP1, auraP2, glassGrad, depthGrad };
      this.gridGradientCache.set(cacheKey, cached);
    }
    ctx.fillStyle = cached.auraP1;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = cached.auraP2;
    ctx.fillRect(0, 0, w, h);

    // ============ 2. Perspective Holo-Floor Grid ============
    const horizonPulse = 0.5 + Math.sin(now * 1.2) * 0.5;
    const edgeSpread = w * 0.6;
    const centerSpread = w * 0.15;
    ctx.strokeStyle = '#00F0FF';
    ctx.globalAlpha = 0.05 + horizonPulse * 0.025;
    ctx.lineWidth = 1;

    for (let i = -10; i <= 10; i++) {
      const t = i / 10;
      const xEdge = cx + t * edgeSpread;
      const xCenter = cx + t * centerSpread;
      ctx.beginPath();
      ctx.moveTo(xEdge, 0);
      ctx.lineTo(xCenter, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xCenter, cy);
      ctx.lineTo(xEdge, h);
      ctx.stroke();
    }

    // Horizontal compression rings (denser toward the horizon)
    for (let ring = 2; ring <= 20; ring += 2) {
      const deep = (ring / 20) ** 1.6;
      const yBot = cy + deep * (h * 0.5);
      const yTop = cy - deep * (h * 0.5);
      ctx.globalAlpha = 0.015 + deep * 0.045;
      ctx.beginPath();
      ctx.moveTo(0, yBot);
      ctx.lineTo(w, yBot);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(w, yTop);
      ctx.stroke();
    }

    // ============ 3. Horizon Energy Sweep Wave ============
    const sweep = (now * 0.055) % 1;
    const sweepY = sweep * h;
    const sweepGrad = ctx.createLinearGradient(0, sweepY - 80, 0, sweepY + 80);
    sweepGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
    sweepGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.045)');
    sweepGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, sweepY - 80, w, 160);

    ctx.fillStyle = 'rgba(0, 240, 255, 0.16)';
    ctx.fillRect(0, sweepY, w, 1.5);

    // ============ 4. Intersection Energy Nodes (scan-reactive) ============
    ctx.fillStyle = '#00F0FF';
    for (let gx = 36; gx < w; gx += 72) {
      for (let gy = 36; gy < h; gy += 72) {
        const dist = Math.abs(gy - sweepY) / 130;
        const strength = Math.max(0, 1 - dist);
        if (strength < 0.05) continue;
        ctx.globalAlpha = strength * 0.26 * (horizonPulse * 0.7 + 0.4);
        ctx.beginPath();
        ctx.arc(gx, gy, 1.7 + strength * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ============ 5. Ambient Holographic Data Motes ============
    for (const m of this.motes) {
      const mx = m.x * w;
      const my = ((m.y + now * m.speed) % 1) * h;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(now * m.drift + m.x * 13));
      ctx.globalAlpha = tw * 0.55;
      ctx.fillStyle = m.x > 0.58 ? '#FF4D8F' : m.x < 0.42 ? '#4DA6FF' : '#00F0FF';
      ctx.fillRect(mx, my, m.r, m.r);
    }
    ctx.globalAlpha = 1.0;

// ============ 6. Central Horizon Glass Reflection ============
    ctx.fillStyle = cached.glassGrad;
    ctx.fillRect(0, cy - 2, w, 4);

    // ============ 7. Cylindrical Lens Vignette ============
    ctx.fillStyle = cached.depthGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Animated center energy divider with flowing charge packets
  public drawEnergyDivider(ctx: CanvasRenderingContext2D, width: number, height: number, isDay: boolean = false) {
    const cy = height * 0.5;
    const now = performance.now() * 0.0025;
    ctx.save();

    // Base dashed rail
    ctx.strokeStyle = isDay ? 'rgba(15, 23, 42, 0.22)' : 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Flowing energy charge packets (P1 crimson <-> P2 cobalt streaming both ways)
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const phase = (now * 0.55 + i / 10) % 1;
      const x = phase * width;
      const pulse = 0.5 + 0.5 * Math.sin(now * 9 + i * 1.9);
      const rightward = i % 2 === 0;
      ctx.strokeStyle = rightward ? '#FF0055' : '#0084FF';
      ctx.globalAlpha = 0.16 + pulse * 0.34;
      ctx.lineWidth = 1.3 + pulse * 2.1;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + (rightward ? 16 : -16), cy);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
    ctx.lineCap = 'butt';

    // Center pulsing neutral core node
    const corePulse = Math.sin(now * 6);
    ctx.fillStyle = isDay ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.6)';
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 9 + corePulse * 5;
    ctx.beginPath();
    ctx.arc(width / 2, cy, 3.2 + corePulse * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Animated holographic glass sheen sweep for HUD pods
  public drawHoloGloss(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number = 14) {
    const now = performance.now() * 0.001;
    const travel = w + 90;
    const shift = ((now * 0.22) % 1) * travel - 45;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    const gloss = ctx.createLinearGradient(x + shift - 30, y, x + shift + 30, y + h);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gloss.addColorStop(0.5, 'rgba(255, 255, 255, 0.11)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.restore();
  }

  // Breathing energy ring (used by many games for target/arena emphasis)
  public drawPulseRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, baseR: number, color: string, time: number, speed: number = 6, range: number = 16) {
    ctx.save();
    const p = 0.5 + 0.5 * Math.sin(time * speed);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.1 + p * 0.35;
    ctx.lineWidth = 1.4 + p * 2.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + p * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR + p * range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  public drawRadialFloorLight(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, intensity: number = 0.35) {
    ctx.save();
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.globalAlpha = Math.max(0, Math.min(1, intensity));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  public drawCyberVisorBracket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    const len = 12;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + len);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - len);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + len, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - len);
    ctx.stroke();

    ctx.restore();
  }

  // --- NEW EX JUICE: CONFETTI & DIRECTIONAL BURSTS ---
  public emitConfetti(width: number, _height: number, count: number = 60) {
    const colors = ['#FFD700', '#00F0FF', '#FF0055', '#00FF66', '#E024FF', '#FF9900'];
    for (let i = 0; i < count; i++) {
      if (this.particlePool.length === 0) break;
      const p = this.particlePool.pop()!;
      p.x = Math.random() * width;
      p.y = -20 - Math.random() * 80;
      p.vx = (Math.random() - 0.5) * 160;
      p.vy = 180 + Math.random() * 260; // fall gravity
      p.life = 1.8 + Math.random() * 1.2;
      p.maxLife = p.life;
      p.size = 5 + Math.random() * 5;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.alpha = 1.0;
      p.shape = 'spark';
      p.rotation = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 12;

      this.activeParticles.push(p);
    }
  }

  public emitDirectionalSparks(x: number, y: number, centerAngle: number, spread: number, color: string, count: number = 18, speed: number = 380) {
    for (let i = 0; i < count; i++) {
      if (this.particlePool.length === 0) break;
      const p = this.particlePool.pop()!;
      const angle = centerAngle + (Math.random() - 0.5) * spread;
      const spd = (0.4 + Math.random() * 0.8) * speed;

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.life = 0.4 + Math.random() * 0.3;
      p.maxLife = p.life;
      p.size = 3 + Math.random() * 3;
      p.color = color;
      p.alpha = 1.0;
      p.shape = 'spark';
      p.rotation = angle;
      p.rotSpeed = (Math.random() - 0.5) * 18;

      this.activeParticles.push(p);
    }
  }

  public renderMatchPointTension(ctx: CanvasRenderingContext2D, width: number, height: number, leadingPlayer: 1 | 2) {
    const pColor = leadingPlayer === 1 ? '#FF0055' : '#0084FF';
    const pulse = 0.5 + Math.sin(this.shakeTime * 6) * 0.5;

    ctx.save();
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 4 + pulse * 4;
    ctx.globalAlpha = 0.3 + pulse * 0.45;
    ctx.shadowColor = pColor;
    ctx.shadowBlur = 16;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    // Corner tension brackets
    const bLen = 30;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.8;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(10, 10 + bLen);
    ctx.lineTo(10, 10);
    ctx.lineTo(10 + bLen, 10);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(width - 10 - bLen, 10);
    ctx.lineTo(width - 10, 10);
    ctx.lineTo(width - 10, 10 + bLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(10, height - 10 - bLen);
    ctx.lineTo(10, height - 10);
    ctx.lineTo(10 + bLen, height - 10);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(width - 10 - bLen, height - 10);
    ctx.lineTo(width - 10, height - 10);
    ctx.lineTo(width - 10, height - 10 - bLen);
    ctx.stroke();

    ctx.restore();
  }

  // --- CRT SCANLINES & RETRO PHOSPHOR OVERLAY ---
  public crtScanlinesEnabled: boolean = false;

  public renderCRTOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (!this.crtScanlinesEnabled) return;

    ctx.save();
    // Tiled scanlines via cached offscreen pattern (1 drawImage vs ~200 fills)
    const hKey = Math.round(height);
    let tile = this.crtTileCache.get(hKey);
    if (!tile) {
      if (this.crtTileCache.size > 3) this.crtTileCache.clear();
      tile = document.createElement('canvas');
      tile.width = 4;
      tile.height = 4;
      const tctx = tile.getContext('2d')!;
      tctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      tctx.fillRect(0, 0, 4, 1.5);
      this.crtTileCache.set(hKey, tile);
    }
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }

    // Phosphor vignette
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 15, 30, 0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }

  // --- PLASMA LIGHTNING ARC ---
  public drawLightningArc(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string = '#00F0FF') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    const segments = 6;
    const dx = (x2 - x1) / segments;
    const dy = (y2 - y1) / segments;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < segments; i++) {
      const offsetX = (Math.random() - 0.5) * 16;
      const offsetY = (Math.random() - 0.5) * 16;
      ctx.lineTo(x1 + dx * i + offsetX, y1 + dy * i + offsetY);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
}
