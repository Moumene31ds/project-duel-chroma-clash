import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface TugPlayer {
  index: PlayerIndex;
  y: number;
  pullPower: number;
  meterVal: number; // 0 to 1
  meterDir: number; // 1 or -1
  meterSpeed: number;
  overcharge: number; // 0 to 100
  lastTapTime: number;
  surgeActive: boolean;
  surgeTimer: number;
  color: string;
}

export class QuantumTug extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'quantum_tug',
    title: 'Quantum Tug Duel',
    subtitle: 'Gravitational Singularity Rope Clash',
    category: 'Action & Speed',
    icon: '⚡',
    targetScore: 3,
    timeLimitSec: 90,
    instructionsP1: 'Tap when the meter hits the GREEN zone to pull the core!',
    instructionsP2: 'Tap when the meter hits the GREEN zone to pull the core!'
  };

  private p1!: TugPlayer;
  private p2!: TugPlayer;

  // Quantum core position along vertical axis (0 = P2 vortex, height = P1 vortex, height*0.5 = center)
  private coreY: number = 0;
  private coreVy: number = 0;
  private coreRadius: number = 24;

  private botTapTimer: number = 0;

  public init(width: number, height: number): void {
    this.targetScore = 3;
    this.p1Score = 0;
    this.p2Score = 0;
    this.coreY = height * 0.5;
    this.coreVy = 0;

    const p1Colors = this.progression.getSkinColors(1);
    const p2Colors = this.progression.getSkinColors(2);

    this.p1 = {
      index: 1,
      y: height - 60,
      pullPower: 0,
      meterVal: 0,
      meterDir: 1,
      meterSpeed: 2.2,
      overcharge: 0,
      lastTapTime: 0,
      surgeActive: false,
      surgeTimer: 0,
      color: p1Colors.primary
    };

    this.p2 = {
      index: 2,
      y: 60,
      pullPower: 0,
      meterVal: 0.5,
      meterDir: -1,
      meterSpeed: 2.2,
      overcharge: 0,
      lastTapTime: 0,
      surgeActive: false,
      surgeTimer: 0,
      color: p2Colors.primary
    };

    this.resetRound(width, height);
  }

  public resetRound(_width: number, height: number): void {
    this.coreY = height * 0.5;
    this.coreVy = 0;
    this.p1.pullPower = 0;
    this.p1.overcharge = 0;
    this.p1.surgeActive = false;
    this.p1.surgeTimer = 0;
    this.p2.pullPower = 0;
    this.p2.overcharge = 0;
    this.p2.surgeActive = false;
    this.p2.surgeTimer = 0;
    this.botTapTimer = 0.2;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Update oscillating sweet-spot meters
    this.updateMeter(this.p1, dt);
    this.updateMeter(this.p2, dt);

    // 2. Handle Inputs
    this.handleInputs(height);

    // 3. AI Bot Logic
    if (this.progression.getGameMode() === 'vs_ai') {
      this.updateBot(dt);
    }

    // 4. Update core physics
    // Net pull force: P1 pulls toward bottom (positive Y), P2 pulls toward top (negative Y)
    const netForce = (this.p1.pullPower - this.p2.pullPower) * 750;
    this.coreVy += netForce * dt;
    // Friction damping
    this.coreVy *= Math.pow(0.15, dt);

    this.coreY += this.coreVy * dt;

    // Decay player pull powers
    this.p1.pullPower = Math.max(0, this.p1.pullPower - dt * 3.5);
    this.p2.pullPower = Math.max(0, this.p2.pullPower - dt * 3.5);

    // Update surge timers
    if (this.p1.surgeActive) {
      this.p1.surgeTimer -= dt;
      if (this.p1.surgeTimer <= 0) this.p1.surgeActive = false;
    }
    if (this.p2.surgeActive) {
      this.p2.surgeTimer -= dt;
      if (this.p2.surgeTimer <= 0) this.p2.surgeActive = false;
    }

    // Emit lightning sparks from core
    if (Math.random() < 0.3) {
      this.juice.emitSparks(width * 0.5, this.coreY, '#00F0FF', 4, 180, 0.2);
    }

    // Check Win/Loss threshold:
    // If core is pulled to P1's zone (Y > height - 130), P1 scores!
    // If core is pulled to P2's zone (Y < 130), P2 scores!
    if (this.coreY > height - 130) {
      // Core pulled into P1's side! P1 scores!
      this.juice.emitExplosion(width * 0.5, height - 110, '#FF0055', 35);
      this.triggerPointScore(1, width, height);
    } else if (this.coreY < 130) {
      // Core pulled into P2's side! P2 scores!
      this.juice.emitExplosion(width * 0.5, 110, '#0084FF', 35);
      this.triggerPointScore(2, width, height);
    }
  }

  private updateMeter(player: TugPlayer, dt: number) {
    player.meterVal += player.meterDir * player.meterSpeed * dt;
    if (player.meterVal > 1) {
      player.meterVal = 1;
      player.meterDir = -1;
    } else if (player.meterVal < 0) {
      player.meterVal = 0;
      player.meterDir = 1;
    }
  }

  private handleInputs(height: number) {
    const touches = this.input.getTouches();

    for (const touch of touches) {
      if (touch.phase === 'began') {
        if (touch.player === 1 && touch.rawY > height * 0.5) {
          this.executePull(this.p1);
        } else if (this.progression.getGameMode() !== 'vs_ai' && touch.player === 2 && touch.rawY < height * 0.5) {
          this.executePull(this.p2);
        }
      }
    }

    // Keyboard inputs
    if (this.input.keyboardP1.actionA && performance.now() - this.p1.lastTapTime > 120) {
      this.executePull(this.p1);
    }
    if (this.progression.getGameMode() !== 'vs_ai' && this.input.keyboardP2.actionA && performance.now() - this.p2.lastTapTime > 120) {
      this.executePull(this.p2);
    }
  }

  private executePull(player: TugPlayer) {
    player.lastTapTime = performance.now();

    // Sweet spot is in center [0.42 to 0.58]
    const inSweetSpot = player.meterVal >= 0.40 && player.meterVal <= 0.60;
    const isOvercharged = player.overcharge >= 100;

    let pullBoost = 1.0;
    if (inSweetSpot) {
      pullBoost = 2.4;
      player.overcharge = Math.min(100, player.overcharge + 20);
      this.audio.playTugPulse(true);
      this.juice.addTrauma(0.18);
    } else {
      pullBoost = 0.8;
      player.overcharge = Math.min(100, player.overcharge + 6);
      this.audio.playTugPulse(false);
    }

    if (isOvercharged) {
      // Release overcharge surge!
      player.overcharge = 0;
      player.surgeActive = true;
      player.surgeTimer = 0.8;
      pullBoost *= 3.0;
      this.audio.playTugSurge();
      this.juice.addTrauma(0.4);
    }

    player.pullPower += pullBoost;
  }

  private updateBot(dt: number) {
    this.botTapTimer -= dt;
    if (this.botTapTimer > 0) return;

    const diff = this.progression.getAIDifficulty();
    const sweetCenter = 0.5;
    const distToSweet = Math.abs(this.p2.meterVal - sweetCenter);

    // Bot triggers pull when close to sweet spot with slight jitter based on difficulty
    const threshold = diff === 'hard' ? 0.08 : diff === 'medium' ? 0.16 : 0.28;

    if (distToSweet < threshold || Math.random() < 0.1) {
      this.executePull(this.p2);
      this.botTapTimer = diff === 'hard' ? 0.16 : diff === 'medium' ? 0.26 : 0.40;
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const cx = width * 0.5;

    // 1. Hazard Vortices at Top and Bottom
    this.renderVortex(ctx, cx, 80, '#0084FF', 'P2 VORTEX');
    this.renderVortex(ctx, cx, height - 80, '#FF0055', 'P1 VORTEX');

    // 2. Quantum Electric Rope Tether
    this.renderElectricRope(ctx, cx, this.p2.y, cx, this.coreY, '#0084FF');
    this.renderElectricRope(ctx, cx, this.coreY, cx, this.p1.y, '#FF0055');

    // 3. Central Quantum Singularity Core
    this.renderCore(ctx, cx, this.coreY);

    // 4. Timing Meters
    this.renderMeter(ctx, width * 0.15, height - 120, width * 0.7, 18, this.p1, isDay);
    this.renderMeter(ctx, width * 0.15, 102, width * 0.7, 18, this.p2, isDay);
  }

  private renderVortex(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    const pulse = 0.8 + Math.sin(performance.now() * 0.005) * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, 40 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '800 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 4);
    ctx.restore();
  }

  private renderElectricRope(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    const segments = 8;
    const dy = (y2 - y1) / segments;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < segments; i++) {
      const wobble = Math.sin(performance.now() * 0.015 + i) * 6;
      ctx.lineTo(x1 + wobble, y1 + dy * i);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  private renderCore(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    const grad = ctx.createRadialGradient(x, y, 2, x, y, this.coreRadius);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.4, '#00F0FF');
    grad.addColorStop(0.8, '#7928CA');
    grad.addColorStop(1, '#FF0055');

    ctx.fillStyle = grad;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(x, y, this.coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Orbital rings
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, this.coreRadius * 1.5, this.coreRadius * 0.5, performance.now() * 0.003, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private renderMeter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, player: TugPlayer, isDay: boolean) {
    ctx.save();
    // Track background
    ctx.fillStyle = isDay ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)';
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();

    // Green Sweet Spot in middle
    const sweetStart = x + w * 0.40;
    const sweetWidth = w * 0.20;
    ctx.fillStyle = 'rgba(0, 255, 102, 0.45)';
    ctx.fillRect(sweetStart, y, sweetWidth, h);

    // Sweet Spot border
    ctx.strokeStyle = '#00FF66';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sweetStart, y, sweetWidth, h);

    // Indicator needle
    const needleX = x + player.meterVal * w;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(needleX - 3, y - 4, 6, h + 8);

    // Overcharge mini gauge
    const ovW = (player.overcharge / 100) * w;
    ctx.fillStyle = player.overcharge >= 100 ? '#FFD700' : player.color;
    ctx.fillRect(x, y + h + 3, ovW, 4);

    ctx.restore();
  }
}
