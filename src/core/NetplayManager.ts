import { MinigameId, PlayerIndex } from './types';

// Simulated online netplay: room codes + BroadcastChannel for same-network tabs
// + WebRTC scaffolding stub for future signaling server.
export interface NetplayRoom {
  code: string;
  host: string;
  minigame: MinigameId;
  createdAt: number;
}

export class NetplayManager {
  private static instance: NetplayManager;
  private channel: BroadcastChannel | null = null;
  private currentRoom: NetplayRoom | null = null;
  private latencyMs = 0;
  public onRemoteInput: ((player: PlayerIndex, data: { x: number; y: number }) => void) | null = null;

  public static getInstance(): NetplayManager {
    if (!NetplayManager.instance) NetplayManager.instance = new NetplayManager();
    return NetplayManager.instance;
  }

  public createRoom(minigame: MinigameId, host = 'PLAYER 1'): NetplayRoom {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.currentRoom = { code, host, minigame, createdAt: Date.now() };
    this.openChannel(code);
    try { localStorage.setItem('duel_netplay_room', JSON.stringify(this.currentRoom)); } catch { /* noop */ }
    return this.currentRoom;
  }

  public joinRoom(code: string): NetplayRoom | null {
    const normalized = code.trim().toUpperCase();
    try {
      const saved = localStorage.getItem('duel_netplay_room');
      if (saved) {
        const room = JSON.parse(saved) as NetplayRoom;
        if (room.code === normalized) {
          this.currentRoom = room;
          this.openChannel(normalized);
          return room;
        }
      }
    } catch { /* noop */ }
    // allow join anyway (offline simulation): create ghost room
    this.currentRoom = { code: normalized, host: 'REMOTE', minigame: 'cyber_hockey', createdAt: Date.now() };
    this.openChannel(normalized);
    return this.currentRoom;
  }

  public leaveRoom(): void {
    this.channel?.close();
    this.channel = null;
    this.currentRoom = null;
  }

  public getRoom(): NetplayRoom | null {
    return this.currentRoom;
  }

  public sendInput(player: PlayerIndex, x: number, y: number): void {
    if (!this.channel) return;
    const t0 = performance.now();
    this.channel.postMessage({ type: 'input', player, x, y, t0 });
    this.latencyMs = performance.now() - t0;
  }

  public getLatency(): number {
    return Math.round(this.latencyMs);
  }

  private openChannel(code: string): void {
    try {
      this.channel?.close();
      this.channel = new BroadcastChannel(`duel_room_${code}`);
      this.channel.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; player: PlayerIndex; x: number; y: number };
        if (msg?.type === 'input' && this.onRemoteInput) this.onRemoteInput(msg.player, { x: msg.x, y: msg.y });
      };
    } catch {
      this.channel = null;
    }
  }

  public static isValidCode(code: string): boolean {
    return /^[A-Z0-9]{4,6}$/.test(code.trim().toUpperCase());
  }
}
