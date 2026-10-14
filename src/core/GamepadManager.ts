import { PlayerIndex } from './types';

export interface GamepadPlayerState {
  connected: boolean;
  id: string;
  axisX: number;
  axisY: number;
  btnA: boolean; // South (Cross / A)
  btnB: boolean; // East (Circle / B)
  btnX: boolean; // West (Square / X)
  btnY: boolean; // North (Triangle / Y)
  triggerL: boolean;
  triggerR: boolean;
}

export class GamepadManager {
  private static instance: GamepadManager;
  private p1State: GamepadPlayerState = this.getEmptyState();
  private p2State: GamepadPlayerState = this.getEmptyState();

  public onGamepadStatusChanged?: (player: PlayerIndex, connected: boolean, id: string) => void;

  private constructor() {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.handleConnection(e.gamepad, true);
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      this.handleConnection(e.gamepad, false);
    });
  }

  public static getInstance(): GamepadManager {
    if (!GamepadManager.instance) {
      GamepadManager.instance = new GamepadManager();
    }
    return GamepadManager.instance;
  }

  private getEmptyState(): GamepadPlayerState {
    return {
      connected: false,
      id: '',
      axisX: 0,
      axisY: 0,
      btnA: false,
      btnB: false,
      btnX: false,
      btnY: false,
      triggerL: false,
      triggerR: false
    };
  }

  private handleConnection(gp: Gamepad, connected: boolean) {
    const player: PlayerIndex = gp.index === 0 ? 1 : 2;
    const state = player === 1 ? this.p1State : this.p2State;
    state.connected = connected;
    state.id = connected ? gp.id : '';

    if (this.onGamepadStatusChanged) {
      this.onGamepadStatusChanged(player, connected, gp.id);
    }
  }

  public poll() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads) return;

    // Gamepad 1 -> Player 1
    if (gamepads[0]) {
      this.updatePlayerState(this.p1State, gamepads[0]);
    } else {
      this.p1State.connected = false;
    }

    // Gamepad 2 -> Player 2
    if (gamepads[1]) {
      this.updatePlayerState(this.p2State, gamepads[1]);
    } else {
      this.p2State.connected = false;
    }
  }

  private updatePlayerState(target: GamepadPlayerState, gp: Gamepad) {
    target.connected = true;
    target.id = gp.id;

    // Deadzone filter for analog sticks
    const deadzone = 0.15;
    let ax = gp.axes[0] || 0;
    let ay = gp.axes[1] || 0;

    if (Math.abs(ax) < deadzone) ax = 0;
    if (Math.abs(ay) < deadzone) ay = 0;

    // D-Pad buttons (typically indices 12: Up, 13: Down, 14: Left, 15: Right)
    const dpadUp = gp.buttons[12]?.pressed || false;
    const dpadDown = gp.buttons[13]?.pressed || false;
    const dpadLeft = gp.buttons[14]?.pressed || false;
    const dpadRight = gp.buttons[15]?.pressed || false;

    if (dpadLeft) ax = -1;
    if (dpadRight) ax = 1;
    if (dpadUp) ay = -1;
    if (dpadDown) ay = 1;

    target.axisX = ax;
    target.axisY = ay;

    // Action buttons
    target.btnA = gp.buttons[0]?.pressed || false; // A / Cross
    target.btnB = gp.buttons[1]?.pressed || false; // B / Circle
    target.btnX = gp.buttons[2]?.pressed || false; // X / Square
    target.btnY = gp.buttons[3]?.pressed || false; // Y / Triangle
    target.triggerL = gp.buttons[4]?.pressed || gp.buttons[6]?.pressed || false;
    target.triggerR = gp.buttons[5]?.pressed || gp.buttons[7]?.pressed || false;
  }

  public getPlayerState(player: PlayerIndex): GamepadPlayerState {
    return player === 1 ? this.p1State : this.p2State;
  }
}
