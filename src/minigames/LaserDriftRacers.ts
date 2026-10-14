import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex, Vector2 } from '../core/types';

interface RacerCar {
  player: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  isDrifting: boolean;
  driftAngle: number;
  nitroTimer: number;
  spinTimer: number;
  currentCheckpoint: number;
  lapsCompleted: number;
  color: string;
}

interface BoostPad {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

export class LaserDriftRacers extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'laser_drift',
    title: 'Laser Drift Racers',
    subtitle: 'Supersonic Micro-Drift Circuit',
    category: 'Racing Arcade',
    icon: '🏎️',
    targetScore: 3, // 3 laps to win
    timeLimitSec: 90,
    instructionsP1: 'Tap Left/Right to Steer | Hold Both to Drift!',
    instructionsP2: 'Tap Left/Right to Steer | Hold Both to Drift!'
  };

  private car1!: RacerCar;
  private car2!: RacerCar;

  private waypoints: Vector2[] = [];
  private boostPads: BoostPad[] = [];
  private trackRadiusX: number = 140;
  private trackRadiusY: number = 260;

  public init(width: number, height: number): void {
    this.trackRadiusX = width * 0.38;
    this.trackRadiusY = height * 0.36;

    const cx = width / 2;
    const cy = height / 2;

    // Generate elliptical track checkpoints
    this.waypoints = [
      { x: cx, y: cy + this.trackRadiusY },           // Bottom straight (Start/Finish)
      { x: cx + this.trackRadiusX, y: cy + this.trackRadiusY * 0.5 }, // Bottom-right corner
      { x: cx + this.trackRadiusX, y: cy - this.trackRadiusY * 0.5 }, // Top-right corner
      { x: cx, y: cy - this.trackRadiusY },           // Top straight
      { x: cx - this.trackRadiusX, y: cy - this.trackRadiusY * 0.5 }, // Top-left corner
      { x: cx - this.trackRadiusX, y: cy + this.trackRadiusY * 0.5 }  // Bottom-left corner
    ];

    // Boost Pads
    this.boostPads = [
      { x: cx + this.trackRadiusX, y: cy, width: 28, height: 44, angle: -Math.PI / 2 },
      { x: cx - this.trackRadiusX, y: cy, width: 28, height: 44, angle: Math.PI / 2 }
    ];

    this.car1 = this.createCar(1, cx - 22, cy + this.trackRadiusY, 0);
    this.car2 = this.createCar(2, cx + 22, cy + this.trackRadiusY, 0);

    this.resetRound(width, height);
  }

  private createCar(player: PlayerIndex, x: number, y: number, angle: number): RacerCar {
    return {
      player,
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      speed: 0,
      isDrifting: false,
      driftAngle: 0,
      nitroTimer: 0,
      spinTimer: 0,
      currentCheckpoint: 0,
      lapsCompleted: 0,
      color: player === 1 ? '#FF0055' : '#0084FF'
    };
  }

  public resetRound(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;

    this.car1.x = cx - 24;
    this.car1.y = cy + this.trackRadiusY;
    this.car1.angle = 0;
    this.car1.speed = 0;
    this.car1.isDrifting = false;
    this.car1.nitroTimer = 0;
    this.car1.spinTimer = 0;
    this.car1.currentCheckpoint = 0;
    this.car1.lapsCompleted = 0;

    this.car2.x = cx + 24;
    this.car2.y = cy + this.trackRadiusY;
    this.car2.angle = 0;
    this.car2.speed = 0;
    this.car2.isDrifting = false;
    this.car2.nitroTimer = 0;
    this.car2.spinTimer = 0;
    this.car2.currentCheckpoint = 0;
    this.car2.lapsCompleted = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    // 1. Process Car 1 (Human Player 1)
    this.updateCarInput(this.car1, 1, dt);

    // 2. Process Car 2 (Human Player 2 or AI Bot)
    if (this.progression.getGameMode() === 'vs_ai') {
      const targetWp = this.waypoints[(this.car2.currentCheckpoint + 1) % this.waypoints.length];
      this.botAI.updateLaserDrift(this.car2, targetWp, this.progression.getAIDifficulty(), dt);
    } else {
      this.updateCarInput(this.car2, 2, dt);
    }

    // 3. Step Physics for both cars
    this.stepCarPhysics(this.car1, dt, width, height);
    this.stepCarPhysics(this.car2, dt, width, height);

    // 4. Car-to-Car Collision
    this.resolveCarCollision();

    // 5. Check Checkpoints & Laps
    this.checkLapProgress(this.car1, width, height);
    this.checkLapProgress(this.car2, width, height);
  }

  private updateCarInput(car: RacerCar, player: PlayerIndex, dt: number) {
    if (car.spinTimer > 0) return;

    const touches = this.input.getTouchesForPlayer(player);
    const kb = player === 1 ? this.input.keyboardP1 : this.input.keyboardP2;

    let steer = 0;
    let accelerate = true;
    let drift = false;

    if (touches.length > 0) {
      const t = touches[0];
      // Left touch region = Steer Left, Right touch region = Steer Right
      if (t.normX < 0.38) steer = -1;
      else if (t.normX > 0.62) steer = 1;
      else drift = true;

      // Two fingers = power drift
      if (touches.length > 1) {
        drift = true;
      }
    } else {
      // Keyboard fallback
      if (kb.x < 0) steer = -1;
      if (kb.x > 0) steer = 1;
      if (kb.actionA || kb.actionB) drift = true;
    }

    // Steering application
    const turnRate = drift ? 4.8 : 3.2;
    car.angle += steer * turnRate * dt;
    car.isDrifting = drift;

    // Acceleration
    const maxSpeed = car.nitroTimer > 0 ? 540 : 340;
    if (accelerate) {
      car.speed = Math.min(maxSpeed, car.speed + 320 * dt);
    }
  }

  private stepCarPhysics(car: RacerCar, dt: number, width: number, height: number) {
    if (car.spinTimer > 0) {
      car.spinTimer -= dt;
      car.angle += 14 * dt; // spin out
      car.speed *= (1.0 - 2.5 * dt);
    }

    if (car.nitroTimer > 0) {
      car.nitroTimer -= dt;
      this.juice.emitSparks(car.x, car.y, '#FFAA00', 4, 180, 0.15);
    }

    // Compute velocity with drift slip
    const headingX = Math.cos(car.angle);
    const headingY = Math.sin(car.angle);

    const driftFactor = car.isDrifting ? 0.65 : 0.94;
    car.vx = car.vx * driftFactor + headingX * car.speed * (1 - driftFactor);
    car.vy = car.vy * driftFactor + headingY * car.speed * (1 - driftFactor);

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Soft arena walls: bounce back so cars can never leave the arena and
    // strand lap checkpoints out of reach
    const margin = 14;
    if (car.x < margin) { car.x = margin; car.vx = Math.abs(car.vx) * 0.6; car.angle = 0; }
    else if (car.x > width - margin) { car.x = width - margin; car.vx = -Math.abs(car.vx) * 0.6; car.angle = Math.PI; }
    if (car.y < margin) { car.y = margin; car.vy = Math.abs(car.vy) * 0.6; car.angle = Math.PI / 2; }
    else if (car.y > height - margin) { car.y = height - margin; car.vy = -Math.abs(car.vy) * 0.6; car.angle = -Math.PI / 2; }

    // Tire trail marks during drift
    if (car.isDrifting && car.speed > 160) {
      this.juice.addTrailPoint(`drift_${car.player}`, car.x, car.y, car.color, 8);
    }

    // Speed-motion exhaust streaks
    if (car.speed > 240 && Math.random() < 0.5) {
      const backX = car.x - Math.cos(car.angle) * 22;
      const backY = car.y - Math.sin(car.angle) * 22;
      this.juice.emitSparks(backX, backY, car.color, 1, 46, 0.18);
    }

    // Check Boost Pads (half-extents match the rendered pad backing)
    for (const bp of this.boostPads) {
      const dx = Math.abs(car.x - bp.x);
      const dy = Math.abs(car.y - bp.y);
      if (dx < bp.width / 2 && dy < bp.height / 2) {
        if (car.nitroTimer <= 0) {
          car.nitroTimer = 1.4;
          this.audio.playNitroBoost();
          this.juice.addTrauma(0.35);
          this.juice.emitExplosion(car.x, car.y, '#FFAA00', 20);
        }
      }
    }
  }

  private resolveCarCollision() {
    const dx = this.car2.x - this.car1.x;
    const dy = this.car2.y - this.car1.y;
    const distSq = dx * dx + dy * dy;
    const minDist = 28;

    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;

      this.car1.x -= nx * 8;
      this.car1.y -= ny * 8;
      this.car2.x += nx * 8;
      this.car2.y += ny * 8;

      this.car1.speed *= 0.85;
      this.car2.speed *= 0.85;

      this.audio.playBumperHit();
      this.juice.addTrauma(0.2);
      this.juice.emitSparks((this.car1.x + this.car2.x) / 2, (this.car1.y + this.car2.y) / 2, '#FFFFFF', 10, 180, 0.2);
    }
  }

  private checkLapProgress(car: RacerCar, width: number, height: number) {
    const nextWp = this.waypoints[car.currentCheckpoint];
    const dx = car.x - nextWp.x;
    const dy = car.y - nextWp.y;

    if (dx * dx + dy * dy < 70 * 70) {
      car.currentCheckpoint++;
      if (car.currentCheckpoint >= this.waypoints.length) {
        car.currentCheckpoint = 0;
        car.lapsCompleted++;
        this.audio.playPuckBounce(1.5);

        if (car.player === 1) this.p1Score = car.lapsCompleted;
        else this.p2Score = car.lapsCompleted;

        if (car.lapsCompleted >= this.targetScore) {
          this.completeMatch(car.player, width, height);
        }
      }
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    const now = performance.now();

    // 1. Race Track Circuit (Dark Cyber-Asphalt with Neon Curbs)
    ctx.save();

    // Asphalt Bed
    ctx.strokeStyle = '#0e131d';
    ctx.lineWidth = 74;
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.trackRadiusX, this.trackRadiusY, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Outer Laser Guard Rail
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.trackRadiusX + 37, this.trackRadiusY + 37, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Neon Apex Curb
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.trackRadiusX - 37, this.trackRadiusY - 37, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Track Guideline Dashes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 16]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.trackRadiusX, this.trackRadiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Checkered Holographic Start/Finish Line
    const flY = cy + this.trackRadiusY;
    const flStartX = cx - 36;
    const flWidth = 72;
    const checkSize = 9;
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 2; r++) {
        const isWhite = (c + r) % 2 === 0;
        ctx.fillStyle = isWhite ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 240, 255, 0.6)';
        ctx.fillRect(flStartX + c * checkSize, flY - 9 + r * checkSize, checkSize, checkSize);
      }
    }

    // Glowing finish line border
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 10;
    ctx.strokeRect(flStartX, flY - 9, flWidth, 18);
    ctx.shadowBlur = 0;
    // Breathing goal beacon above the finish line
    this.juice.drawPulseRing(ctx, cx, flY, 14, '#00F0FF', now * 0.001, 5, 6);
    ctx.restore();

    // 1b. Track center island beacon + shadow
    ctx.save();
    const islandGrad = ctx.createRadialGradient(cx, cy, 24, cx, cy, Math.min(this.trackRadiusX, this.trackRadiusY) * 0.8);
    islandGrad.addColorStop(0, 'rgba(24, 32, 50, 0.92)');
    islandGrad.addColorStop(1, 'rgba(6, 9, 15, 0.92)');
    ctx.fillStyle = islandGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.trackRadiusX - 44, this.trackRadiusY - 44, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing island core light
    this.juice.drawRadialFloorLight(ctx, cx, cy, Math.min(this.trackRadiusX, this.trackRadiusY) * 0.45, 'rgba(0, 240, 255, 0.18)', 0.5 + Math.sin(now * 0.003) * 0.25);
    ctx.restore();

    // 1c. Streaming neon current along the racing lane
    ctx.save();
    const dashOffset = (now * 30) % 24;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -dashOffset;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.trackRadiusX - 18, this.trackRadiusY - 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.shadowBlur = 0;
    ctx.restore();

    // 2. Animated Boost Pads (Pulsing Plasma Chevrons)
    ctx.save();
    for (const bp of this.boostPads) {
      this.juice.drawRadialFloorLight(ctx, bp.x, bp.y, 40, '#FFAA00', 0.4);

      ctx.save();
      ctx.translate(bp.x, bp.y);
      ctx.rotate(bp.angle);

      // Pad Backing
      ctx.fillStyle = '#1a1405';
      ctx.strokeStyle = '#FFAA00';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#FFAA00';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(-bp.width / 2, -bp.height / 2, bp.width, bp.height, 4);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Animated Forward Arrow Chevrons
      const shift = (now * 0.005) % 1;
      ctx.strokeStyle = '#FFE066';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = -1; i <= 1; i++) {
        const oy = (i + shift) * 7;
        if (Math.abs(oy) < bp.height / 2 - 3) {
          ctx.beginPath();
          ctx.moveTo(-7, oy + 4);
          ctx.lineTo(0, oy - 4);
          ctx.lineTo(7, oy + 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();

    // 3. Render Hypercars
    this.renderCar(ctx, this.car1);
    this.renderCar(ctx, this.car2);
  }

  private renderCar(ctx: CanvasRenderingContext2D, car: RacerCar) {
    const now = performance.now();
    ctx.save();
    ctx.translate(car.x, car.y);

    // Neon Ground Underglow
    this.juice.drawRadialFloorLight(ctx, 0, 0, 42, car.color, 0.45);

    ctx.rotate(car.angle);

    // Dual Projection Headlights Casting Cones Forward
    ctx.save();
    const lightCone = ctx.createLinearGradient(12, 0, 80, 0);
    lightCone.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    lightCone.addColorStop(0.3, car.color === '#00F0FF' ? 'rgba(0, 240, 255, 0.3)' : 'rgba(255, 60, 100, 0.3)');
    lightCone.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lightCone;
    ctx.beginPath();
    ctx.moveTo(12, -7);
    ctx.lineTo(75, -24);
    ctx.lineTo(75, 24);
    ctx.lineTo(12, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Twin Nitro Boost Plasma Thrusters
    if (car.nitroTimer > 0) {
      const flicker = 1 + Math.sin(now * 0.05) * 0.2;
      ctx.save();
      const flameGrad = ctx.createLinearGradient(-15, 0, -32 * flicker, 0);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.4, '#ff9900');
      flameGrad.addColorStop(1, 'rgba(255, 0, 60, 0)');
      ctx.fillStyle = flameGrad;

      // Left exhaust flame
      ctx.beginPath();
      ctx.moveTo(-15, -5);
      ctx.lineTo(-30 * flicker, -5);
      ctx.lineTo(-15, -2);
      ctx.fill();

      // Right exhaust flame
      ctx.beginPath();
      ctx.moveTo(-15, 2);
      ctx.lineTo(-30 * flicker, 5);
      ctx.lineTo(-15, 5);
      ctx.fill();
      ctx.restore();
    }

    // Heavy Tire Blocks (4 wheels)
    ctx.fillStyle = '#080b10';
    ctx.fillRect(5, -12, 8, 4);   // Front Right
    ctx.fillRect(5, 8, 8, 4);    // Front Left
    ctx.fillRect(-12, -12, 9, 4); // Rear Right
    ctx.fillRect(-12, 8, 9, 4);  // Rear Left

    // Aerodynamic Chassis Body
    const carGrad = ctx.createLinearGradient(-16, 0, 16, 0);
    carGrad.addColorStop(0, '#121722');
    carGrad.addColorStop(0.5, '#1e2638');
    carGrad.addColorStop(1, '#2b364e');
    ctx.fillStyle = carGrad;
    ctx.strokeStyle = car.color;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = car.color;
    ctx.shadowBlur = 12;

    // Sleek Hypercar Silhouette
    ctx.beginPath();
    ctx.moveTo(16, 0);          // Nose tip
    ctx.lineTo(12, -7);         // Front wing R
    ctx.lineTo(3, -9);          // Side pod R
    ctx.lineTo(-14, -9);        // Rear pod R
    ctx.lineTo(-16, -6);        // Rear wing end R
    ctx.lineTo(-16, 6);         // Rear wing end L
    ctx.lineTo(-14, 9);         // Rear pod L
    ctx.lineTo(3, 9);           // Side pod L
    ctx.lineTo(12, 7);          // Front wing L
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // High-Gloss Cockpit Glass Canopy
    const glassGrad = ctx.createLinearGradient(-5, -4, 6, 4);
    glassGrad.addColorStop(0, '#ffffff');
    glassGrad.addColorStop(0.3, car.color);
    glassGrad.addColorStop(1, '#0b1017');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.roundRect(-4, -5, 11, 10, 3);
    ctx.fill();

    // Carbon fiber aerodynamic rear spoiler blade
    ctx.fillStyle = car.color;
    ctx.fillRect(-16, -10, 3, 20);

    ctx.restore();
  }
}
