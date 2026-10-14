import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface KineticDisc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  color: string;
  isOverdrive: boolean;
}

interface OrbitalPaddle {
  player: PlayerIndex;
  angle: number; // Angle on arc (in radians)
  targetAngle: number;
  arcRadius: number;
  arcWidth: number;
  color: string;
}

export class NeonOrbitBreaker extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'neon_orbit',
    title: 'Neon Orbit Breaker',
    subtitle: 'Gravitational Slingshot Duel',
    category: 'Physics Orbital',
    icon: '🪐',
    targetScore: 5,
    timeLimitSec: 90,
    instructionsP1: 'Drag along bottom arc to deflect curved discs',
    instructionsP2: 'Drag along top arc to deflect curved discs'
  };

  private disc!: KineticDisc;
  private p1Paddle!: OrbitalPaddle;
  private p2Paddle!: OrbitalPaddle;

  private gravityStrength: number = 32000;
  private gravityPulse: number = 0;

  public init(width: number, height: number): void {
    const minDim = Math.min(width, height);
    const arcR = minDim * 0.42;

    this.p1Paddle = {
      player: 1,
      angle: Math.PI / 2, // bottom center
      targetAngle: Math.PI / 2,
      arcRadius: arcR,
      arcWidth: 0.38, // angular width in radians (~22 deg)
      color: '#FF0055'
    };

    this.p2Paddle = {
      player: 2,
      angle: -Math.PI / 2, // top center
      targetAngle: -Math.PI / 2,
      arcRadius: arcR,
      arcWidth: 0.38,
      color: '#0084FF'
    };

    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;

    this.disc = {
      x: cx,
      y: cy - 40,
      vx: (Math.random() - 0.5) * 120,
      vy: (Math.random() > 0.5 ? 1 : -1) * 260,
      radius: 12,
      speed: 280,
      color: '#FFFFFF',
      isOverdrive: false
    };

    this.p1Paddle.angle = Math.PI / 2;
    this.p1Paddle.targetAngle = Math.PI / 2;

    this.p2Paddle.angle = -Math.PI / 2;
    this.p2Paddle.targetAngle = -Math.PI / 2;

    this.gravityStrength = 32000;
  }

  public updateGame(dt: number, width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;

    this.gravityPulse += dt * 4;

    // 1. Process Paddle Inputs
    this.updatePaddleInput(this.p1Paddle, 1, cx, cy, dt);

    if (this.progression.getGameMode() === 'vs_ai') {
      this.botAI.updateNeonOrbit(this.p2Paddle, this.disc, this.progression.getAIDifficulty(), dt, cx, cy);
    } else {
      this.updatePaddleInput(this.p2Paddle, 2, cx, cy, dt);
    }

    // Smooth paddle interpolation
    this.p1Paddle.angle += (this.p1Paddle.targetAngle - this.p1Paddle.angle) * Math.min(1.0, 22 * dt);
    this.p2Paddle.angle += (this.p2Paddle.targetAngle - this.p2Paddle.angle) * Math.min(1.0, 22 * dt);

    // 2. Gravitational Singularity Core Force
    const dx = cx - this.disc.x;
    const dy = cy - this.disc.y;
    const distSq = dx * dx + dy * dy + 400; // epsilon
    const dist = Math.sqrt(distSq);

    const gravForce = this.gravityStrength / distSq;
    this.disc.vx += (dx / dist) * gravForce * dt;
    this.disc.vy += (dy / dist) * gravForce * dt;

    // 3. Step Disc Physics
    this.disc.x += this.disc.vx * dt;
    this.disc.y += this.disc.vy * dt;

    // Add ribbon trail
    this.juice.addTrailPoint('orbit_disc', this.disc.x, this.disc.y, this.disc.isOverdrive ? '#FFAA00' : this.disc.color, 10);

    // 4. Boundary Deflection (Side Walls)
    if (this.disc.x - this.disc.radius < 15) {
      this.disc.x = 15 + this.disc.radius;
      this.disc.vx = Math.abs(this.disc.vx) * 0.98;
      this.audio.playPuckBounce(1.1);
      this.juice.emitSparks(this.disc.x, this.disc.y, '#00F0FF', 8, 160, 0.2);
    } else if (this.disc.x + this.disc.radius > width - 15) {
      this.disc.x = width - 15 - this.disc.radius;
      this.disc.vx = -Math.abs(this.disc.vx) * 0.98;
      this.audio.playPuckBounce(1.1);
      this.juice.emitSparks(this.disc.x, this.disc.y, '#FF0055', 8, 160, 0.2);
    }

    // 5. Paddle Deflections
    this.checkPaddleCollision(this.p1Paddle, cx, cy);
    this.checkPaddleCollision(this.p2Paddle, cx, cy);

    // 6. Score Condition: Escaping out through top/bottom poles
    if (this.disc.y > cy + this.p1Paddle.arcRadius + 30) {
      // Disc passed P1 -> P2 Scores!
      this.triggerPointScore(2, width, height);
    } else if (this.disc.y < cy - this.p2Paddle.arcRadius - 30) {
      // Disc passed P2 -> P1 Scores!
      this.triggerPointScore(1, width, height);
    }
  }

  private updatePaddleInput(paddle: OrbitalPaddle, player: PlayerIndex, cx: number, cy: number, dt: number) {
    const touches = this.input.getTouchesForPlayer(player);
    const kb = player === 1 ? this.input.keyboardP1 : this.input.keyboardP2;

    if (touches.length > 0) {
      const t = touches[0];
      const targetWorldX = t.rawX;
      const targetWorldY = t.rawY;

      const angle = Math.atan2(targetWorldY - cy, targetWorldX - cx);

      if (player === 1) {
        // Clamp to lower arc [0.15 * PI, 0.85 * PI]
        paddle.targetAngle = Math.max(0.2 * Math.PI, Math.min(0.8 * Math.PI, angle));
      } else {
        // Clamp to upper arc [-0.85 * PI, -0.15 * PI]
        paddle.targetAngle = Math.max(-0.8 * Math.PI, Math.min(-0.2 * Math.PI, angle));
      }
    } else {
      // Keyboard fallback (frame-rate independent + clamped to the same arcs
      // as the touch path so the paddle can never cross to the rival side)
      const step = 2.4 * dt;
      if (kb.x < 0) paddle.targetAngle -= step;
      if (kb.x > 0) paddle.targetAngle += step;
      if (player === 1) {
        paddle.targetAngle = Math.max(0.2 * Math.PI, Math.min(0.8 * Math.PI, paddle.targetAngle));
      } else {
        paddle.targetAngle = Math.max(-0.8 * Math.PI, Math.min(-0.2 * Math.PI, paddle.targetAngle));
      }
    }
  }

  private checkPaddleCollision(paddle: OrbitalPaddle, cx: number, cy: number) {
    const paddleX = cx + Math.cos(paddle.angle) * paddle.arcRadius;
    const paddleY = cy + Math.sin(paddle.angle) * paddle.arcRadius;

    const dx = this.disc.x - paddleX;
    const dy = this.disc.y - paddleY;
    const distSq = dx * dx + dy * dy;
    const hitRadius = 32;

    if (distSq < hitRadius * hitRadius) {
      // Deflect disc back toward center with high angular impulse
      const normalX = Math.cos(paddle.angle + Math.PI);
      const normalY = Math.sin(paddle.angle + Math.PI);

      const speed = Math.min(680, Math.sqrt(this.disc.vx * this.disc.vx + this.disc.vy * this.disc.vy) * 1.15 + 60);
      this.disc.vx = normalX * speed + (Math.random() - 0.5) * 80;
      this.disc.vy = normalY * speed;

      this.disc.isOverdrive = speed > 480;
      this.disc.color = paddle.color;

      this.audio.playParryClash();
      this.juice.addTrauma(0.3);
      this.juice.emitExplosion(this.disc.x, this.disc.y, paddle.color, 18);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    const now = performance.now();

    // 0. Celestial starfield backdrop (deterministic twinkle)
    ctx.save();
    for (let i = 0; i < 54; i++) {
      const px = (i * 137.5) % width;
      const py = (i * 73.7) % height;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(now * 0.004 + i * 2.3));
      const size = 0.8 + (i % 3) * 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${tw * 0.5})`;
      ctx.fillRect(px, py, size, size);
    }
    ctx.restore();

    // 1. Central Cosmic Black Hole & Accretion Disk (Gargantua Singularity)
    ctx.save();
    this.juice.drawRadialFloorLight(ctx, cx, cy, 110, '#9D00FF', 0.45);

    // Swirling Volumetric Accretion Dust Spiral
    const rotSpeed = now * 0.0015;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotSpeed);

    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      const spiralGrad = ctx.createLinearGradient(0, 0, 85, 45);
      spiralGrad.addColorStop(0, 'rgba(157, 0, 255, 0.4)');
      spiralGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.25)');
      spiralGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = spiralGrad;
      ctx.beginPath();
      ctx.ellipse(35, 10, 50, 18, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Relativistic Lensing Outer Halo
    const lensGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 80);
    lensGrad.addColorStop(0, 'rgba(180, 50, 255, 0.35)');
    lensGrad.addColorStop(0.5, 'rgba(90, 0, 255, 0.15)');
    lensGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = lensGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fill();

    // Razor-Sharp Relativistic Photon Ring
    const pulseR = 24 + Math.sin(this.gravityPulse) * 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#D580FF';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Breathing capture-ring ahead of the photon ring
    this.juice.drawPulseRing(ctx, cx, cy, pulseR + 10, '#FF4DD8', now * 0.001, 3.2, 7);

    // Pure Void Event Horizon
    ctx.fillStyle = '#020306';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Celestial Orbital Coordinate Ring & Tick Marks
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, this.p1Paddle.arcRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Compass Tick Marks every 30 degrees
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 1.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const r1 = this.p1Paddle.arcRadius - 6;
      const r2 = this.p1Paddle.arcRadius + 6;
      ctx.beginPath();
      ctx.moveTo(cx + cos * r1, cy + sin * r1);
      ctx.lineTo(cx + cos * r2, cy + sin * r2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Render Orbital Paddles
    this.renderPaddleArc(ctx, this.p1Paddle, cx, cy);
    this.renderPaddleArc(ctx, this.p2Paddle, cx, cy);

    // 4. Kinetic Supersonic Pulsar Disc
    ctx.save();
    const discColor = this.disc.isOverdrive ? '#FFAA00' : this.disc.color;
    this.juice.drawRadialFloorLight(ctx, this.disc.x, this.disc.y, 45, discColor, 0.5);

    // Disc Orbital Glow Aura
    ctx.fillStyle = discColor;
    ctx.shadowColor = discColor;
    ctx.shadowBlur = this.disc.isOverdrive ? 26 : 16;
    ctx.beginPath();
    ctx.arc(this.disc.x, this.disc.y, this.disc.radius, 0, Math.PI * 2);
    ctx.fill();

    // Tilted Planetary Energy Ring around disc
    ctx.save();
    ctx.translate(this.disc.x, this.disc.y);
    ctx.rotate(now * 0.004);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.disc.radius * 1.7, this.disc.radius * 0.65, Math.PI / 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // White-Hot Singularity Core
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(this.disc.x, this.disc.y, this.disc.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderPaddleArc(ctx: CanvasRenderingContext2D, paddle: OrbitalPaddle, cx: number, cy: number) {
    ctx.save();
    const startAngle = paddle.angle - paddle.arcWidth / 2;
    const endAngle = paddle.angle + paddle.arcWidth / 2;

    // Glowing Outer Energy Arc
    ctx.strokeStyle = paddle.color;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.shadowColor = paddle.color;
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.arc(cx, cy, paddle.arcRadius, startAngle, endAngle);
    ctx.stroke();

    // Inner White Superheated Energy Core
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, paddle.arcRadius, startAngle + 0.02, endAngle - 0.02);
    ctx.stroke();

    // Magnetic Emitter Node Caps at both arc endpoints
    for (const angle of [startAngle, endAngle]) {
      const nx = cx + Math.cos(angle) * paddle.arcRadius;
      const ny = cy + Math.sin(angle) * paddle.arcRadius;

      ctx.fillStyle = '#10141e';
      ctx.strokeStyle = paddle.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(nx, ny, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(nx, ny, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
