import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';
import { botProfile } from '../core/BotDifficulty';

interface VolleyPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isJumping: boolean;
  jumpZ: number; // height off ground
  jumpVz: number;
  spikeGauge: number;
  color: string;
}

interface VolleyBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  z: number; // simulated height
  vz: number;
  isSpiked: boolean;
  rallyCount: number;
  lastTouch: PlayerIndex | null;
  hitCooldown: number;
}

// Minimum seconds between two registered hits on the same ball: without it
// an overlapping ball re-triggers every frame, farming rallyCount.
const VOLLEY_HIT_COOLDOWN = 0.25;

export class NeonVolley extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'neon_volley',
    title: 'Neon Volley 1v1',
    subtitle: 'Aerial Spikes & Kinetic Net Physics',
    category: 'Action & Speed',
    icon: '🏐',
    targetScore: 5,
    timeLimitSec: 90,
    instructionsP1: 'Slide to move! Double tap or tap Spike to jump & smash!',
    instructionsP2: 'Slide to move! Double tap or tap Spike to jump & smash!'
  };

  private p1!: VolleyPlayer;
  private p2!: VolleyPlayer;
  private ball!: VolleyBall;

  private netY: number = 0;
  private netHeight: number = 14;

  public init(width: number, height: number): void {
    this.targetScore = 5;
    this.p1Score = 0;
    this.p2Score = 0;
    this.netY = height * 0.5;

    const p1Colors = this.progression.getSkinColors(1);
    const p2Colors = this.progression.getSkinColors(2);

    this.p1 = {
      x: width * 0.5,
      y: height * 0.75,
      vx: 0,
      vy: 0,
      radius: 26,
      isJumping: false,
      jumpZ: 0,
      jumpVz: 0,
      spikeGauge: 0,
      color: p1Colors.primary
    };

    this.p2 = {
      x: width * 0.5,
      y: height * 0.25,
      vx: 0,
      vy: 0,
      radius: 26,
      isJumping: false,
      jumpZ: 0,
      jumpVz: 0,
      spikeGauge: 0,
      color: p2Colors.primary
    };

    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    this.netY = height * 0.5;
    this.p1.x = width * 0.5;
    this.p1.y = height * 0.78;
    this.p1.vx = 0;
    this.p1.vy = 0;
    this.p1.isJumping = false;
    this.p1.jumpZ = 0;
    this.p1.jumpVz = 0;

    this.p2.x = width * 0.5;
    this.p2.y = height * 0.22;
    this.p2.vx = 0;
    this.p2.vy = 0;
    this.p2.isJumping = false;
    this.p2.jumpZ = 0;
    this.p2.jumpVz = 0;

    // Ball served from server side towards receiver
    const server: PlayerIndex = (this.p1Score + this.p2Score) % 2 === 0 ? 1 : 2;
    this.ball = {
      x: width * 0.5,
      y: server === 1 ? height * 0.68 : height * 0.32,
      vx: (Math.random() - 0.5) * 80,
      vy: server === 1 ? -320 : 320,
      radius: 16,
      z: 20,
      vz: 120,
      isSpiked: false,
      rallyCount: 0,
      lastTouch: server,
      hitCooldown: 0
    };
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Process player inputs
    this.handleInputs(width, height);

    // 2. AI Bot Update
    if (this.progression.getGameMode() === 'vs_ai') {
      this.updateBotAI(dt, width, height);
    }

    // 3. Update physics for players jumping
    this.updatePlayerJump(this.p1, dt);
    this.updatePlayerJump(this.p2, dt);

    // 4. Update ball physics
    this.updateBall(dt, width, height);

    // 5. Check collision with players (cooldown ticks once per frame here,
    // not inside the per-player check which runs twice)
    this.ball.hitCooldown = Math.max(0, this.ball.hitCooldown - dt);
    this.checkBallPlayerCollision(this.p1, 1);
    this.checkBallPlayerCollision(this.p2, 2);

    // 6. Check score conditions
    this.checkScoring(width, height);
  }

  private handleInputs(width: number, height: number) {
    const touches = this.input.getTouches();

    for (const touch of touches) {
      if (touch.player === 1) {
        // Player 1 controls (bottom half: y from netY to height)
        this.p1.x += (touch.rawX - this.p1.x) * 0.25;
        this.p1.y += (Math.max(this.netY + 40, Math.min(height - 40, touch.rawY)) - this.p1.y) * 0.25;
        if (touch.phase === 'began' && !this.p1.isJumping && touch.rawY < this.netY + 140) {
          this.triggerJump(this.p1);
        }
      } else if (this.progression.getGameMode() !== 'vs_ai' && touch.player === 2) {
        // Player 2 controls (top half: y from 0 to netY - 40)
        this.p2.x += (touch.rawX - this.p2.x) * 0.25;
        this.p2.y += (Math.max(40, Math.min(this.netY - 40, touch.rawY)) - this.p2.y) * 0.25;
        if (touch.phase === 'began' && !this.p2.isJumping && touch.rawY > this.netY - 140) {
          this.triggerJump(this.p2);
        }
      }
    }

    // Keyboard controls
    const kb1 = this.input.keyboardP1;
    if (kb1.x !== 0 || kb1.y !== 0) {
      this.p1.x += kb1.x * 380 * 0.016;
      this.p1.y += kb1.y * 380 * 0.016;
      this.p1.x = Math.max(30, Math.min(width - 30, this.p1.x));
      this.p1.y = Math.max(this.netY + 40, Math.min(height - 40, this.p1.y));
    }
    if (kb1.actionA && !this.p1.isJumping) {
      this.triggerJump(this.p1);
    }

    if (this.progression.getGameMode() !== 'vs_ai') {
      const kb2 = this.input.keyboardP2;
      if (kb2.x !== 0 || kb2.y !== 0) {
        this.p2.x += kb2.x * 380 * 0.016;
        this.p2.y += kb2.y * 380 * 0.016;
        this.p2.x = Math.max(30, Math.min(width - 30, this.p2.x));
        this.p2.y = Math.max(40, Math.min(this.netY - 40, this.p2.y));
      }
      if (kb2.actionA && !this.p2.isJumping) {
        this.triggerJump(this.p2);
      }
    }
  }

  private triggerJump(player: VolleyPlayer) {
    player.isJumping = true;
    player.jumpZ = 1;
    player.jumpVz = 380;
    this.audio.playPaddleBallImpact();
  }

  private updatePlayerJump(player: VolleyPlayer, dt: number) {
    if (!player.isJumping) return;
    player.jumpZ += player.jumpVz * dt;
    player.jumpVz -= 900 * dt; // gravity

    if (player.jumpZ <= 0) {
      player.jumpZ = 0;
      player.jumpVz = 0;
      player.isJumping = false;
    }
  }

  private updateBotAI(dt: number, width: number, _height: number) {
    const diff = this.progression.getAIDifficulty();
    const prof = botProfile(diff);
    let trackSpeed = diff === 'hard' ? 440 : diff === 'medium' ? 320 : 220;

    // Track ball x
    let targetX = this.ball.x;
    let targetY = Math.min(this.netY - 45, Math.max(60, this.ball.y));

    // Anticipate ball when in bot half
    if (this.ball.vy < 0) {
      const timeToReach = Math.max(0.1, (this.ball.y - this.p2.y) / Math.abs(this.ball.vy));
      targetX = this.ball.x + this.ball.vx * timeToReach;
      targetX = Math.max(35, Math.min(width - 35, targetX));
    } else {
      // Default rest position
      targetX = width * 0.5;
      targetY = this.netY * 0.45;
    }

    // Lower tiers misread the position (easy ±30px, medium ±10px, hard exact)
    targetX += (Math.random() - 0.5) * 2 * prof.jitterPx * 0.8;
    targetX = Math.max(20, Math.min(width - 20, targetX));

    this.p2.x += (targetX - this.p2.x) * Math.min(1.0, trackSpeed * dt * 0.03);
    this.p2.y += (targetY - this.p2.y) * Math.min(1.0, trackSpeed * dt * 0.03);

    // Jump / Spike logic when ball is close to net
    if (this.ball.y < this.netY && this.ball.y > this.netY - 110 && !this.p2.isJumping) {
      if (Math.hypot(this.p2.x - this.ball.x, this.p2.y - this.ball.y) < 70) {
        if (Math.random() < (diff === 'hard' ? 0.9 : diff === 'medium' ? 0.6 : 0.3)) {
          this.triggerJump(this.p2);
        }
      }
    }
  }

  private updateBall(dt: number, width: number, _height: number) {
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    // Bounce off side walls
    if (this.ball.x - this.ball.radius < 10) {
      this.ball.x = 10 + this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.95;
      this.audio.playPaddleWallBounce();
      this.juice.emitSparks(this.ball.x, this.ball.y, '#00F0FF', 6);
    } else if (this.ball.x + this.ball.radius > width - 10) {
      this.ball.x = width - 10 - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.95;
      this.audio.playPaddleWallBounce();
      this.juice.emitSparks(this.ball.x, this.ball.y, '#00F0FF', 6);
    }

    // Net collision
    if (Math.abs(this.ball.y - this.netY) < this.ball.radius + this.netHeight * 0.5) {
      // If low ball, reflect back
      if (!this.ball.isSpiked && Math.abs(this.ball.vy) < 220) {
        this.ball.vy = -this.ball.vy * 0.7;
        this.audio.playBumperHit();
        this.juice.emitSparks(this.ball.x, this.netY, '#FFD700', 10);
      }
    }
  }

  private checkBallPlayerCollision(player: VolleyPlayer, pIdx: PlayerIndex) {
    const dist = Math.hypot(this.ball.x - player.x, this.ball.y - player.y);
    if (dist < this.ball.radius + player.radius && this.ball.hitCooldown <= 0) {
      this.ball.hitCooldown = VOLLEY_HIT_COOLDOWN;
      this.ball.lastTouch = pIdx;
      this.ball.rallyCount++;

      // Separate ball from player so the next frame cannot double-register
      const sepX = dist > 0.001 ? (this.ball.x - player.x) / dist : 0;
      const sepY = dist > 0.001 ? (this.ball.y - player.y) / dist : (pIdx === 1 ? -1 : 1);
      this.ball.x = player.x + sepX * (this.ball.radius + player.radius + 1);
      this.ball.y = player.y + sepY * (this.ball.radius + player.radius + 1);

      const isSpike = player.isJumping && player.jumpZ > 15;
      this.ball.isSpiked = isSpike;

      // Base return speed scales with rally count
      const baseSpeed = isSpike ? 680 : 380 + Math.min(260, this.ball.rallyCount * 25);

      // Angle depends on where player hit the ball
      const hitOffsetX = (this.ball.x - player.x) / player.radius;
      this.ball.vx = hitOffsetX * 340;
      this.ball.vy = pIdx === 1 ? -baseSpeed : baseSpeed;

      if (isSpike) {
        this.audio.playSuperSpike();
        this.juice.addTrauma(0.4);
        this.juice.emitExplosion(this.ball.x, this.ball.y, '#FF0055', 25);
        this.juice.triggerShockwave(this.ball.x, this.ball.y, '#FF0055', 100);
      } else {
        this.audio.playVolleyHit(false);
        this.juice.addTrauma(0.15);
        this.juice.emitSparks(this.ball.x, this.ball.y, player.color, 12);
      }
    }
  }

  private checkScoring(width: number, height: number) {
    // Ball touched bottom floor (P1 side)
    if (this.ball.y > height - 15) {
      this.triggerPointScore(2, width, height);
    }
    // Ball touched top floor (P2 side)
    else if (this.ball.y < 15) {
      this.triggerPointScore(1, width, height);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';

    // 1. Court floor & markings
    ctx.save();
    ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.15)' : 'rgba(0, 240, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    // 3m attack lines
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(12, this.netY - 120);
    ctx.lineTo(width - 12, this.netY - 120);
    ctx.moveTo(12, this.netY + 120);
    ctx.lineTo(width - 12, this.netY + 120);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Neon Laser Net
    const netGlow = ctx.createLinearGradient(0, this.netY - 4, width, this.netY + 4);
    netGlow.addColorStop(0, '#FF0055');
    netGlow.addColorStop(0.5, '#00F0FF');
    netGlow.addColorStop(1, '#FF0055');
    ctx.fillStyle = netGlow;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 14;
    ctx.fillRect(8, this.netY - 3, width - 16, 6);
    ctx.shadowBlur = 0;

    // 3. Render Players with simulated shadow when jumping
    this.renderPlayer(ctx, this.p1, 1);
    this.renderPlayer(ctx, this.p2, 2);

    // 4. Render Ball & Trail
    this.renderBall(ctx);

    // 5. Rally count badge in deadzone center
    ctx.fillStyle = isDay ? '#0F172A' : '#FFFFFF';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`RALLY: ${this.ball.rallyCount}`, width * 0.5, this.netY - 12);

    ctx.restore();
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, p: VolleyPlayer, _pIdx: PlayerIndex) {
    ctx.save();
    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Player Avatar elevated by jumpZ
    const renderY = p.y - p.jumpZ;
    const grad = ctx.createRadialGradient(p.x, renderY, p.radius * 0.2, p.x, renderY, p.radius);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.6, p.color);
    grad.addColorStop(1, '#080C14');

    ctx.fillStyle = grad;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.isJumping ? 20 : 10;
    ctx.beginPath();
    ctx.arc(p.x, renderY, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner energy ring
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, renderY, p.radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // Jump indicator
    if (p.isJumping) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SPIKE READY!', p.x, renderY - p.radius - 8);
    }
    ctx.restore();
  }

  private renderBall(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const b = this.ball;
    const ballColor = b.isSpiked ? '#FF0055' : '#FFD700';

    ctx.shadowColor = ballColor;
    ctx.shadowBlur = b.isSpiked ? 24 : 12;

    const grad = ctx.createRadialGradient(b.x, b.y, b.radius * 0.1, b.x, b.y, b.radius);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.5, ballColor);
    grad.addColorStop(1, '#FF5500');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // Volleyball curved rib lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(b.x - 3, b.y, b.radius * 0.7, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();
    ctx.restore();
  }
}
