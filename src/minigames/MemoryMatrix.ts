import { BaseMinigame } from './BaseMinigame';
import { MinigameMetadata, PlayerIndex } from '../core/types';

interface MatrixNode {
  id: number;
  row: number;
  col: number;
  label: string;
  color: string;
}

export class MemoryMatrix extends BaseMinigame {
  public readonly meta: MinigameMetadata = {
    id: 'memory_matrix',
    title: 'Neon Memory Matrix',
    subtitle: 'High-Speed Pattern Duel',
    category: 'Memory Speed',
    icon: '🧠',
    targetScore: 3,
    timeLimitSec: 60,
    instructionsP1: 'Memorize pattern and tap nodes in order',
    instructionsP2: 'Memorize pattern and tap nodes in order'
  };

  // 3x3 Node Layout
  public readonly NODES: MatrixNode[] = [
    { id: 0, row: 0, col: 0, label: 'α', color: '#00F0FF' },
    { id: 1, row: 0, col: 1, label: 'β', color: '#38BDF8' },
    { id: 2, row: 0, col: 2, label: 'γ', color: '#818CF8' },
    { id: 3, row: 1, col: 0, label: 'δ', color: '#E024FF' },
    { id: 4, row: 1, col: 1, label: 'Ω', color: '#FF0055' },
    { id: 5, row: 1, col: 2, label: 'λ', color: '#F43F5E' },
    { id: 6, row: 2, col: 0, label: 'μ', color: '#FFB800' },
    { id: 7, row: 2, col: 1, label: 'θ', color: '#FBBF24' },
    { id: 8, row: 2, col: 2, label: 'Σ', color: '#00FF66' },
  ];

  public phase: 'flash' | 'recall' | 'round_end' = 'flash';
  public sequence: number[] = [];
  public sequenceLength: number = 4;

  // Flash phase animation
  public flashStep: number = 0;
  public flashTimer: number = 0;
  public readonly STEP_DURATION: number = 0.5;
  public isNodeLit: boolean = false;

  // Player recall progress
  public p1Progress: number = 0;
  public p2Progress: number = 0;
  public p1Error: boolean = false;
  public p2Error: boolean = false;
  public recallTimer: number = 10.0;

  // Visual activation states
  private p1NodeGlows: number[] = new Array(9).fill(0);
  private p2NodeGlows: number[] = new Array(9).fill(0);

  // AI bot tracking
  public botDecisionTimer: number = 0;

  public init(width: number, height: number): void {
    this.targetScore = 3;
    this.sequenceLength = 4;
    this.resetRound(width, height);
  }

  public resetRound(_width: number, _height: number): void {
    this.phase = 'flash';
    this.flashStep = 0;
    this.flashTimer = 0.4;
    this.isNodeLit = false;
    this.p1Progress = 0;
    this.p2Progress = 0;
    this.p1Error = false;
    this.p2Error = false;
    this.recallTimer = 10.0;
    this.p1NodeGlows.fill(0);
    this.p2NodeGlows.fill(0);
    this.botDecisionTimer = 0.5;

    // Mutator scaling (Turbo speeds up flash)
    const mutators = this.progression.getMutators();
    const effectiveLen = mutators.turboSpeed ? this.sequenceLength + 1 : this.sequenceLength;

    // Generate random sequence of length
    this.sequence = [];
    for (let i = 0; i < effectiveLen; i++) {
      this.sequence.push(Math.floor(Math.random() * 9));
    }
  }

  public updateGame(dt: number, width: number, height: number): void {
    // Fade node glows
    for (let i = 0; i < 9; i++) {
      if (this.p1NodeGlows[i] > 0) this.p1NodeGlows[i] = Math.max(0, this.p1NodeGlows[i] - dt * 3);
      if (this.p2NodeGlows[i] > 0) this.p2NodeGlows[i] = Math.max(0, this.p2NodeGlows[i] - dt * 3);
    }

    if (this.phase === 'flash') {
      this.updateFlashPhase(dt);
      return;
    }

    if (this.phase === 'recall') {
      this.updateRecallPhase(dt, width, height);
    }
  }

  private updateFlashPhase(dt: number) {
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      if (this.isNodeLit) {
        // Unlight current node, wait brief interval
        this.isNodeLit = false;
        this.flashTimer = 0.15;
        this.flashStep++;

        if (this.flashStep >= this.sequence.length) {
          // Flash phase complete, start simultaneous recall race!
          this.phase = 'recall';
          this.recallTimer = 10.0;
          this.audio.playCountdown(true);
        }
      } else {
        // Light up next node in sequence
        this.isNodeLit = true;
        this.flashTimer = 0.45;
        const nodeId = this.sequence[this.flashStep];
        this.audio.playMemoryTone(nodeId);
        this.p1NodeGlows[nodeId] = 1.0;
        this.p2NodeGlows[nodeId] = 1.0;
        this.juice.addTrauma(0.06);
      }
    }
  }

  private updateRecallPhase(dt: number, width: number, height: number) {
    this.recallTimer -= dt;
    if (this.recallTimer <= 0) {
      // Timeout: reset round
      this.audio.playMemoryError();
      this.resetRound(width, height);
      return;
    }

    // AI bot input for P2
    if (this.progression.getGameMode() === 'vs_ai' && !this.p2Error) {
      this.updateBotRecall(dt, width, height);
    }

    // Human Touch input
    this.handleRecallTouches(width, height);
  }

  private handleRecallTouches(width: number, height: number) {
    const touches = this.input.getTouches();

    for (const touch of touches) {
      if (touch.phase !== 'began') continue;

      if (touch.player === 1 && !this.p1Error) {
        const nodeId = this.getNodeAtTouch(touch.rawX, touch.rawY, 1, width, height);
        if (nodeId !== null) {
          this.processPlayerTap(1, nodeId, width, height);
        }
      } else if (touch.player === 2 && !this.p2Error && this.progression.getGameMode() === 'local_2p') {
        const nodeId = this.getNodeAtTouch(touch.rawX, touch.rawY, 2, width, height);
        if (nodeId !== null) {
          this.processPlayerTap(2, nodeId, width, height);
        }
      }
    }
  }

  public processPlayerTap(player: PlayerIndex, nodeId: number, width: number, height: number) {
    const currentProg = player === 1 ? this.p1Progress : this.p2Progress;
    const expectedNode = this.sequence[currentProg];

    if (nodeId === expectedNode) {
      // Correct tap!
      this.audio.playMemoryTone(nodeId);
      if (player === 1) {
        this.p1NodeGlows[nodeId] = 1.0;
        this.p1Progress++;
        if (this.p1Progress >= this.sequence.length) {
          // P1 WINS ROUND!
          this.audio.playSequenceSuccess();
          this.juice.addTrauma(0.4);
          this.sequenceLength = Math.min(8, this.sequenceLength + 1);
          this.triggerPointScore(1, width, height);
        }
      } else {
        this.p2NodeGlows[nodeId] = 1.0;
        this.p2Progress++;
        if (this.p2Progress >= this.sequence.length) {
          // P2 WINS ROUND!
          this.audio.playSequenceSuccess();
          this.juice.addTrauma(0.4);
          this.sequenceLength = Math.min(8, this.sequenceLength + 1);
          this.triggerPointScore(2, width, height);
        }
      }
    } else {
      // Incorrect tap!
      this.audio.playMemoryError();
      this.juice.addTrauma(0.25);
      if (player === 1) {
        this.p1Error = true;
        // If P1 errors, P2 gets a huge chance or wins if both error
        if (this.p2Error) {
          this.resetRound(width, height);
        }
      } else {
        this.p2Error = true;
        if (this.p1Error) {
          this.resetRound(width, height);
        }
      }
    }
  }

  private updateBotRecall(dt: number, width: number, height: number) {
    this.botDecisionTimer -= dt;
    if (this.botDecisionTimer > 0) return;

    const diff = this.progression.getAIDifficulty();
    const delay = diff === 'hard' ? 0.24 : diff === 'medium' ? 0.38 : 0.55;
    this.botDecisionTimer = delay;

    const expectedNode = this.sequence[this.p2Progress];
    const errorProb = diff === 'hard' ? 0.0 : diff === 'medium' ? 0.12 : 0.28;

    let chosenNode = expectedNode;
    if (Math.random() < errorProb) {
      chosenNode = (expectedNode + 1 + Math.floor(Math.random() * 8)) % 9;
    }

    this.processPlayerTap(2, chosenNode, width, height);
  }

  private getNodeAtTouch(rawX: number, rawY: number, player: PlayerIndex, width: number, height: number): number | null {
    const margin = 24;
    const gridDim = Math.min(width - margin * 2, 260);
    const cellSize = gridDim / 3;

    let gridOriginX = (width - gridDim) / 2;
    let gridOriginY = player === 1 ? height - gridDim - 40 : 40;

    if (rawX < gridOriginX || rawX > gridOriginX + gridDim || rawY < gridOriginY || rawY > gridOriginY + gridDim) {
      return null;
    }

    let relX = rawX - gridOriginX;
    let relY = rawY - gridOriginY;

    // P2 is inverted 180°
    if (player === 2) {
      relX = gridDim - relX;
      relY = gridDim - relY;
    }

    const col = Math.floor(relX / cellSize);
    const row = Math.floor(relY / cellSize);

    if (col >= 0 && col < 3 && row >= 0 && row < 3) {
      return row * 3 + col;
    }
    return null;
  }

  public renderGame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isDay = this.progression.getThemePreference() === 'day';
    const now = performance.now();

    // Holographic scan beam during memorize phase
    if (this.phase === 'flash') {
      const t = (now * 0.0012) % 1;
      const sx = width * t;
      ctx.save();
      const scanGrad = ctx.createLinearGradient(sx - 44, 0, sx + 44, 0);
      scanGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.14)');
      scanGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(sx - 44, 0, 88, height);
      ctx.restore();
    }

    // 1. Center Arena Status (Progress & Sequence Indicator)
    this.renderCenterStatus(ctx, width, height, isDay);

    // 2. Render P2 Matrix (Top Half, 180° rotated for Face-to-Face)
    ctx.save();
    ctx.translate(width / 2, 170);
    ctx.rotate(Math.PI);
    this.renderMatrixGrid(ctx, 2, this.p2Progress, this.p2Error, this.p2NodeGlows, isDay);
    ctx.restore();

    // 3. Render P1 Matrix (Bottom Half, Normal Orientation)
    ctx.save();
    ctx.translate(width / 2, height - 170);
    this.renderMatrixGrid(ctx, 1, this.p1Progress, this.p1Error, this.p1NodeGlows, isDay);
    ctx.restore();
  }

  private renderMatrixGrid(
    ctx: CanvasRenderingContext2D,
    player: PlayerIndex,
    progress: number,
    isError: boolean,
    glows: number[],
    isDay: boolean
  ) {
    const now = performance.now();
    const gridDim = 250;
    const cellSize = (gridDim - 16) / 3;
    const half = gridDim / 2;
    const pColor = player === 1 ? '#FF0055' : '#0084FF';

    // Dynamic Floor Light
    this.juice.drawRadialFloorLight(ctx, 0, 0, gridDim * 0.65, isError ? '#FF0033' : pColor, 0.35);

    // Frame backdrop (High-Tech Armored Matrix Chamber)
    const frameGrad = ctx.createLinearGradient(-half, -half, half, half);
    if (isDay) {
      frameGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
      frameGrad.addColorStop(1, 'rgba(241, 245, 249, 0.96)');
    } else {
      frameGrad.addColorStop(0, 'rgba(24, 32, 48, 0.94)');
      frameGrad.addColorStop(1, 'rgba(12, 17, 26, 0.94)');
    }
    ctx.fillStyle = frameGrad;
    ctx.strokeStyle = isError ? '#FF0033' : (isDay ? 'rgba(30, 50, 90, 0.15)' : 'rgba(255, 255, 255, 0.12)');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-half, -half, gridDim, gridDim, 16);
    ctx.fill();
    ctx.stroke();

    // Cyber Visor Brackets on grid corners
    this.juice.drawCyberVisorBracket(ctx, -half + 6, -half + 6, gridDim - 12, gridDim - 12, isError ? '#FF0033' : pColor);

    // Glowing Conduit Grid Traces connecting nodes
    ctx.save();
    ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.12)' : 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 2;
    for (let c = 0; c < 3; c++) {
      const lineX = -half + 8 + c * (cellSize + 4) + cellSize / 2;
      ctx.beginPath();
      ctx.moveTo(lineX, -half + 20);
      ctx.lineTo(lineX, half - 20);
      ctx.stroke();
    }
    for (let r = 0; r < 3; r++) {
      const lineY = -half + 8 + r * (cellSize + 4) + cellSize / 2;
      ctx.beginPath();
      ctx.moveTo(-half + 20, lineY);
      ctx.lineTo(half - 20, lineY);
      ctx.stroke();
    }
    ctx.restore();

    // Draw 9 Bioluminescent Nodes
    for (const node of this.NODES) {
      const nx = -half + 8 + node.col * (cellSize + 4) + cellSize / 2;
      const ny = -half + 8 + node.row * (cellSize + 4) + cellSize / 2;
      const glowAmt = glows[node.id];
      const isGlowing = glowAmt > 0.05;
      const nodeR = cellSize * 0.42;

      ctx.save();
      ctx.translate(nx, ny);

      // Expanding Harmonic Ripple Wave when glowing
      if (isGlowing) {
        const rippleR = nodeR * (1 + (1 - glowAmt) * 0.8);
        ctx.strokeStyle = node.color;
        ctx.globalAlpha = glowAmt * 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, rippleR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      } else {
        // Idle breathing halo on unlit nodes
        const breath = 0.5 + 0.5 * Math.sin(now * 0.003 + node.id * 1.7);
        ctx.strokeStyle = pColor;
        ctx.globalAlpha = (isDay ? 0.06 : 0.08) + breath * (isDay ? 0.07 : 0.11);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, nodeR + 4 + breath * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // 3D Beveled Outer Ring
      ctx.beginPath();
      ctx.arc(0, 0, nodeR, 0, Math.PI * 2);

      if (isGlowing) {
        const nodeGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, nodeR);
        nodeGrad.addColorStop(0, '#FFFFFF');
        nodeGrad.addColorStop(0.4, node.color);
        nodeGrad.addColorStop(1, '#0c121e');
        ctx.fillStyle = nodeGrad;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 22;
      } else {
        const idleGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, nodeR);
        if (isDay) {
          idleGrad.addColorStop(0, '#FFFFFF');
          idleGrad.addColorStop(0.7, '#E2E8F0');
          idleGrad.addColorStop(1, '#CBD5E1');
        } else {
          idleGrad.addColorStop(0, '#1c253b');
          idleGrad.addColorStop(0.7, '#101726');
          idleGrad.addColorStop(1, '#080d16');
        }
        ctx.fillStyle = idleGrad;
        ctx.shadowBlur = 0;
      }
      ctx.fill();

      // Node Rim Bevel
      ctx.strokeStyle = isGlowing ? '#FFFFFF' : (isDay ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)');
      ctx.lineWidth = isGlowing ? 2.5 : 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Node Glyph
      ctx.font = '900 17px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isGlowing ? '#FFFFFF' : (isDay ? '#334155' : '#94A3B8');
      ctx.fillText(node.label, 0, 1);

      ctx.restore();
    }

    // High-Tech LED Progress Bars below grid
    const totalDotW = (this.sequence.length - 1) * 18;
    for (let i = 0; i < this.sequence.length; i++) {
      const dotX = -totalDotW / 2 + i * 18;
      const isLit = i < progress;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(dotX - 5, half + 10, 10, 5, 2);
      if (isLit) {
        ctx.fillStyle = pColor;
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = isDay ? '#CBD5E1' : '#27354a';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.restore();
    }
  }

  private renderCenterStatus(ctx: CanvasRenderingContext2D, width: number, height: number, isDay: boolean) {
    const cy = height / 2;
    const now = performance.now();
    ctx.save();

    // High-Tech Holographic Center HUD Pod
    const podW = 230;
    const podH = 46;

    const podGrad = ctx.createLinearGradient(0, cy - podH / 2, 0, cy + podH / 2);
    podGrad.addColorStop(0, isDay ? 'rgba(255, 255, 255, 0.95)' : 'rgba(22, 29, 44, 0.95)');
    podGrad.addColorStop(1, isDay ? 'rgba(240, 245, 255, 0.9)' : 'rgba(12, 17, 28, 0.9)');
    ctx.fillStyle = podGrad;

    const statusColor = this.phase === 'flash' ? '#FF9900' : '#00F0FF';
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.roundRect(width / 2 - podW / 2, cy - podH / 2, podW, podH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Corner visors on pod
    this.juice.drawCyberVisorBracket(ctx, width / 2 - podW / 2 + 4, cy - podH / 2 + 4, podW - 8, podH - 8, statusColor);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px monospace';

    if (this.phase === 'flash') {
      const pulse = 0.8 + Math.sin(now * 0.008) * 0.2;
      ctx.fillStyle = `rgba(255, 153, 0, ${pulse})`;
      ctx.fillText(`👀 MEMORIZE (${this.flashStep + 1}/${this.sequence.length})`, width / 2, cy);
    } else {
      ctx.fillStyle = statusColor;
      ctx.fillText(`⚡ RECALL! (${Math.ceil(this.recallTimer)}s)`, width / 2, cy);
    }

    ctx.restore();
  }
}
