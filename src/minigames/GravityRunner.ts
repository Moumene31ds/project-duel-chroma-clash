import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface Runner {
  player: PlayerIndex;
  x: number;
  y: number;
  gravity: 1 | -1;
  stun: number;
  anim: number;
}

interface Obstacle {
  player: PlayerIndex;
  x: number;
  gapY: number; // center of safe gap; runner must be on correct side
  gapH: number;
  passed: boolean;
  speed: number;
}

export class GravityRunner extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'gravity_runner',
    title: 'Gravity Runner',
    subtitle: 'Inverted Gravity Dash & Hazard Run',
    category: 'Runner',
    icon: '🌌',
    targetScore: 8,
    timeLimitSec: 90,
    instructionsP1: 'Tap to flip gravity! Dodge lasers, survive longer!',
    instructionsP2: 'انقر لعكس الجاذبية وتفادي العوائق!'
  };

  private r1!: Runner;
  private r2!: Runner;
  private obstacles: Obstacle[] = [];
  private spawnTimer = 0.7;
  private elapsed = 0;
  private botTimer = 0;

  constructor(
    input: import('../core/InputManager').InputManager,
    audio: import('../core/AudioHaptics').AudioHaptics,
    juice: import('../core/JuiceEngine').JuiceEngine,
    progression: import('../meta/ProgressionManager').ProgressionManager,
    botAI: import('../core/AIBotEngine').AIBotEngine
  ) {
    super(input, audio, juice, progression, botAI);
    this.targetScore = 8;
  }

  public init(width: number, height: number): void {
    this.r1 = { player: 1, x: width * 0.3, y: height * 0.85, gravity: 1, stun: 0, anim: 0 };
    this.r2 = { player: 2, x: width * 0.3, y: height * 0.15, gravity: 1, stun: 0, anim: 0 };
    this.resetRound(width, height);
  }

  public resetRound(_w: number, _h: number): void {
    this.obstacles = [];
    this.spawnTimer = 0.7;
    this.elapsed = 0;
    if (this.r1) { this.r1.stun = 0; }
    if (this.r2) { this.r2.stun = 0; }
  }

  private laneTop(player: PlayerIndex, height: number): number {
    return player === 1 ? height * 0.62 : height * 0.06;
  }
  private laneBottom(player: PlayerIndex, height: number): number {
    return player === 1 ? height * 0.94 : height * 0.38;
  }

  public updateGame(dt: number, width: number, height: number): void {
    this.elapsed += dt;
    const speed = 220 + this.elapsed * 8;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      for (const p of [1, 2] as PlayerIndex[]) {
        const top = this.laneTop(p, height);
        const bottom = this.laneBottom(p, height);
        // obstacle requires runner to be at top (gravity -1) or bottom (gravity 1)
        const needTop = Math.random() < 0.5;
        this.obstacles.push({
          player: p, x: width + 20,
          gapY: needTop ? top : bottom, gapH: 34,
          passed: false, speed: speed + Math.random() * 40
        });
      }
      this.spawnTimer = Math.max(0.55, 1.0 - this.elapsed * 0.008);
    }

    this.handleInput();

    for (const r of [this.r1, this.r2]) {
      r.anim += dt * 10;
      if (r.stun > 0) r.stun -= dt;
      const top = this.laneTop(r.player, height);
      const bottom = this.laneBottom(r.player, height);
      const targetY = r.gravity === 1 ? bottom : top;
      r.y += (targetY - r.y) * Math.min(1, dt * 12);
    }

    const isAi = this.progression.getGameMode() === 'vs_ai';
    if (isAi) {
      this.botTimer -= dt;
      if (this.botTimer <= 0) {
        this.botTimer = 0.15;
        this.autoBot(height);
      }
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= o.speed * dt;
      const r = o.player === 1 ? this.r1 : this.r2;
      if (!o.passed && o.x < r.x) {
        o.passed = true;
        // check dodge: runner y must be near gapY
        if (Math.abs(r.y - o.gapY) < o.gapH) {
          if (o.player === 1) this.p1Score++;
          else this.p2Score++;
          this.audio.playPuckBounce(1.4);
        } else {
          // hit
          if (o.player === 1) { this.p1Score = Math.max(0, this.p1Score - 1); this.r1.stun = 0.5; }
          else { this.p2Score = Math.max(0, this.p2Score - 1); this.r2.stun = 0.5; }
          this.audio.playMemoryError();
          this.juice.addTrauma(0.3);
          this.juice.emitExplosion(o.x, o.gapY, '#FF3333', 16);
        }
      }
      if (o.x < -30) this.obstacles.splice(i, 1);
    }

    if (this.p1Score >= this.targetScore) this.completeMatch(1, width, height);
    else if (this.p2Score >= this.targetScore) this.completeMatch(2, width, height);
  }

  private handleInput(): void {
    for (const t of this.input.getTouches()) {
      if (t.phase !== 'began') continue;
      // InputManager already routes ownership by screen half (t.player);
      // in vs_ai the bot drives P2 itself.
      if (t.player === 2 && this.progression.getGameMode() === 'vs_ai') continue;
      this.flip(t.player);
    }
    if (this.input.keyboardP1.actionA) { this.flip(1); this.input.keyboardP1.actionA = false; }
    if (this.input.keyboardP2.actionA && this.progression.getGameMode() !== 'vs_ai') { this.flip(2); this.input.keyboardP2.actionA = false; }
  }

  private flip(p: PlayerIndex): void {
    const r = p === 1 ? this.r1 : this.r2;
    if (!r || r.stun > 0) return;
    r.gravity = r.gravity === 1 ? -1 : 1;
    this.audio.hapticLight();
  }

  private autoBot(_height: number): void {
    // flip if next obstacle needs opposite side
    const next = this.obstacles.filter(o => o.player === 2 && !o.passed && o.x > this.r2.x).sort((a, b) => a.x - b.x)[0];
    if (!next) return;
    const diff = this.progression.getAIDifficulty();
    const reactDist = diff === 'hard' ? 170 : diff === 'medium' ? 130 : 95;
    if (next.x - this.r2.x < reactDist) {
      const needGravity = Math.abs(next.gapY - this.laneBottom(2, 840)) < Math.abs(next.gapY - this.laneTop(2, 840)) ? 1 : -1;
      void _height;
      if (this.r2.gravity !== needGravity) this.flip(2);
    }
  }

  public static shouldFlipForTest(runnerY: number, gapY: number, gapH: number): boolean {
    return Math.abs(runnerY - gapY) > gapH;
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // lanes
    for (const p of [1, 2] as PlayerIndex[]) {
      const top = this.laneTop(p, height);
      const bottom = this.laneBottom(p, height);
      ctx.save();
      ctx.strokeStyle = p === 1 ? 'rgba(0,240,255,0.35)' : 'rgba(255,0,85,0.35)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(10, top); ctx.lineTo(width - 10, top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, bottom); ctx.lineTo(width - 10, bottom); ctx.stroke();
      ctx.restore();
    }
    // obstacles
    for (const o of this.obstacles) {
      const col = o.player === 1 ? '#00F0FF' : '#FF0055';
      ctx.save();
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      // laser wall with gap at gapY
      ctx.fillRect(o.x - 6, this.laneTop(o.player, height) - 10, 12, (o.gapY - o.gapH / 2) - (this.laneTop(o.player, height) - 10));
      ctx.fillRect(o.x - 6, o.gapY + o.gapH / 2, 12, (this.laneBottom(o.player, height) + 10) - (o.gapY + o.gapH / 2));
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(o.x - 6, o.gapY - o.gapH / 2, 12, o.gapH);
      ctx.restore();
    }
    // runners
    for (const r of [this.r1, this.r2]) {
      if (!r) continue;
      const col = r.player === 1 ? '#00F0FF' : '#FF0055';
      const bounce = Math.abs(Math.sin(r.anim)) * 4;
      ctx.save();
      ctx.translate(r.x, r.y - bounce);
      if (r.gravity === -1) ctx.scale(1, -1);
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(2, -3, 6, 4); // visor
      // legs
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      const legSwing = Math.sin(r.anim) * 6;
      ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(-3 + legSwing, 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(3 - legSwing, 16); ctx.stroke();
      if (r.stun > 0) {
        ctx.fillStyle = '#FF3333'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('✖', 0, -18);
      }
      ctx.restore();
    }
  }
}
