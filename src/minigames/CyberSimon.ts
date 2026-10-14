import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface SimonArc {
  id: number;
  label: string;
  color: string;
  startAngle: number;
  endAngle: number;
  toneIndex: number;
}

export class CyberSimon extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'cyber_simon',
    title: 'Cyber Simon Duel',
    subtitle: 'Polyphonic Sensory Arc Duel',
    category: 'Memory Audio',
    icon: '⚡',
    targetScore: 3,
    timeLimitSec: 60,
    instructionsP1: 'Listen & watch, then repeat the arc pattern',
    instructionsP2: 'Listen & watch, then repeat the arc pattern'
  };

  public readonly ARCS: SimonArc[] = [
    { id: 0, label: 'CYAN', color: '#00F0FF', startAngle: Math.PI, endAngle: Math.PI * 1.5, toneIndex: 0 },
    { id: 1, label: 'MAGENTA', color: '#FF0055', startAngle: Math.PI * 1.5, endAngle: Math.PI * 2, toneIndex: 2 },
    { id: 2, label: 'GOLD', color: '#FFB800', startAngle: 0, endAngle: Math.PI * 0.5, toneIndex: 4 },
    { id: 3, label: 'EMERALD', color: '#00FF66', startAngle: Math.PI * 0.5, endAngle: Math.PI, toneIndex: 6 },
  ];

  public phase: 'playback' | 'input' | 'scored' = 'playback';
  public sequence: number[] = [];
  public sequenceLength: number = 3;

  public playbackStep: number = 0;
  public playbackTimer: number = 0;
  public activeArcLit: number | null = null;

  public p1Progress: number = 0;
  public p2Progress: number = 0;
  public p1Error: boolean = false;
  public p2Error: boolean = false;

  public p1ArcGlow: number[] = [0, 0, 0, 0];
  public p2ArcGlow: number[] = [0, 0, 0, 0];

  public inputTimer: number = 10.0;
  public botDecisionTimer: number = 0;

  public init(width: number, height: number): void {
    this.targetScore = 3;
    this.sequenceLength = 3;
    this.resetRound(width, height);
  }

  public resetRound(_width: number, _height: number): void {
    this.phase = 'playback';
    this.playbackStep = 0;
    this.playbackTimer = 0.5;
    this.activeArcLit = null;
    this.p1Progress = 0;
    this.p2Progress = 0;
    this.p1Error = false;
    this.p2Error = false;
    this.inputTimer = 10.0;
    this.p1ArcGlow.fill(0);
    this.p2ArcGlow.fill(0);
    this.botDecisionTimer = 0.5;

    // Mutators (Turbo speeds up playback tempo)
    const mutators = this.progression.getMutators();
    const effectiveLen = mutators.turboSpeed ? this.sequenceLength + 1 : this.sequenceLength;

    this.sequence = [];
    for (let i = 0; i < effectiveLen; i++) {
      this.sequence.push(Math.floor(Math.random() * 4));
    }
  }

  public updateGame(dt: number, width: number, height: number): void {
    // Fade arc glows
    for (let i = 0; i < 4; i++) {
      if (this.p1ArcGlow[i] > 0) this.p1ArcGlow[i] = Math.max(0, this.p1ArcGlow[i] - dt * 3.5);
      if (this.p2ArcGlow[i] > 0) this.p2ArcGlow[i] = Math.max(0, this.p2ArcGlow[i] - dt * 3.5);
    }

    if (this.phase === 'playback') {
      this.updatePlayback(dt);
      return;
    }

    if (this.phase === 'input') {
      this.updateInputPhase(dt, width, height);
    }
  }

  private updatePlayback(dt: number) {
    this.playbackTimer -= dt;
    if (this.playbackTimer <= 0) {
      if (this.activeArcLit !== null) {
        // Arc off
        this.activeArcLit = null;
        this.playbackTimer = 0.16;
        this.playbackStep++;

        if (this.playbackStep >= this.sequence.length) {
          // Playback finished, players input!
          this.phase = 'input';
          this.inputTimer = 10.0;
          this.audio.playCountdown(true);
        }
      } else {
        // Arc on
        const arcId = this.sequence[this.playbackStep];
        this.activeArcLit = arcId;
        this.playbackTimer = 0.42;
        this.audio.playMemoryTone(this.ARCS[arcId].toneIndex);
        this.p1ArcGlow[arcId] = 1.0;
        this.p2ArcGlow[arcId] = 1.0;
        this.juice.addTrauma(0.08);
      }
    }
  }

  private updateInputPhase(dt: number, width: number, height: number) {
    this.inputTimer -= dt;
    if (this.inputTimer <= 0) {
      this.audio.playMemoryError();
      this.resetRound(width, height);
      return;
    }

    // AI Bot handling
    if (this.progression.getGameMode() === 'vs_ai' && !this.p2Error) {
      this.updateBot(dt, width, height);
    }

    // Human input
    this.handleTouches(width, height);
  }

  private handleTouches(width: number, height: number) {
    const touches = this.input.getTouches();

    for (const touch of touches) {
      if (touch.phase !== 'began') continue;

      if (touch.player === 1 && !this.p1Error) {
        const arcId = this.getArcAtPoint(touch.rawX, touch.rawY, 1, width, height);
        if (arcId !== null) {
          this.processTap(1, arcId, width, height);
        }
      } else if (touch.player === 2 && !this.p2Error && this.progression.getGameMode() === 'local_2p') {
        const arcId = this.getArcAtPoint(touch.rawX, touch.rawY, 2, width, height);
        if (arcId !== null) {
          this.processTap(2, arcId, width, height);
        }
      }
    }
  }

  public processTap(player: PlayerIndex, arcId: number, width: number, height: number) {
    const currentProg = player === 1 ? this.p1Progress : this.p2Progress;
    const expected = this.sequence[currentProg];

    if (arcId === expected) {
      // Correct!
      this.audio.playMemoryTone(this.ARCS[arcId].toneIndex);
      if (player === 1) {
        this.p1ArcGlow[arcId] = 1.0;
        this.p1Progress++;
        if (this.p1Progress >= this.sequence.length) {
          this.audio.playSequenceSuccess();
          this.juice.addTrauma(0.4);
          this.sequenceLength = Math.min(8, this.sequenceLength + 1);
          this.triggerPointScore(1, width, height);
        }
      } else {
        this.p2ArcGlow[arcId] = 1.0;
        this.p2Progress++;
        if (this.p2Progress >= this.sequence.length) {
          this.audio.playSequenceSuccess();
          this.juice.addTrauma(0.4);
          this.sequenceLength = Math.min(8, this.sequenceLength + 1);
          this.triggerPointScore(2, width, height);
        }
      }
    } else {
      // Wrong!
      this.audio.playMemoryError();
      this.juice.addTrauma(0.25);
      if (player === 1) {
        this.p1Error = true;
        if (this.p2Error) this.resetRound(width, height);
      } else {
        this.p2Error = true;
        if (this.p1Error) this.resetRound(width, height);
      }
    }
  }

  private updateBot(dt: number, width: number, height: number) {
    this.botDecisionTimer -= dt;
    if (this.botDecisionTimer > 0) return;

    const diff = this.progression.getAIDifficulty();
    const delay = diff === 'hard' ? 0.25 : diff === 'medium' ? 0.4 : 0.6;
    this.botDecisionTimer = delay;

    const expected = this.sequence[this.p2Progress];
    const errorChance = diff === 'hard' ? 0.0 : diff === 'medium' ? 0.12 : 0.3;

    let tapArc = expected;
    if (Math.random() < errorChance) {
      tapArc = (expected + 1 + Math.floor(Math.random() * 3)) % 4;
    }

    this.processTap(2, tapArc, width, height);
  }

  private getArcAtPoint(rawX: number, rawY: number, player: PlayerIndex, width: number, height: number): number | null {
    const centerCY = player === 1 ? height - 160 : 160;
    const centerCX = width / 2;

    let dx = rawX - centerCX;
    let dy = rawY - centerCY;

    if (player === 2) {
      dx = -dx;
      dy = -dy;
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 30 || dist > 120) return null; // Outside sensory ring

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;

    for (const arc of this.ARCS) {
      if (arc.startAngle < arc.endAngle) {
        if (angle >= arc.startAngle && angle <= arc.endAngle) return arc.id;
      } else {
        if (angle >= arc.startAngle || angle <= arc.endAngle) return arc.id;
      }
    }
    return null;
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';

    // 1. Center Round Status
    this.renderCenterStatus(ctx, width, height, isDay);

    // 2. Render P2 Ring (Top Half, rotated 180° for Face-to-Face)
    ctx.save();
    ctx.translate(width / 2, 160);
    ctx.rotate(Math.PI);
    this.renderRing(ctx, 2, this.p2Progress, this.p2Error, this.p2ArcGlow, isDay);
    ctx.restore();

    // 3. Render P1 Ring (Bottom Half, Normal Orientation)
    ctx.save();
    ctx.translate(width / 2, height - 160);
    this.renderRing(ctx, 1, this.p1Progress, this.p1Error, this.p1ArcGlow, isDay);
    ctx.restore();
  }

  private renderRing(
    ctx: CanvasRenderingContext2D,
    player: PlayerIndex,
    progress: number,
    isError: boolean,
    glows: number[],
    isDay: boolean
  ) {
    const now = performance.now();
    const pColor = player === 1 ? '#FF0055' : '#0084FF';
    const outerR = 115;
    const innerR = 45;

    // Dynamic Floor Light
    this.juice.drawRadialFloorLight(ctx, 0, 0, outerR + 30, isError ? '#FF0033' : pColor, 0.4);

    // Outer Backing Plate (High-Tech Synthesizer Pedestal)
    const pedestalGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR + 15);
    if (isDay) {
      pedestalGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      pedestalGrad.addColorStop(1, 'rgba(235, 242, 250, 0.95)');
    } else {
      pedestalGrad.addColorStop(0, 'rgba(22, 30, 46, 0.95)');
      pedestalGrad.addColorStop(1, 'rgba(11, 15, 24, 0.95)');
    }

    ctx.beginPath();
    ctx.arc(0, 0, outerR + 14, 0, Math.PI * 2);
    ctx.fillStyle = pedestalGrad;
    ctx.strokeStyle = isError ? '#FF0033' : (isDay ? 'rgba(30, 50, 90, 0.15)' : 'rgba(255, 255, 255, 0.12)');
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();

    // Outer Frequency Tick Marks (24 ticks around circumference)
    ctx.save();
    ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.25)' : 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 1.5;
    for (let t = 0; t < 24; t++) {
      const a = (t * Math.PI * 2) / 24;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cos * (outerR + 7), sin * (outerR + 7));
      ctx.lineTo(cos * (outerR + 12), sin * (outerR + 12));
      ctx.stroke();
    }
    ctx.restore();

    // Render 4 Crystalline Audio Arcs
    for (const arc of this.ARCS) {
      const glowAmt = glows[arc.id];
      const isLit = glowAmt > 0.05;
      const startA = arc.startAngle + 0.05;
      const endA = arc.endAngle - 0.05;

      ctx.beginPath();
      ctx.arc(0, 0, outerR, startA, endA);
      ctx.arc(0, 0, innerR, endA, startA, true);
      ctx.closePath();

      if (isLit) {
        // High-gloss supercharged acoustic luminescence
        const litGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
        litGrad.addColorStop(0, '#FFFFFF');
        litGrad.addColorStop(0.3, arc.color);
        litGrad.addColorStop(1, '#0c121e');
        ctx.fillStyle = litGrad;
        ctx.shadowColor = arc.color;
        ctx.shadowBlur = 24;
      } else {
        const idleGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
        if (isDay) {
          idleGrad.addColorStop(0, 'rgba(241, 245, 249, 0.9)');
          idleGrad.addColorStop(1, 'rgba(215, 225, 238, 0.9)');
        } else {
          idleGrad.addColorStop(0, 'rgba(28, 38, 58, 0.85)');
          idleGrad.addColorStop(1, 'rgba(14, 20, 32, 0.85)');
        }
        ctx.fillStyle = idleGrad;
        ctx.shadowBlur = 0;
      }
      ctx.fill();

      // Crystalline Beveled Rim
      ctx.strokeStyle = isLit ? '#FFFFFF' : (isDay ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)');
      ctx.lineWidth = isLit ? 3 : 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Arc Center Sonic Wave Line when lit
      if (isLit) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, (innerR + outerR) / 2, startA + 0.1, endA - 0.1);
        ctx.stroke();

        // Expanding outward sonic shockwave segment as the glow decays
        const avgA = (startA + endA) / 2;
        const push = (1 - glowAmt) * 28;
        ctx.globalAlpha = glowAmt * 0.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, outerR + 8 + push, avgA - 0.35, avgA + 0.35);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }

    // Center Core (Spinning Cyber Reactor)
    ctx.save();
    const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, innerR - 6);
    coreGrad.addColorStop(0, isDay ? '#FFFFFF' : '#1a2233');
    coreGrad.addColorStop(1, isDay ? '#E2E8F0' : '#0a0d14');
    ctx.fillStyle = coreGrad;
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = pColor;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(0, 0, innerR - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Spinning Core Reticle
    ctx.rotate(now * 0.002);
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, innerR - 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Center Progress Text
    ctx.font = '900 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pColor;
    ctx.fillText(`${progress}/${this.sequence.length}`, 0, 0);
  }

  private renderCenterStatus(ctx: CanvasRenderingContext2D, width: number, height: number, isDay: boolean) {
    const cy = height / 2;
    const now = performance.now();
    ctx.save();

    const podW = 230;
    const podH = 46;

    const podGrad = ctx.createLinearGradient(0, cy - podH / 2, 0, cy + podH / 2);
    podGrad.addColorStop(0, isDay ? 'rgba(255, 255, 255, 0.95)' : 'rgba(22, 29, 44, 0.95)');
    podGrad.addColorStop(1, isDay ? 'rgba(240, 245, 255, 0.9)' : 'rgba(12, 17, 28, 0.9)');
    ctx.fillStyle = podGrad;

    const statusColor = this.phase === 'playback' ? '#FF9900' : '#00F0FF';
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.roundRect(width / 2 - podW / 2, cy - podH / 2, podW, podH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    this.juice.drawCyberVisorBracket(ctx, width / 2 - podW / 2 + 4, cy - podH / 2 + 4, podW - 8, podH - 8, statusColor);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px monospace';

    if (this.phase === 'playback') {
      const pulse = 0.8 + Math.sin(now * 0.008) * 0.2;
      ctx.fillStyle = `rgba(255, 153, 0, ${pulse})`;
      ctx.fillText(`🎵 SYNCHRONIZING CHORD`, width / 2, cy);
    } else {
      ctx.fillStyle = statusColor;
      ctx.fillText(`⚡ REPEAT CHORD (${Math.ceil(this.inputTimer)}s)`, width / 2, cy);
    }

    ctx.restore();
  }
}
