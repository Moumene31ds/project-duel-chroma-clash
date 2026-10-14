import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';
import { InputManager } from '../core/InputManager';
import { AudioHaptics } from '../core/AudioHaptics';
import { JuiceEngine } from '../core/JuiceEngine';
import { ProgressionManager } from '../meta/ProgressionManager';
import { AIBotEngine } from '../core/AIBotEngine';

interface SliceTarget {
  id: number;
  type: 'orb' | 'star' | 'bomb';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  points: number;
  targetPlayer: PlayerIndex;
  isSliced: boolean;
  sliceAngle: number;
  halfOffset: number;
}

interface SlicePoint {
  x: number;
  y: number;
  time: number;
}

export class CyberSlicer extends BaseMinigame {
  public meta: MinigameMetadata = {
    id: 'cyber_slicer',
    title: 'Cyber Slicer',
    subtitle: 'High-Velocity Neon Blade Duel',
    category: 'Action',
    icon: '⚔️',
    targetScore: 10,
    timeLimitSec: 60,
    instructionsP1: 'Swipe across falling orbs to slice! Avoid EMP bombs!',
    instructionsP2: 'اسحب إصبعك لتقطيع كرات الطاقة وتفادي القنابل!'
  };

  private targets: SliceTarget[] = [];
  private nextTargetId: number = 0;
  private spawnTimer: number = 0.5;

  private p1SliceTrail: SlicePoint[] = [];
  private p2SliceTrail: SlicePoint[] = [];

  private p1Combo: number = 0;
  private p1ComboTimer: number = 0;
  private p2Combo: number = 0;
  private p2ComboTimer: number = 0;

  private botSlashTimer: number = 0.25;

  constructor(
    input: InputManager,
    audio: AudioHaptics,
    juice: JuiceEngine,
    progression: ProgressionManager,
    botAI: AIBotEngine
  ) {
    super(input, audio, juice, progression, botAI);
    this.targetScore = 10;
  }

  public init(width: number, height: number): void {
    this.resetRound(width, height);
  }

  public resetRound(_width: number, _height: number): void {
    this.targets = [];
    this.spawnTimer = 0.6;
    this.p1SliceTrail = [];
    this.p2SliceTrail = [];
    this.p1Combo = 0;
    this.p2Combo = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    const now = performance.now();

    // 1. Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTargets(width, height);
      this.spawnTimer = 0.55 + Math.random() * 0.45;
    }

    // 2. Update Target Physics
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const tg = this.targets[i];
      if (tg.isSliced) {
        tg.halfOffset += dt * 180;
        tg.y += tg.vy * dt * 0.6;
        tg.x += tg.vx * dt * 0.6;
        if (tg.halfOffset > 60) {
          this.targets.splice(i, 1);
          continue;
        }
      } else {
        tg.x += tg.vx * dt;
        tg.y += tg.vy * dt;
        tg.rotation += tg.rotSpeed * dt;

        // Gravity pull back toward launch boundary
        const g = tg.targetPlayer === 1 ? 260 : -260;
        tg.vy += g * dt;

        // Cleanup out of bounds
        if (tg.y < -50 || tg.y > height + 50 || tg.x < -40 || tg.x > width + 40) {
          this.targets.splice(i, 1);
        }
      }
    }

    // 3. Update Combos decay
    if (this.p1ComboTimer > 0) {
      this.p1ComboTimer -= dt;
      if (this.p1ComboTimer <= 0) this.p1Combo = 0;
    }
    if (this.p2ComboTimer > 0) {
      this.p2ComboTimer -= dt;
      if (this.p2ComboTimer <= 0) this.p2Combo = 0;
    }

    // 4. Input Touch Trails & Slicing
    this.processTouchSlices(now, width, height);

    // 5. AI Bot
    if (this.progression.getGameMode() === 'vs_ai') {
      this.updateBot(dt, width, height);
    }

    // 6. Prune old slice trails (keep 140ms history)
    this.p1SliceTrail = this.p1SliceTrail.filter(p => now - p.time < 160);
    this.p2SliceTrail = this.p2SliceTrail.filter(p => now - p.time < 160);
  }

  private spawnTargets(width: number, height: number) {
    // Launch towards Player 1 (downwards) and Player 2 (upwards)
    for (const player of [1, 2] as PlayerIndex[]) {
      const isBomb = Math.random() < 0.22;
      const isStar = !isBomb && Math.random() < 0.28;

      const type = isBomb ? 'bomb' : isStar ? 'star' : 'orb';
      const color = isBomb ? '#FF3333' : isStar ? '#FFD700' : (player === 1 ? '#00F0FF' : '#FF0055');
      const points = isBomb ? -1 : isStar ? 2 : 1;

      const startX = width * 0.2 + Math.random() * (width * 0.6);
      const startY = height * 0.5 + (player === 1 ? -10 : 10);

      // Launch velocity with arch
      const vx = (Math.random() - 0.5) * 140;
      const vy = player === 1 ? 320 + Math.random() * 120 : -320 - Math.random() * 120;

      this.targets.push({
        id: this.nextTargetId++,
        type,
        x: startX,
        y: startY,
        vx,
        vy,
        radius: isBomb ? 18 : isStar ? 16 : 14,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 6,
        color,
        points,
        targetPlayer: player,
        isSliced: false,
        sliceAngle: 0,
        halfOffset: 0
      });
    }
  }

  private processTouchSlices(now: number, width: number, height: number) {
    const touches = this.input.getTouches();

    for (const t of touches) {
      if (t.phase === 'ended' || t.phase === 'canceled') continue;

      const player = t.rawY > height * 0.5 ? 1 : 2;
      const trail = player === 1 ? this.p1SliceTrail : this.p2SliceTrail;

      const lastPoint = trail.length > 0 ? trail[trail.length - 1] : null;
      trail.push({ x: t.rawX, y: t.rawY, time: now });

      if (lastPoint) {
        this.checkSegmentSlice(player, lastPoint.x, lastPoint.y, t.rawX, t.rawY, width, height);
      }
    }
  }

  private checkSegmentSlice(player: PlayerIndex, x1: number, y1: number, x2: number, y2: number, width: number, height: number) {
    const sliceDx = x2 - x1;
    const sliceDy = y2 - y1;
    const sliceLen = Math.hypot(sliceDx, sliceDy);
    if (sliceLen < 6) return;

    for (const tg of this.targets) {
      if (tg.isSliced || tg.targetPlayer !== player) continue;

      // Distance from circle center to segment
      const t = Math.max(0, Math.min(1, ((tg.x - x1) * sliceDx + (tg.y - y1) * sliceDy) / (sliceLen * sliceLen)));
      const closeX = x1 + t * sliceDx;
      const closeY = y1 + t * sliceDy;
      const dist = Math.hypot(tg.x - closeX, tg.y - closeY);

      if (dist < tg.radius + 6) {
        this.executeSlice(player, tg, Math.atan2(sliceDy, sliceDx), width, height);
      }
    }
  }

  private executeSlice(player: PlayerIndex, tg: SliceTarget, angle: number, width: number, height: number) {
    tg.isSliced = true;
    tg.sliceAngle = angle;
    tg.halfOffset = 2;

    if (tg.type === 'bomb') {
      // Hit bomb: penalty
      this.audio.playMemoryError();
      this.juice.addTrauma(0.35);
      this.juice.emitExplosion(tg.x, tg.y, '#FF3333', 25);
      if (player === 1) {
        this.p1Score = Math.max(0, this.p1Score - 1);
        this.p1Combo = 0;
      } else {
        this.p2Score = Math.max(0, this.p2Score - 1);
        this.p2Combo = 0;
      }
    } else {
      // Successful slice
      this.audio.playPinballFlipper();
      this.juice.addTrauma(0.18);
      this.juice.emitSparks(tg.x, tg.y, tg.color, 12, 220, 0.25);

      if (player === 1) {
        this.p1Combo++;
        this.p1ComboTimer = 0.55;
        const pts = tg.points + (this.p1Combo >= 3 ? 1 : 0);
        this.p1Score += pts;
      } else {
        this.p2Combo++;
        this.p2ComboTimer = 0.55;
        const pts = tg.points + (this.p2Combo >= 3 ? 1 : 0);
        this.p2Score += pts;
      }

      // Check match victory (completeMatch adds no extra point: score already counted)
      if (this.p1Score >= this.targetScore) {
        this.completeMatch(1, width, height);
      } else if (this.p2Score >= this.targetScore) {
        this.completeMatch(2, width, height);
      }
    }
  }

  private updateBot(dt: number, width: number, height: number) {
    this.botSlashTimer -= dt;
    if (this.botSlashTimer > 0) return;

    const diff = this.progression.getAIDifficulty();
    this.botSlashTimer = diff === 'hard' ? 0.18 : diff === 'medium' ? 0.32 : 0.48;

    // Search for orbs in P2's court (upper half)
    const validTargets = this.targets.filter(t => !t.isSliced && t.targetPlayer === 2 && t.type !== 'bomb');
    if (validTargets.length > 0) {
      const tg = validTargets[0];
      const sliceAngle = Math.random() * Math.PI;
      const x1 = tg.x - Math.cos(sliceAngle) * 30;
      const y1 = tg.y - Math.sin(sliceAngle) * 30;
      const x2 = tg.x + Math.cos(sliceAngle) * 30;
      const y2 = tg.y + Math.sin(sliceAngle) * 30;

      this.p2SliceTrail.push({ x: x1, y: y1, time: performance.now() });
      this.p2SliceTrail.push({ x: x2, y: y2, time: performance.now() });
      this.executeSlice(2, tg, sliceAngle, width, height);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cy = height * 0.5;

    // Center divider boundary
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(14, cy);
    ctx.lineTo(width - 14, cy);
    ctx.stroke();
    ctx.restore();

    // Render Targets
    for (const tg of this.targets) {
      this.renderTarget(ctx, tg);
    }

    // Render Slice Trails
    this.renderSliceTrail(ctx, this.p1SliceTrail, '#FF0055');
    this.renderSliceTrail(ctx, this.p2SliceTrail, '#00F0FF');

    // Combo Displays
    if (this.p1Combo >= 2) {
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font = '900 16px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 10;
      ctx.fillText(`⚡ COMBO ${this.p1Combo}X`, width * 0.5, height * 0.72);
      ctx.restore();
    }
    if (this.p2Combo >= 2) {
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font = '900 16px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 10;
      ctx.fillText(`⚡ COMBO ${this.p2Combo}X`, width * 0.5, height * 0.28);
      ctx.restore();
    }
  }

  private renderTarget(ctx: CanvasRenderingContext2D, tg: SliceTarget) {
    ctx.save();
    ctx.translate(tg.x, tg.y);
    ctx.rotate(tg.rotation);

    if (tg.isSliced) {
      // Sliced halves moving apart
      ctx.save();
      ctx.rotate(tg.sliceAngle);
      // Half 1
      ctx.fillStyle = tg.color;
      ctx.beginPath();
      ctx.arc(0, -tg.halfOffset, tg.radius, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // Half 2
      ctx.beginPath();
      ctx.arc(0, tg.halfOffset, tg.radius, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.shadowColor = tg.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = tg.color;

      if (tg.type === 'bomb') {
        // EMP Hazard Bomb
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', 0, 0);
      } else if (tg.type === 'star') {
        // Multiplier Star
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', 0, 0);
      } else {
        // Energy Orb
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius, 0, Math.PI * 2);
        ctx.fill();
        // Inner Core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-2, -2, tg.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private renderSliceTrail(ctx: CanvasRenderingContext2D, trail: SlicePoint[], color: string) {
    if (trail.length < 2) return;
    const now = performance.now();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < trail.length; i++) {
      const p1 = trail[i - 1];
      const p2 = trail[i];
      const age = now - p2.time;
      const alpha = Math.max(0, 1 - age / 160);

      ctx.strokeStyle = color;
      ctx.lineWidth = 6 * alpha;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * alpha;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Specular white blade core
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 * alpha;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
