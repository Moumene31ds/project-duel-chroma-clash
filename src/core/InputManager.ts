import { TouchInput, PlayerIndex } from './types';
import { GamepadManager } from './GamepadManager';

export class InputManager {
  private element: HTMLElement;
  private deadZoneFraction: number = 0.04; // 4% deadzone at center
  private fingerOwners: Map<number, PlayerIndex> = new Map();
  private activeTouches: Map<number, TouchInput> = new Map();
  private prevPositions: Map<number, { x: number; y: number; time: number }> = new Map();

  private p1Callbacks: Set<(input: TouchInput) => void> = new Set();
  private p2Callbacks: Set<(input: TouchInput) => void> = new Set();

  // Desktop keyboard & gamepad fallback states
  public keyboardP1 = { x: 0, y: 0, actionA: false, actionB: false };
  public keyboardP2 = { x: 0, y: 0, actionA: false, actionB: false };
  public mirrorModeEnabled: boolean = false;
  private gamepadMgr = GamepadManager.getInstance();

  constructor(element: HTMLElement) {
    this.element = element;
    this.setupTouchListeners();
    this.setupMouseListeners();
    this.setupKeyboardListeners();
  }

  public pollGamepads() {
    this.gamepadMgr.poll();
    const gp1 = this.gamepadMgr.getPlayerState(1);
    if (gp1.connected) {
      if (Math.abs(gp1.axisX) > 0.1) this.keyboardP1.x = gp1.axisX;
      if (Math.abs(gp1.axisY) > 0.1) this.keyboardP1.y = gp1.axisY;
      if (gp1.btnA) this.keyboardP1.actionA = true;
      if (gp1.btnB) this.keyboardP1.actionB = true;
    }

    const gp2 = this.gamepadMgr.getPlayerState(2);
    if (gp2.connected) {
      if (Math.abs(gp2.axisX) > 0.1) this.keyboardP2.x = gp2.axisX;
      if (Math.abs(gp2.axisY) > 0.1) this.keyboardP2.y = gp2.axisY;
      if (gp2.btnA) this.keyboardP2.actionA = true;
      if (gp2.btnB) this.keyboardP2.actionB = true;
    }
  }

  public subscribe(player: PlayerIndex, callback: (input: TouchInput) => void): () => void {
    const set = player === 1 ? this.p1Callbacks : this.p2Callbacks;
    set.add(callback);
    return () => set.delete(callback);
  }

  public getTouchesForPlayer(player: PlayerIndex): TouchInput[] {
    const list: TouchInput[] = [];
    for (const touch of this.activeTouches.values()) {
      if (touch.player === player) {
        list.push(touch);
      }
    }
    return list;
  }

  public getTouches(): TouchInput[] {
    return Array.from(this.activeTouches.values());
  }

  private setupTouchListeners() {
    const opts: AddEventListenerOptions = { passive: false };

    this.element.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const rect = this.element.getBoundingClientRect();
      const now = performance.now();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const rawX = t.clientX - rect.left;
        const rawY = t.clientY - rect.top;
        const normY = rawY / rect.height;

        const halfDead = this.deadZoneFraction / 2;
        let owner: PlayerIndex | null = null;

        if (normY > 0.5 + halfDead) {
          owner = 1; // Bottom half -> Player 1
        } else if (normY < 0.5 - halfDead) {
          owner = 2; // Top half -> Player 2
        }

        if (owner !== null) {
          this.fingerOwners.set(t.identifier, owner);
          this.prevPositions.set(t.identifier, { x: rawX, y: rawY, time: now });

          const touchInput = this.createTouchInput(t.identifier, owner, rawX, rawY, rect, 'began', now, 0, 0);
          this.activeTouches.set(t.identifier, touchInput);
          this.dispatch(touchInput);
        }
      }
    }, opts);

    this.element.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      const rect = this.element.getBoundingClientRect();
      const now = performance.now();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const owner = this.fingerOwners.get(t.identifier);
        if (!owner) continue;

        const rawX = t.clientX - rect.left;
        const rawY = t.clientY - rect.top;
        const prev = this.prevPositions.get(t.identifier);

        let vx = 0;
        let vy = 0;
        if (prev) {
          const dt = Math.max((now - prev.time) / 1000, 0.001);
          vx = (rawX - prev.x) / dt;
          vy = (rawY - prev.y) / dt;
          this.prevPositions.set(t.identifier, { x: rawX, y: rawY, time: now });
        }

        const touchInput = this.createTouchInput(t.identifier, owner, rawX, rawY, rect, 'moved', now, vx, vy);
        this.activeTouches.set(t.identifier, touchInput);
        this.dispatch(touchInput);
      }
    }, opts);

    const handleTouchEnd = (e: TouchEvent, phase: 'ended' | 'canceled') => {
      e.preventDefault();
      const rect = this.element.getBoundingClientRect();
      const now = performance.now();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const owner = this.fingerOwners.get(t.identifier);
        if (!owner) continue;

        const rawX = t.clientX - rect.left;
        const rawY = t.clientY - rect.top;
        const prev = this.prevPositions.get(t.identifier);
        let vx = 0;
        let vy = 0;
        if (prev) {
          const dt = Math.max((now - prev.time) / 1000, 0.001);
          vx = (rawX - prev.x) / dt;
          vy = (rawY - prev.y) / dt;
        }

        const touchInput = this.createTouchInput(t.identifier, owner, rawX, rawY, rect, phase, now, vx, vy);
        this.dispatch(touchInput);

        this.fingerOwners.delete(t.identifier);
        this.activeTouches.delete(t.identifier);
        this.prevPositions.delete(t.identifier);
      }
    };

    this.element.addEventListener('touchend', (e) => handleTouchEnd(e, 'ended'), opts);
    this.element.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'canceled'), opts);
  }

  private createTouchInput(
    id: number,
    owner: PlayerIndex,
    rawX: number,
    rawY: number,
    rect: DOMRect,
    phase: 'began' | 'moved' | 'ended' | 'canceled',
    now: number,
    vx: number,
    vy: number
  ): TouchInput {
    let normX = 0;
    let normY = 0;
    let arenaX = 0;
    let arenaY = 0;

    const w = rect.width;
    const h = rect.height;

    if (owner === 1) {
      // Player 1: Bottom half
      normX = Math.max(0, Math.min(1, rawX / w));
      normY = Math.max(0, Math.min(1, (rawY - h * 0.5) / (h * 0.5)));
      arenaX = rawX;
      arenaY = rawY;
    } else {
      // Player 2: Top half rotated 180 degrees
      normX = Math.max(0, Math.min(1, (w - rawX) / w));
      normY = Math.max(0, Math.min(1, ((h * 0.5) - rawY) / (h * 0.5)));
      arenaX = w - rawX;
      arenaY = h - rawY;
      vx = -vx;
      vy = -vy;
    }

    if (this.mirrorModeEnabled) {
      arenaX = w - arenaX;
      vx = -vx;
      normX = 1 - normX;
    }

    return {
      id,
      player: owner,
      normX,
      normY,
      arenaX,
      arenaY,
      rawX,
      rawY,
      vx,
      vy,
      phase,
      startTime: now
    };
  }

  private dispatch(input: TouchInput) {
    const cbs = input.player === 1 ? this.p1Callbacks : this.p2Callbacks;
    for (const cb of cbs) {
      cb(input);
    }
  }

  // Desktop Mouse Emulation for testing
  private setupMouseListeners() {
    let mouseOwner: PlayerIndex | null = null;
    const mouseId = 9999;
    let isMouseDown = false;

    this.element.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = this.element.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const normY = rawY / rect.height;

      if (normY > 0.5) {
        mouseOwner = 1;
      } else {
        mouseOwner = 2;
      }

      isMouseDown = true;
      const now = performance.now();
      this.fingerOwners.set(mouseId, mouseOwner);
      this.prevPositions.set(mouseId, { x: rawX, y: rawY, time: now });

      const touchInput = this.createTouchInput(mouseId, mouseOwner, rawX, rawY, rect, 'began', now, 0, 0);
      this.activeTouches.set(mouseId, touchInput);
      this.dispatch(touchInput);
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isMouseDown || !mouseOwner) return;
      const rect = this.element.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const now = performance.now();
      const prev = this.prevPositions.get(mouseId);

      let vx = 0;
      let vy = 0;
      if (prev) {
        const dt = Math.max((now - prev.time) / 1000, 0.001);
        vx = (rawX - prev.x) / dt;
        vy = (rawY - prev.y) / dt;
        this.prevPositions.set(mouseId, { x: rawX, y: rawY, time: now });
      }

      const touchInput = this.createTouchInput(mouseId, mouseOwner, rawX, rawY, rect, 'moved', now, vx, vy);
      this.activeTouches.set(mouseId, touchInput);
      this.dispatch(touchInput);
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (!isMouseDown || !mouseOwner) return;
      isMouseDown = false;
      const rect = this.element.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const now = performance.now();

      const touchInput = this.createTouchInput(mouseId, mouseOwner, rawX, rawY, rect, 'ended', now, 0, 0);
      this.dispatch(touchInput);

      this.fingerOwners.delete(mouseId);
      this.activeTouches.delete(mouseId);
      this.prevPositions.delete(mouseId);
      mouseOwner = null;
    });
  }

  // Keyboard controls for split testing on desktop
  private setupKeyboardListeners() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Player 1 (WASD + Space/J)
      if (e.code === 'KeyW') this.keyboardP1.y = -1;
      if (e.code === 'KeyS') this.keyboardP1.y = 1;
      if (e.code === 'KeyA') this.keyboardP1.x = -1;
      if (e.code === 'KeyD') this.keyboardP1.x = 1;
      if (e.code === 'Space' || e.code === 'KeyJ') this.keyboardP1.actionA = true;
      if (e.code === 'KeyK') this.keyboardP1.actionB = true;

      // Player 2 (Arrows + Enter/L)
      if (e.code === 'ArrowUp') this.keyboardP2.y = -1;
      if (e.code === 'ArrowDown') this.keyboardP2.y = 1;
      if (e.code === 'ArrowLeft') this.keyboardP2.x = -1;
      if (e.code === 'ArrowRight') this.keyboardP2.x = 1;
      if (e.code === 'Enter' || e.code === 'KeyL') this.keyboardP2.actionA = true;
      if (e.code === 'Quote') this.keyboardP2.actionB = true;
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'KeyW' && this.keyboardP1.y === -1) this.keyboardP1.y = 0;
      if (e.code === 'KeyS' && this.keyboardP1.y === 1) this.keyboardP1.y = 0;
      if (e.code === 'KeyA' && this.keyboardP1.x === -1) this.keyboardP1.x = 0;
      if (e.code === 'KeyD' && this.keyboardP1.x === 1) this.keyboardP1.x = 0;
      if (e.code === 'Space' || e.code === 'KeyJ') this.keyboardP1.actionA = false;
      if (e.code === 'KeyK') this.keyboardP1.actionB = false;

      if (e.code === 'ArrowUp' && this.keyboardP2.y === -1) this.keyboardP2.y = 0;
      if (e.code === 'ArrowDown' && this.keyboardP2.y === 1) this.keyboardP2.y = 0;
      if (e.code === 'ArrowLeft' && this.keyboardP2.x === -1) this.keyboardP2.x = 0;
      if (e.code === 'ArrowRight' && this.keyboardP2.x === 1) this.keyboardP2.x = 0;
      if (e.code === 'Enter' || e.code === 'KeyL') this.keyboardP2.actionA = false;
      if (e.code === 'Quote') this.keyboardP2.actionB = false;
    });
  }
}
