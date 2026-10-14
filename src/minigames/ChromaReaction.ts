import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface ColorDefinition {
  name: string;
  hex: string;
}

const COLOR_SET: ColorDefinition[] = [
  { name: 'RED', hex: '#FF0055' },
  { name: 'BLUE', hex: '#0084FF' },
  { name: 'GREEN', hex: '#00FF66' },
  { name: 'YELLOW', hex: '#FFD700' }
];

export class ChromaReaction extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'chroma_reaction',
    title: 'Chroma Reaction Duel',
    subtitle: 'Stroop-Effect Cognitive Reflex',
    category: 'Memory & Reflex',
    icon: '⚡',
    targetScore: 5,
    timeLimitSec: 90,
    instructionsP1: 'Tap correct color/word fast! First to tap scores!',
    instructionsP2: 'Tap correct color/word fast! First to tap scores!'
  };

  private currentWordIndex: number = 0;
  private currentInkIndex: number = 1;
  private currentMode: 'match_color' | 'match_word' = 'match_color';

  private promptStartTime: number = 0;
  private roundActive: boolean = false;
  private nextPromptTimer: number = 1.0;

  // Lockout timers on error
  private p1Lockout: number = 0;
  private p2Lockout: number = 0;

  private botReactionTimer: number = 0;
  private lastReactionMs: number = 0;

  public init(width: number, height: number): void {
    this.targetScore = 5;
    this.p1Score = 0;
    this.p2Score = 0;
    this.resetRound(width, height);
  }

  public resetRound(_width: number, _height: number): void {
    this.p1Lockout = 0;
    this.p2Lockout = 0;
    this.roundActive = false;
    this.nextPromptTimer = 0.8;
  }

  private generateNewPrompt() {
    this.currentWordIndex = Math.floor(Math.random() * COLOR_SET.length);
    // Ensure ink color is different for strong Stroop conflict
    let ink = Math.floor(Math.random() * COLOR_SET.length);
    while (ink === this.currentWordIndex) {
      ink = Math.floor(Math.random() * COLOR_SET.length);
    }
    this.currentInkIndex = ink;

    this.currentMode = Math.random() > 0.5 ? 'match_color' : 'match_word';
    this.promptStartTime = performance.now();
    this.roundActive = true;

    this.armBotTimer();

    this.audio.playReflexChime();
  }

  private armBotTimer() {
    // Configure bot reaction delay
    const diff = this.progression.getAIDifficulty();
    const delaySec = diff === 'hard' ? 0.32 + Math.random() * 0.12 :
                     diff === 'medium' ? 0.52 + Math.random() * 0.2 :
                     0.85 + Math.random() * 0.3;
    this.botReactionTimer = delaySec;
  }

  public updateGame(dt: number, width: number, height: number): void {
    if (this.p1Lockout > 0) this.p1Lockout -= dt;
    if (this.p2Lockout > 0) this.p2Lockout -= dt;

    if (!this.roundActive) {
      this.nextPromptTimer -= dt;
      if (this.nextPromptTimer <= 0) {
        this.generateNewPrompt();
      }
      return;
    }

    // Handle Human Touches
    this.handlePadInputs(width, height);

    // Handle AI Bot
    if (this.progression.getGameMode() === 'vs_ai' && this.p2Lockout <= 0) {
      this.updateBot(dt, width, height);
    }
  }

  private handlePadInputs(width: number, height: number) {
    const touches = this.input.getTouches();

    for (const t of touches) {
      if (t.phase !== 'began') continue;

      if (t.player === 1 && this.p1Lockout <= 0 && t.rawY > height * 0.72) {
        const padIdx = Math.max(0, Math.min(3, Math.floor((t.rawX / width) * 4)));
        this.evaluatePlayerChoice(1, padIdx, width, height);
      } else if (t.player === 2 && this.p2Lockout <= 0 && t.rawY < height * 0.28) {
        // P2 pads are 180° rotated so indices are mirrored horizontally (3 - idx)
        const padIdx = Math.max(0, Math.min(3, 3 - Math.floor((t.rawX / width) * 4)));
        this.evaluatePlayerChoice(2, padIdx, width, height);
      }
    }
  }

  private evaluatePlayerChoice(player: PlayerIndex, chosenIdx: number, width: number, height: number) {
    if (!this.roundActive) return;

    const correctIdx = this.currentMode === 'match_color' ? this.currentInkIndex : this.currentWordIndex;

    if (chosenIdx === correctIdx) {
      // SUCCESS!
      const elapsedMs = Math.round(performance.now() - this.promptStartTime);
      this.lastReactionMs = elapsedMs;
      this.progression.recordReactionTime(elapsedMs);

      if (player === 1) this.p1Score++;
      else this.p2Score++;

      this.audio.playPairMatch();
      this.juice.addTrauma(0.25);
      this.juice.emitExplosion(width / 2, height / 2, COLOR_SET[correctIdx].hex, 25);

      this.roundActive = false;
      this.nextPromptTimer = 0.9;

      if (this.p1Score >= this.targetScore || this.p2Score >= this.targetScore) {
        const winner: PlayerIndex = this.p1Score >= this.targetScore ? 1 : 2;
        this.completeMatch(winner, width, height);
      }
    } else {
      // PENALTY LOCKOUT!
      if (player === 1) this.p1Lockout = 1.2;
      else this.p2Lockout = 1.2;

      this.audio.playMemoryError();
      this.juice.addTrauma(0.18);
    }
  }

  private updateBot(dt: number, width: number, height: number) {
    this.botReactionTimer -= dt;
    if (this.botReactionTimer <= 0 && this.roundActive) {
      const correctIdx = this.currentMode === 'match_color' ? this.currentInkIndex : this.currentWordIndex;
      const diff = this.progression.getAIDifficulty();

      // Error chance on Easy
      let choice = correctIdx;
      if (diff === 'easy' && Math.random() < 0.25) {
        choice = (correctIdx + 1) % COLOR_SET.length;
      }

      this.evaluatePlayerChoice(2, choice, width, height);
      // On a miss the same prompt stays active with an expired timer: re-arm
      // so the bot recovers humanly instead of retrying the same frame the
      // lockout expires.
      if (this.roundActive) this.armBotTimer();
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const now = performance.now();
    const midX = width / 2;
    const midY = height / 2;

    // 1. Center Holographic Neural Terminal Pedestal
    ctx.save();
    const termW = Math.min(width - 40, 320);
    const termH = 130;

    // Terminal floor light
    this.juice.drawRadialFloorLight(ctx, midX, midY, termW * 0.6, '#00F0FF', 0.35);

    // Terminal Pod Glass Backing
    const termGrad = ctx.createLinearGradient(0, midY - termH / 2, 0, midY + termH / 2);
    termGrad.addColorStop(0, isDay ? 'rgba(255, 255, 255, 0.96)' : 'rgba(22, 30, 48, 0.94)');
    termGrad.addColorStop(1, isDay ? 'rgba(238, 244, 254, 0.92)' : 'rgba(10, 14, 24, 0.94)');
    ctx.fillStyle = termGrad;
    ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.25)' : 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(midX - termW / 2, midY - termH / 2, termW, termH, 16);
    ctx.fill();
    ctx.stroke();

    // Visor Brackets on Terminal
    this.juice.drawCyberVisorBracket(ctx, midX - termW / 2 + 5, midY - termH / 2 + 5, termW - 10, termH - 10, '#00F0FF');

    // Pulsing neural feedback ring around the terminal
    if (this.roundActive) {
      const ring = 0.5 + 0.5 * Math.sin(now * 0.008);
      const ringColor = this.currentMode === 'match_color' ? '#00F0FF' : '#FF0055';
      ctx.globalAlpha = 0.22 + ring * 0.3;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(midX, midY, termH * 0.52 + 6 + ring * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
    }

    // Peripheral data-equalizer flicker bars on both sides
    for (let side = 0; side < 2; side++) {
      const barsX = side === 0 ? midX - termW / 2 - 16 : midX + termW / 2 + 8;
      for (let b = 0; b < 4; b++) {
        const eq = 0.15 + 0.85 * Math.abs(Math.sin(now * 0.006 + b * 1.1 + side * 0.7));
        ctx.fillStyle = side === 0 ? `rgba(0, 240, 255, ${eq * 0.35})` : `rgba(255, 0, 85, ${eq * 0.35})`;
        ctx.fillRect(barsX, midY - 26 + b * 13 + (1 - eq) * 6, 8, 4 + eq * 9);
      }
    }

    if (this.roundActive) {
      const word = COLOR_SET[this.currentWordIndex].name;
      const inkColor = COLOR_SET[this.currentInkIndex].hex;
      const modeText = this.currentMode === 'match_color' ? '🎨 TARGET: INK COLOR' : '📖 TARGET: WORD TEXT';

      // Mode instruction pill
      ctx.fillStyle = this.currentMode === 'match_color' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 0, 85, 0.15)';
      ctx.strokeStyle = this.currentMode === 'match_color' ? '#00F0FF' : '#FF0055';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(midX - 100, midY - 48, 200, 22, 11);
      ctx.fill();
      ctx.stroke();

      ctx.font = '900 11px monospace';
      ctx.fillStyle = this.currentMode === 'match_color' ? '#00F0FF' : '#FF0055';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(modeText, midX, midY - 37);

      // Stroop Word (High-Luminance Typographic Display)
      ctx.font = '900 42px monospace';
      ctx.fillStyle = inkColor;
      ctx.shadowColor = inkColor;
      ctx.shadowBlur = 22;
      ctx.fillText(word, midX, midY + 4);
      ctx.shadowBlur = 0;

      // Telemetry Stopwatch Readout
      const elapsed = Math.round(performance.now() - this.promptStartTime);
      ctx.font = '800 12px monospace';
      ctx.fillStyle = isDay ? '#64748B' : '#94a3b8';
      ctx.fillText(`⏱️ ${elapsed} ms`, midX, midY + 44);
    } else {
      // Inter-round Standby Pod
      ctx.font = '900 15px monospace';
      ctx.fillStyle = isDay ? '#475569' : '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const msg = this.lastReactionMs > 0 ? `⚡ REACTION: ${this.lastReactionMs}ms` : 'SYSTEM ARMED...';
      ctx.fillText(msg, midX, midY);
    }
    ctx.restore();

    // 2. Render P2 Color Pads (Top - 180° rotated for Face-to-Face)
    ctx.save();
    ctx.translate(midX, height * 0.22);
    ctx.rotate(Math.PI);
    this.renderPlayerPads(ctx, 2, -width * 0.45, -height * 0.06, width * 0.9, height * 0.11, this.p2Lockout > 0);
    ctx.restore();

    // 3. Render P1 Color Pads (Bottom - Normal)
    ctx.save();
    ctx.translate(midX, height * 0.78);
    this.renderPlayerPads(ctx, 1, -width * 0.45, -height * 0.06, width * 0.9, height * 0.11, this.p1Lockout > 0);
    ctx.restore();
  }

  private renderPlayerPads(
    ctx: CanvasRenderingContext2D,
    _player: PlayerIndex,
    startX: number,
    startY: number,
    totalWidth: number,
    padHeight: number,
    isLocked: boolean
  ) {
    const padW = totalWidth / 4;

    for (let i = 0; i < 4; i++) {
      const x = startX + i * padW + 3;
      const w = padW - 6;
      const col = COLOR_SET[i];

      ctx.save();

      // Button Inset Shadow Bed
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(x, startY + 4, w, padHeight, 10);
      ctx.fill();

      // 3D Tactile Button Body
      const btnGrad = ctx.createLinearGradient(x, startY, x, startY + padHeight);
      if (isLocked) {
        btnGrad.addColorStop(0, '#334155');
        btnGrad.addColorStop(1, '#0f172a');
      } else {
        btnGrad.addColorStop(0, '#FFFFFF');
        btnGrad.addColorStop(0.2, col.hex);
        btnGrad.addColorStop(0.85, col.hex);
        btnGrad.addColorStop(1, '#0b0f19');
      }

      ctx.fillStyle = btnGrad;
      ctx.strokeStyle = isLocked ? '#475569' : col.hex;
      ctx.lineWidth = 2;
      ctx.shadowColor = isLocked ? 'transparent' : col.hex;
      ctx.shadowBlur = isLocked ? 0 : 12;

      ctx.beginPath();
      ctx.roundRect(x, startY, w, padHeight, 10);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top Specular Highlight Bevel
      if (!isLocked) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.roundRect(x + 4, startY + 3, w - 8, padHeight * 0.35, 6);
        ctx.fill();
      }

      // Button Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(isLocked ? '🔒 LOCK' : col.name, x + w / 2, startY + padHeight / 2 + 1);

      ctx.restore();
    }
  }
}
