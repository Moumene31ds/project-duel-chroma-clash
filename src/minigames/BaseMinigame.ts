import { PlayerIndex, MinigameMetadata } from '../core/types';
import { InputManager } from '../core/InputManager';
import { AudioHaptics } from '../core/AudioHaptics';
import { JuiceEngine } from '../core/JuiceEngine';
import { ProgressionManager } from '../meta/ProgressionManager';
import { AIBotEngine } from '../core/AIBotEngine';

export abstract class BaseMinigame {
  public abstract readonly meta: MinigameMetadata;

  protected input: InputManager;
  protected audio: AudioHaptics;
  protected juice: JuiceEngine;
  protected progression: ProgressionManager;
  protected botAI: AIBotEngine;

  public p1Score: number = 0;
  public p2Score: number = 0;
  public targetScore: number = 5;
  public matchWinner: PlayerIndex | null = null;
  public roundWinner: PlayerIndex | null = null;

  public isCountdownActive: boolean = true;
  public countdownTime: number = 3.0; // 3 seconds count
  private lastCountdownFloor: number = 4;

  public isRoundOver: boolean = false;
  public roundOverTimer: number = 0;

  public onMatchCompleteCallback?: (winner: PlayerIndex) => void;

  // One-shot guard: update() keeps running after the match ends (the end
  // screen is an overlay), so without this the victory callback — and a new
  // victory modal, music restart and tournament double-advance — would fire
  // every frame.
  private matchCompleteFired: boolean = false;

  // Cached visor-pod backdrop gradient (identical every frame; rebuild on resize)
  private visorGradKey: number = -1;
  private visorGrad: CanvasGradient | null = null;

  constructor(
    input: InputManager,
    audio: AudioHaptics,
    juice: JuiceEngine,
    progression: ProgressionManager,
    botAI: AIBotEngine
  ) {
    this.input = input;
    this.audio = audio;
    this.juice = juice;
    this.progression = progression;
    this.botAI = botAI;
  }

  public abstract init(width: number, height: number): void;
  public abstract resetRound(width: number, height: number): void;
  public abstract updateGame(dt: number, width: number, height: number): void;
  public abstract renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Centralized match start: single source of truth for target score (from
  // meta) + full state reset. Fixes: stale isRoundOver on rematch, silent
  // countdown on 2nd+ match (lastCountdownFloor), targetScore drift.
  public beginMatch(width: number, height: number): void {
    this.targetScore = this.meta.targetScore;
    this.p1Score = 0;
    this.p2Score = 0;
    this.matchWinner = null;
    this.roundWinner = null;
    this.isRoundOver = false;
    this.roundOverTimer = 0;
    this.isCountdownActive = true;
    this.countdownTime = 3.0;
    this.lastCountdownFloor = 4;
    this.matchCompleteFired = false;
    this.botAI.reset();
    this.init(width, height);
  }

  // Centralized match end for score-accumulation games (no extra point added).
  // Guarded against double-completion within the same frame.
  protected completeMatch(winner: PlayerIndex, width: number, height: number): void {
    if (this.matchWinner !== null || this.isRoundOver) return;
    this.roundWinner = winner;
    this.matchWinner = winner;
    this.isRoundOver = true;
    this.roundOverTimer = 1.4;
    this.juice.triggerSlowMo(0.5, 0.25);
    this.juice.emitConfetti(width, height);
    this.audio.playVictoryFanfare();
    this.progression.recordMatchResult(this.meta.id, winner);
  }

  public update(realDt: number, width: number, height: number) {
    // Countdown state (3.. 2.. 1.. GO!)
    if (this.isCountdownActive) {
      this.countdownTime -= realDt;
      const currentFloor = Math.ceil(this.countdownTime);
      if (currentFloor !== this.lastCountdownFloor && currentFloor > 0 && currentFloor <= 3) {
        this.lastCountdownFloor = currentFloor;
        this.audio.playCountdown(false);
      } else if (this.countdownTime <= 0 && this.lastCountdownFloor !== 0) {
        this.lastCountdownFloor = 0;
        this.audio.playCountdown(true);
        this.isCountdownActive = false;
      }
      return;
    }

    // Round over pause
    if (this.isRoundOver) {
      this.roundOverTimer -= realDt;
      if (this.roundOverTimer <= 0) {
        if (this.matchWinner !== null) {
          if (!this.matchCompleteFired) {
            this.matchCompleteFired = true;
            if (this.onMatchCompleteCallback) {
              this.onMatchCompleteCallback(this.matchWinner);
            }
          }
        } else {
          this.isRoundOver = false;
          this.resetRound(width, height);
        }
      }
      return;
    }

    // Apply mutators (Turbo speed 1.5x, Hyper Fever 1.35x)
    const mutators = this.progression.getMutators();
    let effectiveDt = realDt;
    if (mutators.turboSpeed) effectiveDt *= 1.5;
    if (mutators.hyperFever) effectiveDt *= 1.35;

    // Sudden death mutator (restores base target when toggled off instead of
    // permanently clobbering the game's target score)
    if (mutators.suddenDeath) {
      this.targetScore = 1;
    } else if (this.targetScore !== this.meta.targetScore) {
      this.targetScore = this.meta.targetScore;
    }

    this.updateGame(effectiveDt, width, height);
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.juice.drawCyberGrid(ctx, width, height);
    this.renderGame(ctx, width, height);
    this.juice.renderJuice(ctx, width, height);

    // Dynamic Match-Point Perimeter Tension (pulsing cyber-brackets when at match point)
    if (!this.matchWinner && this.targetScore > 1 && (this.p1Score === this.targetScore - 1 || this.p2Score === this.targetScore - 1)) {
      const leader: 1 | 2 = this.p1Score > this.p2Score ? 1 : this.p2Score > this.p1Score ? 2 : (Math.sin(performance.now() * 0.005) > 0 ? 1 : 2);
      this.juice.renderMatchPointTension(ctx, width, height, leader);
    }

    this.renderSplitHUD(ctx, width, height);

    if (this.isCountdownActive) {
      this.renderCountdownOverlay(ctx, width, height);
    } else if (this.isRoundOver) {
      this.renderRoundOverOverlay(ctx, width, height);
    }
  }

  protected triggerPointScore(winner: PlayerIndex, width: number, height: number) {
    if (this.isRoundOver) return;
    this.roundWinner = winner;
    this.isRoundOver = true;
    this.roundOverTimer = 1.4; // 1.4s delay for juice impact

    if (winner === 1) this.p1Score++;
    else this.p2Score++;

    this.audio.playGoalDetonation();
    this.juice.emitExplosion(width / 2, winner === 1 ? height * 0.2 : height * 0.8, winner === 1 ? '#FF0055' : '#0084FF', 40);

    // Check match winner & trigger Bullet-Time Slow-Mo + Confetti Fanfare!
    if (this.p1Score >= this.targetScore) {
      this.matchWinner = 1;
      this.juice.triggerSlowMo(0.5, 0.25); // Cinematic Bullet-Time Finisher!
      this.juice.emitConfetti(width, height);
      this.audio.playVictoryFanfare();
      this.progression.recordMatchResult(this.meta.id, 1);
    } else if (this.p2Score >= this.targetScore) {
      this.matchWinner = 2;
      this.juice.triggerSlowMo(0.5, 0.25);
      this.juice.emitConfetti(width, height);
      this.audio.playVictoryFanfare();
      this.progression.recordMatchResult(this.meta.id, 2);
    }
  }

  private renderSplitHUD(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const p1Colors = this.progression.getSkinColors(1);
    const p2Colors = this.progression.getSkinColors(2);
    const isAiMode = this.progression.getGameMode() === 'vs_ai';

    // 1. Center Divider Line with Flowing Energy & Glowing Neutral Core
    const isDay = this.progression.getThemePreference() === 'day';
    ctx.save();
    this.juice.drawEnergyDivider(ctx, width, height, isDay);
    ctx.restore();

    // 2. PLAYER 2 HUD (Top Edge - 180° Rotated for Face-to-Face ergonomics)
    ctx.save();
    ctx.translate(width, 0);
    ctx.rotate(Math.PI);
    this.renderVisorPod(
      ctx,
      width,
      isAiMode ? 'CYBER BOT' : 'PLAYER 2',
      this.p2Score,
      this.targetScore,
      p2Colors.primary,
      this.meta.title
    );
    ctx.restore();

    // 3. PLAYER 1 HUD (Bottom Edge - Upright)
    ctx.save();
    ctx.translate(0, height);
    this.renderVisorPod(
      ctx,
      width,
      'PLAYER 1',
      this.p1Score,
      this.targetScore,
      p1Colors.primary,
      this.meta.title
    );
    ctx.restore();
  }

  private renderVisorPod(
    ctx: CanvasRenderingContext2D,
    width: number,
    playerName: string,
    score: number,
    targetScore: number,
    color: string,
    title: string
  ) {
    const podH = 48;
    const margin = 12;
    const podW = width - margin * 2;

    // Glassmorphic Visor Chassis
    ctx.save();
    ctx.translate(margin, -podH - 8);

    // Beveled Pod Backdrop (gradient cached: static for a given width)
    if (!this.visorGrad || this.visorGradKey !== podW) {
      const bg = ctx.createLinearGradient(0, 0, 0, podH);
      bg.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
      bg.addColorStop(1, 'rgba(8, 12, 20, 0.96)');
      this.visorGrad = bg;
      this.visorGradKey = podW;
    }
    ctx.fillStyle = this.visorGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, podW, podH, 14);
    ctx.fill();

    // Glowing Neon Accent Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Animated holo gloss sheen sweep
    this.juice.drawHoloGloss(ctx, 2, 2, podW - 4, podH - 4, 14);

    // Player Label Badge
    ctx.shadowBlur = 0;
    ctx.font = '900 13px "Inter", sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerName, 16, 16);

    // Game Title Subtitle
    ctx.font = '700 10px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(title.toUpperCase(), 16, 32);

    // LED Score Pips (● ● ○ ○ ○)
    const pipRadius = 5.5;
    const pipGap = 16;
    const pipsStartX = podW - 18 - (targetScore - 1) * pipGap;

    for (let i = 0; i < targetScore; i++) {
      const px = pipsStartX + i * pipGap;
      const py = 24;
      const isScored = i < score;

      ctx.beginPath();
      ctx.arc(px, py, pipRadius, 0, Math.PI * 2);

      if (isScored) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.shadowBlur = 0;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Energy progress hairline (score / target)
    const frac = Math.min(1, score / targetScore);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14, 41);
    ctx.lineTo(14 + (podW - 28) * frac, 41);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(14 + (podW - 28) * frac, 41);
    ctx.lineTo(podW - 14, 41);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private renderCountdownOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const text = this.countdownTime > 0.5 ? Math.ceil(this.countdownTime).toString() : 'FIGHT!';
    const scale = 1.0 + (this.countdownTime % 1) * 0.4;
    const frac = Math.min(1, Math.max(0, this.countdownTime / 3));

    const drawCountdown = (x: number, y: number, flip: boolean, color: string) => {
      const now = performance.now() * 0.001;
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.rotate(Math.PI);
      ctx.scale(scale, scale);

      // Expanding cinematic pulse rings behind the number
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2;
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.arc(0, 0, 48 + r * 20 + (1 - frac) * 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rotating energy arc (locks onto the countdown)
      ctx.save();
      ctx.rotate(now * 2.4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 0.9);
      ctx.stroke();
      ctx.restore();

      // Big bold countdown numeral
      ctx.font = '900 68px "Inter", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = color;
      ctx.shadowBlur = 26;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 2);
      ctx.restore();
    };

    // P1 side (bottom, upright) + P2 side (top, flipped face-to-face)
    drawCountdown(width / 2, height * 0.75, false, '#FF0055');
    drawCountdown(width / 2, height * 0.25, true, '#0084FF');
  }

  private renderRoundOverOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const isAiMode = this.progression.getGameMode() === 'vs_ai';
    let winnerText = '';
    if (this.matchWinner !== null) {
      if (this.matchWinner === 1) winnerText = 'PLAYER 1 WINS MATCH!';
      else winnerText = isAiMode ? 'CYBER AI BOT WINS!' : 'PLAYER 2 WINS MATCH!';
    } else {
      if (this.roundWinner === 1) winnerText = 'PLAYER 1 SCORES!';
      else winnerText = isAiMode ? 'CYBER AI BOT SCORES!' : 'PLAYER 2 SCORES!';
    }

    const color = this.roundWinner === 1 ? '#FF0055' : '#0084FF';
    const now = performance.now() * 0.001;
    const pulse = 0.6 + 0.4 * Math.sin(now * 6);

    const drawBanner = (x: number, y: number, flip: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.rotate(Math.PI);

      // Pulsing energy halo disc
      const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, 150);
      halo.addColorStop(0, color);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.16 * pulse;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Expanding win rings
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4 * pulse;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 118 + (1 - pulse) * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Cyber corner brackets for cinematic framing
      this.juice.drawCyberVisorBracket(ctx, -190, -46, 380, 92, color);

      // Title text
      ctx.font = '900 32px "Inter", sans-serif';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(winnerText, 0, 0);
      ctx.shadowBlur = 0;

      // Match-win trophy flair
      if (this.matchWinner !== null) {
        ctx.font = '28px sans-serif';
        ctx.globalAlpha = 0.25 + pulse * 0.35;
        ctx.fillText('👑', 0, 58);
        ctx.globalAlpha = 1.0;
      }
      ctx.restore();
    };

    drawBanner(width / 2, height * 0.75, false);
    drawBanner(width / 2, height * 0.25, true);
  }
}
