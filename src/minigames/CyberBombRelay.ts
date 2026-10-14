import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';
import { InputManager } from '../core/InputManager';
import { AudioHaptics } from '../core/AudioHaptics';
import { JuiceEngine } from '../core/JuiceEngine';
import { ProgressionManager } from '../meta/ProgressionManager';
import { AIBotEngine } from '../core/AIBotEngine';
import { AchievementManager } from '../meta/AchievementManager';

interface PlasmaBomb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  fuseSec: number;
  maxFuseSec: number;
  speedRatio: number;
  isSmash: boolean;
  trail: Array<{ x: number; y: number; alpha: number; isSmash: boolean }>;
}

interface DeflectorPaddle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  width: number;
  height: number;
  vx: number;
  lastX: number;
  glowColor: string;
}

export class CyberBombRelay extends BaseMinigame {
  public meta: MinigameMetadata = {
    id: 'cyber_bomb',
    title: 'Cyber Bomb Relay',
    subtitle: 'High-Voltage Plasma Fuse Deflection',
    category: 'Action',
    icon: '💣',
    targetScore: 5,
    timeLimitSec: 60,
    instructionsP1: 'Drag shield to deflect the bomb! Fast swipe triggers SUPER SMASH!',
    instructionsP2: 'حرك درع البلازما لرد القنبلة! التمرير السريع يفجر ضربة خارقة!'
  };

  private bomb!: PlasmaBomb;
  private p1Paddle!: DeflectorPaddle;
  private p2Paddle!: DeflectorPaddle;

  private rallyCount: number = 0;
  private tickTimer: number = 0;
  private explosionShockwave: { x: number; y: number; radius: number; maxRadius: number; life: number } | null = null;

  constructor(
    input: InputManager,
    audio: AudioHaptics,
    juice: JuiceEngine,
    progression: ProgressionManager,
    botAI: AIBotEngine
  ) {
    super(input, audio, juice, progression, botAI);
    this.targetScore = 5;
  }

  public init(width: number, height: number): void {
    const paddleW = Math.max(90, width * 0.28);
    const paddleH = 20;

    this.p1Paddle = {
      x: width * 0.5,
      y: height * 0.86,
      targetX: width * 0.5,
      targetY: height * 0.86,
      width: paddleW,
      height: paddleH,
      vx: 0,
      lastX: width * 0.5,
      glowColor: '#00F0FF'
    };

    this.p2Paddle = {
      x: width * 0.5,
      y: height * 0.14,
      targetX: width * 0.5,
      targetY: height * 0.14,
      width: paddleW,
      height: paddleH,
      vx: 0,
      lastX: width * 0.5,
      glowColor: '#FF0055'
    };

    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    const baseSpeed = 400;
    const launchToP1 = Math.random() < 0.5;
    const angle = (Math.random() - 0.5) * 0.6;

    this.bomb = {
      x: width * 0.5,
      y: height * 0.5,
      vx: Math.sin(angle) * baseSpeed,
      vy: (launchToP1 ? 1 : -1) * Math.cos(angle) * baseSpeed,
      radius: 17,
      fuseSec: 14.0,
      maxFuseSec: 14.0,
      speedRatio: 1.0,
      isSmash: false,
      trail: []
    };

    this.rallyCount = 0;
    this.tickTimer = 0.5;
    this.explosionShockwave = null;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Update Paddles
    this.updatePaddles(dt, width, height);

    // 2. Update Shockwave
    if (this.explosionShockwave) {
      this.explosionShockwave.radius += dt * 500;
      this.explosionShockwave.life -= dt * 2.0;
      if (this.explosionShockwave.life <= 0) {
        this.explosionShockwave = null;
      }
    }

    // 3. Update Bomb Trail
    this.bomb.trail.unshift({
      x: this.bomb.x,
      y: this.bomb.y,
      alpha: 1.0,
      isSmash: this.bomb.isSmash
    });
    if (this.bomb.trail.length > 14) this.bomb.trail.pop();
    for (const t of this.bomb.trail) {
      t.alpha -= dt * 3.5;
    }

    // 4. Update Fuse & Audio Ticking
    this.bomb.fuseSec -= dt;
    this.tickTimer -= dt;
    const tickInterval = Math.max(0.12, (this.bomb.fuseSec / this.bomb.maxFuseSec) * 0.65);
    if (this.tickTimer <= 0) {
      this.audio.playBombTick(this.bomb.speedRatio);
      this.tickTimer = tickInterval;
    }

    // 5. Check Fuse Detonation (Timeout in current half)
    if (this.bomb.fuseSec <= 0) {
      const losingPlayer: PlayerIndex = this.bomb.y > height * 0.5 ? 1 : 2;
      const winner: PlayerIndex = losingPlayer === 1 ? 2 : 1;
      this.triggerDetonation(winner, this.bomb.x, this.bomb.y, width, height, 'FUSE DETONATION');
      return;
    }

    // 6. Physics Step (Sub-stepped for high precision CCD)
    const substeps = 4;
    const sdt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      this.bomb.x += this.bomb.vx * sdt;
      this.bomb.y += this.bomb.vy * sdt;

      // Side Wall Bounces
      if (this.bomb.x - this.bomb.radius < 0) {
        this.bomb.x = this.bomb.radius;
        this.bomb.vx = Math.abs(this.bomb.vx);
        this.audio.playPuckBounce(0.9);
      } else if (this.bomb.x + this.bomb.radius > width) {
        this.bomb.x = width - this.bomb.radius;
        this.bomb.vx = -Math.abs(this.bomb.vx);
        this.audio.playPuckBounce(0.9);
      }

      // Check Paddle Collisions
      this.checkPaddleCollision(this.p1Paddle, 1);
      this.checkPaddleCollision(this.p2Paddle, 2);

      // Check Goal Breaches
      if (this.bomb.y - this.bomb.radius > height) {
        // P1 missed -> P2 scores
        this.triggerDetonation(2, this.bomb.x, height - 10, width, height, 'GOAL BREACH');
        return;
      } else if (this.bomb.y + this.bomb.radius < 0) {
        // P2 missed -> P1 scores
        this.triggerDetonation(1, this.bomb.x, 10, width, height, 'GOAL BREACH');
        return;
      }
    }
  }

  private updatePaddles(dt: number, width: number, height: number): void {
    // Player 1 (Bottom Half)
    const p1Touches = this.input.getTouchesForPlayer(1);
    if (p1Touches.length > 0) {
      const active = p1Touches[p1Touches.length - 1];
      this.p1Paddle.targetX = active.arenaX;
      // Clamped Y movement
      this.p1Paddle.targetY = Math.max(height * 0.65, Math.min(height * 0.92, active.arenaY));
    }

    // Player 2 (Top Half: AI or Human)
    if (this.progression.getGameMode() === 'vs_ai') {
      this.botAI.updateCyberBomb(this.p2Paddle, this.bomb, this.progression.getAIDifficulty(), dt, width, height);
    } else {
      const p2Touches = this.input.getTouchesForPlayer(2);
      if (p2Touches.length > 0) {
        const active = p2Touches[p2Touches.length - 1];
        this.p2Paddle.targetX = active.arenaX;
        this.p2Paddle.targetY = Math.max(height * 0.08, Math.min(height * 0.35, active.arenaY));
      }
    }

    // Smooth paddle interpolation & velocity tracking
    const smooth = 25 * dt;
    this.p1Paddle.lastX = this.p1Paddle.x;
    this.p1Paddle.x += (this.p1Paddle.targetX - this.p1Paddle.x) * Math.min(1.0, smooth);
    this.p1Paddle.y += (this.p1Paddle.targetY - this.p1Paddle.y) * Math.min(1.0, smooth);
    this.p1Paddle.vx = (this.p1Paddle.x - this.p1Paddle.lastX) / Math.max(0.001, dt);

    const halfW1 = this.p1Paddle.width * 0.5;
    this.p1Paddle.x = Math.max(halfW1, Math.min(width - halfW1, this.p1Paddle.x));

    this.p2Paddle.lastX = this.p2Paddle.x;
    this.p2Paddle.x += (this.p2Paddle.targetX - this.p2Paddle.x) * Math.min(1.0, smooth);
    this.p2Paddle.y += (this.p2Paddle.targetY - this.p2Paddle.y) * Math.min(1.0, smooth);
    this.p2Paddle.vx = (this.p2Paddle.x - this.p2Paddle.lastX) / Math.max(0.001, dt);

    const halfW2 = this.p2Paddle.width * 0.5;
    this.p2Paddle.x = Math.max(halfW2, Math.min(width - halfW2, this.p2Paddle.x));
  }

  private checkPaddleCollision(paddle: DeflectorPaddle, player: PlayerIndex): void {
    const isP1 = player === 1;
    // Direction check: P1 only deflects upward, P2 only downward
    if (isP1 && this.bomb.vy <= 0) return;
    if (!isP1 && this.bomb.vy >= 0) return;

    const halfW = paddle.width * 0.5;
    const halfH = paddle.height * 0.5;

    const nearX = Math.max(paddle.x - halfW, Math.min(this.bomb.x, paddle.x + halfW));
    const nearY = Math.max(paddle.y - halfH, Math.min(this.bomb.y, paddle.y + halfH));

    const dx = this.bomb.x - nearX;
    const dy = this.bomb.y - nearY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= this.bomb.radius * this.bomb.radius) {
      // Deflection success!
      this.rallyCount++;
      if (this.rallyCount >= 8) {
        AchievementManager.getInstance().unlock('bomb_squad');
      }

      // Check Smash hit from swift paddle motion
      const isSmash = Math.abs(paddle.vx) > 380;
      this.bomb.isSmash = isSmash;

      // Accelerate bomb
      this.bomb.speedRatio = Math.min(2.4, this.bomb.speedRatio + 0.09 + (isSmash ? 0.18 : 0));
      const currentSpeed = 440 * this.bomb.speedRatio;

      // Deflection angle offset from hit position
      const offset = (this.bomb.x - paddle.x) / halfW;
      const angle = offset * 0.95; // up to ~54 degrees

      this.bomb.vx = Math.sin(angle) * currentSpeed + paddle.vx * 0.15;
      this.bomb.vy = (isP1 ? -1 : 1) * Math.cos(angle) * currentSpeed;

      // Push bomb cleanly outside paddle
      this.bomb.y = isP1 ? paddle.y - halfH - this.bomb.radius - 2 : paddle.y + halfH + this.bomb.radius + 2;

      this.audio.playDeflectSound(this.bomb.speedRatio);
      this.juice.addTrauma(isSmash ? 0.45 : 0.2);
      this.juice.emitSparks(this.bomb.x, this.bomb.y, isSmash ? '#FFE600' : paddle.glowColor, isSmash ? 24 : 12);
    }
  }

  private triggerDetonation(winner: PlayerIndex, x: number, y: number, width: number, height: number, _cause: string): void {
    this.roundWinner = winner;
    if (winner === 1) this.p1Score++;
    else this.p2Score++;

    this.audio.playPlasmaExplosion();
    this.juice.addTrauma(0.7);
    this.juice.triggerSlowMo(0.35, 0.32);
    this.juice.emitSparks(x, y, '#FF0055', 45);

    this.explosionShockwave = {
      x,
      y,
      radius: 10,
      maxRadius: width * 0.75,
      life: 1.0
    };

    if (this.p1Score >= this.targetScore || this.p2Score >= this.targetScore) {
      const matchWinner: PlayerIndex = this.p1Score >= this.targetScore ? 1 : 2;
      this.completeMatch(matchWinner, width, height);
    } else {
      this.isRoundOver = true;
      this.roundOverTimer = 1.7;
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const centerY = height * 0.5;

    // 1. Dark Court Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (isDay) {
      bgGrad.addColorStop(0, '#E8F1FC');
      bgGrad.addColorStop(0.5, '#F5F9FF');
      bgGrad.addColorStop(1, '#E8F1FC');
    } else {
      bgGrad.addColorStop(0, '#12040D');
      bgGrad.addColorStop(0.5, '#060814');
      bgGrad.addColorStop(1, '#05111F');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Center Danger Net
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Center Warning Circle
    ctx.beginPath();
    ctx.arc(width * 0.5, centerY, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 3. Shockwave
    if (this.explosionShockwave) {
      const sw = this.explosionShockwave;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 40, 80, ${sw.life})`;
      ctx.lineWidth = 6 * sw.life;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Bomb Trail
    for (const t of this.bomb.trail) {
      if (t.alpha <= 0) continue;
      ctx.save();
      ctx.fillStyle = t.isSmash ? `rgba(255, 230, 0, ${t.alpha * 0.7})` : `rgba(255, 0, 85, ${t.alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.bomb.radius * (0.4 + t.alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. Plasma Bomb Core
    this.renderBomb(ctx);

    // 6. Deflector Paddles
    this.renderPaddle(ctx, this.p1Paddle);
    this.renderPaddle(ctx, this.p2Paddle);

    // 7. HUD Banner (Rally & Fuse Display)
    this.renderHUD(ctx, width, height);
  }

  private renderBomb(ctx: CanvasRenderingContext2D): void {
    const b = this.bomb;
    const fuseRatio = Math.max(0, b.fuseSec / b.maxFuseSec);
    const dangerColor = fuseRatio < 0.35 ? '#FF0033' : b.isSmash ? '#FFE600' : '#FF0055';

    ctx.save();
    ctx.translate(b.x, b.y);

    // Outer plasma glow
    ctx.shadowColor = dangerColor;
    ctx.shadowBlur = 18 * b.speedRatio;

    // Core sphere
    ctx.fillStyle = dangerColor;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // White core heat
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Fuse countdown number on bomb
    ctx.font = `900 12px 'Inter', sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.ceil(b.fuseSec).toString(), 0, 0);

    ctx.restore();
  }

  private renderPaddle(ctx: CanvasRenderingContext2D, p: DeflectorPaddle): void {
    ctx.save();
    const halfW = p.width * 0.5;
    const halfH = p.height * 0.5;

    ctx.shadowColor = p.glowColor;
    ctx.shadowBlur = 14;

    // Glowing shield bar
    ctx.fillStyle = p.glowColor;
    ctx.beginPath();
    ctx.roundRect(p.x - halfW, p.y - halfH, p.width, p.height, 8);
    ctx.fill();

    // Inner energy conduit
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(p.x - halfW + 6, p.y - 2, p.width - 12, 4, 2);
    ctx.fill();

    ctx.restore();
  }

  private renderHUD(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const centerY = height * 0.5;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Rally counter
    if (this.rallyCount > 0) {
      ctx.font = `900 18px 'Inter', sans-serif`;
      ctx.fillStyle = this.rallyCount >= 6 ? '#FFE600' : '#00F0FF';
      ctx.fillText(`🔥 RALLY x${this.rallyCount}`, width * 0.5, centerY - 24);
    }

    // Fuse warning
    const fuseSec = Math.max(0, this.bomb.fuseSec).toFixed(1);
    ctx.font = `700 14px 'Cairo', sans-serif`;
    ctx.fillStyle = this.bomb.fuseSec < 4 ? '#FF0033' : '#94A3B8';
    ctx.fillText(`⏱️ الفتيل: ${fuseSec}s`, width * 0.5, centerY + 24);

    ctx.restore();
  }
}
