import { MinigameId, PlayerIndex } from './types';

export interface ReplayEvent {
  t: number;
  p: PlayerIndex;
  x: number;
  y: number;
  kind: string;
}

export interface Replay {
  id: string;
  minigame: MinigameId;
  winner: PlayerIndex;
  durationMs: number;
  createdAt: number;
  events: ReplayEvent[];
}

const KEY = 'duel_replays_v1';
const MAX_REPLAYS = 20;

export class ReplayManager {
  private static instance: ReplayManager;
  private recording: ReplayEvent[] = [];
  private startTime = 0;
  private activeMinigame: MinigameId | null = null;

  public static getInstance(): ReplayManager {
    if (!ReplayManager.instance) ReplayManager.instance = new ReplayManager();
    return ReplayManager.instance;
  }

  public startRecording(minigame: MinigameId): void {
    this.activeMinigame = minigame;
    this.recording = [];
    this.startTime = performance.now();
  }

  public record(p: PlayerIndex, x: number, y: number, kind = 'touch'): void {
    if (!this.activeMinigame) return;
    if (this.recording.length > 600) return; // cap
    this.recording.push({ t: Math.round(performance.now() - this.startTime), p, x: Math.round(x), y: Math.round(y), kind });
  }

  public stopAndSave(winner: PlayerIndex): Replay | null {
    if (!this.activeMinigame) return null;
    const replay: Replay = {
      id: `rp_${Date.now().toString(36)}`,
      minigame: this.activeMinigame,
      winner,
      durationMs: Math.round(performance.now() - this.startTime),
      createdAt: Date.now(),
      events: [...this.recording]
    };
    this.activeMinigame = null;
    this.recording = [];
    try {
      const list = this.list();
      list.unshift(replay);
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_REPLAYS)));
    } catch { /* quota */ }
    return replay;
  }

  public list(): Replay[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as Replay[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  public clear(): void {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  }

  public exportReplay(id: string): string | null {
    const r = this.list().find(x => x.id === id);
    return r ? JSON.stringify(r) : null;
  }
}
