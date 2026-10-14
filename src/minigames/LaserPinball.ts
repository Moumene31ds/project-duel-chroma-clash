import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';
import { botProfile, botMakesMistake } from '../core/BotDifficulty';

interface PinballBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isMultiball: boolean;
  fusionCooldown: number;
}

const MAX_PINBALLS = 5;
const FUSION_COOLDOWN_SEC = 0.6;
const MIN_DEFLECT_SPEED = 280;

interface Bumper {
  x: number;
  y: number;
  radius: number;
  color: string;
  glow: number;
}

interface Flipper {
  pivotX: number;
  pivotY: number;
  length: number;
  angle: number;
  restAngle: number;
  activeAngle: number;
  isEngaged: boolean;
  angularVelocity: number;
}

export class LaserPinball extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'laser_pinball',
    title: 'Laser Pinball Duel',
    subtitle: 'Kinetic Bumpers & Multiball Frenzy',
    category: 'Action & Speed',
    icon: '🏓',
    targetScore: 5,
    timeLimitSec: 90,
    instructionsP1: 'Tap Left / Right half to flip flippers!',
    instructionsP2: 'Tap Left / Right half to flip flippers!'
  };

  private balls: PinballBall[] = [];
  private bumpers: Bumper[] = [];

  // P1 Flippers (Bottom)
  private p1LeftFlipper!: Flipper;
  private p1RightFlipper!: Flipper;

  // P2 Flippers (Top)
  private p2LeftFlipper!: Flipper;
  private p2RightFlipper!: Flipper;

  // Center Fusion Core (Multiball reactor)
  private fusionHits: number = 0;
  private fusionGlow: number = 0;
  // Bot reaction gate: instant perfect flips made difficulty meaningless
  private botClock: number = 0;
  private botArmed: boolean = true;

  public init(width: number, height: number): void {
    this.targetScore = 5;
    this.p1Score = 0;
    this.p2Score = 0;
    this.fusionHits = 0;

    // Bumpers Layout
    this.bumpers = [
      { x: width * 0.3, y: height * 0.42, radius: 24, color: '#00F0FF', glow: 0 },
      { x: width * 0.7, y: height * 0.42, radius: 24, color: '#FF0055', glow: 0 },
      { x: width * 0.5, y: height * 0.58, radius: 26, color: '#FFD700', glow: 0 }
    ];

    // Initialize Flippers
    const flipperLen = 58;
    this.p1LeftFlipper = {
      pivotX: width * 0.28,
      pivotY: height * 0.88,
      length: flipperLen,
      angle: 0.4,
      restAngle: 0.4,
      activeAngle: -0.6,
      isEngaged: false,
      angularVelocity: 0
    };

    this.p1RightFlipper = {
      pivotX: width * 0.72,
      pivotY: height * 0.88,
      length: flipperLen,
      angle: Math.PI - 0.4,
      restAngle: Math.PI - 0.4,
      activeAngle: Math.PI + 0.6,
      isEngaged: false,
      angularVelocity: 0
    };

    this.p2LeftFlipper = {
      pivotX: width * 0.28,
      pivotY: height * 0.12,
      length: flipperLen,
      angle: -0.4,
      restAngle: -0.4,
      activeAngle: 0.6,
      isEngaged: false,
      angularVelocity: 0
    };

    this.p2RightFlipper = {
      pivotX: width * 0.72,
      pivotY: height * 0.12,
      length: flipperLen,
      angle: Math.PI + 0.4,
      restAngle: Math.PI + 0.4,
      activeAngle: Math.PI - 0.6,
      isEngaged: false,
      angularVelocity: 0
    };

    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    this.balls = [
      {
        x: width / 2,
        y: height / 2,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() > 0.5 ? 1 : -1) * 320,
        radius: 11,
        color: '#FFFFFF',
        isMultiball: false,
        fusionCooldown: 0
      }
    ];
    this.fusionHits = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Process Touch Inputs for Flippers
    this.handleFlipperInputs(width, height);

    // 2. AI Bot Control for P2
    if (this.progression.getGameMode() === 'vs_ai') {
      this.updateBot(height);
    }

    // 3. Update Flipper Dynamics (Spring Return)
    this.updateFlipper(this.p1LeftFlipper, dt);
    this.updateFlipper(this.p1RightFlipper, dt);
    this.updateFlipper(this.p2LeftFlipper, dt);
    this.updateFlipper(this.p2RightFlipper, dt);

    // Decay glow
    this.fusionGlow = Math.max(0, this.fusionGlow - dt * 2);
    for (const b of this.bumpers) {
      b.glow = Math.max(0, b.glow - dt * 2);
    }

    // 4. Update Balls Physics
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Arena Sidewalls Bounce
      if (ball.x - ball.radius < 16) {
        ball.x = 16 + ball.radius;
        ball.vx = Math.abs(ball.vx);
        this.audio.playPaddleWallBounce();
      } else if (ball.x + ball.radius > width - 16) {
        ball.x = width - 16 - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        this.audio.playPaddleWallBounce();
      }

      // Bumpers Collision
      for (const bmp of this.bumpers) {
        const dx = ball.x - bmp.x;
        const dy = ball.y - bmp.y;
        const dist = Math.hypot(dx, dy);
        const minDist = ball.radius + bmp.radius;

        if (dist < minDist) {
          const safeDist = dist || 1;
          const nx = dx / safeDist;
          const ny = dy / safeDist;
          const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.25, 750);
          ball.vx = nx * speed;
          ball.vy = ny * speed;
          bmp.glow = 1.0;

          this.audio.playPinballBumper();
          this.juice.addTrauma(0.18);
          this.juice.emitExplosion(bmp.x, bmp.y, bmp.color, 16);
        }
      }

      // Central Fusion Core Hit (Triggers Multiball on 3 hits; per-ball
      // cooldown stops a single overlapping pass from counting 3x)
      ball.fusionCooldown = Math.max(0, ball.fusionCooldown - dt);
      const coreDist = Math.hypot(ball.x - width / 2, ball.y - height / 2);
      if (coreDist < ball.radius + 20 && ball.fusionCooldown <= 0) {
        ball.fusionCooldown = FUSION_COOLDOWN_SEC;
        this.fusionHits++;
        this.fusionGlow = 1.0;
        this.audio.playReflexChime();
        this.juice.emitExplosion(width / 2, height / 2, '#FFD700', 20);

        if (this.fusionHits >= 3) {
          this.fusionHits = 0;
          this.triggerMultiball(width, height);
        }

        // Deflect away from center with guaranteed minimum speed so the
        // spawn-at-center ball can never get trapped farming multiball
        let dvx = (ball.x - width / 2) * 8;
        let dvy = (ball.y - height / 2) * 8;
        const dSpeed = Math.hypot(dvx, dvy);
        if (dSpeed < MIN_DEFLECT_SPEED) {
          const fallbackAngle = Math.atan2(ball.vy, ball.vx) || Math.PI / 4;
          const dirX = dSpeed > 1 ? dvx / dSpeed : Math.cos(fallbackAngle);
          const dirY = dSpeed > 1 ? dvy / dSpeed : Math.sin(fallbackAngle);
          dvx = dirX * MIN_DEFLECT_SPEED;
          dvy = dirY * MIN_DEFLECT_SPEED;
        }
        ball.vx = dvx;
        ball.vy = dvy;
      }

      // Flippers Collision
      this.checkFlipperCollision(ball, this.p1LeftFlipper, 1);
      this.checkFlipperCollision(ball, this.p1RightFlipper, 1);
      this.checkFlipperCollision(ball, this.p2LeftFlipper, 2);
      this.checkFlipperCollision(ball, this.p2RightFlipper, 2);

      // Goals Detection (Ball drained)
      if (ball.y < 0) {
        // P1 Scored (Passed P2's defense)
        this.balls.splice(i, 1);
        if (this.balls.length === 0) {
          this.triggerPointScore(1, width, height);
        }
      } else if (ball.y > height) {
        // P2 Scored (Passed P1's defense)
        this.balls.splice(i, 1);
        if (this.balls.length === 0) {
          this.triggerPointScore(2, width, height);
        }
      }
    }

    // Safety: If all balls drained during play, respawn 1
    if (this.balls.length === 0 && !this.isRoundOver) {
      this.resetRound(width, height);
    }
  }

  private triggerMultiball(width: number, height: number) {
    if (this.balls.length >= MAX_PINBALLS) return;
    this.audio.playHyperShot();
    this.juice.addTrauma(0.4);
    this.juice.emitExplosion(width / 2, height / 2, '#00F0FF', 35);

    this.balls.push(
      {
        x: width / 2,
        y: height / 2 - 20,
        vx: -280,
        vy: -320,
        radius: 11,
        color: '#00F0FF',
        isMultiball: true,
        fusionCooldown: FUSION_COOLDOWN_SEC
      },
      {
        x: width / 2,
        y: height / 2 + 20,
        vx: 280,
        vy: 320,
        radius: 11,
        color: '#FF0055',
        isMultiball: true,
        fusionCooldown: FUSION_COOLDOWN_SEC
      }
    );
  }

  private handleFlipperInputs(width: number, height: number) {
    const touches = this.input.getTouches();

    let p1L = false, p1R = false, p2L = false, p2R = false;

    for (const t of touches) {
      if (t.phase === 'ended' || t.phase === 'canceled') continue;

      if (t.player === 1 && t.rawY > height * 0.5) {
        if (t.rawX < width * 0.5) p1L = true;
        else p1R = true;
      } else if (t.player === 2 && t.rawY < height * 0.5) {
        if (t.rawX < width * 0.5) p2L = true;
        else p2R = true;
      }
    }

    // Keyboard fallback
    const kb1 = this.input.keyboardP1;
    if (kb1.x < 0 || kb1.actionA) p1L = true;
    if (kb1.x > 0 || kb1.actionB) p1R = true;

    if (this.progression.getGameMode() !== 'vs_ai') {
      const kb2 = this.input.keyboardP2;
      if (kb2.x < 0 || kb2.actionA) p2L = true;
      if (kb2.x > 0 || kb2.actionB) p2R = true;
    }

    this.p1LeftFlipper.isEngaged = p1L;
    this.p1RightFlipper.isEngaged = p1R;

    if (this.progression.getGameMode() !== 'vs_ai') {
      this.p2LeftFlipper.isEngaged = p2L;
      this.p2RightFlipper.isEngaged = p2R;
    }
  }

  private updateBot(height: number) {
    const diff = this.progression.getAIDifficulty();
    // Human-like reaction: the bot must wait out its tier delay before its
    // flip decision takes effect; easy bots additionally flub reads.
    this.botClock += 1 / 60;
    const prof = botProfile(diff);
    const need = (prof.reactionMin + prof.reactionMax) / 2;
    if (this.botClock >= need) {
      this.botClock = 0;
      this.botArmed = !botMakesMistake(diff);
    }
    if (!this.botArmed) {
      this.p2LeftFlipper.isEngaged = false;
      this.p2RightFlipper.isEngaged = false;
      return;
    }

    const triggerY = diff === 'hard' ? height * 0.22 : diff === 'medium' ? height * 0.18 : height * 0.14;

    let botL = false;
    let botR = false;

    for (const b of this.balls) {
      if (b.vy < 0 && b.y < triggerY && b.y > height * 0.08) {
        if (b.x < this.p2LeftFlipper.pivotX + 50) botL = true;
        if (b.x > this.p2RightFlipper.pivotX - 50) botR = true;
      }
    }

    this.p2LeftFlipper.isEngaged = botL;
    this.p2RightFlipper.isEngaged = botR;
  }

  private updateFlipper(f: Flipper, dt: number) {
    const target = f.isEngaged ? f.activeAngle : f.restAngle;
    const speed = 25; // Rad/s rapid flip actuation
    f.angle += (target - f.angle) * speed * dt;
  }

  private checkFlipperCollision(ball: PinballBall, f: Flipper, _player: PlayerIndex) {
    const tipX = f.pivotX + Math.cos(f.angle) * f.length;
    const tipY = f.pivotY + Math.sin(f.angle) * f.length;

    // Line segment distance from ball to flipper
    const dx = tipX - f.pivotX;
    const dy = tipY - f.pivotY;
    const lenSq = dx * dx + dy * dy;

    let t = ((ball.x - f.pivotX) * dx + (ball.y - f.pivotY) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = f.pivotX + t * dx;
    const closestY = f.pivotY + t * dy;

    const dist = Math.hypot(ball.x - closestX, ball.y - closestY);

    if (dist < ball.radius + 7) {
      // Normal vector
      const nx = (ball.x - closestX) / (dist || 1);
      const ny = (ball.y - closestY) / (dist || 1);

      // Add flipper kinetic impulse if currently engaged
      const impulse = f.isEngaged ? 520 : 360;
      ball.vx = nx * impulse;
      ball.vy = ny * impulse;

      this.audio.playPinballFlipper();
      this.juice.addTrauma(0.12);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const now = performance.now();

    // 0. Rotating playfield gloss sheen sweep (arcade cabinet glass reflection)
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#FFFFFF';
    const sweepX = ((now * 0.0004) % 1) * (width + 200) - 100;
    ctx.beginPath();
    ctx.rect(sweepX, 0, 70, height);
    ctx.clip();
    ctx.fillRect(sweepX, 0, 70, height);
    ctx.restore();

    // 1. Playfield Outer Laser Guides & Rails
    ctx.save();
    ctx.strokeStyle = isDay ? 'rgba(30, 50, 90, 0.15)' : 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // Inner Corner Inlane Guides
    ctx.beginPath();
    ctx.moveTo(16, 120);
    ctx.lineTo(60, 180);
    ctx.moveTo(width - 16, 120);
    ctx.lineTo(width - 60, 180);
    ctx.moveTo(16, height - 120);
    ctx.lineTo(60, height - 180);
    ctx.moveTo(width - 16, height - 120);
    ctx.lineTo(width - 60, height - 180);
    ctx.stroke();
    ctx.restore();

    // 2. Render Multi-Tier Kinetic Pop Bumpers
    for (const b of this.bumpers) {
      ctx.save();
      this.juice.drawRadialFloorLight(ctx, b.x, b.y, b.radius * 2.5, b.color, 0.4 + b.glow * 0.5);

      // Outer Base Ring
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0f141e';
      ctx.strokeStyle = '#2d3b55';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      // Mushroom Cap (Radial Gradient)
      const capGrad = ctx.createRadialGradient(b.x - 4, b.y - 4, 2, b.x, b.y, b.radius);
      capGrad.addColorStop(0, '#FFFFFF');
      capGrad.addColorStop(0.3, b.color);
      capGrad.addColorStop(1, '#0a0e17');

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = capGrad;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12 + b.glow * 20;
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner Glowing Jewel Node
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.restore();
    }

    // 3. Render Central Fusion Reactor Core
    ctx.save();
    const coreX = width / 2;
    const coreY = height / 2;
    const coreR = 24;
    const coreColor = this.fusionHits >= 2 ? '#FF0055' : '#00F0FF';

    this.juice.drawRadialFloorLight(ctx, coreX, coreY, 65, coreColor, 0.5 + this.fusionGlow * 0.4);

    // Breathing containment pulse around the reactor
    this.juice.drawPulseRing(ctx, coreX, coreY, coreR + 14, coreColor, now * 0.001, 4.2, 10);

    // Rotating Containment Ring
    ctx.save();
    ctx.translate(coreX, coreY);
    ctx.rotate(now * 0.003);
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, coreR + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Core Pod Base
    const coreGrad = ctx.createRadialGradient(coreX - 3, coreY - 3, 2, coreX, coreY, coreR);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.3, coreColor);
    coreGrad.addColorStop(1, '#090d14');
    ctx.fillStyle = coreGrad;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Status Text Badge
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⚡${this.fusionHits}/3`, coreX, coreY);
    ctx.restore();

    // 4. Render Heavy Chrome Flippers
    this.renderFlipper(ctx, this.p1LeftFlipper, '#FF0055');
    this.renderFlipper(ctx, this.p1RightFlipper, '#FF0055');
    this.renderFlipper(ctx, this.p2LeftFlipper, '#0084FF');
    this.renderFlipper(ctx, this.p2RightFlipper, '#0084FF');

    // 5. Render Specular Chrome Pinballs
    for (const b of this.balls) {
      ctx.save();
      this.juice.drawRadialFloorLight(ctx, b.x, b.y, b.radius * 2.4, b.color, 0.45);

      // Specular Chrome Shading
      const chromeGrad = ctx.createRadialGradient(b.x - b.radius * 0.4, b.y - b.radius * 0.4, 1, b.x, b.y, b.radius);
      chromeGrad.addColorStop(0, '#FFFFFF');
      chromeGrad.addColorStop(0.3, '#cbd5e1');
      chromeGrad.addColorStop(0.7, '#334155');
      chromeGrad.addColorStop(1, '#0f172a');

      ctx.fillStyle = chromeGrad;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.isMultiball ? 16 : 8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Bright Reflection Glint
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private renderFlipper(ctx: CanvasRenderingContext2D, f: Flipper, color: string) {
    const tipX = f.pivotX + Math.cos(f.angle) * f.length;
    const tipY = f.pivotY + Math.sin(f.angle) * f.length;

    ctx.save();

    // Tapered Heavy Aerodynamic Flipper Bat
    const normalAngle = f.angle + Math.PI / 2;
    const baseW = 7;
    const tipW = 3.5;

    const p1x = f.pivotX + Math.cos(normalAngle) * baseW;
    const p1y = f.pivotY + Math.sin(normalAngle) * baseW;
    const p2x = f.pivotX - Math.cos(normalAngle) * baseW;
    const p2y = f.pivotY - Math.sin(normalAngle) * baseW;

    const t1x = tipX + Math.cos(normalAngle) * tipW;
    const t1y = tipY + Math.sin(normalAngle) * tipW;
    const t2x = tipX - Math.cos(normalAngle) * tipW;
    const t2y = tipY - Math.sin(normalAngle) * tipW;

    // Bat Chassis (Carbon Fiber Gradient)
    const batGrad = ctx.createLinearGradient(f.pivotX, f.pivotY, tipX, tipY);
    batGrad.addColorStop(0, '#1c2436');
    batGrad.addColorStop(0.6, '#101624');
    batGrad.addColorStop(1, '#090d14');

    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(t1x, t1y);
    ctx.arc(tipX, tipY, tipW, normalAngle, normalAngle + Math.PI);
    ctx.lineTo(p2x, p2y);
    ctx.arc(f.pivotX, f.pivotY, baseW, normalAngle + Math.PI, normalAngle);
    ctx.closePath();

    ctx.fillStyle = batGrad;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Neon Strike Rubber Ridge on impact face
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(t1x, t1y);
    ctx.stroke();

    // Far-edge neon plasma ridge (pulses, flares while engaged)
    const engageGlow = f.isEngaged ? 1.0 : 0.4 + 0.3 * Math.sin(performance.now() * 0.005);
    ctx.globalAlpha = engageGlow;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 + engageGlow * 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + engageGlow * 10;
    ctx.beginPath();
    ctx.moveTo(t2x, t2y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // Heavy Metal Pivot Joint Cap
    ctx.beginPath();
    ctx.arc(f.pivotX, f.pivotY, baseW + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}
