import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isDecoy: boolean;
  color: string;
}

interface Mallet {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  speedMultiplier: number;
  freezeTimer: number;
  hasShield: boolean;
  shieldTimer: number;
}

interface PowerUpItem {
  x: number;
  y: number;
  type: 'multi' | 'freeze' | 'shield' | 'gravity';
  radius: number;
  duration: number;
  color: string;
  icon: string;
}

export class CyberHockey extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'cyber_hockey',
    title: 'Cyber Hockey 2.0',
    subtitle: 'High-Velocity Kinetic Table',
    category: 'Physics Arcade',
    icon: '⚡',
    targetScore: 5,
    timeLimitSec: 120,
    instructionsP1: 'Drag to strike puck into top goal',
    instructionsP2: 'Drag to strike puck into bottom goal'
  };

  private pucks: Puck[] = [];
  private p1Mallet!: Mallet;
  private p2Mallet!: Mallet;

  // Kinetic oscillating middle bumpers
  private bumpers: Array<{ x: number; y: number; width: number; height: number; speed: number; dir: number }> = [];

  // Active powerups on field
  private fieldPowerUps: PowerUpItem[] = [];
  private powerUpSpawnTimer: number = 5.0;

  // Active gravity wells
  private gravityWell: { x: number; y: number; timer: number } | null = null;

  // EX Hyper-Shot Kinetic Charge
  public p1HyperCharge: number = 0;
  public p2HyperCharge: number = 0;

  public init(width: number, height: number): void {
    const malletR = Math.min(width, height) * 0.08;
    this.p1Mallet = {
      x: width / 2,
      y: height * 0.85,
      targetX: width / 2,
      targetY: height * 0.85,
      radius: malletR,
      speedMultiplier: 1.0,
      freezeTimer: 0,
      hasShield: false,
      shieldTimer: 0
    };

    this.p2Mallet = {
      x: width / 2,
      y: height * 0.15,
      targetX: width / 2,
      targetY: height * 0.15,
      radius: malletR,
      speedMultiplier: 1.0,
      freezeTimer: 0,
      hasShield: false,
      shieldTimer: 0
    };

    // Kinetic bumpers
    this.bumpers = [
      { x: width * 0.25, y: height * 0.5, width: 44, height: 16, speed: 80, dir: 1 },
      { x: width * 0.75, y: height * 0.5, width: 44, height: 16, speed: 80, dir: -1 }
    ];

    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    const puckR = Math.min(width, height) * 0.045;
    this.pucks = [{
      x: width / 2,
      y: height / 2,
      vx: (Math.random() - 0.5) * 80,
      vy: (Math.random() > 0.5 ? 1 : -1) * 220,
      radius: puckR,
      isDecoy: false,
      color: '#FFFFFF'
    }];

    this.p1Mallet.x = width / 2;
    this.p1Mallet.y = height * 0.85;
    this.p1Mallet.targetX = width / 2;
    this.p1Mallet.targetY = height * 0.85;
    this.p1Mallet.freezeTimer = 0;
    this.p1Mallet.speedMultiplier = 1.0;
    this.p1Mallet.hasShield = false;
    this.p1Mallet.shieldTimer = 0;

    this.p2Mallet.x = width / 2;
    this.p2Mallet.y = height * 0.15;
    this.p2Mallet.targetX = width / 2;
    this.p2Mallet.targetY = height * 0.15;
    this.p2Mallet.freezeTimer = 0;
    this.p2Mallet.speedMultiplier = 1.0;
    this.p2Mallet.hasShield = false;
    this.p2Mallet.shieldTimer = 0;

    this.p1HyperCharge = 0;
    this.p2HyperCharge = 0;

    this.fieldPowerUps = [];
    this.powerUpSpawnTimer = 4.0;
    this.gravityWell = null;
  }

  public updateGame(dt: number, width: number, height: number): void {
    const goalWidth = width * 0.45;
    const goalLeft = (width - goalWidth) / 2;
    const goalRight = goalLeft + goalWidth;

    // 1. Process Mallet Movement via InputManager
    this.updateMalletInput(1, this.p1Mallet, dt, width, height);
    if (this.progression.getGameMode() === 'vs_ai') {
      this.botAI.updateCyberHockey(this.p2Mallet, this.pucks, this.progression.getAIDifficulty(), dt, width, height);
      // smooth mallet follow
      this.p2Mallet.x += (this.p2Mallet.targetX - this.p2Mallet.x) * Math.min(1.0, 28 * dt);
      this.p2Mallet.y += (this.p2Mallet.targetY - this.p2Mallet.y) * Math.min(1.0, 28 * dt);
    } else {
      this.updateMalletInput(2, this.p2Mallet, dt, width, height);
    }

    // 2. Update Bumpers (sine oscillation)
    for (const b of this.bumpers) {
      b.x += b.speed * b.dir * dt;
      if (b.x < 50) {
        b.x = 50;
        b.dir = 1;
      } else if (b.x > width - 50) {
        b.x = width - 50;
        b.dir = -1;
      }
    }

    // 3. Power-Up Spawner
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0 && this.fieldPowerUps.length < 2) {
      this.spawnRandomPowerUp(width, height);
      this.powerUpSpawnTimer = 8.0 + Math.random() * 5.0;
    }

    // 4. Gravity Well
    if (this.gravityWell) {
      this.gravityWell.timer -= dt;
      if (this.gravityWell.timer <= 0) {
        this.gravityWell = null;
      }
    }

    // 5. Update Pucks with CCD (Sub-stepping)
    const substeps = 4;
    const sdt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      for (let i = this.pucks.length - 1; i >= 0; i--) {
        const p = this.pucks[i];

        // Apply Gravity Well pull
        if (this.gravityWell) {
          const dx = this.gravityWell.x - p.x;
          const dy = this.gravityWell.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 20;
          const force = 18000 / (dist * dist);
          p.vx += (dx / dist) * force * sdt;
          p.vy += (dy / dist) * force * sdt;
        }

        // Substep movement
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;

        // Friction / drag
        p.vx *= (1.0 - 0.08 * sdt);
        p.vy *= (1.0 - 0.08 * sdt);

        // Clamp max speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = 1600;
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }

        // Wall collisions (Left and Right)
        if (p.x - p.radius < 0) {
          p.x = p.radius;
          p.vx = Math.abs(p.vx) * 0.95;
          this.audio.playPuckBounce(1.1);
          this.juice.emitSparks(p.x, p.y, '#00F0FF', 8, 200, 0.2);
        } else if (p.x + p.radius > width) {
          p.x = width - p.radius;
          p.vx = -Math.abs(p.vx) * 0.95;
          this.audio.playPuckBounce(1.1);
          this.juice.emitSparks(p.x, p.y, '#FF0055', 8, 200, 0.2);
        }

        // Top Wall Collision (P2 Goal Line)
        if (p.y - p.radius < 0) {
          if (p.x >= goalLeft && p.x <= goalRight) {
            // Check Shield
            if (this.p2Mallet.hasShield) {
              p.y = p.radius + 15;
              p.vy = Math.abs(p.vy) * 1.3;
              this.p2Mallet.hasShield = false;
              this.audio.playBumperHit();
              this.juice.emitExplosion(p.x, p.y, '#00F0FF', 25);
            } else {
              // Goal for P1!
              if (!p.isDecoy) {
                this.triggerPointScore(1, width, height);
                return;
              } else {
                this.pucks.splice(i, 1);
                continue;
              }
            }
          } else {
            p.y = p.radius;
            p.vy = Math.abs(p.vy) * 0.95;
            this.audio.playPuckBounce(1.0);
            this.juice.emitSparks(p.x, p.y, '#00F0FF', 8, 200, 0.2);
          }
        }

        // Bottom Wall Collision (P1 Goal Line)
        if (p.y + p.radius > height) {
          if (p.x >= goalLeft && p.x <= goalRight) {
            // Check Shield
            if (this.p1Mallet.hasShield) {
              p.y = height - p.radius - 15;
              p.vy = -Math.abs(p.vy) * 1.3;
              this.p1Mallet.hasShield = false;
              this.audio.playBumperHit();
              this.juice.emitExplosion(p.x, p.y, '#FF0055', 25);
            } else {
              // Goal for P2!
              if (!p.isDecoy) {
                this.triggerPointScore(2, width, height);
                return;
              } else {
                this.pucks.splice(i, 1);
                continue;
              }
            }
          } else {
            p.y = height - p.radius;
            p.vy = -Math.abs(p.vy) * 0.95;
            this.audio.playPuckBounce(1.0);
            this.juice.emitSparks(p.x, p.y, '#FF0055', 8, 200, 0.2);
          }
        }

        // Mallet 1 Collision
        this.resolveMalletCollision(p, this.p1Mallet, 1);
        // Mallet 2 Collision
        this.resolveMalletCollision(p, this.p2Mallet, 2);

        // Bumper Collisions
        for (const b of this.bumpers) {
          if (
            p.x + p.radius > b.x - b.width / 2 &&
            p.x - p.radius < b.x + b.width / 2 &&
            p.y + p.radius > b.y - b.height / 2 &&
            p.y - p.radius < b.y + b.height / 2
          ) {
            p.vy = -p.vy * 1.25;
            p.vx += b.dir * 120;
            this.audio.playBumperHit();
            this.juice.emitSparks(p.x, p.y, '#8B00FF', 14, 280, 0.3);
            this.juice.addTrauma(0.25);
          }
        }

        // Power-Up Collection Check
        for (let puIdx = this.fieldPowerUps.length - 1; puIdx >= 0; puIdx--) {
          const pu = this.fieldPowerUps[puIdx];
          const distSq = (p.x - pu.x) * (p.x - pu.x) + (p.y - pu.y) * (p.y - pu.y);
          if (distSq < (p.radius + pu.radius) * (p.radius + pu.radius)) {
            // Determine who triggered (based on puck velocity Y)
            const beneficiary: PlayerIndex = p.vy < 0 ? 1 : 2;
            this.applyPowerUp(pu.type, beneficiary, p);
            this.fieldPowerUps.splice(puIdx, 1);
            this.audio.playPowerUp();
            this.juice.emitExplosion(pu.x, pu.y, pu.color, 24);
          }
        }
      }
    }

    // Add trails for pucks (velocity-reactive neon streaks)
    for (let idx = 0; idx < this.pucks.length; idx++) {
      const p = this.pucks[idx];
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const hot = Math.min(1, speed / 900);
      const trailColor = p.isDecoy
        ? '#FFD700'
        : p.color === '#FFAA00'
          ? '#FFAA00'
          : speed > 620 ? '#FFFFFF' : speed > 260 ? '#66E0FF' : p.color;
      this.juice.addTrailPoint(`puck_${idx}`, p.x, p.y, trailColor, p.radius * (1.2 + hot * 0.9));

      // Supersonic shock micro-sparks at extreme velocity
      if (speed > 1050 && Math.random() < 0.4) {
        this.juice.emitSparks(p.x, p.y, '#00F0FF', 2, 130, 0.12);
      }
    }
  }

  private updateMalletInput(player: PlayerIndex, mallet: Mallet, dt: number, width: number, height: number) {
    if (mallet.freezeTimer > 0) {
      mallet.freezeTimer -= dt;
      mallet.speedMultiplier = 0.35;
    } else {
      mallet.speedMultiplier = 1.0;
    }

    const touches = this.input.getTouchesForPlayer(player);
    if (touches.length > 0) {
      const t = touches[0];
      // Direct 1:1 screen touch mapping for smooth mallet motion
      mallet.targetX = t.rawX;
      mallet.targetY = t.rawY;
    } else {
      // Keyboard fallback for testing
      const kb = player === 1 ? this.input.keyboardP1 : this.input.keyboardP2;
      if (kb.x !== 0 || kb.y !== 0) {
        mallet.targetX += kb.x * 600 * dt;
        mallet.targetY += kb.y * 600 * dt;
      }
    }

    // Clamp mallet to defensive half-court
    const padding = mallet.radius + 10;
    mallet.targetX = Math.max(padding, Math.min(width - padding, mallet.targetX));

    if (player === 1) {
      // P1: Lower half
      mallet.targetY = Math.max(height * 0.52 + padding, Math.min(height - padding, mallet.targetY));
    } else {
      // P2: Upper half
      mallet.targetY = Math.max(padding, Math.min(height * 0.48 - padding, mallet.targetY));
    }

    // Interpolate mallet position smoothly
    const followFactor = 28 * mallet.speedMultiplier;
    mallet.x += (mallet.targetX - mallet.x) * Math.min(1.0, followFactor * dt);
    mallet.y += (mallet.targetY - mallet.y) * Math.min(1.0, followFactor * dt);
  }

  private resolveMalletCollision(puck: Puck, mallet: Mallet, player: PlayerIndex) {
    const dx = puck.x - mallet.x;
    const dy = puck.y - mallet.y;
    const distSq = dx * dx + dy * dy;
    const minDist = puck.radius + mallet.radius;

    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;

      // Position push-out
      puck.x = mallet.x + nx * minDist;
      puck.y = mallet.y + ny * minDist;

      // Calculate relative velocity
      const dot = puck.vx * nx + puck.vy * ny;
      const impulse = -(1 + 0.9) * dot;

      puck.vx += nx * impulse;
      puck.vy += ny * impulse;

      // Impart extra velocity from mallet stroke
      const extraPower = 260;
      puck.vx += nx * extraPower;
      puck.vy += ny * extraPower;

      // EX Kinetic Hyper-Shot Trigger
      const charge = player === 1 ? this.p1HyperCharge : this.p2HyperCharge;
      if (charge >= 100) {
        if (player === 1) this.p1HyperCharge = 0;
        else this.p2HyperCharge = 0;

        puck.vx *= 1.85;
        puck.vy *= 1.85;
        puck.color = '#FFAA00';
        this.audio.playHyperShot();
        this.juice.addTrauma(0.55);
        this.juice.triggerFlash('#FF9900', 0.4);
        this.juice.emitExplosion(puck.x, puck.y, '#FFAA00', 26);
      } else {
        if (player === 1) this.p1HyperCharge = Math.min(100, this.p1HyperCharge + 25);
        else this.p2HyperCharge = Math.min(100, this.p2HyperCharge + 25);

        this.audio.playPuckBounce(player === 1 ? 1.0 : 1.25);
        this.juice.addTrauma(0.2);
        this.juice.emitSparks(puck.x, puck.y, player === 1 ? '#FF0055' : '#00F0FF', 12, 260, 0.25);
      }
    }
  }

  private spawnRandomPowerUp(width: number, height: number) {
    const types: Array<'multi' | 'freeze' | 'shield' | 'gravity'> = ['multi', 'freeze', 'shield', 'gravity'];
    const selected = types[Math.floor(Math.random() * types.length)];
    let color = '#00F0FF';
    let icon = '⚡';

    if (selected === 'multi') {
      color = '#FFD700';
      icon = 'x3';
    } else if (selected === 'freeze') {
      color = '#00FFFF';
      icon = '❄';
    } else if (selected === 'shield') {
      color = '#00FF66';
      icon = '🛡';
    } else if (selected === 'gravity') {
      color = '#9D00FF';
      icon = '🌀';
    }

    this.fieldPowerUps.push({
      x: width * 0.2 + Math.random() * (width * 0.6),
      y: height * 0.35 + Math.random() * (height * 0.3),
      type: selected,
      radius: 20,
      duration: 10.0,
      color,
      icon
    });
  }

  private applyPowerUp(type: 'multi' | 'freeze' | 'shield' | 'gravity', beneficiary: PlayerIndex, puck: Puck) {
    const opponent = beneficiary === 1 ? this.p2Mallet : this.p1Mallet;
    const ally = beneficiary === 1 ? this.p1Mallet : this.p2Mallet;

    if (type === 'multi') {
      // Spawn 2 decoy pucks
      for (let i = -1; i <= 1; i += 2) {
        this.pucks.push({
          x: puck.x,
          y: puck.y,
          vx: puck.vx * 0.8 + i * 200,
          vy: puck.vy * 0.8,
          radius: puck.radius * 0.9,
          isDecoy: true,
          color: '#FFD700'
        });
      }
    } else if (type === 'freeze') {
      opponent.freezeTimer = 4.5;
    } else if (type === 'shield') {
      ally.hasShield = true;
    } else if (type === 'gravity') {
      this.gravityWell = {
        x: puck.x,
        y: puck.y,
        timer: 5.0
      };
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Must match the gameplay goalWidth in updateGame (0.45): a wider render
    // lets pucks visually enter the goal mouth yet bounce off.
    const goalWidth = width * 0.45;
    const goalLeft = (width - goalWidth) / 2;
    const now = performance.now() * 0.003;

    // 1. Goal Zones with Animated Laser Forcefield Meshes
    // Radiant energy wash under each goal mouth (score-lane beacons)
    this.juice.drawRadialFloorLight(ctx, width / 2, 14, goalWidth * 0.75, 'rgba(0, 190, 255, 0.20)', 0.9);
    this.juice.drawRadialFloorLight(ctx, width / 2, height - 14, goalWidth * 0.75, 'rgba(255, 0, 85, 0.22)', 0.9);

    // Top Goal (P2)
    ctx.save();
    this.renderLaserGoal(ctx, goalLeft, 0, goalWidth, 26, '#00F0FF', now);
    // Bottom Goal (P1)
    this.renderLaserGoal(ctx, goalLeft, height - 26, goalWidth, 26, '#FF0055', now);
    ctx.restore();

    // Pulsing goal aperture energy flares (invite scoring attempts)
    const flare = 0.5 + Math.sin(now * 2.4) * 0.5;
    ctx.save();
    ctx.fillStyle = `rgba(0, 200, 255, ${0.05 + flare * 0.07})`;
    ctx.fillRect(goalLeft, 16, goalWidth, 7);
    ctx.fillStyle = `rgba(255, 0, 85, ${0.05 + flare * 0.07})`;
    ctx.fillRect(goalLeft, height - 23, goalWidth, 7);
    ctx.restore();

    // 2. Defensive Energy Shields
    if (this.p2Mallet.hasShield) {
      this.renderShieldBarrier(ctx, goalLeft - 15, 34, goalWidth + 30, '#00FF66');
    }
    if (this.p1Mallet.hasShield) {
      this.renderShieldBarrier(ctx, goalLeft - 15, height - 34, goalWidth + 30, '#00FF66');
    }

    // 3. Kinetic Bumpers with High-Tech Bevels
    for (const b of this.bumpers) {
      ctx.save();
      ctx.translate(b.x, b.y);
      this.juice.drawRadialFloorLight(ctx, 0, 0, 48, '#9D00FF', 0.25);

      ctx.fillStyle = '#0F1626';
      ctx.beginPath();
      ctx.roundRect(-b.width / 2, -b.height / 2, b.width, b.height, 8);
      ctx.fill();

      // Outer Neon Pulse Rim
      ctx.strokeStyle = '#9D00FF';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#9D00FF';
      ctx.shadowBlur = 14;
      ctx.stroke();

      // Center High-Voltage Core
      ctx.fillStyle = '#C084FC';
      ctx.fillRect(-b.width * 0.25, -2, b.width * 0.5, 4);
      ctx.restore();
    }

    // 4. Gravity Well
    if (this.gravityWell) {
      ctx.save();
      ctx.translate(this.gravityWell.x, this.gravityWell.y);
      const swirl = now * 3;
      ctx.rotate(swirl);
      this.juice.drawRadialFloorLight(ctx, 0, 0, 65, '#9D00FF', 0.4);
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#A855F7';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 36 + Math.sin(now * 5) * 8, 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Power-Ups on Field
    for (const pu of this.fieldPowerUps) {
      ctx.save();
      ctx.translate(pu.x, pu.y);
      this.juice.drawRadialFloorLight(ctx, 0, 0, 45, pu.color, 0.35);

      // Outer floating gem ring
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = pu.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = pu.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, pu.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pu.color;
      ctx.font = '900 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pu.icon, 0, 0);
      ctx.restore();
    }

    // 6. Mallets (High-Tech Aerospace Thruster Paddles)
    const p1Col = this.progression.getSkinColors(1);
    const p2Col = this.progression.getSkinColors(2);

    this.renderMallet(ctx, this.p1Mallet, p1Col.primary, p1Col.secondary, this.p1HyperCharge, now);
    this.renderMallet(ctx, this.p2Mallet, p2Col.primary, p2Col.secondary, this.p2HyperCharge, now);

    // 7. Pucks (Holographic Plasma Energy Disc)
    for (const p of this.pucks) {
      this.renderPlasmaPuck(ctx, p, now);
    }
  }

  private renderLaserGoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, time: number) {
    // Emitter base posts
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillRect(x - 6, y, 12, h);
    ctx.strokeRect(x - 6, y, 12, h);
    ctx.fillRect(x + w - 6, y, 12, h);
    ctx.strokeRect(x + w - 6, y, 12, h);

    // Flowing Laser Mesh Barrier
    const meshBeams = 6;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45 + Math.sin(time * 6) * 0.25;
    for (let i = 1; i < meshBeams; i++) {
      const bx = x + (w / meshBeams) * i;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx + Math.sin(time * 4 + i) * 6, y + h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  private renderShieldBarrier(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();
  }

  private renderMallet(ctx: CanvasRenderingContext2D, m: Mallet, primaryColor: string, secondaryColor: string, hyperCharge: number, time: number) {
    ctx.save();
    ctx.translate(m.x, m.y);

    // Dynamic Floor Glow
    this.juice.drawRadialFloorLight(ctx, 0, 0, m.radius * 2.2, primaryColor, 0.4);

    // Outer Thruster Ring & Hyper Charge Indicator
    const chargeRatio = Math.min(1, hyperCharge / 100);
    ctx.strokeStyle = chargeRatio >= 1 ? '#FFAA00' : primaryColor;
    ctx.lineWidth = chargeRatio >= 1 ? 4 : 2.5;
    ctx.shadowColor = chargeRatio >= 1 ? '#FFAA00' : primaryColor;
    ctx.shadowBlur = chargeRatio >= 1 ? 18 : 8;
    ctx.beginPath();
    ctx.arc(0, 0, m.radius + 6, -Math.PI / 2, -Math.PI / 2 + (chargeRatio > 0 ? chargeRatio : 1) * Math.PI * 2);
    ctx.stroke();

    // Metallic Outer Rim with Specular Shading
    const rimGrad = ctx.createLinearGradient(-m.radius, -m.radius, m.radius, m.radius);
    rimGrad.addColorStop(0, '#E2E8F0');
    rimGrad.addColorStop(0.5, '#334155');
    rimGrad.addColorStop(1, '#0F172A');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner Aerospace Turbine Core
    ctx.fillStyle = '#080C14';
    ctx.beginPath();
    ctx.arc(0, 0, m.radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // Rotating Turbine Blades
    ctx.save();
    ctx.rotate(time * 2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(i * Math.PI * 0.5) * (m.radius * 0.65), Math.sin(i * Math.PI * 0.5) * (m.radius * 0.65));
      ctx.stroke();
    }
    ctx.restore();

    // Center Energy Grip Cap
    const capGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, m.radius * 0.32);
    capGrad.addColorStop(0, '#FFFFFF');
    capGrad.addColorStop(0.4, secondaryColor);
    capGrad.addColorStop(1, primaryColor);
    ctx.fillStyle = capGrad;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, m.radius * 0.32, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderPlasmaPuck(ctx: CanvasRenderingContext2D, p: Puck, time: number) {
    ctx.save();
    ctx.translate(p.x, p.y);

    // Floor Lighting Puddle
    this.juice.drawRadialFloorLight(ctx, 0, 0, p.radius * 2.8, p.color, 0.45);

    // Rotating Outer Energy Segment Gear
    ctx.save();
    ctx.rotate(-time * 4);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 14;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // White-Hot Plasma Core
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.radius * 0.7);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.5, p.color);
    coreGrad.addColorStop(1, '#000000');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
