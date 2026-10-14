import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';
import { InputManager } from '../core/InputManager';
import { AudioHaptics } from '../core/AudioHaptics';
import { JuiceEngine } from '../core/JuiceEngine';
import { ProgressionManager } from '../meta/ProgressionManager';
import { AIBotEngine } from '../core/AIBotEngine';
import { AchievementManager } from '../meta/AchievementManager';

type DuelPhase = 'STANDOFF' | 'READY_SIGNAL' | 'ROUND_RESOLVED' | 'FOUL_PENALTY';

interface SlashEffect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  life: number;
  maxLife: number;
}

export class NeonBladeDuel extends BaseMinigame {
  public meta: MinigameMetadata = {
    id: 'neon_blade',
    title: 'Neon Blade Duel',
    subtitle: 'Cyber Katana Millisecond Quickdraw',
    category: 'Action',
    icon: '⚔️',
    targetScore: 3,
    timeLimitSec: 45,
    instructionsP1: 'Wait for the SLASH! signal. Tap or swipe first! Premature strike = FOUL!',
    instructionsP2: 'انتظر إشارة اضرب! واقطع الشاشة أولاً! التسرع المبكر = خطأ فوري!'
  };

  private phase: DuelPhase = 'STANDOFF';
  private standoffTimer: number = 0;
  private signalTimestamp: number = 0;
  private p1ReactionMs: number | null = null;
  private p2ReactionMs: number | null = null;
  private foulPlayer: PlayerIndex | null = null;
  private heartbeatTimer: number = 0;

  private slashes: SlashEffect[] = [];
  private screenFlashAlpha: number = 0;

  // Stance energy pulse
  private p1Energy: number = 0;
  private p2Energy: number = 0;

  constructor(
    input: InputManager,
    audio: AudioHaptics,
    juice: JuiceEngine,
    progression: ProgressionManager,
    botAI: AIBotEngine
  ) {
    super(input, audio, juice, progression, botAI);
    this.targetScore = 3;
  }

  public init(width: number, height: number): void {
    this.resetRound(width, height);
  }

  public resetRound(_width: number, _height: number): void {
    this.phase = 'STANDOFF';
    // Random standoff between 2.2 and 4.6 seconds
    this.standoffTimer = 2.2 + Math.random() * 2.4;
    this.signalTimestamp = 0;
    this.p1ReactionMs = null;
    this.p2ReactionMs = null;
    this.foulPlayer = null;
    this.heartbeatTimer = 0.5;
    this.slashes = [];
    this.screenFlashAlpha = 0;
    this.p1Energy = 0;
    this.p2Energy = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Update visual slash trails & flashes
    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 3.5);
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].life -= dt;
      if (this.slashes[i].life <= 0) {
        this.slashes.splice(i, 1);
      }
    }

    this.p1Energy = Math.min(1.0, this.p1Energy + dt * 0.4);
    this.p2Energy = Math.min(1.0, this.p2Energy + dt * 0.4);

    // 2. Handle Phase Logic
    if (this.phase === 'STANDOFF') {
      // Heartbeat pulse audio
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.audio.playHeartbeat();
        this.heartbeatTimer = 0.85 + Math.random() * 0.25;
      }

      // Check for premature taps (FOUL)
      const p1Touches = this.input.getTouchesForPlayer(1);
      const p2Touches = this.input.getTouchesForPlayer(2);

      const p1Premature = p1Touches.some(t => t.phase === 'began');
      const p2Premature = p2Touches.some(t => t.phase === 'began');

      if (p1Premature || p2Premature) {
        const violator: PlayerIndex = p1Premature ? 1 : 2;
        this.triggerFoul(violator, width, height);
        return;
      }

      // Countdown standoff
      this.standoffTimer -= dt;
      if (this.standoffTimer <= 0) {
        // TRIGGER SLASH SIGNAL!
        this.phase = 'READY_SIGNAL';
        this.signalTimestamp = performance.now();
        this.screenFlashAlpha = 0.85;
        this.juice.addTrauma(0.35);
        this.audio.playBladeDraw();
        this.audio.playCountdown(true);
      }
    } else if (this.phase === 'READY_SIGNAL') {
      const now = performance.now();
      const elapsedSec = (now - this.signalTimestamp) / 1000;

      // Player 1 input detection
      const p1Touches = this.input.getTouchesForPlayer(1);
      const p1Struck = p1Touches.some(t => t.phase === 'began' || (t.phase === 'moved' && Math.hypot(t.vx, t.vy) > 300));

      if (p1Struck && this.p1ReactionMs === null) {
        this.p1ReactionMs = Math.round(now - this.signalTimestamp);
        this.triggerStrike(1, this.p1ReactionMs, width, height);
        return;
      }

      // Player 2 input (Local Human or AI Bot)
      if (this.progression.getGameMode() === 'vs_ai') {
        this.botAI.updateNeonBlade(true, elapsedSec, this.progression.getAIDifficulty(), () => {
          if (this.phase === 'READY_SIGNAL' && this.p2ReactionMs === null) {
            const botNow = performance.now();
            this.p2ReactionMs = Math.round(botNow - this.signalTimestamp);
            this.triggerStrike(2, this.p2ReactionMs, width, height);
          }
        });
      } else {
        const p2Touches = this.input.getTouchesForPlayer(2);
        const p2Struck = p2Touches.some(t => t.phase === 'began' || (t.phase === 'moved' && Math.hypot(t.vx, t.vy) > 300));

        if (p2Struck && this.p2ReactionMs === null) {
          this.p2ReactionMs = Math.round(now - this.signalTimestamp);
          this.triggerStrike(2, this.p2ReactionMs, width, height);
          return;
        }
      }
    }
  }

  private triggerStrike(winner: PlayerIndex, reactionMs: number, width: number, height: number): void {
    this.phase = 'ROUND_RESOLVED';
    this.roundWinner = winner;

    if (winner === 1) {
      this.p1Score++;
      // Check samurai achievement
      if (reactionMs < 220) {
        AchievementManager.getInstance().unlock('cyber_samurai');
      }
    } else {
      this.p2Score++;
    }

    // Slash geometry across opponent zone
    const targetY = winner === 1 ? height * 0.25 : height * 0.75;
    this.slashes.push({
      startX: 20,
      startY: targetY - 40,
      endX: width - 20,
      endY: targetY + 40,
      color: winner === 1 ? '#00F0FF' : '#FF0055',
      life: 0.65,
      maxLife: 0.65
    });

    this.audio.playBladeClash();
    this.juice.addTrauma(0.55);
    this.juice.triggerSlowMo(0.4, 0.28);
    this.juice.emitSparks(width * 0.5, targetY, winner === 1 ? '#00F0FF' : '#FF0055', 40);

    // End match or next round
    if (this.p1Score >= this.targetScore || this.p2Score >= this.targetScore) {
      const matchWinner: PlayerIndex = this.p1Score >= this.targetScore ? 1 : 2;
      this.completeMatch(matchWinner, width, height);
    } else {
      this.isRoundOver = true;
      this.roundOverTimer = 1.6;
    }
  }

  private triggerFoul(violator: PlayerIndex, width: number, height: number): void {
    this.phase = 'FOUL_PENALTY';
    this.foulPlayer = violator;
    const beneficiary: PlayerIndex = violator === 1 ? 2 : 1;
    this.roundWinner = beneficiary;

    if (beneficiary === 1) {
      this.p1Score++;
    } else {
      this.p2Score++;
    }

    this.audio.playFoulBuzzer();
    this.juice.addTrauma(0.3);

    if (this.p1Score >= this.targetScore || this.p2Score >= this.targetScore) {
      const matchWinner: PlayerIndex = this.p1Score >= this.targetScore ? 1 : 2;
      this.completeMatch(matchWinner, width, height);
    } else {
      this.isRoundOver = true;
      this.roundOverTimer = 1.5;
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const centerY = height * 0.5;

    // 1. Dark Atmospheric Standoff Arena
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (isDay) {
      bgGrad.addColorStop(0, '#E8F1FC');
      bgGrad.addColorStop(0.5, '#F5F9FF');
      bgGrad.addColorStop(1, '#E8F1FC');
    } else {
      bgGrad.addColorStop(0, '#0F051D');
      bgGrad.addColorStop(0.5, '#050711');
      bgGrad.addColorStop(1, '#051424');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Center Dividing Razor Wire / Energy Line
    ctx.save();
    ctx.strokeStyle = this.phase === 'READY_SIGNAL' ? '#FFE600' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = this.phase === 'READY_SIGNAL' ? 4 : 2;
    ctx.setLineDash(this.phase === 'READY_SIGNAL' ? [] : [8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.restore();

    // 3. Stance Blades / Sheaths
    this.renderBladeStance(ctx, 1, width, height);
    this.renderBladeStance(ctx, 2, width, height);

    // 4. Center Tension Display / Signal Banner
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.phase === 'STANDOFF') {
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.06;
      ctx.font = `900 ${Math.round(24 * pulse)}px 'Cairo', 'Inter', sans-serif`;
      ctx.fillStyle = isDay ? '#334155' : '#94A3B8';
      ctx.fillText('⏳ استعد... READY...', width * 0.5, centerY - 28);

      ctx.font = `700 13px 'Cairo', sans-serif`;
      ctx.fillStyle = isDay ? '#64748B' : '#64748B';
      ctx.fillText('لا تلمس قبل الإشارة! (أي تسرع = خطأ)', width * 0.5, centerY + 28);
    } else if (this.phase === 'READY_SIGNAL') {
      // MASSIVE FLASHY SLASH PROMPT
      const scale = 1 + Math.sin(performance.now() * 0.02) * 0.12;
      ctx.font = `900 ${Math.round(52 * scale)}px 'Cairo', 'Inter', sans-serif`;
      ctx.fillStyle = '#FFE600';
      ctx.shadowColor = '#FFE600';
      ctx.shadowBlur = 24;
      ctx.fillText('⚡ اضرب! SLASH! ⚡', width * 0.5, centerY);
      ctx.shadowBlur = 0;
    } else if (this.phase === 'ROUND_RESOLVED') {
      const winner = this.roundWinner;
      const ms = winner === 1 ? this.p1ReactionMs : this.p2ReactionMs;
      ctx.font = `900 32px 'Cairo', sans-serif`;
      ctx.fillStyle = winner === 1 ? '#00F0FF' : '#FF0055';
      ctx.fillText(winner === 1 ? '⚔️ ضربة خاطفة للّاعب 1!' : '⚔️ ضربة خاطفة للّاعب 2!', width * 0.5, centerY - 20);

      if (ms !== null) {
        ctx.font = `900 22px 'Inter', sans-serif`;
        ctx.fillStyle = '#FFE600';
        ctx.fillText(`⚡ ${ms} ms`, width * 0.5, centerY + 20);
      }
    } else if (this.phase === 'FOUL_PENALTY') {
      ctx.font = `900 30px 'Cairo', sans-serif`;
      ctx.fillStyle = '#FF2A4D';
      ctx.fillText('⚠️ خطأ فوري! (تسرع مبكر)', width * 0.5, centerY - 18);

      ctx.font = `700 16px 'Cairo', sans-serif`;
      ctx.fillStyle = isDay ? '#0F172A' : '#F8FAFC';
      const beneficiaryText = this.foulPlayer === 1 ? 'نقطة للاعب 2 (+1)' : 'نقطة للاعب 1 (+1)';
      ctx.fillText(beneficiaryText, width * 0.5, centerY + 20);
    }
    ctx.restore();

    // 5. Active Slashing Laser Trails
    for (const s of this.slashes) {
      const alpha = s.life / s.maxLife;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 8 * alpha;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.startX, s.startY);
      ctx.lineTo(s.endX, s.endY);
      ctx.stroke();

      // White core
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3 * alpha;
      ctx.stroke();
      ctx.restore();
    }

    // 6. Full Screen Flash
    if (this.screenFlashAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${this.screenFlashAlpha})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 7. Touch Guidance Strips
    this.renderTouchStrikes(ctx, width, height);
  }

  private renderBladeStance(ctx: CanvasRenderingContext2D, player: PlayerIndex, width: number, height: number): void {
    const isP1 = player === 1;
    const y = isP1 ? height * 0.84 : height * 0.16;
    const color = isP1 ? '#00F0FF' : '#FF0055';
    const energy = isP1 ? this.p1Energy : this.p2Energy;

    ctx.save();
    ctx.translate(width * 0.5, y);
    if (!isP1) ctx.rotate(Math.PI);

    // Glowing Katana Blade in ready position
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * energy;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, 0);
    ctx.lineTo(width * 0.32, 0);
    ctx.stroke();

    // Blade Hilt
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-width * 0.36, -6, width * 0.06, 12);
    ctx.fillRect(-width * 0.31, -10, 4, 20);

    ctx.restore();
  }

  private renderTouchStrikes(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    ctx.save();
    ctx.font = `800 13px 'Cairo', sans-serif`;
    ctx.textAlign = 'center';

    // P1 bottom prompt
    ctx.fillStyle = isDay ? 'rgba(0, 100, 200, 0.7)' : 'rgba(0, 240, 255, 0.7)';
    ctx.fillText('منطقة ضربة اللاعب 1 👆 (المس هنا بعد الإشارة)', width * 0.5, height - 32);

    // P2 top prompt
    ctx.save();
    ctx.translate(width * 0.5, 32);
    ctx.rotate(Math.PI);
    ctx.fillStyle = isDay ? 'rgba(200, 0, 70, 0.7)' : 'rgba(255, 0, 85, 0.7)';
    ctx.fillText('منطقة ضربة اللاعب 2 👆 (المس هنا بعد الإشارة)', 0, 0);
    ctx.restore();

    ctx.restore();
  }
}
