import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex, Rect } from '../core/types';

interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: PlayerIndex;
  bouncesLeft: number;
  isHoming: boolean;
  radius: number;
  color: string;
}

interface Tank {
  player: PlayerIndex;
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  ammo: number;
  maxAmmo: number;
  reloadTimer: number;
  isOverheated: boolean;
  overheatTimer: number;
  isStealth: boolean;
  stealthTimer: number;
  isEmped: boolean;
  empTimer: number;
  hasHomingNext: boolean;
  revealTimer: number; // Revealed after shooting
}

interface TankPowerUp {
  x: number;
  y: number;
  type: 'homing' | 'stealth' | 'emp';
  radius: number;
  color: string;
  icon: string;
}

export class TacticalTanks extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'tactical_tanks',
    title: 'Tactical Arena Tanks',
    subtitle: 'Specular Ricochet & Fog-of-War',
    category: 'Tactical Combat',
    icon: '🎯',
    targetScore: 3,
    timeLimitSec: 120,
    instructionsP1: 'Left side: Drive | Right side: Aim & Fire',
    instructionsP2: 'Left side: Drive | Right side: Aim & Fire'
  };

  private tank1!: Tank;
  private tank2!: Tank;
  private shells: Shell[] = [];
  public obstacles: Array<Rect & { hp: number; maxHp: number }> = [];
  private powerUps: TankPowerUp[] = [];
  private powerUpTimer: number = 6.0;

  public init(width: number, height: number): void {
    // Generate tactical symmetric arena obstacles with destruction HP
    const midX = width / 2;

    this.buildObstacles(width, height);

    this.tank1 = this.createTank(1, midX, height * 0.85, -Math.PI / 2);
    this.tank2 = this.createTank(2, midX, height * 0.15, Math.PI / 2);

    this.resetRound(width, height);
  }

  private buildObstacles(width: number, height: number): void {
    const midX = width / 2;
    const midY = height / 2;
    const w = 24;
    const h = 70;

    this.obstacles = [
      // Center tactical destructible pillars (hp: 3)
      { x: midX - 90, y: midY - h / 2, width: w, height: h, hp: 3, maxHp: 3 },
      { x: midX + 90 - w, y: midY - h / 2, width: w, height: h, hp: 3, maxHp: 3 },
      // Corner bunkers (hp: 4)
      { x: width * 0.2, y: height * 0.3, width: 60, height: 22, hp: 4, maxHp: 4 },
      { x: width * 0.8 - 60, y: height * 0.3, width: 60, height: 22, hp: 4, maxHp: 4 },
      { x: width * 0.2, y: height * 0.7 - 22, width: 60, height: 22, hp: 4, maxHp: 4 },
      { x: width * 0.8 - 60, y: height * 0.7 - 22, width: 60, height: 22, hp: 4, maxHp: 4 }
    ];
  }

  private createTank(player: PlayerIndex, x: number, y: number, angle: number): Tank {
    return {
      player,
      x,
      y,
      angle,
      turretAngle: angle,
      ammo: 3,
      maxAmmo: 3,
      reloadTimer: 1.2,
      isOverheated: false,
      overheatTimer: 0,
      isStealth: false,
      stealthTimer: 0,
      isEmped: false,
      empTimer: 0,
      hasHomingNext: false,
      revealTimer: 0
    };
  }

  public resetRound(width: number, height: number): void {
    const midX = width / 2;
    // Destroyed obstacles stay destroyed across points within a match only if
    // intended: restore the full layout every round so cover never vanishes.
    this.buildObstacles(width, height);
    this.resetTankState(this.tank1, midX, height * 0.85, -Math.PI / 2);
    this.resetTankState(this.tank2, midX, height * 0.15, Math.PI / 2);

    this.shells = [];
    this.powerUps = [];
    this.powerUpTimer = 5.0;
  }

  private resetTankState(tank: Tank, x: number, y: number, angle: number): void {
    tank.x = x;
    tank.y = y;
    tank.angle = angle;
    tank.turretAngle = angle;
    tank.ammo = tank.maxAmmo;
    tank.reloadTimer = 0;
    tank.isOverheated = false;
    tank.overheatTimer = 0;
    tank.isStealth = false;
    tank.stealthTimer = 0;
    tank.isEmped = false;
    tank.empTimer = 0;
    tank.hasHomingNext = false;
    tank.revealTimer = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Process Tank Controls & Logic
    this.updateTankLogic(this.tank1, 1, dt, width, height);
    if (this.progression.getGameMode() === 'vs_ai') {
      this.botAI.updateTacticalTanks(
        this.tank2,
        this.tank1,
        this.progression.getAIDifficulty(),
        dt,
        () => this.fireTankCannon(this.tank2)
      );
      const radius = 20;
      this.tank2.x = Math.max(radius, Math.min(width - radius, this.tank2.x));
      this.tank2.y = Math.max(radius, Math.min(height - radius, this.tank2.y));
    } else {
      this.updateTankLogic(this.tank2, 2, dt, width, height);
    }

    // 2. Spawn Power-Ups
    this.powerUpTimer -= dt;
    if (this.powerUpTimer <= 0 && this.powerUps.length < 2) {
      this.spawnTankPowerUp(width, height);
      this.powerUpTimer = 8.0 + Math.random() * 4.0;
    }

    // 3. Update Shells with Ricochet Specular Physics
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];

      // Homing missile logic
      if (s.isHoming) {
        const target = s.owner === 1 ? this.tank2 : this.tank1;
        const targetAngle = Math.atan2(target.y - s.y, target.x - s.x);
        const currentAngle = Math.atan2(s.vy, s.vx);
        let diff = targetAngle - currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const turnSpeed = 2.5 * dt;
        const newAngle = currentAngle + Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed);
        const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        s.vx = Math.cos(newAngle) * speed;
        s.vy = Math.sin(newAngle) * speed;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      this.juice.addTrailPoint(`shell_${i}`, s.x, s.y, s.color, 6);

      // Arena boundary bounces
      if (s.x < s.radius || s.x > width - s.radius) {
        s.vx = -s.vx;
        s.x = s.x < s.radius ? s.radius : width - s.radius;
        this.onShellBounce(s, i);
        continue;
      }
      if (s.y < s.radius || s.y > height - s.radius) {
        s.vy = -s.vy;
        s.y = s.y < s.radius ? s.radius : height - s.radius;
        this.onShellBounce(s, i);
        continue;
      }

      // Obstacle bounces
      for (const obs of this.obstacles) {
        if (
          s.x + s.radius > obs.x &&
          s.x - s.radius < obs.x + obs.width &&
          s.y + s.radius > obs.y &&
          s.y - s.radius < obs.y + obs.height
        ) {
          // Specular reflection: determine hit face
          const overlapLeft = (s.x + s.radius) - obs.x;
          const overlapRight = (obs.x + obs.width) - (s.x - s.radius);
          const overlapTop = (s.y + s.radius) - obs.y;
          const overlapBottom = (obs.y + obs.height) - (s.y - s.radius);

          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minOverlap === overlapLeft || minOverlap === overlapRight) {
            s.vx = -s.vx;
          } else {
            s.vy = -s.vy;
          }

          // EX Obstacle Damage & Destruction
          obs.hp--;
          if (obs.hp <= 0) {
            const obsIdx = this.obstacles.indexOf(obs);
            if (obsIdx !== -1) this.obstacles.splice(obsIdx, 1);
            this.audio.playDestructionCrumble();
            this.juice.emitExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, '#94A3B8', 22);
            this.juice.addTrauma(0.35);
          } else {
            this.juice.emitSparks(s.x, s.y, '#94A3B8', 8, 140, 0.2);
          }

          this.onShellBounce(s, i);
          break;
        }
      }

      // Hit detection with tanks
      if (this.checkTankHit(s, this.tank1)) {
        this.destroyTank(this.tank1, 2, width, height);
        this.shells.splice(i, 1);
        continue;
      }
      if (this.checkTankHit(s, this.tank2)) {
        this.destroyTank(this.tank2, 1, width, height);
        this.shells.splice(i, 1);
        continue;
      }
    }

    // Power-up pickups by tanks
    for (let pi = this.powerUps.length - 1; pi >= 0; pi--) {
      const pu = this.powerUps[pi];
      if (this.checkPowerUpPickup(this.tank1, pu)) {
        this.applyTankPowerUp(this.tank1, pu.type);
        this.powerUps.splice(pi, 1);
      } else if (this.checkPowerUpPickup(this.tank2, pu)) {
        this.applyTankPowerUp(this.tank2, pu.type);
        this.powerUps.splice(pi, 1);
      }
    }
  }

  private onShellBounce(s: Shell, index: number) {
    s.bouncesLeft--;
    if (s.bouncesLeft <= 0) {
      this.juice.emitExplosion(s.x, s.y, s.color, 16);
      this.audio.playPuckBounce(1.5);
      this.shells.splice(index, 1);
    } else {
      this.audio.playTankRicochet(2 - s.bouncesLeft);
      this.juice.emitSparks(s.x, s.y, s.color, 8, 160, 0.2);
    }
  }

  private updateTankLogic(tank: Tank, player: PlayerIndex, dt: number, width: number, height: number) {
    // Timers
    if (tank.empTimer > 0) {
      tank.empTimer -= dt;
      tank.isEmped = tank.empTimer > 0;
    }
    if (tank.stealthTimer > 0) {
      tank.stealthTimer -= dt;
      tank.isStealth = tank.stealthTimer > 0;
    }
    if (tank.revealTimer > 0) {
      tank.revealTimer -= dt;
    }

    // Passive Ammo Reload
    if (tank.ammo < tank.maxAmmo) {
      tank.reloadTimer -= dt;
      if (tank.reloadTimer <= 0) {
        tank.ammo++;
        tank.reloadTimer = 1.2;
      }
    }

    if (tank.isOverheated) {
      tank.overheatTimer -= dt;
      if (tank.overheatTimer <= 0) {
        tank.isOverheated = false;
        tank.ammo = 1;
      }
      return;
    }

    if (tank.isEmped) return; // Cannot move or shoot while EMPed

    // Touch Controls: Dual Region (Left = Drive, Right = Aim & Fire)
    const touches = this.input.getTouchesForPlayer(player);
    const kb = player === 1 ? this.input.keyboardP1 : this.input.keyboardP2;

    if (touches.length > 0) {
      for (const t of touches) {
        // In player space, normX < 0.5 is left stick (drive), normX >= 0.5 is right stick (aim/fire)
        if (t.normX < 0.5) {
          // Drive joystick
          const moveSpeed = 160;
          const targetAngle = Math.atan2(t.vy, t.vx);
          if (Math.abs(t.vx) > 30 || Math.abs(t.vy) > 30) {
            tank.angle = targetAngle;
            tank.x += Math.cos(tank.angle) * moveSpeed * dt;
            tank.y += Math.sin(tank.angle) * moveSpeed * dt;

            // Tread dust kick while driving
            if (Math.random() < 0.35) {
              this.juice.emitSparks(
                tank.x - Math.cos(tank.angle) * 18 + (Math.random() - 0.5) * 10,
                tank.y - Math.sin(tank.angle) * 18 + (Math.random() - 0.5) * 10,
                tank.isStealth ? 'rgba(255, 255, 255, 0.4)' : '#94A3B8',
                1, 60, 0.25);
            }
          }
        } else {
          // Aim & Fire joystick
          const touchWorldX = t.rawX;
          const touchWorldY = t.rawY;
          tank.turretAngle = Math.atan2(touchWorldY - tank.y, touchWorldX - tank.x);

          if (t.phase === 'ended') {
            this.fireTankCannon(tank);
          }
        }
      }
    } else {
      // Keyboard Controls
      if (kb.x !== 0 || kb.y !== 0) {
        tank.angle = Math.atan2(kb.y, kb.x);
        tank.turretAngle = tank.angle;
        tank.x += Math.cos(tank.angle) * 160 * dt;
        tank.y += Math.sin(tank.angle) * 160 * dt;
      }
      if (kb.actionA) {
        this.fireTankCannon(tank);
        kb.actionA = false;
      }
    }

    // Clamp tank to arena walls & obstacles
    const radius = 20;
    tank.x = Math.max(radius, Math.min(width - radius, tank.x));
    tank.y = Math.max(radius, Math.min(height - radius, tank.y));

    for (const obs of this.obstacles) {
      if (
        tank.x + radius > obs.x &&
        tank.x - radius < obs.x + obs.width &&
        tank.y + radius > obs.y &&
        tank.y - radius < obs.y + obs.height
      ) {
        // Push tank out of obstacle
        const cx = obs.x + obs.width / 2;
        const cy = obs.y + obs.height / 2;
        if (Math.abs(tank.x - cx) > Math.abs(tank.y - cy)) {
          tank.x = tank.x > cx ? obs.x + obs.width + radius : obs.x - radius;
        } else {
          tank.y = tank.y > cy ? obs.y + obs.height + radius : obs.y - radius;
        }
      }
    }
  }

  private fireTankCannon(tank: Tank) {
    if (tank.ammo <= 0) {
      tank.isOverheated = true;
      tank.overheatTimer = 2.0;
      this.audio.playPuckBounce(0.5);
      return;
    }

    tank.ammo--;
    tank.revealTimer = 1.5; // Revealed on shot
    if (tank.isStealth) tank.isStealth = false;

    const shellSpeed = 520;
    const barrelLength = 26;
    const spawnX = tank.x + Math.cos(tank.turretAngle) * barrelLength;
    const spawnY = tank.y + Math.sin(tank.turretAngle) * barrelLength;

    this.shells.push({
      x: spawnX,
      y: spawnY,
      vx: Math.cos(tank.turretAngle) * shellSpeed,
      vy: Math.sin(tank.turretAngle) * shellSpeed,
      owner: tank.player,
      bouncesLeft: 2,
      isHoming: tank.hasHomingNext,
      radius: tank.hasHomingNext ? 7 : 5,
      color: tank.player === 1 ? '#FF0055' : '#00F0FF'
    });

    tank.hasHomingNext = false;
    this.audio.playTankShoot();
    this.juice.addTrauma(0.18);
    this.juice.emitSparks(spawnX, spawnY, '#FFAA00', 8, 200, 0.15);
  }

  private checkTankHit(s: Shell, tank: Tank): boolean {
    const distSq = (s.x - tank.x) * (s.x - tank.x) + (s.y - tank.y) * (s.y - tank.y);
    return distSq < (s.radius + 18) * (s.radius + 18);
  }

  private destroyTank(tank: Tank, victor: PlayerIndex, width: number, height: number) {
    this.audio.playGoalDetonation();
    this.juice.emitExplosion(tank.x, tank.y, tank.player === 1 ? '#FF0055' : '#00F0FF', 36);
    this.triggerPointScore(victor, width, height);
  }

  private spawnTankPowerUp(width: number, height: number) {
    const types: Array<'homing' | 'stealth' | 'emp'> = ['homing', 'stealth', 'emp'];
    const type = types[Math.floor(Math.random() * types.length)];
    let color = '#FFD700';
    let icon = '🚀';
    if (type === 'stealth') { color = '#AA00FF'; icon = '👻'; }
    if (type === 'emp') { color = '#00FFFF'; icon = '⚡'; }

    this.powerUps.push({
      x: width * 0.25 + Math.random() * (width * 0.5),
      y: height * 0.25 + Math.random() * (height * 0.5),
      type,
      radius: 18,
      color,
      icon
    });
  }

  private checkPowerUpPickup(tank: Tank, pu: TankPowerUp): boolean {
    const distSq = (tank.x - pu.x) * (tank.x - pu.x) + (tank.y - pu.y) * (tank.y - pu.y);
    return distSq < (18 + pu.radius) * (18 + pu.radius);
  }

  private applyTankPowerUp(tank: Tank, type: 'homing' | 'stealth' | 'emp') {
    this.audio.playPowerUp();
    if (type === 'homing') {
      tank.hasHomingNext = true;
    } else if (type === 'stealth') {
      tank.isStealth = true;
      tank.stealthTimer = 6.0;
    } else if (type === 'emp') {
      const opponent = tank.player === 1 ? this.tank2 : this.tank1;
      opponent.isEmped = true;
      opponent.empTimer = 2.5;
      this.juice.triggerShockwave(tank.x, tank.y, '#00FFFF', 180);
      this.juice.addTrauma(0.3);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const now = performance.now();
    const p1Col = this.progression.getSkinColors(1);
    const p2Col = this.progression.getSkinColors(2);

    // 1. Dynamic Floor Lighting under tanks
    this.juice.drawRadialFloorLight(ctx, this.tank1.x, this.tank1.y, 50, p1Col.primary, this.tank1.isStealth ? 0.08 : 0.4);
    this.juice.drawRadialFloorLight(ctx, this.tank2.x, this.tank2.y, 50, p2Col.primary, this.tank2.isStealth ? 0.08 : 0.4);

    // 1b. Drifting battlefield smoke haze layer
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 91 + now * 0.032 * 90) % (width + 260)) - 130;
      const cy = height * (0.16 + 0.15 * i) + Math.sin(now * 0.003 + i) * 26;
      const smoke = ctx.createRadialGradient(cx, cy, 2, cx, cy, 62 + (i % 3) * 24);
      smoke.addColorStop(0, 'rgba(148, 163, 184, 0.34)');
      smoke.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = smoke;
      ctx.fillRect(cx - 100, cy - 100, 200, 200);
    }
    ctx.restore();

    // 2. Obstacles (High-Tech Armored Bunkers)
    ctx.save();
    for (const obs of this.obstacles) {
      // Drop shadow for 3D extrusion
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(obs.x + 4, obs.y + 6, obs.width, obs.height);

      // Main bunker chassis
      const bunkerGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
      bunkerGrad.addColorStop(0, '#1c2436');
      bunkerGrad.addColorStop(0.5, '#121824');
      bunkerGrad.addColorStop(1, '#0b0f17');
      ctx.fillStyle = bunkerGrad;
      ctx.strokeStyle = '#2d3b55';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.width, obs.height, 4);
      ctx.fill();
      ctx.stroke();

      // Top beveled rim
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(obs.x + 2, obs.y + obs.height - 2);
      ctx.lineTo(obs.x + 2, obs.y + 2);
      ctx.lineTo(obs.x + obs.width - 2, obs.y + 2);
      ctx.stroke();

      // Armor plating interior seam
      ctx.strokeStyle = '#00F0FF';
      ctx.globalAlpha = 0.25;
      ctx.strokeRect(obs.x + 4, obs.y + 4, obs.width - 8, obs.height - 8);
      ctx.globalAlpha = 1.0;

      // Hex bolt rivets on corners
      ctx.fillStyle = '#64748b';
      const rSize = 2;
      const rOffset = 5;
      ctx.fillRect(obs.x + rOffset, obs.y + rOffset, rSize, rSize);
      ctx.fillRect(obs.x + obs.width - rOffset - rSize, obs.y + rOffset, rSize, rSize);
      ctx.fillRect(obs.x + rOffset, obs.y + obs.height - rOffset - rSize, rSize, rSize);
      ctx.fillRect(obs.x + obs.width - rOffset - rSize, obs.y + obs.height - rOffset - rSize, rSize, rSize);

      // Warning hazard stripes or damage cracks
      if (obs.hp < obs.maxHp) {
        const pulse = 0.5 + Math.sin(now * 0.008) * 0.3;
        ctx.strokeStyle = `rgba(255, 30, 80, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(obs.x + 6, obs.y + 6);
        ctx.lineTo(obs.x + obs.width * 0.4, obs.y + obs.height * 0.6);
        ctx.lineTo(obs.x + obs.width - 6, obs.y + obs.height - 6);
        if (obs.hp === 1) {
          ctx.moveTo(obs.x + obs.width - 6, obs.y + 8);
          ctx.lineTo(obs.x + obs.width * 0.5, obs.y + obs.height * 0.5);
          ctx.lineTo(obs.x + 8, obs.y + obs.height - 6);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // 3. Power-Ups (Holographic Beacon Orbs)
    ctx.save();
    for (const pu of this.powerUps) {
      const bob = Math.sin(now * 0.005 + pu.x) * 3;
      const cy = pu.y + bob;

      this.juice.drawRadialFloorLight(ctx, pu.x, pu.y, pu.radius * 2.2, pu.color, 0.4);

      // Outer rotating holographic beacon ring
      ctx.save();
      ctx.translate(pu.x, cy);
      ctx.rotate(now * 0.002);
      ctx.strokeStyle = pu.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, pu.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Main core orb
      const orbGrad = ctx.createRadialGradient(pu.x - 3, cy - 3, 2, pu.x, cy, pu.radius);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.3, pu.color);
      orbGrad.addColorStop(1, '#0a0d14');

      ctx.fillStyle = orbGrad;
      ctx.strokeStyle = pu.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = pu.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(pu.x, cy, pu.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Power-up Icon
      ctx.shadowBlur = 0;
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pu.icon, pu.x, cy);
    }
    ctx.restore();

    // 4. Tanks
    this.renderTank(ctx, this.tank1, p1Col.primary, p1Col.secondary);
    this.renderTank(ctx, this.tank2, p2Col.primary, p2Col.secondary);

    // 5. Shells (High-velocity Plasma Cores)
    ctx.save();
    for (const s of this.shells) {
      // Glow trail
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 1.5, 0, Math.PI * 2);
      ctx.fill();

      // White-hot plasma core
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderTank(ctx: CanvasRenderingContext2D, tank: Tank, primary: string, secondary: string) {
    const now = performance.now();
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // Stealth Alpha Masking
    if (tank.isStealth && tank.revealTimer <= 0) {
      ctx.globalAlpha = 0.18;
    }

    // High-Tech Dotted Laser Sight Aim Trajectory + Reticle
    ctx.save();
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const laserDist = 160;
    const targetX = Math.cos(tank.turretAngle) * laserDist;
    const targetY = Math.sin(tank.turretAngle) * laserDist;
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    // Crosshair Reticle at laser tip
    ctx.setLineDash([]);
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(targetX - 9, targetY);
    ctx.lineTo(targetX + 9, targetY);
    ctx.moveTo(targetX, targetY - 9);
    ctx.lineTo(targetX, targetY + 9);
    ctx.stroke();
    ctx.restore();

    // EMP Shock Ring
    if (tank.isEmped) {
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    // 1. Tank Chassis (Rotates with driving direction)
    ctx.save();
    ctx.rotate(tank.angle);

    // Heavy Treads (Left & Right) with animated track segments
    const trackWidth = 38;
    const trackHeight = 7;
    const treadYOffset = 13;

    for (const side of [-1, 1]) {
      const ty = side * treadYOffset - (side === 1 ? 0 : trackHeight);
      // Tread base
      ctx.fillStyle = '#0f131a';
      ctx.strokeStyle = '#2a3447';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-trackWidth / 2, ty, trackWidth, trackHeight, 3);
      ctx.fill();
      ctx.stroke();

      // Tread teeth
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.7;
      const numTeeth = 6;
      for (let t = 0; t < numTeeth; t++) {
        const tx = -trackWidth / 2 + 3 + t * 5.5;
        ctx.fillRect(tx, ty + 1, 2.5, trackHeight - 2);
      }
      ctx.globalAlpha = 1.0;
    }

    // Main Armored Hull with Cyber Bevel
    const hullGrad = ctx.createLinearGradient(-16, -14, 16, 14);
    hullGrad.addColorStop(0, '#1c2436');
    hullGrad.addColorStop(0.5, '#121722');
    hullGrad.addColorStop(1, '#0a0d14');
    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = primary;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.roundRect(-16, -12, 32, 24, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Hull center engine reactor vent
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(-10, -5, 20, 10);
    ctx.fillStyle = primary;
    ctx.globalAlpha = 0.5 + Math.sin(now * 0.006) * 0.3;
    ctx.fillRect(-8, -1, 16, 2);
    ctx.globalAlpha = 1.0;

    ctx.restore(); // End Chassis

    // 2. Tank Turret (Rotates independently with aim)
    ctx.save();
    ctx.rotate(tank.turretAngle);

    // Heavy Cannon Barrel
    const barrelGrad = ctx.createLinearGradient(0, -3, 0, 3);
    barrelGrad.addColorStop(0, '#4a5568');
    barrelGrad.addColorStop(0.5, '#1e293b');
    barrelGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(0, -3.5, 24, 7);

    // Barrel cooling heat shimmer after a shot
    if (tank.reloadTimer > 0.82) {
      const heat = Math.min(1, (tank.reloadTimer - 0.82) / 0.38);
      ctx.fillStyle = `rgba(255, 120, 50, ${heat * 0.42})`;
      ctx.shadowColor = '#FF5500';
      ctx.shadowBlur = 12 * heat;
      ctx.fillRect(16, -4.5, 7, 9);
      ctx.shadowBlur = 0;
    }

    // Muzzle brake
    ctx.fillStyle = primary;
    ctx.fillRect(22, -4.5, 4, 9);

    // Barrel power rails
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -1.5);
    ctx.lineTo(20, -1.5);
    ctx.moveTo(4, 1.5);
    ctx.lineTo(20, 1.5);
    ctx.stroke();

    // Turret Armored Mantlet & Cupola
    const cupolaGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, 11);
    cupolaGrad.addColorStop(0, '#2b3648');
    cupolaGrad.addColorStop(0.7, '#131924');
    cupolaGrad.addColorStop(1, '#090d14');

    ctx.fillStyle = cupolaGrad;
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.shadowColor = primary;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing Sensor Eye on Turret
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // End Turret

    // 3. Sleek Floating Ammo Pods above tank
    const totalW = (tank.maxAmmo - 1) * 9;
    const startX = -totalW / 2;
    for (let i = 0; i < tank.maxAmmo; i++) {
      const ax = startX + i * 9;
      const ay = -24;
      if (i < tank.ammo) {
        ctx.fillStyle = primary;
        ctx.shadowColor = primary;
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = '#2a3547';
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.roundRect(ax - 3, ay - 2, 6, 4, 1.5);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}
