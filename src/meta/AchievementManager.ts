export interface Achievement {
  id: string;
  title: string;
  desc: string;
  unlocked: boolean;
  at?: number;
}

const KEY = 'duel_achievements_v1';

const DEFS: Omit<Achievement, 'unlocked'>[] = [
  { id: 'first_blood', title: 'First Blood', desc: 'Win your first match' },
  { id: 'streak_3', title: 'Hat Trick', desc: 'Win 3 matches in a row' },
  { id: 'explorer', title: 'Explorer', desc: 'Play 5 different minigames' },
  { id: 'completionist', title: 'Completionist', desc: 'Play all 20 minigames' },
  { id: 'speed_demon', title: 'Speed Demon', desc: 'Win with Turbo mutator on' },
  { id: 'survivor', title: 'Survivor', desc: 'Win a Sudden Death match' },
  { id: 'gauntlet_clear', title: 'Boss Slayer', desc: 'Clear AI Gauntlet' },
  { id: 'party_king', title: 'Party King', desc: 'Win a Party Board game' },
  { id: 'rhythm_master', title: 'Rhythm Master', desc: 'Score Perfect x10 in Synthwave Rhythm' },
  { id: 'gravity_pro', title: 'Gravity Pro', desc: 'Win Gravity Runner without conceding' },
  { id: 'slicer_pro', title: 'Blade Master', desc: 'Reach 5x combo in Cyber Slicer' },
  { id: 'cyber_samurai', title: 'Cyber Samurai', desc: 'Win a Blade Duel with sub-220ms reaction' },
  { id: 'bomb_squad', title: 'Bomb Squad', desc: 'Rally Cyber Bomb 8 times in a single round' },
  { id: 'daily_warrior', title: 'Daily Warrior', desc: 'Complete a Daily Challenge' }
];

export class AchievementManager {
  private static instance: AchievementManager;
  private map: Map<string, Achievement> = new Map();

  public static getInstance(): AchievementManager {
    if (!AchievementManager.instance) {
      AchievementManager.instance = new AchievementManager();
      AchievementManager.instance.load();
    }
    return AchievementManager.instance;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Achievement[]) : [];
      const byId = new Map(saved.map(a => [a.id, a]));
      for (const d of DEFS) {
        const s = byId.get(d.id);
        this.map.set(d.id, s ?? { ...d, unlocked: false });
      }
    } catch {
      for (const d of DEFS) this.map.set(d.id, { ...d, unlocked: false });
    }
  }

  public list(): Achievement[] {
    return [...this.map.values()];
  }

  public unlock(id: string): boolean {
    const a = this.map.get(id);
    if (!a || a.unlocked) return false;
    a.unlocked = true;
    a.at = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.list())); } catch { /* noop */ }
    return true;
  }

  public isUnlocked(id: string): boolean {
    return this.map.get(id)?.unlocked ?? false;
  }

  public reset(): void {
    for (const a of this.map.values()) { a.unlocked = false; delete a.at; }
    try { localStorage.setItem(KEY, JSON.stringify(this.list())); } catch { /* noop */ }
  }
}
