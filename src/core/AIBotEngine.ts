import { AIDifficulty, Vector2 } from './types';
import { botProfile, botMakesMistake } from './BotDifficulty';

export class AIBotEngine {
  private reactionTimer: number = 0;
  // Frame-safe pending feint (replaces setTimeout: pauses cleanly with the game)
  private feintTimer: number = 0;
  private feintTarget: { state: string } | null = null;
  private feintStrike: ((d: unknown) => void) | null = null;

  public reset() {
    this.reactionTimer = 0;
    this.feintTimer = 0;
    this.feintTarget = null;
    this.feintStrike = null;
  }

  // --- 1. CYBER HOCKEY BOT ---
  public updateCyberHockey(
    botMallet: { x: number; y: number; targetX: number; targetY: number; radius: number },
    pucks: Array<{ x: number; y: number; vx: number; vy: number; radius: number }>,
    difficulty: AIDifficulty,
    dt: number,
    width: number,
    height: number
  ) {
    if (pucks.length === 0) return;
    const puck = pucks[0];
    const prof = botProfile(difficulty);

    const trackSpeed = 640 * prof.speedMul + (difficulty === 'hard' ? 14 : 0);
    const predictAheadSec = prof.predictSec;
    const jitter = (Math.random() - 0.5) * 2 * prof.jitterPx;

    // Predictive puck position
    let predictedX = puck.x + puck.vx * predictAheadSec + jitter;
    predictedX = Math.max(botMallet.radius + 15, Math.min(width - botMallet.radius - 15, predictedX));

    // Defensive default position
    let targetY = height * 0.16;

    // If puck is heading into bot's defensive half
    if (puck.y < height * 0.48) {
      if (puck.vy < 0) {
        // Attack / Strike puck!
        targetY = Math.min(height * 0.42, puck.y + botMallet.radius + 10);
      } else {
        // Return to goal line guard
        targetY = height * 0.15;
      }
    }

    botMallet.targetX += (predictedX - botMallet.targetX) * Math.min(1.0, (trackSpeed / 100) * dt * 3);
    botMallet.targetY += (targetY - botMallet.targetY) * Math.min(1.0, (trackSpeed / 100) * dt * 3);
  }

  // --- 2. PHYSICS SUMO BOT ---
  public updatePhysicsSumo(
    botFighter: { x: number; y: number; angle: number; isCharging: boolean; chargeTime: number; isStunned: boolean },
    playerFighter: { x: number; y: number },
    difficulty: AIDifficulty,
    dt: number,
    centerX: number,
    centerY: number,
    arenaRadius: number,
    executeLunge: (f: unknown) => void
  ) {
    if (botFighter.isStunned) return;

    // Check distance from lava edge
    const dxCenter = botFighter.x - centerX;
    const dyCenter = botFighter.y - centerY;
    const distFromCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);

    if (distFromCenter > arenaRadius * 0.78) {
      // Danger: steer back towards center!
      botFighter.angle = Math.atan2(centerY - botFighter.y, centerX - botFighter.x);
      botFighter.isCharging = true;
      botFighter.chargeTime += dt;
      if (botFighter.chargeTime > 0.4) {
        executeLunge(botFighter);
      }
      return;
    }

    // Aim toward player
    const dx = playerFighter.x - botFighter.x;
    const dy = playerFighter.y - botFighter.y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    let angleToPlayer = Math.atan2(dy, dx);
    if (difficulty === 'easy') {
      angleToPlayer += (Math.random() - 0.5) * 0.5;
    } else if (difficulty === 'medium') {
      angleToPlayer += (Math.random() - 0.5) * 0.15;
    }

    botFighter.angle = angleToPlayer;

    // Charge & lunge decision
    botFighter.isCharging = true;
    botFighter.chargeTime += dt;

    const prof = botProfile(difficulty);
    const chargeThreshold = 1.0 - 0.45 * prof.aggression;
    if (botFighter.chargeTime >= chargeThreshold && distToPlayer < 240) {
      executeLunge(botFighter);
    }
  }

  // --- 3. TACTICAL TANKS BOT ---
  public updateTacticalTanks(
    botTank: { x: number; y: number; angle: number; turretAngle: number; ammo: number; isOverheated: boolean },
    playerTank: { x: number; y: number },
    difficulty: AIDifficulty,
    dt: number,
    fireCannon: (t: unknown) => void
  ) {
    if (botTank.isOverheated) return;

    this.reactionTimer += dt;

    // Aim turret at player
    const dx = playerTank.x - botTank.x;
    const dy = playerTank.y - botTank.y;
    let targetAngle = Math.atan2(dy, dx);

    const prof = botProfile(difficulty);
    if (difficulty !== 'hard') {
      targetAngle += Math.sin(this.reactionTimer * 2) * (difficulty === 'easy' ? 0.4 : 0.18);
    }

    botTank.turretAngle = targetAngle;

    // Tactical positioning: keep medium combat distance
    const dist = Math.sqrt(dx * dx + dy * dy);
    const moveSpeed = 110 * prof.speedMul;
    if (dist > 220) {
      botTank.angle = targetAngle;
      botTank.x += Math.cos(botTank.angle) * moveSpeed * dt;
      botTank.y += Math.sin(botTank.angle) * moveSpeed * dt;
    } else if (dist < 120) {
      // Retreat slightly
      botTank.angle = targetAngle + Math.PI;
      botTank.x += Math.cos(botTank.angle) * moveSpeed * 0.8 * dt;
      botTank.y += Math.sin(botTank.angle) * moveSpeed * 0.8 * dt;
    }

    // Fire decision (easy bots hesitate and flub shots)
    const fireInterval = difficulty === 'hard' ? 1.1 : difficulty === 'medium' ? 1.8 : 2.4;
    if (this.reactionTimer > fireInterval && botTank.ammo > 0) {
      if (!botMakesMistake(difficulty)) fireCannon(botTank);
      this.reactionTimer = 0;
    }
  }

  // --- 4. COUNTER-DASH BOT ---
  public updateCounterDash(
    botDuelist: { state: string; isFeinting: boolean },
    playerDuelist: { state: string },
    difficulty: AIDifficulty,
    dt: number,
    executeAttack: (d: unknown) => void,
    executeParry: (d: unknown) => void
  ) {
    // Resolve a pending hard-AI feint on the game clock (pauses cleanly).
    // Runs before the idle gate: the bot is in 'startup' while baiting.
    if (this.feintTimer > 0) {
      this.feintTimer -= dt;
      if (this.feintTimer <= 0) {
        if (this.feintTarget && this.feintTarget.state === 'startup' && this.feintStrike) {
          this.feintStrike(this.feintTarget);
        }
        this.feintTarget = null;
        this.feintStrike = null;
      }
    }

    if (botDuelist.state !== 'idle') return;

    this.reactionTimer += dt;

    // 1. If player initiates strike (startup), attempt to PARRY!
    if (playerDuelist.state === 'startup') {
      let parryChance = 0.45; // Easy
      if (difficulty === 'medium') parryChance = 0.75;
      if (difficulty === 'hard') parryChance = 0.95;

      if (Math.random() < parryChance && this.reactionTimer > 0.08) {
        executeParry(botDuelist);
        this.reactionTimer = 0;
        return;
      }
    }

    // 2. If player is recovering or parry-whiffed, PUNISH IMMEDIATELY!
    if (playerDuelist.state === 'recovery' || playerDuelist.state === 'parry_whiff') {
      executeAttack(botDuelist);
      this.reactionTimer = 0;
      return;
    }

    // 3. Proactive attacks & Feints
    const attackInterval = difficulty === 'hard' ? 1.0 : difficulty === 'medium' ? 1.6 : 2.2;
    if (this.reactionTimer > attackInterval) {
      executeAttack(botDuelist);
      this.reactionTimer = 0;

      // Hard AI occasionally cancels into a Feint to bait human parry!
      if (difficulty === 'hard' && Math.random() < 0.4) {
        this.feintTimer = 0.12;
        this.feintTarget = botDuelist;
        this.feintStrike = executeAttack;
      }
    }
  }

  // --- 5. LASER DRIFT RACERS BOT ---
  public updateLaserDrift(
    botCar: { x: number; y: number; angle: number; speed: number },
    targetWaypoint: Vector2,
    difficulty: AIDifficulty,
    dt: number
  ) {
    const dx = targetWaypoint.x - botCar.x;
    const dy = targetWaypoint.y - botCar.y;
    const desiredAngle = Math.atan2(dy, dx);

    let diff = desiredAngle - botCar.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    const turnRate = difficulty === 'hard' ? 4.5 : difficulty === 'medium' ? 3.4 : 2.6;
    botCar.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

    const maxSpeed = difficulty === 'hard' ? 380 : difficulty === 'medium' ? 310 : 240;
    botCar.speed = Math.min(maxSpeed, botCar.speed + 180 * dt);
  }

  // --- 6. NEON ORBIT BREAKER BOT ---
  public updateNeonOrbit(
    botPaddle: { targetAngle: number },
    disc: { x: number; y: number; vx: number; vy: number },
    difficulty: AIDifficulty,
    _dt: number,
    centerX: number,
    centerY: number
  ) {
    // Intercept disc orbital angle around center
    const dx = disc.x - centerX;
    const dy = disc.y - centerY;
    let discAngle = Math.atan2(dy, dx);

    const prof = botProfile(difficulty);
    if (prof.jitterPx > 0) {
      // 0.35 rad easy / 0.12 medium / 0 hard — scaled from the shared profile
      discAngle += (Math.random() - 0.5) * (prof.jitterPx / 38) * 0.35;
    }

    botPaddle.targetAngle = Math.max(-0.8 * Math.PI, Math.min(-0.2 * Math.PI, discAngle));
  }

  // --- 7. NEON BLADE DUEL BOT ---
  private bladeBotReactionDelay: number = -1;

  public updateNeonBlade(
    isSignalActive: boolean,
    signalElapsedSec: number,
    difficulty: AIDifficulty,
    onStrike: () => void
  ) {
    if (!isSignalActive) {
      this.bladeBotReactionDelay = -1;
      return;
    }

    if (this.bladeBotReactionDelay < 0) {
      if (difficulty === 'hard') {
        this.bladeBotReactionDelay = 0.18 + Math.random() * 0.05; // 180-230ms
      } else if (difficulty === 'medium') {
        this.bladeBotReactionDelay = 0.26 + Math.random() * 0.07; // 260-330ms
      } else {
        this.bladeBotReactionDelay = 0.38 + Math.random() * 0.10; // 380-480ms
      }
    }

    if (signalElapsedSec >= this.bladeBotReactionDelay) {
      this.bladeBotReactionDelay = 999; // trigger once
      onStrike();
    }
  }

  // --- 8. CYBER BOMB RELAY BOT ---
  public updateCyberBomb(
    botPaddle: { x: number; y: number; targetX: number; targetY: number; width: number },
    bomb: { x: number; y: number; vx: number; vy: number; radius: number },
    difficulty: AIDifficulty,
    dt: number,
    arenaWidth: number,
    arenaHeight: number
  ) {
    const prof = botProfile(difficulty);
    const speed = 550 * prof.speedMul;
    const predictSec = prof.predictSec * 0.8;
    const jitter = (Math.random() - 0.5) * prof.jitterPx * 0.8;

    let targetX = bomb.x + bomb.vx * predictSec + jitter;
    const halfW = botPaddle.width * 0.5;
    targetX = Math.max(halfW + 10, Math.min(arenaWidth - halfW - 10, targetX));

    // Aggressive forward lunge when bomb enters bot zone
    let targetY = arenaHeight * 0.15;
    if (bomb.y < arenaHeight * 0.45 && bomb.vy < 0) {
      targetY = Math.max(arenaHeight * 0.12, Math.min(arenaHeight * 0.32, bomb.y - 15));
    }

    botPaddle.targetX += (targetX - botPaddle.targetX) * Math.min(1.0, (speed / 100) * dt * 3.5);
    botPaddle.targetY += (targetY - botPaddle.targetY) * Math.min(1.0, (speed / 100) * dt * 3.0);
  }
}
