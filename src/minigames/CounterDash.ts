import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

type CombatState = 'idle' | 'startup' | 'active' | 'recovery' | 'parrying' | 'parry_whiff' | 'stunned';

interface Duelist {
  player: PlayerIndex;
  x: number;
  y: number;
  state: CombatState;
  stateTimer: number;
  isFeinting: boolean;
  stamina: number;
  tapCount: number;
  lastTapTime: number;
  swordOffset: number;
  dashOffset: number;
}

export class CounterDash extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'counter_dash',
    title: 'Kinetic Counter-Dash',
    subtitle: 'High-Stakes Parry & Frame-Advantage Dueling',
    category: 'Twitch Reflex',
    icon: '⚡',
    targetScore: 3,
    timeLimitSec: 60,
    instructionsP1: 'Tap Left = Parry | Tap Right = Strike / Double-Tap = Feint',
    instructionsP2: 'Tap Left = Parry | Tap Right = Strike / Double-Tap = Feint'
  };

  private d1!: Duelist;
  private d2!: Duelist;

  // Tension mechanics
  private idleTensionTimer: number = 0;
  private isTensionActive: boolean = false;
  private heartbeatSoundTimer: number = 0;

  public init(width: number, height: number): void {
    const midX = width / 2;
    this.d1 = this.createDuelist(1, midX, height * 0.72);
    this.d2 = this.createDuelist(2, midX, height * 0.28);

    this.resetRound(width, height);
  }

  private createDuelist(player: PlayerIndex, x: number, y: number): Duelist {
    return {
      player,
      x,
      y,
      state: 'idle',
      stateTimer: 0,
      isFeinting: false,
      stamina: 100,
      tapCount: 0,
      lastTapTime: 0,
      swordOffset: 0,
      dashOffset: 0
    };
  }

  public resetRound(width: number, height: number): void {
    const midX = width / 2;
    this.resetDuelist(this.d1, midX, height * 0.72);
    this.resetDuelist(this.d2, midX, height * 0.28);

    this.idleTensionTimer = 0;
    this.isTensionActive = false;
    this.heartbeatSoundTimer = 0;
  }

  private resetDuelist(d: Duelist, x: number, y: number) {
    d.x = x;
    d.y = y;
    d.state = 'idle';
    d.stateTimer = 0;
    d.isFeinting = false;
    d.stamina = 100;
    d.tapCount = 0;
    d.lastTapTime = 0;
    d.swordOffset = 0;
    d.dashOffset = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Tension System
    if (this.d1.state === 'idle' && this.d2.state === 'idle') {
      this.idleTensionTimer += dt;
      if (this.idleTensionTimer > 3.5) {
        this.isTensionActive = true;
        this.heartbeatSoundTimer -= dt;
        if (this.heartbeatSoundTimer <= 0) {
          this.audio.playHeartbeat();
          this.heartbeatSoundTimer = Math.max(0.4, 0.9 - (this.idleTensionTimer - 3.5) * 0.1);
        }
      }
    } else {
      this.idleTensionTimer = 0;
      this.isTensionActive = false;
    }

    // 2. Process Inputs
    this.processDuelistInput(this.d1, 1, dt);
    if (this.progression.getGameMode() === 'vs_ai') {
      this.botAI.updateCounterDash(
        this.d2,
        this.d1,
        this.progression.getAIDifficulty(),
        dt,
        () => this.executeAttackInput(this.d2),
        () => this.executeParry(this.d2)
      );
    } else {
      this.processDuelistInput(this.d2, 2, dt);
    }

    // 3. Step Combat State Machines
    this.stepDuelistState(this.d1, dt);
    this.stepDuelistState(this.d2, dt);

    // 4. Resolve Combat Interactions (Strike vs Parry vs Whiff)
    this.resolveDuelistInteractions(width, height);

    // Lethal blade streak trails while striking
    for (const d of [this.d1, this.d2]) {
      if (d.state === 'active') {
        const dir = d.player === 1 ? -1 : 1;
        const tipY = d.y + dir * (44 + d.swordOffset);
        this.juice.addTrailPoint(`blade_${d.player}`, d.x, tipY, d.player === 1 ? '#FF0055' : '#0084FF', 5);
      }
    }
  }

  private processDuelistInput(d: Duelist, player: PlayerIndex, dt: number) {
    // Passive stamina recovery
    d.stamina = Math.min(100, d.stamina + 35 * dt);

    if (d.state === 'stunned' || d.state === 'parry_whiff') return;

    const touches = this.input.getTouchesForPlayer(player);
    const kb = player === 1 ? this.input.keyboardP1 : this.input.keyboardP2;

    if (touches.length > 0) {
      for (const t of touches) {
        if (t.phase === 'began') {
          // In player coordinates, Left half = Parry / Dash, Right half = Strike / Feint
          if (t.normX < 0.5) {
            this.executeParry(d);
          } else {
            this.executeAttackInput(d);
          }
        }
      }
    } else {
      // Keyboard fallback
      if (kb.actionB) {
        this.executeParry(d);
        kb.actionB = false;
      }
      if (kb.actionA) {
        this.executeAttackInput(d);
        kb.actionA = false;
      }
    }
  }

  private executeAttackInput(d: Duelist) {
    const now = performance.now();

    // Check for Feint cancel during startup
    if (d.state === 'startup') {
      d.isFeinting = true;
      d.state = 'idle';
      d.stateTimer = 0;
      d.swordOffset = 0;
      this.audio.playPuckBounce(1.6);
      this.juice.emitSparks(d.x, d.y, '#FFFFFF', 6, 120, 0.15);
      return;
    }

    if (d.state !== 'idle') return;

    // Normal Strike Initiation
    d.state = 'startup';
    // If tension is active, startup compresses from 0.3s down to 0.16s!
    d.stateTimer = this.isTensionActive ? 0.16 : 0.28;
    d.swordOffset = 15;
    d.lastTapTime = now;
    this.audio.playSwordSlash();
  }

  private executeParry(d: Duelist) {
    if (d.state !== 'idle') return;
    d.state = 'parrying';
    d.stateTimer = 0.11; // 110ms parry active window
    d.swordOffset = -8;
    this.audio.playPuckBounce(1.2);
  }

  private stepDuelistState(d: Duelist, dt: number) {
    d.stateTimer -= dt;

    if (d.state === 'startup') {
      d.swordOffset += 80 * dt;
      if (d.stateTimer <= 0) {
        // Transition to ACTIVE lethal strike
        d.state = 'active';
        d.stateTimer = 0.07; // 70ms active hit window
      }
    } else if (d.state === 'active') {
      d.swordOffset += 140 * dt;
      if (d.stateTimer <= 0) {
        // Transition to RECOVERY vulnerability
        d.state = 'recovery';
        d.stateTimer = 0.38; // 380ms recovery
      }
    } else if (d.state === 'recovery') {
      d.swordOffset *= (1.0 - 5.0 * dt);
      if (d.stateTimer <= 0) {
        d.state = 'idle';
        d.swordOffset = 0;
      }
    } else if (d.state === 'parrying') {
      if (d.stateTimer <= 0) {
        // Whiffed Parry Penalty
        d.state = 'parry_whiff';
        d.stateTimer = 0.32; // 320ms helpless whiff state
      }
    } else if (d.state === 'parry_whiff') {
      if (d.stateTimer <= 0) {
        d.state = 'idle';
      }
    } else if (d.state === 'stunned') {
      if (d.stateTimer <= 0) {
        d.state = 'idle';
      }
    }
  }

  private resolveDuelistInteractions(width: number, height: number) {
    // 1. D1 Active Strike vs D2
    if (this.d1.state === 'active') {
      if (this.d2.state === 'parrying') {
        // CLASH / PARRY SUCCESS for D2!
        this.d1.state = 'stunned';
        this.d1.stateTimer = 0.85;
        this.d2.state = 'idle';

        this.audio.playParryFreeze();
        this.juice.triggerSlowMo(0.08, 0.05); // Cinematic Hit-Stop Frame Freeze!
        this.juice.triggerFlash('#FFFFFF', 0.65);
        this.juice.addTrauma(0.55);
        this.juice.triggerShockwave(width / 2, height / 2, '#00F0FF', 180);
        this.juice.emitExplosion(width / 2, height / 2, '#00F0FF', 30);
      } else if (this.d2.state !== 'active') {
        // LETHAL HIT by D1 on D2!
        this.audio.playGoalDetonation();
        this.juice.emitExplosion(this.d2.x, this.d2.y, '#FF0055', 40);
        this.triggerPointScore(1, width, height);
      }
    }

    // 2. D2 Active Strike vs D1
    if (this.d2.state === 'active') {
      if (this.d1.state === 'parrying') {
        // CLASH / PARRY SUCCESS for D1!
        this.d2.state = 'stunned';
        this.d2.stateTimer = 0.85;
        this.d1.state = 'idle';

        this.audio.playParryFreeze();
        this.juice.triggerSlowMo(0.08, 0.05); // Cinematic Hit-Stop Frame Freeze!
        this.juice.triggerFlash('#FFFFFF', 0.65);
        this.juice.addTrauma(0.55);
        this.juice.triggerShockwave(width / 2, height / 2, '#FF0055', 180);
        this.juice.emitExplosion(width / 2, height / 2, '#FF0055', 30);
      } else if (this.d1.state !== 'active') {
        // LETHAL HIT by D2 on D1!
        this.audio.playGoalDetonation();
        this.juice.emitExplosion(this.d1.x, this.d1.y, '#00F0FF', 40);
        this.triggerPointScore(2, width, height);
      }
    }

    // 3. Double Active Strike = Neutral Blade Clash!
    if (this.d1.state === 'active' && this.d2.state === 'active') {
      this.d1.state = 'recovery';
      this.d1.stateTimer = 0.25;
      this.d2.state = 'recovery';
      this.d2.stateTimer = 0.25;

      this.audio.playParryClash();
      this.juice.addTrauma(0.3);
      this.juice.emitExplosion(width / 2, height / 2, '#FFAA00', 20);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const midX = width / 2;
    const midY = height / 2;
    const now = performance.now();

    // 1. Central Clash Arena Lines & Tension
    ctx.save();
    // Center combat line
    ctx.strokeStyle = this.isTensionActive ? 'rgba(255, 30, 80, 0.6)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(30, midY);
    ctx.lineTo(width - 30, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Central Clash Ring
    ctx.strokeStyle = this.isTensionActive ? 'rgba(255, 30, 80, 0.8)' : 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(midX, midY, 40, 0, Math.PI * 2);
    ctx.stroke();

    // Tension Dark Vignette & Pulse
    if (this.isTensionActive) {
      const grad = ctx.createRadialGradient(midX, midY, 30, midX, midY, height * 0.65);
      const pulse = 0.35 + Math.sin(now * 0.012) * 0.15;
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, `rgba(255, 0, 60, ${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Pulsing VS duel emblem in the clash ring
      const vsPulse = 0.5 + 0.5 * Math.sin(now * 0.006);
      ctx.font = '900 20px sans-serif';
      ctx.fillStyle = `rgba(255, 40, 90, ${0.5 + vsPulse * 0.4})`;
      ctx.shadowColor = '#FF0055';
      ctx.shadowBlur = 18;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡VS⚡', midX, midY + 1);
      ctx.shadowBlur = 0;

      // Warning alert beneath the ring
      ctx.font = '900 13px sans-serif';
      ctx.fillStyle = 'rgba(255, 60, 90, 0.7)';
      ctx.fillText('⚡ LETHAL FOCUS ⚡', midX, midY + 30);
    }
    ctx.restore();

    // 2. Action Zone Cyber-HUD Pods
    ctx.save();
    const renderZonePill = (x: number, y: number, label: string, color: string, rot180 = false) => {
      ctx.save();
      ctx.translate(x, y);
      if (rot180) ctx.rotate(Math.PI);
      ctx.fillStyle = 'rgba(15, 20, 32, 0.75)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-55, -12, 110, 24, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 10px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1);
      ctx.restore();
    };

    // P1 Zones (Bottom)
    renderZonePill(width * 0.25, height * 0.93, '🛡️ PARRY ZONE', '#00F0FF');
    renderZonePill(width * 0.75, height * 0.93, '⚔️ STRIKE / FEINT', '#FF0055');

    // P2 Zones (Top - Rotated)
    renderZonePill(width * 0.75, height * 0.07, '🛡️ PARRY ZONE', '#00F0FF', true);
    renderZonePill(width * 0.25, height * 0.07, '⚔️ STRIKE / FEINT', '#FF0055', true);
    ctx.restore();

    // 3. Dynamic Floor Lighting under Duelists
    const p1Col = this.progression.getSkinColors(1);
    const p2Col = this.progression.getSkinColors(2);
    this.juice.drawRadialFloorLight(ctx, this.d1.x, this.d1.y, 65, p1Col.primary, 0.45);
    this.juice.drawRadialFloorLight(ctx, this.d2.x, this.d2.y, 65, p2Col.primary, 0.45);

    // 4. Render Duelists
    this.renderDuelist(ctx, this.d1, p1Col.primary, p1Col.secondary, 1);
    this.renderDuelist(ctx, this.d2, p2Col.primary, p2Col.secondary, 2);
  }

  private renderDuelist(ctx: CanvasRenderingContext2D, d: Duelist, primary: string, secondary: string, player: PlayerIndex) {
    const now = performance.now();
    ctx.save();
    ctx.translate(d.x, d.y);

    const dir = player === 1 ? -1 : 1; // P1 attacks upwards (-Y), P2 attacks downwards (+Y)

    // A. Feint Holographic Chromatic Ghost
    if (d.isFeinting) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      const ghostOffset = Math.sin(now * 0.03) * 8;
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ghostOffset, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // B. Stun Status Electricity Buzz
    if (d.state === 'stunned') {
      ctx.strokeStyle = '#FFCC00';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.shadowColor = '#FFCC00';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    // C. Parrying Hex Shield Dome
    if (d.state === 'parrying') {
      ctx.save();
      const shieldPulse = 1 + Math.sin(now * 0.02) * 0.08;
      ctx.scale(shieldPulse, shieldPulse);
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00F0FF';
      ctx.shadowBlur = 20;

      ctx.beginPath();
      ctx.arc(0, dir * 18, 30, 0, Math.PI * 2);
      ctx.stroke();

      // Energy Shield Hex Fill
      ctx.fillStyle = 'rgba(0, 240, 255, 0.18)';
      ctx.fill();

      // Front Energy Deflector Arc
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, dir * 18, 28, dir === -1 ? Math.PI : 0, dir === -1 ? 0 : Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    // D. Flowing Energy Scarf / Cape (Drifting behind body)
    ctx.save();
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.65;
    const wave1 = Math.sin(now * 0.008) * 8;
    const wave2 = Math.cos(now * 0.012) * 12;
    ctx.beginPath();
    ctx.moveTo(-8, -dir * 12);
    ctx.quadraticCurveTo(-16 + wave1, -dir * 28, -10 + wave2, -dir * 42);
    ctx.stroke();
    ctx.restore();

    // E. Cyber-Ronin Armor Body
    // Armored Shoulders
    ctx.fillStyle = '#1c2436';
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-26, -8, 12, 16, 3);
    ctx.roundRect(14, -8, 12, 16, 3);
    ctx.fill();
    ctx.stroke();

    // Main Torso / Chassis
    const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 22);
    bodyGrad.addColorStop(0, '#2b3648');
    bodyGrad.addColorStop(0.6, '#131924');
    bodyGrad.addColorStop(1, '#090d14');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    ctx.shadowColor = primary;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing Cyber Visor Slit
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = primary;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(-10, dir * 4 - 2, 20, 4, 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // F. Cyber Katana Blade Projection & Slash Trail
    const bladeExtension = d.swordOffset * dir;
    const bladeTipY = dir * (40 + bladeExtension);
    const bladeBaseY = dir * 14;

    // Dash Strike Light Slash Ribbon Trail
    if (d.state === 'active') {
      ctx.save();
      const slashGrad = ctx.createLinearGradient(0, bladeBaseY, 0, bladeTipY);
      slashGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      slashGrad.addColorStop(1, primary);
      ctx.fillStyle = slashGrad;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-16, bladeBaseY);
      ctx.lineTo(16, bladeBaseY);
      ctx.lineTo(0, bladeTipY + dir * 20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Katana Tsuba Guard
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-7, bladeBaseY - 2, 14, 4);

    // Hyper-Plasma Katana Blade
    ctx.save();
    const isLethal = d.state === 'active';
    ctx.strokeStyle = isLethal ? '#FFFFFF' : primary;
    ctx.shadowColor = isLethal ? '#FFFFFF' : primary;
    ctx.shadowBlur = isLethal ? 26 : 12;
    ctx.lineWidth = isLethal ? 7 : 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, bladeBaseY);
    ctx.lineTo(0, bladeTipY);
    ctx.stroke();

    // White Core Sharp Ridge
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // G. Sleek Status Tag Badge
    ctx.save();
    ctx.font = '800 10px monospace';
    ctx.fillStyle = d.state === 'active' ? '#FF0055' : (d.state === 'parrying' ? '#00F0FF' : '#94a3b8');
    ctx.textAlign = 'center';
    ctx.fillText(d.state.toUpperCase(), 0, -dir * 34);
    ctx.restore();

    ctx.restore();
  }
}
