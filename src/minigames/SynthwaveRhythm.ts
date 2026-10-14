import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';
import { InputManager } from '../core/InputManager';
import { AudioHaptics } from '../core/AudioHaptics';
import { JuiceEngine } from '../core/JuiceEngine';
import { ProgressionManager } from '../meta/ProgressionManager';
import { AIBotEngine } from '../core/AIBotEngine';

interface RhythmNote {
  id: number;
  player: PlayerIndex;
  lane: number; // 0..3
  y: number;
  speed: number;
  hit: boolean;
  missed: boolean;
}

export class SynthwaveRhythm extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'synthwave_rhythm',
    title: 'Synthwave Rhythm',
    subtitle: 'Beat-Synced Neon Track Duel',
    category: 'Rhythm',
    icon: '🎵',
    targetScore: 12,
    timeLimitSec: 90,
    instructionsP1: 'Tap lanes when notes hit the line! Perfect timing = bonus!',
    instructionsP2: 'انقر على المسار عندما تصل النغمة إلى الخط!'
  };

  private notes: RhythmNote[] = [];
  private nextId = 0;
  private spawnTimerP1 = 0.4;
  private spawnTimerP2 = 0.4;
  private beatTime = 0;
  private p1Combo = 0;
  private p2Combo = 0;
  private p1Fever = 0;
  private p2Fever = 0;
  private botTimer = 0.2;

  constructor(
    input: InputManager,
    audio: AudioHaptics,
    juice: JuiceEngine,
    progression: ProgressionManager,
    botAI: AIBotEngine
  ) {
    super(input, audio, juice, progression, botAI);
    this.targetScore = 12;
  }

  public init(_w: number, _h: number): void {
    this.resetRound(_w, _h);
  }

  public resetRound(_w: number, _h: number): void {
    this.notes = [];
    this.nextId = 0;
    this.spawnTimerP1 = 0.4;
    this.spawnTimerP2 = 0.4;
    this.beatTime = 0;
    this.p1Combo = 0;
    this.p2Combo = 0;
    this.p1Fever = 0;
    this.p2Fever = 0;
  }

  private rhythmLineY(player: PlayerIndex, height: number): number {
    return player === 1 ? height * 0.82 : height * 0.18;
  }

  private spawnNote(player: PlayerIndex, height: number): void {
    const lane = Math.floor(Math.random() * 4);
    const startY = height * 0.5;
    const speed = 260 + Math.random() * 120 + this.beatTime * 2;
    // P1 notes travel down toward the lower line, P2 notes up toward the top
    const vy = player === 1 ? Math.abs(speed) : -Math.abs(speed);
    this.notes.push({ id: this.nextId++, player, lane, y: startY, speed: vy, hit: false, missed: false });
  }

  public updateGame(dt: number, _width: number, height: number): void {
    this.beatTime += dt;
    this.spawnTimerP1 -= dt;
    this.spawnTimerP2 -= dt;
    const interval = Math.max(0.28, 0.62 - this.beatTime * 0.004);
    if (this.spawnTimerP1 <= 0) { this.spawnNote(1, height); this.spawnTimerP1 = interval + Math.random() * 0.15; }
    if (this.spawnTimerP2 <= 0) { this.spawnNote(2, height); this.spawnTimerP2 = interval + Math.random() * 0.15; }

    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      n.y += n.speed * dt;
      const lineY = this.rhythmLineY(n.player, height);
      const dist = Math.abs(n.y - lineY);
      // miss if passed line by 46px
      if (!n.hit && ((n.player === 1 && n.y > lineY + 46) || (n.player === 2 && n.y < lineY - 46))) {
        n.missed = true;
        if (n.player === 1) { this.p1Combo = 0; this.p1Fever = 0; } else { this.p2Combo = 0; this.p2Fever = 0; }
        this.notes.splice(i, 1);
      } else if (Math.abs(n.y) > height + 60) {
        this.notes.splice(i, 1);
      }
      void dist;
    }

    this.handleTaps(height);

    if (this.progression.getGameMode() === 'vs_ai') {
      this.botTimer -= dt;
      if (this.botTimer <= 0) {
        const diff = this.progression.getAIDifficulty();
        this.botTimer = diff === 'hard' ? 0.12 : diff === 'medium' ? 0.22 : 0.36;
        this.botHit(height, diff);
      }
    }

    if (this.p1Score >= this.targetScore) this.completeMatch(1, _width, height);
    else if (this.p2Score >= this.targetScore) this.completeMatch(2, _width, height);
  }

  private laneFromNormX(normX: number): number {
    return Math.max(0, Math.min(3, Math.floor(normX * 4)));
  }

  private handleTaps(height: number): void {
    const touches = this.input.getTouches();
    for (const t of touches) {
      if (t.phase !== 'began') continue;
      const player = t.rawY > height * 0.5 ? 1 : 2;
      // ignore bot side taps when vs_ai (bot handles itself)
      if (player === 2 && this.progression.getGameMode() === 'vs_ai') continue;
      const lane = this.laneFromNormX(t.normX);
      this.attemptHit(player as PlayerIndex, lane, height);
    }
    // keyboard fallback
    if (this.input.keyboardP1.actionA) { this.attemptHit(1, Math.floor(Math.random() * 4), height); this.input.keyboardP1.actionA = false; }
    if (this.input.keyboardP2.actionA && this.progression.getGameMode() !== 'vs_ai') { this.attemptHit(2, Math.floor(Math.random() * 4), height); this.input.keyboardP2.actionA = false; }
  }

  private attemptHit(player: PlayerIndex, lane: number, height: number): void {
    const lineY = this.rhythmLineY(player, height);
    let best: RhythmNote | null = null;
    let bestDist = 52;
    for (const n of this.notes) {
      if (n.player !== player || n.hit) continue;
      if (n.lane !== lane) continue;
      const d = Math.abs(n.y - lineY);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    if (!best) return;
    best.hit = true;
    this.notes.splice(this.notes.indexOf(best), 1);
    const perfect = bestDist < 16;
    const feverBonus = (player === 1 ? this.p1Fever : this.p2Fever) >= 8 ? 1 : 0;
    const pts = (perfect ? 2 : 1) + feverBonus;
    if (player === 1) {
      this.p1Score += pts;
      this.p1Combo++;
      this.p1Fever++;
      if (perfect) { this.audio.playReflexChime(); this.juice.emitSparks(best.lane * 40 + 60, lineY, '#00F0FF', 8, 160, 0.2); }
      else this.audio.playPuckBounce(1.3);
    } else {
      this.p2Score += pts;
      this.p2Combo++;
      this.p2Fever++;
      if (perfect) { this.audio.playReflexChime(); this.juice.emitSparks(best.lane * 40 + 60, lineY, '#FF0055', 8, 160, 0.2); }
      else this.audio.playPuckBounce(1.1);
    }
  }

  private botHit(height: number, diff: string): void {
    const lineY = this.rhythmLineY(2, height);
    const windowPx = diff === 'hard' ? 40 : diff === 'medium' ? 30 : 20;
    for (const n of [...this.notes]) {
      if (n.player !== 2 || n.hit) continue;
      if (Math.abs(n.y - lineY) < windowPx) {
        this.attemptHit(2, n.lane, height);
        break;
      }
    }
  }

  public static scoreTapForTest(noteY: number, lineY: number): 'perfect' | 'good' | 'miss' {
    const d = Math.abs(noteY - lineY);
    if (d < 16) return 'perfect';
    if (d < 46) return 'good';
    return 'miss';
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const lineP1 = this.rhythmLineY(1, height);
    const lineP2 = this.rhythmLineY(2, height);
    // beat pulse
    const pulse = 0.5 + 0.5 * Math.sin(this.beatTime * 6);
    for (const [lineY, color] of [[lineP1, '#00F0FF'], [lineP2, '#FF0055']] as const) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.6 + pulse * 0.4;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(20, lineY); ctx.lineTo(width - 20, lineY); ctx.stroke();
      ctx.restore();
      // 4 lanes
      for (let l = 0; l < 4; l++) {
        const x = 20 + (l + 0.5) * ((width - 40) / 4);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, height * 0.5); ctx.lineTo(x, lineY); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(['◀', '●', '●', '▶'][l], x, lineY + (lineY > height * 0.5 ? 16 : -10));
        ctx.restore();
      }
    }
    for (const n of this.notes) {
      const x = 20 + (n.lane + 0.5) * ((width - 40) / 4);
      const lineY = this.rhythmLineY(n.player, height);
      const d = Math.abs(n.y - lineY);
      const col = n.player === 1 ? '#00F0FF' : '#FF0055';
      ctx.save();
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = d < 16 ? 18 : 8;
      ctx.beginPath(); ctx.arc(x, n.y, d < 16 ? 11 : 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 2, n.y - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = '#FFD700'; ctx.font = '900 13px monospace'; ctx.textAlign = 'center';
    if (this.p1Combo >= 3) ctx.fillText(`COMBO x${this.p1Combo}${this.p1Fever >= 8 ? ' 🔥FEVER' : ''}`, width / 2, height * 0.68);
    if (this.p2Combo >= 3) ctx.fillText(`COMBO x${this.p2Combo}${this.p2Fever >= 8 ? ' 🔥FEVER' : ''}`, width / 2, height * 0.32);
    ctx.restore();
  }
}
