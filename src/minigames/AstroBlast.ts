import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface SpaceShip {
  player: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // in radians
  speed: number;
  radius: number;
  shieldActive: boolean;
  shieldHp: number;
  fireCooldown: number;
  tripleShotTimer: number;
  color: string;
}

interface LaserBolt {
  owner: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  bounces: number;
  color: string;
}

interface PowerupCrate {
  x: number;
  y: number;
  type: 'triple' | 'shield';
  active: boolean;
  radius: number;
}

export class AstroBlast extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'astro_blast',
    title: 'Astro Blast Duel',
    subtitle: 'Zero-G Space Dogfight & Orbital Lasers',
    category: 'Action & Speed',
    icon: '🚀',
    targetScore: 5,
    timeLimitSec: 90,
    instructionsP1: 'Left/Right to steer, Tap to thrust & fire lasers!',
    instructionsP2: 'Left/Right to steer, Tap to thrust & fire lasers!'
  };

  private ship1!: SpaceShip;
  private ship2!: SpaceShip;
  private lasers: LaserBolt[] = [];
  private crates: PowerupCrate[] = [];
  private crateSpawnTimer: number = 5.0;

  public init(width: number, height: number): void {
    this.targetScore = 5;
    this.p1Score = 0;
    this.p2Score = 0;

    const p1Colors = this.progression.getSkinColors(1);
    const p2Colors = this.progression.getSkinColors(2);

    this.ship1 = {
      player: 1,
      x: width * 0.5,
      y: height * 0.8,
      vx: 0,
      vy: 0,
      angle: -Math.PI * 0.5, // pointing up
      speed: 0,
      radius: 18,
      shieldActive: true,
      shieldHp: 1,
      fireCooldown: 0,
      tripleShotTimer: 0,
      color: p1Colors.primary
    };

    this.ship2 = {
      player: 2,
      x: width * 0.5,
      y: height * 0.2,
      vx: 0,
      vy: 0,
      angle: Math.PI * 0.5, // pointing down
      speed: 0,
      radius: 18,
      shieldActive: true,
      shieldHp: 1,
      fireCooldown: 0,
      tripleShotTimer: 0,
      color: p2Colors.primary
    };

    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    this.lasers = [];
    this.crates = [];
    this.crateSpawnTimer = 4.0;

    this.ship1.x = width * 0.5;
    this.ship1.y = height * 0.82;
    this.ship1.vx = 0;
    this.ship1.vy = 0;
    this.ship1.angle = -Math.PI * 0.5;
    this.ship1.shieldActive = true;
    this.ship1.shieldHp = 1;
    this.ship1.fireCooldown = 0;
    this.ship1.tripleShotTimer = 0;

    this.ship2.x = width * 0.5;
    this.ship2.y = height * 0.18;
    this.ship2.vx = 0;
    this.ship2.vy = 0;
    this.ship2.angle = Math.PI * 0.5;
    this.ship2.shieldActive = true;
    this.ship2.shieldHp = 1;
    this.ship2.fireCooldown = 0;
    this.ship2.tripleShotTimer = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    this.ship1.fireCooldown = Math.max(0, this.ship1.fireCooldown - dt);
    this.ship2.fireCooldown = Math.max(0, this.ship2.fireCooldown - dt);

    if (this.ship1.tripleShotTimer > 0) this.ship1.tripleShotTimer -= dt;
    if (this.ship2.tripleShotTimer > 0) this.ship2.tripleShotTimer -= dt;

    // 1. Inputs
    this.handleInputs(dt, width, height);

    // 2. AI Bot
    if (this.progression.getGameMode() === 'vs_ai') {
      this.updateBot(dt, width);
    }

    // 3. Update ships movement & boundaries
    this.updateShip(this.ship1, dt, width, height);
    this.updateShip(this.ship2, dt, width, height);

    // 4. Update lasers
    this.updateLasers(dt, width, height);

    // 5. Update powerup crates
    this.updateCrates(dt, width, height);
  }

  private handleInputs(dt: number, _width: number, _height: number) {
    const touches = this.input.getTouches();

    for (const touch of touches) {
      if (touch.player === 1) {
        // P1 controls
        const dx = touch.rawX - this.ship1.x;
        const dy = touch.rawY - this.ship1.y;
        this.ship1.angle = Math.atan2(dy, dx);
        this.thrustShip(this.ship1, dt);
        if (touch.phase === 'began' || touch.phase === 'moved') {
          this.fireLaser(this.ship1);
        }
      } else if (this.progression.getGameMode() !== 'vs_ai' && touch.player === 2) {
        // P2 controls
        const dx = touch.rawX - this.ship2.x;
        const dy = touch.rawY - this.ship2.y;
        this.ship2.angle = Math.atan2(dy, dx);
        this.thrustShip(this.ship2, dt);
        if (touch.phase === 'began' || touch.phase === 'moved') {
          this.fireLaser(this.ship2);
        }
      }
    }

    // Keyboard support
    const kb1 = this.input.keyboardP1;
    if (kb1.x !== 0) this.ship1.angle += kb1.x * 4.5 * dt;
    if (kb1.y < 0) this.thrustShip(this.ship1, dt);
    if (kb1.actionA) this.fireLaser(this.ship1);

    if (this.progression.getGameMode() !== 'vs_ai') {
      const kb2 = this.input.keyboardP2;
      if (kb2.x !== 0) this.ship2.angle += kb2.x * 4.5 * dt;
      if (kb2.y < 0) this.thrustShip(this.ship2, dt);
      if (kb2.actionA) this.fireLaser(this.ship2);
    }
  }

  private thrustShip(ship: SpaceShip, dt: number) {
    const thrust = 380 * dt;
    ship.vx += Math.cos(ship.angle) * thrust;
    ship.vy += Math.sin(ship.angle) * thrust;

    // Cap velocity
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 260) {
      ship.vx = (ship.vx / speed) * 260;
      ship.vy = (ship.vy / speed) * 260;
    }

    // Engine exhaust particles
    if (Math.random() < 0.4) {
      this.juice.emitSparks(
        ship.x - Math.cos(ship.angle) * ship.radius,
        ship.y - Math.sin(ship.angle) * ship.radius,
        ship.color,
        2,
        80,
        0.15
      );
    }
  }

  private fireLaser(ship: SpaceShip) {
    if (ship.fireCooldown > 0) return;
    ship.fireCooldown = 0.22;

    const speed = 560;
    this.audio.playLaserBlaster();

    if (ship.tripleShotTimer > 0) {
      // Triple Laser Salvo
      const angles = [ship.angle - 0.2, ship.angle, ship.angle + 0.2];
      for (const a of angles) {
        this.lasers.push({
          owner: ship.player,
          x: ship.x + Math.cos(a) * ship.radius,
          y: ship.y + Math.sin(a) * ship.radius,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          radius: 4,
          life: 1.8,
          bounces: 1,
          color: ship.color
        });
      }
    } else {
      // Standard dual blaster
      this.lasers.push({
        owner: ship.player,
        x: ship.x + Math.cos(ship.angle) * ship.radius,
        y: ship.y + Math.sin(ship.angle) * ship.radius,
        vx: Math.cos(ship.angle) * speed,
        vy: Math.sin(ship.angle) * speed,
        radius: 4,
        life: 1.8,
        bounces: 1,
        color: ship.color
      });
    }
  }

  private static wrapAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  private updateBot(dt: number, _width: number) {
    const diff = this.progression.getAIDifficulty();
    const target = this.ship1;

    // Aim toward player
    const dx = target.x - this.ship2.x;
    const dy = target.y - this.ship2.y;
    const desiredAngle = Math.atan2(dy, dx);

    // Smooth turn (shortest-arc across the +-PI seam)
    const turnSpeed = diff === 'hard' ? 6.0 : diff === 'medium' ? 3.5 : 2.0;
    const angleDelta = AstroBlast.wrapAngle(desiredAngle - this.ship2.angle);
    this.ship2.angle += angleDelta * Math.min(1.0, turnSpeed * dt);

    // Thrust forward periodically
    if (Math.hypot(dx, dy) > 160) {
      this.thrustShip(this.ship2, dt);
    }

    // Fire laser if lined up
    if (Math.abs(AstroBlast.wrapAngle(desiredAngle - this.ship2.angle)) < 0.35) {
      this.fireLaser(this.ship2);
    }
  }

  private updateShip(ship: SpaceShip, dt: number, width: number, height: number) {
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    // Space drag
    ship.vx *= Math.pow(0.85, dt);
    ship.vy *= Math.pow(0.85, dt);

    // Boundaries clamp
    if (ship.x < ship.radius) { ship.x = ship.radius; ship.vx = -ship.vx * 0.5; }
    if (ship.x > width - ship.radius) { ship.x = width - ship.radius; ship.vx = -ship.vx * 0.5; }

    // Territory limit: P1 cannot enter deep P2 zone, P2 cannot enter deep P1 zone
    if (ship.player === 1) {
      if (ship.y < height * 0.45) { ship.y = height * 0.45; ship.vy = 0; }
      if (ship.y > height - ship.radius) { ship.y = height - ship.radius; ship.vy = 0; }
    } else {
      if (ship.y > height * 0.55) { ship.y = height * 0.55; ship.vy = 0; }
      if (ship.y < ship.radius) { ship.y = ship.radius; ship.vy = 0; }
    }
  }

  private updateLasers(dt: number, width: number, height: number) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const b = this.lasers[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Bounce off sidewalls once
      if (b.x < 10 || b.x > width - 10) {
        if (b.bounces > 0) {
          b.vx = -b.vx;
          b.bounces--;
          this.audio.playPaddleWallBounce();
        } else {
          b.life = 0;
        }
      }

      // Check hit on opponent ship
      const target = b.owner === 1 ? this.ship2 : this.ship1;
      const dist = Math.hypot(b.x - target.x, b.y - target.y);

      if (dist < b.radius + target.radius) {
        b.life = 0;
        if (target.shieldActive && target.shieldHp > 0) {
          // Shield absorbed hit!
          target.shieldHp = 0;
          target.shieldActive = false;
          this.audio.playShieldDeflect();
          this.juice.addTrauma(0.2);
          this.juice.emitSparks(target.x, target.y, '#00F0FF', 16);
        } else {
          // Direct hit -> Score point!
          this.audio.playGoalDetonation();
          this.juice.addTrauma(0.45);
          this.juice.emitExplosion(target.x, target.y, target.color, 30);
          this.triggerPointScore(b.owner, width, height);
          this.lasers.splice(i, 1);
          return;
        }
      }

      if (b.life <= 0 || b.y < 0 || b.y > height) {
        this.lasers.splice(i, 1);
      }
    }
  }

  private updateCrates(dt: number, width: number, height: number) {
    this.crateSpawnTimer -= dt;
    if (this.crateSpawnTimer <= 0) {
      this.crateSpawnTimer = 6.0;
      // Count only live crates: collected ones stay in the array as inactive
      // until pruned below, otherwise spawns stop forever after 2 pickups
      const liveCrates = this.crates.filter(c => c.active).length;
      if (liveCrates < 2) {
        this.crates.push({
          x: width * 0.2 + Math.random() * width * 0.6,
          y: height * 0.35 + Math.random() * height * 0.3,
          type: Math.random() > 0.5 ? 'triple' : 'shield',
          active: true,
          radius: 14
        });
      }
    }

    for (const c of this.crates) {
      if (!c.active) continue;
      // Check collision with ships (re-check active: first ship's pickup
      // must not grant the same crate to the second ship in one frame)
      for (const ship of [this.ship1, this.ship2]) {
        if (!c.active) break;
        if (Math.hypot(ship.x - c.x, ship.y - c.y) < ship.radius + c.radius) {
          c.active = false;
          if (c.type === 'triple') {
            ship.tripleShotTimer = 6.0;
          } else {
            ship.shieldActive = true;
            ship.shieldHp = 1;
          }
          this.audio.playPowerUp();
          this.juice.emitSparks(c.x, c.y, '#FFD700', 14);
        }
      }
    }

    // Prune collected crates so the array never grows across rounds
    if (this.crates.some(c => !c.active)) {
      this.crates = this.crates.filter(c => c.active);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // 1. Starfield background
    this.renderStars(ctx, width, height);

    // 2. Powerup crates
    for (const c of this.crates) {
      if (c.active) this.renderCrate(ctx, c);
    }

    // 3. Lasers
    for (const b of this.lasers) {
      this.renderLaser(ctx, b);
    }

    // 4. Ships
    this.renderShip(ctx, this.ship1);
    this.renderShip(ctx, this.ship2);
  }

  private renderStars(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 25; i++) {
      const sx = ((i * 37) % width);
      const sy = ((i * 73 + performance.now() * 0.02) % height);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.restore();
  }

  private renderShip(ctx: CanvasRenderingContext2D, ship: SpaceShip) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Shield bubble
    if (ship.shieldActive && ship.shieldHp > 0) {
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00F0FF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ship Hull (triangle wedge fighter)
    ctx.fillStyle = ship.color;
    ctx.shadowColor = ship.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(ship.radius, 0);
    ctx.lineTo(-ship.radius * 0.7, ship.radius * 0.7);
    ctx.lineTo(-ship.radius * 0.4, 0);
    ctx.lineTo(-ship.radius * 0.7, -ship.radius * 0.7);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ship.radius * 0.2, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderLaser(ctx: CanvasRenderingContext2D, b: LaserBolt) {
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.stroke();
    ctx.restore();
  }

  private renderCrate(ctx: CanvasRenderingContext2D, c: PowerupCrate) {
    ctx.save();
    ctx.fillStyle = c.type === 'triple' ? '#FF9900' : '#00E5A3';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillRect(c.x - c.radius, c.y - c.radius, c.radius * 2, c.radius * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.type === 'triple' ? '3X' : 'SH', c.x, c.y + 3);
    ctx.restore();
  }
}
