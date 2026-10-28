import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

export interface QuantumCard {
  id: number;
  symbolId: number;
  label: string;
  color: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isFlipped: boolean;
  isMatched: boolean;
  matchedBy: PlayerIndex | null;
  flipAngle: number; // 0 = face down, Math.PI = face up
  targetFlipAngle: number;
  shakeTime: number;
  matchGlow: number;
}

const SYMBOL_MANIFEST = [
  { id: 0, label: 'LIGHTNING', color: '#00F0FF', icon: '⚡' },
  { id: 1, label: 'CRYSTAL', color: '#E024FF', icon: '💎' },
  { id: 2, label: 'HELIX', color: '#00FF66', icon: '🧬' },
  { id: 3, label: 'AEGIS', color: '#FFB800', icon: '🛡️' },
  { id: 4, label: 'ORB', color: '#FF0055', icon: '🔮' },
  { id: 5, label: 'CROWN', color: '#FFD700', icon: '👑' },
  { id: 6, label: 'REACTOR', color: '#38BDF8', icon: '⚛️' },
  { id: 7, label: 'WARP', color: '#F43F5E', icon: '🚀' },
  { id: 99, label: 'WILD STAR', color: '#FFD700', icon: '⭐' },
];

export class ChromaPairs extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'chroma_pairs',
    title: 'Chroma Pairs Duel',
    subtitle: 'Quantum Hologram Match 1v1',
    category: 'Memory Quantum',
    icon: '🃏',
    targetScore: 3,
    timeLimitSec: 90,
    instructionsP1: 'Tap cards on your turn to find matching pairs',
    instructionsP2: 'Tap cards on your turn to find matching pairs'
  };

  public cards: QuantumCard[] = [];
  public activePlayer: PlayerIndex = 1;
  public firstFlippedIdx: number | null = null;
  public secondFlippedIdx: number | null = null;

  public p1Pairs: number = 0;
  public p2Pairs: number = 0;
  public comboStreak: number = 0;

  public turnTimer: number = 8.0;
  public readonly TURN_LIMIT: number = 8.0;
  public mismatchTimer: number = 0;
  // Live arena dims (checkPairMatch needs them for celebration FX coordinates)
  private arenaW: number = 420;
  private arenaH: number = 840;

  // Active lightning link effect between newly matched pair
  private matchLink: { c1: number; c2: number; timer: number; color: string } | null = null;

  // AI bot memory map: card index -> symbolId
  public botMemory: Map<number, number> = new Map();
  public botDecisionTimer: number = 0;

  public init(width: number, height: number): void {
    this.targetScore = 3; // First to win 3 full clearing rounds
    this.resetRound(width, height);
  }

  public resetRound(width: number, height: number): void {
    this.cards = [];
    this.firstFlippedIdx = null;
    this.secondFlippedIdx = null;
    this.mismatchTimer = 0;
    this.matchLink = null;
    this.turnTimer = this.TURN_LIMIT;
    this.comboStreak = 0;
    this.p1Pairs = 0;
    this.p2Pairs = 0;
    this.activePlayer = 1;
    this.botMemory.clear();
    this.botDecisionTimer = 0.6;

    // Create 7 regular pairs (14 cards) + 2 Wild Star cards (2 cards = 16 cards total)
    const cardPool: number[] = [];
    for (let i = 0; i < 7; i++) {
      cardPool.push(i, i);
    }
    cardPool.push(8, 8); // Wild Star index 8 (symbolId: 99)

    // Shuffle pool with Fisher-Yates
    for (let i = cardPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardPool[i], cardPool[j]] = [cardPool[j], cardPool[i]];
    }

    // Calculate grid geometry (4 columns x 4 rows)
    const cols = 4;
    const rows = 4;
    const marginX = 16;
    const availableWidth = width - marginX * 2;
    const cardWidth = Math.min(84, (availableWidth - (cols - 1) * 8) / cols);
    const cardHeight = Math.min(104, cardWidth * 1.25);
    const gridWidth = cols * cardWidth + (cols - 1) * 8;
    const gridHeight = rows * cardHeight + (rows - 1) * 8;

    const startX = (width - gridWidth) / 2;
    const startY = (height - gridHeight) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const sym = SYMBOL_MANIFEST[cardPool[idx]];
        this.cards.push({
          id: idx,
          symbolId: sym.id,
          label: sym.label,
          color: sym.color,
          icon: sym.icon,
          x: startX + c * (cardWidth + 8),
          y: startY + r * (cardHeight + 8),
          width: cardWidth,
          height: cardHeight,
          isFlipped: false,
          isMatched: false,
          matchedBy: null,
          flipAngle: 0,
          targetFlipAngle: 0,
          shakeTime: 0,
          matchGlow: 0
        });
      }
    }
  }

  public updateGame(dt: number, width: number, height: number): void {
    this.arenaW = width;
    this.arenaH = height;
    // 1. Update Card 3D Flip Interpolations & Glows
    for (const card of this.cards) {
      if (card.shakeTime > 0) card.shakeTime -= dt * 4;
      if (card.matchGlow > 0) card.matchGlow = Math.max(0, card.matchGlow - dt * 2);

      const diff = card.targetFlipAngle - card.flipAngle;
      if (Math.abs(diff) > 0.01) {
        card.flipAngle += diff * Math.min(1.0, 16 * dt);
      } else {
        card.flipAngle = card.targetFlipAngle;
      }
    }

    // 2. Update Lightning Match Link Effect
    if (this.matchLink) {
      this.matchLink.timer -= dt;
      if (this.matchLink.timer <= 0) {
        this.matchLink = null;
      }
    }

    // 3. Handle Mismatch Waiting Period
    if (this.mismatchTimer > 0) {
      this.mismatchTimer -= dt;
      if (this.mismatchTimer <= 0) {
        // Flip back mismatched cards
        if (this.firstFlippedIdx !== null) {
          this.cards[this.firstFlippedIdx].isFlipped = false;
          this.cards[this.firstFlippedIdx].targetFlipAngle = 0;
        }
        if (this.secondFlippedIdx !== null) {
          this.cards[this.secondFlippedIdx].isFlipped = false;
          this.cards[this.secondFlippedIdx].targetFlipAngle = 0;
        }
        this.firstFlippedIdx = null;
        this.secondFlippedIdx = null;
        this.switchTurn();
      }
      return; // Freeze user interaction while showing error
    }

    // 4. Update Turn Timer (Pass turn on timeout)
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.audio.playMemoryError();
      this.juice.addTrauma(0.15);
      if (this.firstFlippedIdx !== null) {
        this.cards[this.firstFlippedIdx].isFlipped = false;
        this.cards[this.firstFlippedIdx].targetFlipAngle = 0;
        this.firstFlippedIdx = null;
      }
      this.switchTurn();
      return;
    }

    // 5. Handle AI Bot Turn
    if (this.progression.getGameMode() === 'vs_ai' && this.activePlayer === 2) {
      this.updateBot(dt);
      return;
    }

    // 6. Handle Human Touch Input
    this.handleHumanTouch(width, height);
  }

  private handleHumanTouch(width: number, height: number) {
    void width;
    void height;
    const touches = this.input.getTouches();
    for (const touch of touches) {
      if (touch.phase !== 'began') continue;

      // Allow tapping any card across the board during the active human turn

      // Check card hit
      for (let i = 0; i < this.cards.length; i++) {
        const card = this.cards[i];
        if (card.isMatched || card.isFlipped) continue;

        if (
          touch.rawX >= card.x &&
          touch.rawX <= card.x + card.width &&
          touch.rawY >= card.y &&
          touch.rawY <= card.y + card.height
        ) {
          this.flipCard(i);
          break;
        }
      }
    }
  }

  public flipCard(cardIndex: number) {
    if (this.mismatchTimer > 0) return;
    const card = this.cards[cardIndex];
    if (!card || card.isMatched || card.isFlipped) return;

    card.isFlipped = true;
    card.targetFlipAngle = Math.PI; // 180° flip to reveal face
    this.audio.playCardFlip();

    // Store in AI memory
    this.botMemory.set(cardIndex, card.symbolId);

    if (this.firstFlippedIdx === null) {
      this.firstFlippedIdx = cardIndex;
    } else if (this.secondFlippedIdx === null && this.firstFlippedIdx !== cardIndex) {
      this.secondFlippedIdx = cardIndex;
      this.checkPairMatch();
    }
  }

  private checkPairMatch() {
    if (this.firstFlippedIdx === null || this.secondFlippedIdx === null) return;
    const c1 = this.cards[this.firstFlippedIdx];
    const c2 = this.cards[this.secondFlippedIdx];

    const isWild = c1.symbolId === 99 || c2.symbolId === 99;
    if (c1.symbolId === c2.symbolId || isWild) {
      // MATCH SUCCESS!
      c1.isMatched = true;
      c2.isMatched = true;
      c1.matchedBy = this.activePlayer;
      c2.matchedBy = this.activePlayer;
      c1.matchGlow = 1.0;
      c2.matchGlow = 1.0;

      this.comboStreak++;
      const bonus = (this.comboStreak > 1 ? 2 : 1) + (isWild ? 1 : 0);
      if (this.activePlayer === 1) this.p1Pairs += bonus;
      else this.p2Pairs += bonus;

      this.audio.playPairMatch();
      this.juice.addTrauma(0.35);

      // Trigger high-voltage lightning link
      this.matchLink = {
        c1: this.firstFlippedIdx,
        c2: this.secondFlippedIdx,
        timer: 0.55,
        color: isWild ? '#FFD700' : c1.color
      };

      // Emit celebratory quantum particles
      this.juice.emitExplosion(c1.x + c1.width / 2, c1.y + c1.height / 2, isWild ? '#FFD700' : c1.color, 24);
      this.juice.emitExplosion(c2.x + c2.width / 2, c2.y + c2.height / 2, isWild ? '#FFD700' : c2.color, 24);

      // Reset selection and give player another turn!
      this.firstFlippedIdx = null;
      this.secondFlippedIdx = null;
      this.turnTimer = this.TURN_LIMIT;

      // Check if all 8 pairs are cleared
      const remaining = this.cards.filter(c => !c.isMatched);
      if (remaining.length === 0) {
        const roundWinner: PlayerIndex = this.p1Pairs >= this.p2Pairs ? 1 : 2;
        this.triggerPointScore(roundWinner, this.arenaW, this.arenaH);
      }
    } else {
      // MISMATCH!
      this.comboStreak = 0;
      c1.shakeTime = 1.0;
      c2.shakeTime = 1.0;
      this.audio.playMemoryError();
      this.juice.addTrauma(0.2);
      this.mismatchTimer = 0.75; // Brief reveal before hiding
    }
  }

  private switchTurn() {
    this.activePlayer = this.activePlayer === 1 ? 2 : 1;
    this.turnTimer = this.TURN_LIMIT;
    this.comboStreak = 0;
    this.botDecisionTimer = 0.55;
  }

  private updateBot(dt: number) {
    this.botDecisionTimer -= dt;
    if (this.botDecisionTimer > 0) return;

    const diff = this.progression.getAIDifficulty();
    const delay = diff === 'hard' ? 0.35 : diff === 'medium' ? 0.6 : 0.9;
    this.botDecisionTimer = delay;

    const unrevealedIndices = this.cards
      .map((c, i) => (!c.isMatched && !c.isFlipped ? i : -1))
      .filter(i => i !== -1);

    if (unrevealedIndices.length === 0) return;

    // BOT DECISION LOGIC:
    // If bot has already flipped first card, check if it remembers where the matching pair is!
    if (this.firstFlippedIdx !== null && this.secondFlippedIdx === null) {
      const targetSymbol = this.cards[this.firstFlippedIdx].symbolId;
      let matchIdx: number | null = null;

      for (const [idx, symId] of this.botMemory.entries()) {
        if (idx !== this.firstFlippedIdx && symId === targetSymbol && !this.cards[idx].isMatched && !this.cards[idx].isFlipped) {
          matchIdx = idx;
          break;
        }
      }

      // Memory retention check based on difficulty
      const recallChance = diff === 'hard' ? 1.0 : diff === 'medium' ? 0.75 : 0.4;
      if (matchIdx !== null && Math.random() < recallChance) {
        this.flipCard(matchIdx);
      } else {
        // Pick random unrevealed card
        const randIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
        this.flipCard(randIdx);
      }
    } else if (this.firstFlippedIdx === null) {
      // First card flip: does bot know of ANY complete pair from memory?
      let knownPair: [number, number] | null = null;
      const seenSymbols = new Map<number, number>();

      for (const [idx, symId] of this.botMemory.entries()) {
        if (this.cards[idx].isMatched || this.cards[idx].isFlipped) continue;
        if (seenSymbols.has(symId)) {
          knownPair = [seenSymbols.get(symId)!, idx];
          break;
        } else {
          seenSymbols.set(symId, idx);
        }
      }

      const pairRecallChance = diff === 'hard' ? 0.95 : diff === 'medium' ? 0.65 : 0.3;
      if (knownPair !== null && Math.random() < pairRecallChance) {
        this.flipCard(knownPair[0]);
      } else {
        const randIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
        this.flipCard(randIdx);
      }
    }
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const now = performance.now();

    // 0. Ambient holographic sparkles drifting across the field
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const px = (i * 93.7 + now * 0.01) % width;
      const py = (i * 57.3 + Math.sin(now * 0.002 + i) * 40) % height;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(now * 0.005 + i * 1.9));
      ctx.fillStyle = `rgba(255, 255, 255, ${tw * 0.38})`;
      ctx.fillRect(px, py, 1.6, 1.6);
    }
    ctx.restore();

    // 1. Render Face-to-Face Turn Banners
    this.renderPlayerBanners(ctx, width, height, isDay);

    // 2. Render Cards Grid with 3D Holographic Flip
    for (const card of this.cards) {
      this.renderCard(ctx, card, isDay);
    }

    // 3. Render High-Voltage Lightning Arc Link
    if (this.matchLink) {
      const c1 = this.cards[this.matchLink.c1];
      const c2 = this.cards[this.matchLink.c2];
      this.renderLightningArc(ctx, c1.x + c1.width / 2, c1.y + c1.height / 2, c2.x + c2.width / 2, c2.y + c2.height / 2, this.matchLink.color);
    }
  }

  private renderCard(ctx: CanvasRenderingContext2D, card: QuantumCard, isDay: boolean) {
    const now = performance.now();
    ctx.save();
    const cx = card.x + card.width / 2;
    const cy = card.y + card.height / 2;
    ctx.translate(cx, cy);

    // Gentle levitation bob for matched cards
    if (card.isMatched) {
      ctx.translate(0, Math.sin(now * 0.004 + card.x * 0.015) * 2.6);
    }

    // Card shake on mismatch
    if (card.shakeTime > 0) {
      const shakeX = Math.sin(card.shakeTime * 30) * 4;
      ctx.translate(shakeX, 0);
    }

    // Dynamic Floor Light under active/matched cards
    if (card.isMatched || card.isFlipped) {
      this.juice.drawRadialFloorLight(ctx, 0, 0, card.width * 0.85, card.color, 0.35);
    }

    // 3D Flip Scale around Y-axis
    const cosAngle = Math.cos(card.flipAngle);
    ctx.scale(Math.abs(cosAngle) || 0.02, 1);

    const isFaceUp = card.flipAngle > Math.PI / 2;
    const w = card.width;
    const h = card.height;

    // Outer glow for matched or active card
    if (card.isMatched) {
      const pColor = card.matchedBy === 1 ? '#FF0055' : '#0084FF';
      ctx.shadowColor = pColor;
      ctx.shadowBlur = 18;
    } else if (card.isFlipped) {
      ctx.shadowColor = card.color;
      ctx.shadowBlur = 14;
    }

    // Draw Rounded Card Chassis
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 12);

    if (isFaceUp) {
      // --- CARD FACE (Holographic Crystalline Shard) ---
      const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      if (isDay) {
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.6, '#F1F5F9');
        grad.addColorStop(1, '#E2E8F0');
      } else {
        grad.addColorStop(0, '#1c2438');
        grad.addColorStop(0.6, '#111726');
        grad.addColorStop(1, '#0b0f19');
      }
      ctx.fillStyle = grad;
      ctx.fill();

      // Prismatic iridescent reflection band across the face
      ctx.save();
      ctx.clip();
      const sheenShift = ((now * 0.001) % 1) * (w + h) - w;
      const sheenGrad = ctx.createLinearGradient(sheenShift, -h / 2, sheenShift + 40, h / 2);
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();

      // Metallic Beveled Rim
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = card.color;
      ctx.stroke();

      // Cyber Visor Brackets on card corners
      this.juice.drawCyberVisorBracket(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, card.color);

      // Card Face Icon & Title
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '32px sans-serif';
      ctx.fillText(card.icon, 0, -8);

      // Holographic Subtitle Pill
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 8, h / 2 - 24, w - 16, 16, 8);
      ctx.fill();

      ctx.font = '900 9px monospace';
      ctx.fillStyle = card.color;
      ctx.fillText(card.label.toUpperCase(), 0, h / 2 - 16);

      // Match Player Ring
      if (card.isMatched) {
        const pColor = card.matchedBy === 1 ? '#FF0055' : '#0084FF';
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      // --- CARD BACK (Ultra-Luxury Iridescent Quantum Sigil) ---
      const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      if (isDay) {
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(0.5, '#e2e8f0');
        grad.addColorStop(1, '#cbd5e1');
      } else {
        grad.addColorStop(0, '#1c253b');
        grad.addColorStop(0.5, '#121828');
        grad.addColorStop(1, '#090d16');
      }
      ctx.fillStyle = grad;
      ctx.fill();

      // Gold / Platinum Rim Bevel
      const rimGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      rimGrad.addColorStop(0, '#ffd700');
      rimGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.3)');
      rimGrad.addColorStop(1, '#00f0ff');
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Central Quantum Circuit Pattern
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.35)' : 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-w * 0.28, -h * 0.28, w * 0.56, h * 0.56);

      // Rotating central micro-sigil
      ctx.save();
      ctx.rotate(now * 0.001);
      ctx.strokeStyle = isDay ? '#0084FF' : '#00F0FF';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Glowing Center Quantum Core
      const coreGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 6);
      coreGrad.addColorStop(0, '#FFFFFF');
      coreGrad.addColorStop(0.5, '#00F0FF');
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderPlayerBanners(ctx: CanvasRenderingContext2D, width: number, height: number, isDay: boolean) {
    const isAi = this.progression.getGameMode() === 'vs_ai';

    // --- P2 Top Banner (Rotated 180° for Face-to-Face local play) ---
    ctx.save();
    ctx.translate(width / 2, 65);
    ctx.rotate(Math.PI);

    this.drawPlayerBannerContent(
      ctx,
      2,
      isAi ? 'CYBER BOT' : 'PLAYER 2',
      this.p2Pairs,
      this.activePlayer === 2,
      isDay
    );
    ctx.restore();

    // --- P1 Bottom Banner (Normal Orientation) ---
    ctx.save();
    ctx.translate(width / 2, height - 65);
    this.drawPlayerBannerContent(
      ctx,
      1,
      'PLAYER 1',
      this.p1Pairs,
      this.activePlayer === 1,
      isDay
    );
    ctx.restore();
  }

  private drawPlayerBannerContent(
    ctx: CanvasRenderingContext2D,
    player: PlayerIndex,
    title: string,
    score: number,
    isActive: boolean,
    isDay: boolean
  ) {
    const pColor = player === 1 ? '#FF0055' : '#0084FF';
    const bgWidth = 260;
    const bgHeight = 44;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 14);

    if (isActive) {
      const bannerGrad = ctx.createLinearGradient(-bgWidth / 2, 0, bgWidth / 2, 0);
      bannerGrad.addColorStop(0, isDay ? 'rgba(255, 255, 255, 0.95)' : 'rgba(28, 36, 52, 0.95)');
      bannerGrad.addColorStop(1, isDay ? 'rgba(240, 246, 255, 0.9)' : 'rgba(16, 22, 34, 0.9)');
      ctx.fillStyle = bannerGrad;
      ctx.strokeStyle = pColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = pColor;
      ctx.shadowBlur = 14;
    } else {
      ctx.fillStyle = isDay ? 'rgba(240, 244, 250, 0.65)' : 'rgba(14, 18, 28, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
    }

    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 12px monospace';
    ctx.fillStyle = isActive ? pColor : (isDay ? '#64748B' : '#94A3B8');
    ctx.fillText(`${isActive ? '⚡ ' : ''}${title}`, -bgWidth / 2 + 16, 0);

    // Score Badges
    ctx.textAlign = 'right';
    ctx.font = '900 14px monospace';
    ctx.fillStyle = pColor;
    ctx.fillText(`${score} PAIRS`, bgWidth / 2 - 16, 0);

    // Turn Timer Bar inside banner if active
    if (isActive) {
      const timerProgress = Math.max(0, this.turnTimer / this.TURN_LIMIT);
      ctx.fillStyle = pColor;
      ctx.fillRect(-bgWidth / 2 + 16, bgHeight / 2 - 3, (bgWidth - 32) * timerProgress, 3);
    }

    ctx.restore();
  }

  private renderLightningArc(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;

    const segments = 10;
    ctx.beginPath();
    ctx.moveTo(x1, y1);

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const lx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 16;
      const ly = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 16;
      ctx.lineTo(lx, ly);
    }

    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
}
