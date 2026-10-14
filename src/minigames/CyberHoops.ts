import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex, Vector2 } from '../core/types';

interface Basketball {
  active: boolean;
  owner: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isOnFire: boolean;
  swishStreak: number;
  trailTimer: number;
}

interface CyberHoop {
  player: PlayerIndex;
  x: number;
  y: number;
  width: number;
  rimRadius: number;
  speed: number;
  direction: number;
  minX: number;
  maxX: number;
}

export class CyberHoops extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'cyber_hoops',
    title: 'Cyber Hoops 1v1',
    subtitle: 'Kinetic Basketball & Swish Streaks',
    category: 'Action & Speed',
    icon: '🏀',
    targetScore: 7,
    timeLimitSec: 90,
    instructionsP1: 'Drag & release to shoot! Tap in mid-court to block!',
    instructionsP2: 'Drag & release to shoot! Tap in mid-court to block!'
  };

  private balls: Basketball[] = [];
  private hoopP1!: CyberHoop; // Target hoop for P1 (located in P2's half)
  private hoopP2!: CyberHoop; // Target hoop for P2 (located in P1's half)

  // Drag aiming vectors
  private dragStartP1: Vector2 | null = null;
  private dragCurrentP1: Vector2 | null = null;
  private dragStartP2: Vector2 | null = null;
  private dragCurrentP2: Vector2 | null = null;

  private p1SwishStreak: number = 0;
  private p2SwishStreak: number = 0;

  private botShootTimer: number = 1.0;
  private gravity: number = 1100; // px/s^2

  public init(width: number, height: number): void {
    this.targetScore = 7;
    this.p1Score = 0;
    this.p2Score = 0;
    this.p1SwishStreak = 0;
    this.p2SwishStreak = 0;

    // Initialize hoops
    this.hoopP1 = {
      player: 1,
      x: width / 2,
      y: height * 0.22, // in P2's court
      width: 64,
      rimRadius: 28,
      speed: 80,
      direction: 1,
      minX: 70,
      maxX: width - 70
    };

    this.hoopP2 = {
      player: 2,
      x: width / 2,
      y: height * 0.78, // in P1's court
      width: 64,
      rimRadius: 28,
      speed: 80,
      direction: -1,
      minX: 70,
      maxX: width - 70
    };

    this.resetRound(width, height);
  }

  public resetRound(_width: number, _height: number): void {
    this.balls = [];
    this.dragStartP1 = null;
    this.dragCurrentP1 = null;
    this.dragStartP2 = null;
    this.dragCurrentP2 = null;
    this.botShootTimer = 0.8;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Update Hoops Horizontal Sway
    this.updateHoop(this.hoopP1, dt);
    this.updateHoop(this.hoopP2, dt);

    // 2. Handle Human Input Drag & Aim
    this.handleTouchInputs(width, height);

    // 3. Handle AI Bot Logic
    if (this.progression.getGameMode() === 'vs_ai') {
      this.updateBot(dt);
    }

    // 4. Update Active Balls Physics & Trajectory
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (!b.active) {
        this.balls.splice(i, 1);
        continue;
      }

      // Gravity pulls ball toward owner's target hoop
      // For P1 (shooting up): gravity pulls down (+y)
      // For P2 (shooting down): gravity pulls up (-y)
      const g = b.owner === 1 ? this.gravity : -this.gravity;
      b.vy += g * dt;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Particle Trail (sparks only: explosion would spam trauma/flash/shockwave)
      b.trailTimer += dt;
      if (b.trailTimer >= 0.03) {
        b.trailTimer = 0;
        const trailColor = b.isOnFire ? '#FF4400' : (b.owner === 1 ? '#FF0055' : '#0084FF');
        this.juice.emitSparks(b.x, b.y, trailColor, b.isOnFire ? 3 : 1, 60, 0.25);
      }

      // Sidewall Bounce
      if (b.x - b.radius < 12) {
        b.x = 12 + b.radius;
        b.vx = -b.vx * 0.7;
        this.audio.playPaddleWallBounce();
      } else if (b.x + b.radius > width - 12) {
        b.x = width - 12 - b.radius;
        b.vx = -b.vx * 0.7;
        this.audio.playPaddleWallBounce();
      }

      // Check Basket Scored
      const targetHoop = b.owner === 1 ? this.hoopP1 : this.hoopP2;
      const hoopDistX = Math.abs(b.x - targetHoop.x);
      const hoopDistY = Math.abs(b.y - targetHoop.y);

      // Scoring condition: Ball passing through the hoop cylinder from front
      const passingY = b.owner === 1 ? (b.vy > 0 && hoopDistY < 16) : (b.vy < 0 && hoopDistY < 16);
      if (hoopDistX < targetHoop.rimRadius && passingY) {
        // GOAL SCORED!
        const isSwish = hoopDistX < targetHoop.rimRadius * 0.5;
        const pts = b.isOnFire ? 2 : 1;

        if (b.owner === 1) {
          if (isSwish) this.p1SwishStreak++;
          else this.p1SwishStreak = 0;
          this.p1Score += pts;
        } else {
          if (isSwish) this.p2SwishStreak++;
          else this.p2SwishStreak = 0;
          this.p2Score += pts;
        }

        this.audio.playHoopSwish();
        this.juice.addTrauma(0.35);
        this.juice.emitExplosion(targetHoop.x, targetHoop.y, b.isOnFire ? '#FFD700' : '#00FF66', 25);

        b.active = false;

        // Check Match Victory
        if (this.p1Score >= this.targetScore || this.p2Score >= this.targetScore) {
          const winner: PlayerIndex = this.p1Score >= this.targetScore ? 1 : 2;
          this.completeMatch(winner, width, height);
        }
        continue;
      }

      // Rim / Backboard Collision
      if (hoopDistX < targetHoop.rimRadius + 10 && hoopDistY < 12) {
        b.vy = -b.vy * 0.55;
        b.vx += (Math.random() - 0.5) * 120;
        this.audio.playPaddleBallImpact();
      }

      // Out of bounds cleanup
      if (b.y < -50 || b.y > height + 50) {
        b.active = false;
      }
    }
  }

  private updateHoop(hoop: CyberHoop, dt: number) {
    hoop.x += hoop.speed * hoop.direction * dt;
    if (hoop.x < hoop.minX) {
      hoop.x = hoop.minX;
      hoop.direction = 1;
    } else if (hoop.x > hoop.maxX) {
      hoop.x = hoop.maxX;
      hoop.direction = -1;
    }
  }

  private handleTouchInputs(_width: number, height: number) {
    const touches = this.input.getTouches();

    for (const touch of touches) {
      const p = touch.player;

      if (touch.phase === 'began') {
        // Defensive Block Tap in Midfield?
        const isMidfield = p === 1 ? (touch.rawY < height * 0.55 && touch.rawY > height * 0.35)
                                   : (touch.rawY > height * 0.45 && touch.rawY < height * 0.65);
        if (isMidfield) {
          this.triggerDefensiveBlock(p, touch.rawX, touch.rawY);
          continue;
        }

        // Shooting Drag Start
        if (p === 1 && touch.rawY > height * 0.6) {
          this.dragStartP1 = { x: touch.rawX, y: touch.rawY };
          this.dragCurrentP1 = { x: touch.rawX, y: touch.rawY };
        } else if (p === 2 && touch.rawY < height * 0.4) {
          this.dragStartP2 = { x: touch.rawX, y: touch.rawY };
          this.dragCurrentP2 = { x: touch.rawX, y: touch.rawY };
        }
      } else if (touch.phase === 'moved') {
        if (p === 1 && this.dragStartP1) {
          this.dragCurrentP1 = { x: touch.rawX, y: touch.rawY };
        } else if (p === 2 && this.dragStartP2) {
          this.dragCurrentP2 = { x: touch.rawX, y: touch.rawY };
        }
      } else if (touch.phase === 'ended' || touch.phase === 'canceled') {
        if (p === 1 && this.dragStartP1 && this.dragCurrentP1) {
          this.launchBall(1, this.dragStartP1, this.dragCurrentP1);
          this.dragStartP1 = null;
          this.dragCurrentP1 = null;
        } else if (p === 2 && this.dragStartP2 && this.dragCurrentP2) {
          this.launchBall(2, this.dragStartP2, this.dragCurrentP2);
          this.dragStartP2 = null;
          this.dragCurrentP2 = null;
        }
      }
    }
  }

  private launchBall(owner: PlayerIndex, start: Vector2, current: Vector2) {
    // Pull back vector (slingshot impulse)
    const dx = start.x - current.x;
    const dy = start.y - current.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 15) return; // Ignore accidental tap

    const power = Math.min(dist * 5.8, 1200);
    const angle = Math.atan2(dy, dx);

    const isOnFire = owner === 1 ? (this.p1SwishStreak >= 2) : (this.p2SwishStreak >= 2);

    this.balls.push({
      active: true,
      owner,
      x: start.x,
      y: start.y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      radius: 14,
      isOnFire,
      swishStreak: owner === 1 ? this.p1SwishStreak : this.p2SwishStreak,
      trailTimer: 0
    });

    this.audio.playDiceRoll();
  }

  private triggerDefensiveBlock(player: PlayerIndex, x: number, y: number) {
    this.audio.playPinballFlipper();
    this.juice.emitExplosion(x, y, player === 1 ? '#FF0055' : '#0084FF', 12);

    // Deflect any opponent balls within radius
    for (const b of this.balls) {
      if (b.active && b.owner !== player) {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < 65) {
          b.vx = (b.x - x) * 6;
          b.vy = (player === 1 ? -300 : 300);
          this.juice.addTrauma(0.2);
          this.audio.playPaddleBallImpact();
        }
      }
    }
  }

  private updateBot(dt: number) {
    this.botShootTimer -= dt;
    if (this.botShootTimer > 0) return;

    const diff = this.progression.getAIDifficulty();
    this.botShootTimer = diff === 'hard' ? 1.1 : diff === 'medium' ? 1.6 : 2.2;

    // Calculate arc towards hoopP2 (located in P1's half)
    const target = this.hoopP2;
    const startX = 100 + Math.random() * 220;
    const startY = 160;

    const targetX = target.x + (diff === 'hard' ? (Math.random() - 0.5) * 15 : (Math.random() - 0.5) * 50);
    const targetY = target.y;

    const dx = targetX - startX;
    const dy = targetY - startY;

    // Pull vector opposite to trajectory
    const start: Vector2 = { x: startX, y: startY };
    const current: Vector2 = { x: startX - dx * 0.18, y: startY - dy * 0.18 };

    this.launchBall(2, start, current);
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const now = performance.now();

    // 0. Court floor energy pools beneath each player's end
    this.juice.drawRadialFloorLight(ctx, width / 2, height * 0.8, width * 0.34, '#FF0055', 0.13 + Math.sin(now * 0.004) * 0.05);
    this.juice.drawRadialFloorLight(ctx, width / 2, height * 0.2, width * 0.34, '#0084FF', 0.13 + Math.sin(now * 0.004 + 1.7) * 0.05);

    // 1. Render Court Boundary & Key Lines
    ctx.save();
    ctx.strokeStyle = isDay ? 'rgba(30, 50, 90, 0.18)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;

    // Center Court Arc Keys
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.22, 85, 0, Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(width / 2, height * 0.78, 85, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Center Dividing Line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(30, height / 2);
    ctx.lineTo(width - 30, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 1b. Player-end court spotlights
    this.juice.drawRadialFloorLight(ctx, width / 2, height * 0.22, width * 0.38, 'rgba(0, 132, 255, 0.16)', 0.9);
    this.juice.drawRadialFloorLight(ctx, width / 2, height * 0.78, width * 0.38, 'rgba(255, 0, 85, 0.16)', 0.9);

    // 2. Render Hoops (Glass Backboard + Laser Net)
    this.renderCyberHoop(ctx, this.hoopP1, isDay);
    this.renderCyberHoop(ctx, this.hoopP2, isDay);

    // 3. Render Aim Trajectory Lines
    if (this.dragStartP1 && this.dragCurrentP1) {
      this.renderAimLine(ctx, this.dragStartP1, this.dragCurrentP1, '#FF0055');
    }
    if (this.dragStartP2 && this.dragCurrentP2) {
      this.renderAimLine(ctx, this.dragStartP2, this.dragCurrentP2, '#0084FF');
    }

    // 4. Render Active Basketballs (3D Sphere Shading + Glowing Seams)
    for (const b of this.balls) {
      if (!b.active) continue;

      ctx.save();
      this.juice.drawRadialFloorLight(ctx, b.x, b.y, b.radius * 2.2, b.isOnFire ? '#FF5500' : (b.owner === 1 ? '#FF0055' : '#0084FF'), 0.4);

      // On Fire Solar Aura
      if (b.isOnFire) {
        ctx.save();
        const fireGrad = ctx.createRadialGradient(b.x, b.y, b.radius * 0.5, b.x, b.y, b.radius * 2.2);
        fireGrad.addColorStop(0, 'rgba(255, 200, 0, 0.6)');
        fireGrad.addColorStop(0.5, 'rgba(255, 60, 0, 0.3)');
        fireGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fireGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3D Spherical Ball Gradient
      const baseColor = b.isOnFire ? '#FF5500' : (b.owner === 1 ? '#FF0055' : '#0084FF');
      const ballGrad = ctx.createRadialGradient(b.x - b.radius * 0.35, b.y - b.radius * 0.35, 2, b.x, b.y, b.radius);
      ballGrad.addColorStop(0, '#FFFFFF');
      ballGrad.addColorStop(0.25, b.isOnFire ? '#FFAA00' : baseColor);
      ballGrad.addColorStop(0.85, b.isOnFire ? '#D02000' : '#101726');
      ballGrad.addColorStop(1, '#05080f');

      ctx.fillStyle = ballGrad;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = b.isOnFire ? 20 : 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Cyber Seams Ribbing
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Horizontal rib
      ctx.arc(b.x, b.y, b.radius, -0.3, 0.3);
      // Center cross rib
      ctx.moveTo(b.x, b.y - b.radius);
      ctx.lineTo(b.x, b.y + b.radius);
      ctx.stroke();

      ctx.restore();
    }
  }

  private renderCyberHoop(ctx: CanvasRenderingContext2D, hoop: CyberHoop, isDay: boolean) {
    const now = performance.now();
    ctx.save();
    const color = hoop.player === 1 ? '#FF0055' : '#0084FF';

    // Dynamic Floor Glow under hoop
    this.juice.drawRadialFloorLight(ctx, hoop.x, hoop.y, hoop.rimRadius * 2.8, color, 0.4);

    // 1. Tempered Glass LED Backboard
    const bbW = hoop.width;
    const bbH = 22;
    const bbX = hoop.x - bbW / 2;
    const bbY = hoop.y - bbH / 2;

    // Backboard Glass
    const bbGrad = ctx.createLinearGradient(bbX, bbY, bbX, bbY + bbH);
    bbGrad.addColorStop(0, isDay ? 'rgba(255, 255, 255, 0.95)' : 'rgba(28, 36, 54, 0.9)');
    bbGrad.addColorStop(1, isDay ? 'rgba(230, 240, 255, 0.85)' : 'rgba(12, 17, 26, 0.85)');
    ctx.fillStyle = bbGrad;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(bbX, bbY, bbW, bbH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner Target Square
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hoop.x - 14, hoop.y - 6, 28, 12);

    // 2. Animated Rippling Laser Net (player-aligned color)
    const netDrop = 26;
    const netSegments = 5;
    const netSway = Math.sin(now * 0.005 + hoop.x) * 3;
    const netColor = hoop.player === 1 ? 'rgba(255, 0, 85, 0.75)' : 'rgba(0, 132, 255, 0.75)';
    ctx.strokeStyle = netColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now * 0.01 + hoop.player);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    for (let i = 0; i < netSegments; i++) {
      const topX = hoop.x - hoop.rimRadius + (i / (netSegments - 1)) * (hoop.rimRadius * 2);
      const botX = hoop.x - hoop.rimRadius * 0.5 + (i / (netSegments - 1)) * hoop.rimRadius + netSway;
      ctx.beginPath();
      ctx.moveTo(topX, hoop.y);
      ctx.lineTo(botX, hoop.y + netDrop);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // 3. Glowing Heavy Neon Rim
    ctx.beginPath();
    ctx.arc(hoop.x, hoop.y, hoop.rimRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFAA00';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#FFAA00';
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Breathing target-glow ring just outside the rim
    this.juice.drawPulseRing(ctx, hoop.x, hoop.y, hoop.rimRadius + 6, color, now * 0.001, 3.4, 5);

    // White rim top highlight
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.restore();
  }

  private renderAimLine(ctx: CanvasRenderingContext2D, start: Vector2, current: Vector2, color: string) {
    ctx.save();
    const pullX = start.x - current.x;
    const pullY = start.y - current.y;

    // Parabolic Dotted Trajectory Arc
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 5]);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const endX = start.x + pullX * 1.5;
    const endY = start.y + pullY * 1.5;
    ctx.quadraticCurveTo(start.x + pullX * 0.75, start.y + pullY * 0.2, endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target Crosshair at arc tip
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
