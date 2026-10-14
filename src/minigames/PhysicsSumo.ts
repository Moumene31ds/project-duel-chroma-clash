import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface RagdollBone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetOffsetX: number;
  targetOffsetY: number;
}

interface SumoFighter {
  player: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  mass: number;
  isCharging: boolean;
  chargeTime: number;
  lungeTimer: number;
  isStunned: boolean;
  stunTimer: number;
  isBurning: boolean;
  // Ragdoll spring nodes
  head: RagdollBone;
  leftArm: RagdollBone;
  rightArm: RagdollBone;
}

export class PhysicsSumo extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'physics_sumo',
    title: 'Physics Brawl: Sumo',
    subtitle: 'Active Ragdoll Momentum Clash',
    category: 'Physics Ragdoll',
    icon: '🤼',
    targetScore: 3,
    timeLimitSec: 90,
    instructionsP1: 'Hold to charge, drag to aim & lunge!',
    instructionsP2: 'Hold to charge, drag to aim & lunge!'
  };

  private fighter1!: SumoFighter;
  private fighter2!: SumoFighter;

  // Concentric arena radius and collapse mechanics
  private arenaMaxRadius: number = 240;
  private currentArenaRadius: number = 240;
  private arenaCollapseStage: number = 0; // 0 = Full, 1 = Warning outer, 2 = Collapsed outer
  private matchElapsed: number = 0;
  // Live arena center (set every updateGame; replaces the old 420x840 constants)
  private arenaCX: number = 210;
  private arenaCY: number = 420;

  public init(width: number, height: number): void {
    this.arenaMaxRadius = Math.min(width, height) * 0.42;
    this.currentArenaRadius = this.arenaMaxRadius;

    this.fighter1 = this.createFighter(1, width / 2, height / 2 + 100);
    this.fighter2 = this.createFighter(2, width / 2, height / 2 - 100);

    this.resetRound(width, height);
  }

  private createFighter(player: PlayerIndex, x: number, y: number): SumoFighter {
    return {
      player,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: player === 1 ? -Math.PI / 2 : Math.PI / 2,
      mass: 1.0,
      isCharging: false,
      chargeTime: 0,
      lungeTimer: 0,
      isStunned: false,
      stunTimer: 0,
      isBurning: false,
      head: { x, y: y - 18, vx: 0, vy: 0, radius: 14, targetOffsetX: 0, targetOffsetY: -18 },
      leftArm: { x: x - 22, y: y + 5, vx: 0, vy: 0, radius: 10, targetOffsetX: -22, targetOffsetY: 5 },
      rightArm: { x: x + 22, y: y + 5, vx: 0, vy: 0, radius: 10, targetOffsetX: 22, targetOffsetY: 5 }
    };
  }

  public resetRound(width: number, height: number): void {
    this.arenaMaxRadius = Math.min(width, height) * 0.42;
    this.currentArenaRadius = this.arenaMaxRadius;
    this.arenaCollapseStage = 0;
    this.matchElapsed = 0;

    this.resetFighter(this.fighter1, width / 2, height / 2 + 110, -Math.PI / 2);
    this.resetFighter(this.fighter2, width / 2, height / 2 - 110, Math.PI / 2);
  }

  private resetFighter(f: SumoFighter, x: number, y: number, angle: number) {
    f.x = x;
    f.y = y;
    f.vx = 0;
    f.vy = 0;
    f.angle = angle;
    f.mass = 1.0;
    f.isCharging = false;
    f.chargeTime = 0;
    f.lungeTimer = 0;
    f.isStunned = false;
    f.stunTimer = 0;
    f.isBurning = false;

    this.updateBonesInstant(f);
  }

  private updateBonesInstant(f: SumoFighter) {
    const cos = Math.cos(f.angle + Math.PI / 2);
    const sin = Math.sin(f.angle + Math.PI / 2);

    const rotate = (ox: number, oy: number) => ({
      x: f.x + (ox * cos - oy * sin),
      y: f.y + (ox * sin + oy * cos)
    });

    const h = rotate(f.head.targetOffsetX, f.head.targetOffsetY);
    f.head.x = h.x; f.head.y = h.y; f.head.vx = 0; f.head.vy = 0;

    const la = rotate(f.leftArm.targetOffsetX, f.leftArm.targetOffsetY);
    f.leftArm.x = la.x; f.leftArm.y = la.y; f.leftArm.vx = 0; f.leftArm.vy = 0;

    const ra = rotate(f.rightArm.targetOffsetX, f.rightArm.targetOffsetY);
    f.rightArm.x = ra.x; f.rightArm.y = ra.y; f.rightArm.vx = 0; f.rightArm.vy = 0;
  }

  public updateGame(dt: number, width: number, height: number): void {
    const arenaCenterX = width / 2;
    const arenaCenterY = height / 2;
    this.arenaCX = arenaCenterX;
    this.arenaCY = arenaCenterY;

    this.matchElapsed += dt;

    // Arena Collapse progression (T > 10s warning, T > 14s collapse)
    if (this.matchElapsed > 14.0) {
      this.arenaCollapseStage = 2;
      this.currentArenaRadius = Math.max(this.arenaMaxRadius * 0.65, this.currentArenaRadius - 25 * dt);
    } else if (this.matchElapsed > 10.0) {
      this.arenaCollapseStage = 1; // Flashing warning
    }

    // Process inputs
    this.processFighterInput(this.fighter1, 1, dt, width, height);
    if (this.progression.getGameMode() === 'vs_ai') {
      this.botAI.updatePhysicsSumo(
        this.fighter2,
        this.fighter1,
        this.progression.getAIDifficulty(),
        dt,
        arenaCenterX,
        arenaCenterY,
        this.currentArenaRadius,
        (f) => this.executeLunge(f as typeof this.fighter2)
      );
    } else {
      this.processFighterInput(this.fighter2, 2, dt, width, height);
    }

    // Update Physics & Spring Damper ragdoll joints
    this.stepFighterPhysics(this.fighter1, dt);
    this.stepFighterPhysics(this.fighter2, dt);

    // Body-to-Body Collision
    this.resolveFighterCollision(this.fighter1, this.fighter2);

    // Check Ring-Out against Arena Radius
    this.checkRingOut(this.fighter1, arenaCenterX, arenaCenterY, 2, width, height);
    this.checkRingOut(this.fighter2, arenaCenterX, arenaCenterY, 1, width, height);

    // Charge / high-momentum dust kick particles
    for (const f of [this.fighter1, this.fighter2]) {
      if (f.isCharging && Math.random() < 0.45) {
        this.juice.emitSparks(f.x + (Math.random() - 0.5) * 34, f.y + 20, f.player === 1 ? '#FF0055' : '#0084FF', 1, 55, 0.25);
      } else if (Math.hypot(f.vx, f.vy) > 300 && Math.random() < 0.28) {
        this.juice.emitSparks(f.x - f.vx * 0.02, f.y - f.vy * 0.02, '#94A3B8', 1, 90, 0.2);
      }
    }
  }

  private processFighterInput(f: SumoFighter, player: PlayerIndex, dt: number, _width: number, _height: number) {
    if (f.isStunned || f.isBurning) {
      f.stunTimer -= dt;
      if (f.stunTimer <= 0) f.isStunned = false;
      return;
    }

    const touches = this.input.getTouchesForPlayer(player);
    const kb = player === 1 ? this.input.keyboardP1 : this.input.keyboardP2;

    if (touches.length > 0) {
      const t = touches[0];
      const targetArenaX = t.rawX;
      const targetArenaY = t.rawY;

      const dx = targetArenaX - f.x;
      const dy = targetArenaY - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 15) {
        f.angle = Math.atan2(dy, dx);
      }

      if (t.phase === 'moved' || t.phase === 'began') {
        f.isCharging = true;
        f.chargeTime = Math.min(1.2, f.chargeTime + dt);
      }

      if (t.phase === 'ended' || t.phase === 'canceled') {
        this.executeLunge(f);
      }
    } else if (kb.x !== 0 || kb.y !== 0 || kb.actionA) {
      // Keyboard desktop fallback
      if (kb.x !== 0 || kb.y !== 0) {
        f.angle = Math.atan2(kb.y, kb.x);
      }
      if (kb.actionA) {
        f.isCharging = true;
        f.chargeTime = Math.min(1.2, f.chargeTime + dt);
      } else if (f.isCharging) {
        this.executeLunge(f);
      }
    } else {
      if (f.isCharging) {
        this.executeLunge(f);
      }
    }
  }

  private executeLunge(f: SumoFighter) {
    const isMegaSlam = f.chargeTime >= 1.0;
    const chargeRatio = Math.max(0.3, f.chargeTime / 1.2);
    const lungeForce = (450 + chargeRatio * 750) * (isMegaSlam ? 1.65 : 1.0);

    f.vx += Math.cos(f.angle) * lungeForce;
    f.vy += Math.sin(f.angle) * lungeForce;

    f.mass = 1.0 + chargeRatio * 3.5; // Massive inertia during lunge!
    f.lungeTimer = 0.45;
    f.isCharging = false;
    f.chargeTime = 0;

    if (isMegaSlam) {
      this.audio.playHyperShot();
      this.juice.addTrauma(0.5);
      this.juice.triggerFlash(f.player === 1 ? '#FF0055' : '#00F0FF', 0.35);
      this.juice.triggerShockwave(f.x, f.y, f.player === 1 ? '#FF0055' : '#00F0FF', 160);
    } else {
      this.audio.playSwordSlash();
      this.juice.emitSparks(f.x, f.y, f.player === 1 ? '#FF0055' : '#00F0FF', 10, 200, 0.2);
    }
  }

  private stepFighterPhysics(f: SumoFighter, dt: number) {
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    // Linear drag
    f.vx *= (1.0 - 4.5 * dt);
    f.vy *= (1.0 - 4.5 * dt);

    if (f.lungeTimer > 0) {
      f.lungeTimer -= dt;
      if (f.lungeTimer <= 0) {
        f.mass = 1.0;
      }
    }

    // Spring-Damper Ragdoll Limbs
    const cos = Math.cos(f.angle + Math.PI / 2);
    const sin = Math.sin(f.angle + Math.PI / 2);

    const updateSpringJoint = (bone: RagdollBone) => {
      const targetWorldX = f.x + (bone.targetOffsetX * cos - bone.targetOffsetY * sin);
      const targetWorldY = f.y + (bone.targetOffsetX * sin + bone.targetOffsetY * cos);

      const kSpring = 180;
      const dDamping = 14;

      const fx = -kSpring * (bone.x - targetWorldX) - dDamping * bone.vx;
      const fy = -kSpring * (bone.y - targetWorldY) - dDamping * bone.vy;

      bone.vx += fx * dt;
      bone.vy += fy * dt;
      bone.x += bone.vx * dt;
      bone.y += bone.vy * dt;
    };

    updateSpringJoint(f.head);
    updateSpringJoint(f.leftArm);
    updateSpringJoint(f.rightArm);
  }

  private resolveFighterCollision(f1: SumoFighter, f2: SumoFighter) {
    const dx = f2.x - f1.x;
    const dy = f2.y - f1.y;
    const distSq = dx * dx + dy * dy;
    const radius = 28;
    const minDist = radius * 2;

    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;

      // Position push-out
      const overlap = minDist - dist;
      f1.x -= nx * overlap * 0.5;
      f1.y -= ny * overlap * 0.5;
      f2.x += nx * overlap * 0.5;
      f2.y += ny * overlap * 0.5;

      // Momentum-based impulse transfer
      const rvx = f2.vx - f1.vx;
      const rvy = f2.vy - f1.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const restitution = 0.85;
        const impulseMagnitude = -(1 + restitution) * velAlongNormal / (1 / f1.mass + 1 / f2.mass);

        const impulseX = nx * impulseMagnitude;
        const impulseY = ny * impulseMagnitude;

        f1.vx -= impulseX / f1.mass;
        f1.vy -= impulseY / f1.mass;
        f2.vx += impulseX / f2.mass;
        f2.vy += impulseY / f2.mass;

        // Displace ragdoll limbs violently on impact
        f1.head.vx -= impulseX * 0.6;
        f1.head.vy -= impulseY * 0.6;
        f2.head.vx += impulseX * 0.6;
        f2.head.vy += impulseY * 0.6;

        this.audio.playSumoClash();
        this.juice.addTrauma(0.35);
        this.juice.emitExplosion((f1.x + f2.x) / 2, (f1.y + f2.y) / 2, '#FFAA00', 20);

        // EX Arena Rim Fracture on Heavy Impact
        if (impulseMagnitude > 750) {
          const clashX = (f1.x + f2.x) / 2;
          const clashY = (f1.y + f2.y) / 2;
          const distToCenter = Math.sqrt((clashX - this.arenaCX) ** 2 + (clashY - this.arenaCY) ** 2);

          if (distToCenter > this.currentArenaRadius * 0.6) {
            this.currentArenaRadius = Math.max(90, this.currentArenaRadius - 14);
            this.audio.playDestructionCrumble();
            this.juice.emitExplosion(clashX, clashY, '#FF3300', 28);
            this.juice.addTrauma(0.4);
          }
        }
      }
    }
  }

  private checkRingOut(f: SumoFighter, cx: number, cy: number, scorer: PlayerIndex, width: number, height: number) {
    if (f.isBurning) return;
    const dx = f.x - cx;
    const dy = f.y - cy;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    if (distFromCenter > this.currentArenaRadius) {
      f.isBurning = true;
      this.juice.emitExplosion(f.x, f.y, '#FF3300', 36);
      this.triggerPointScore(scorer, width, height);
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    const now = performance.now() * 0.002;

    // 1. Magma Abyss Hazard Background Outside Ring
    ctx.save();
    const abyss = ctx.createRadialGradient(cx, cy, this.currentArenaRadius, cx, cy, width * 0.8);
    abyss.addColorStop(0, '#2D0A07');
    abyss.addColorStop(0.5, '#1A0504');
    abyss.addColorStop(1, '#080101');
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, width, height);

    // Dynamic Magma Heat Convection Puddles
    ctx.strokeStyle = '#FF4400';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const angle = now * 0.8 + (i * Math.PI / 4);
      const r = this.currentArenaRadius + 28 + Math.sin(now * 3 + i) * 14;
      const bx = cx + Math.cos(angle) * r;
      const by = cy + Math.sin(angle) * r;
      ctx.globalAlpha = 0.2 + Math.sin(now * 4 + i) * 0.15;
      ctx.beginPath();
      ctx.arc(bx, by, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 2. High-Tech Cyber-Dohyo Sacred Arena Platform
    ctx.save();
    ctx.translate(cx, cy);

    // Molten Rim Fracture Glow
    ctx.strokeStyle = '#FF3300';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#FF3300';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, this.currentArenaRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Solid Titanium Dojo Base
    const dojoGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, this.currentArenaRadius);
    dojoGrad.addColorStop(0, '#1E293B');
    dojoGrad.addColorStop(0.7, '#0F172A');
    dojoGrad.addColorStop(1, '#080C14');
    ctx.fillStyle = dojoGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.currentArenaRadius, 0, Math.PI * 2);
    ctx.fill();

    // Perimeter Neon Laser Ring
    ctx.strokeStyle = '#00FFA3';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00FFA3';
    ctx.shadowBlur = 12;
    ctx.stroke();

    // Collapse-stage threat ring (rotating hazard chevrons)
    const stageColor =
      this.arenaCollapseStage === 2 ? '#FF3300'
      : this.arenaCollapseStage === 1 ? '#FFAA00'
      : 'rgba(0, 255, 163, 0.55)';
    ctx.save();
    ctx.rotate(now * (this.arenaCollapseStage === 2 ? 2.2 : 0.9));
    ctx.setLineDash([26 - this.arenaCollapseStage * 6, 18]);
    ctx.strokeStyle = stageColor;
    ctx.lineWidth = 5;
    ctx.shadowColor = stageColor;
    ctx.shadowBlur = this.arenaCollapseStage === 2 ? 22 : 14;
    ctx.beginPath();
    ctx.arc(0, 0, this.currentArenaRadius + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Stadium crowd light specks just outside the ring
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const a = i * 0.24 + now * 0.15;
      const r = this.currentArenaRadius + 62 + Math.sin(now * 2 + i) * 6;
      const lx = Math.cos(a) * r;
      const ly = Math.sin(a) * r;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(now * 3.1 + i * 1.3));
      ctx.fillStyle = i % 2 === 0 ? `rgba(255, 220, 120, ${tw * 0.5})` : `rgba(255, 255, 255, ${tw * 0.35})`;
      ctx.fillRect(lx - 1.2, ly - 1.2, 2.4, 2.4);
    }
    ctx.restore();

    // Sacred Concentric Circuit Inscriptions
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.currentArenaRadius * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(0, 0, this.currentArenaRadius * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // Center Cross-Hash Combat Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-25, -15);
    ctx.lineTo(25, -15);
    ctx.moveTo(-25, 15);
    ctx.lineTo(25, 15);
    ctx.stroke();

    ctx.restore();

    // 3. Render Mecha-Sumo Titans
    const p1Col = this.progression.getSkinColors(1);
    const p2Col = this.progression.getSkinColors(2);

    this.renderFighterRagdoll(ctx, this.fighter1, p1Col.primary, p1Col.secondary, now);
    this.renderFighterRagdoll(ctx, this.fighter2, p2Col.primary, p2Col.secondary, now);
  }

  private renderFighterRagdoll(ctx: CanvasRenderingContext2D, f: SumoFighter, col1: string, col2: string, time: number) {
    ctx.save();

    // Dynamic Floor Glow
    this.juice.drawRadialFloorLight(ctx, f.x, f.y, 65, col1, 0.4);

    // High-Velocity / Charging Energy Aura
    if (f.isCharging || Math.hypot(f.vx, f.vy) > 300) {
      ctx.strokeStyle = col1;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = col1;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 34 + Math.sin(time * 8) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Heavy Spiked Mecha Arms
    this.renderMechaFist(ctx, f.leftArm.x, f.leftArm.y, f.leftArm.radius, col1, col2);
    this.renderMechaFist(ctx, f.rightArm.x, f.rightArm.y, f.rightArm.radius, col1, col2);

    // Torso: Heavy Beveled Cyber Armor Chassis
    ctx.save();
    ctx.translate(f.x, f.y);

    const torsoGrad = ctx.createLinearGradient(-26, -26, 26, 26);
    torsoGrad.addColorStop(0, '#334155');
    torsoGrad.addColorStop(0.5, '#0F172A');
    torsoGrad.addColorStop(1, '#020617');
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();

    // Armored Outer Bevel Ring
    ctx.strokeStyle = col1;
    ctx.lineWidth = 4;
    ctx.shadowColor = col1;
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Center Energy Core Reactor
    ctx.fillStyle = col2;
    ctx.shadowColor = col2;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mecha Head & Tracking Visor Eyes
    ctx.save();
    ctx.translate(f.head.x, f.head.y);

    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = col1;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, f.head.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Dynamic Visor Eye pointing towards angle
    const eyeX = Math.cos(f.angle) * 6;
    const eyeY = Math.sin(f.angle) * 6;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = col1;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private renderMechaFist(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col1: string, col2: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = col2;
    ctx.strokeStyle = col1;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = col1;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spiked knuckle cap
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
