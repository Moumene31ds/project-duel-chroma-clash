import { GameMutators, MinigameId } from '../core/types';

export interface DailyChallenge {
  date: string;
  minigame: MinigameId;
  mutators: Partial<GameMutators>;
  targetScore: number;
  seed: number;
  title: string;
}

const GAMES: MinigameId[] = [
  'cyber_hockey', 'physics_sumo', 'tactical_tanks', 'counter_dash',
  'laser_drift', 'neon_orbit', 'chroma_pairs', 'memory_matrix',
  'cyber_simon', 'cyber_hoops', 'laser_pinball', 'chroma_reaction',
  'neon_volley', 'quantum_tug', 'astro_blast', 'cyber_slicer',
  'synthwave_rhythm', 'gravity_runner', 'neon_blade', 'cyber_bomb'
];

// Deterministic daily pick from date string (no server needed)
export class DailyChallengeManager {
  public static todayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  public static hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  public static getDaily(date = DailyChallengeManager.todayKey()): DailyChallenge {
    const seed = DailyChallengeManager.hashStr(`duel-${date}`);
    const minigame = GAMES[seed % GAMES.length];
    const mutators: Partial<GameMutators> = {};
    if (seed % 3 === 0) mutators.turboSpeed = true;
    if (seed % 5 === 0) mutators.suddenDeath = true;
    if (seed % 7 === 0) mutators.lowGravity = true;
    return {
      date,
      minigame,
      mutators,
      targetScore: seed % 4 === 0 ? 3 : 5,
      seed,
      title: `Daily Clash ${date}`
    };
  }

  public static getWeekly(date = new Date()): DailyChallenge[] {
    const out: DailyChallenge[] = [];
    const base = new Date(date);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - base.getDay() + i);
      out.push(DailyChallengeManager.getDaily(d.toISOString().split('T')[0]));
    }
    return out;
  }
}
