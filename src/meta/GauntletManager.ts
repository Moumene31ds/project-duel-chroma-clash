import { GauntletState, GauntletStage, MinigameId, PlayerIndex } from '../core/types';

export class GauntletManager {
  private state: GauntletState;

  constructor() {
    this.state = this.initNewGauntlet();
  }

  public initNewGauntlet(): GauntletState {
    const minigamePool: MinigameId[] = [
      'neon_volley',
      'cyber_hockey',
      'physics_sumo',
      'quantum_tug',
      'astro_blast',
      'counter_dash',
      'laser_drift',
      'cyber_hoops',
      'neon_blade',
      'cyber_bomb'
    ];

    // Pick 5 distinct random minigames for this gauntlet run
    const shuffled = [...minigamePool].sort(() => Math.random() - 0.5);

    const stages: GauntletStage[] = [
      {
        stageNumber: 1,
        bossName: 'SPARK-01',
        bossTitle: 'Novice Synthetica',
        minigame: shuffled[0],
        difficulty: 'easy',
        rewardCoins: 25,
        rewardTrophies: 15,
        completed: false
      },
      {
        stageNumber: 2,
        bossName: 'VECTOR-9',
        bossTitle: 'Adaptive Sentinel',
        minigame: shuffled[1],
        difficulty: 'medium',
        rewardCoins: 50,
        rewardTrophies: 30,
        completed: false
      },
      {
        stageNumber: 3,
        bossName: 'KINETIC TITAN',
        bossTitle: 'Vanguard Striker',
        minigame: shuffled[2],
        difficulty: 'medium',
        rewardCoins: 75,
        rewardTrophies: 45,
        completed: false
      },
      {
        stageNumber: 4,
        bossName: 'NEXUS VIPER',
        bossTitle: 'Cyber Assassin',
        minigame: shuffled[3],
        difficulty: 'hard',
        rewardCoins: 100,
        rewardTrophies: 60,
        completed: false
      },
      {
        stageNumber: 5,
        bossName: 'CHROMA OVERLORD',
        bossTitle: 'The Celestial AI Master',
        minigame: shuffled[4],
        difficulty: 'hard',
        rewardCoins: 200,
        rewardTrophies: 120,
        completed: false
      }
    ];

    this.state = {
      currentStageIndex: 0,
      totalStages: 5,
      livesRemaining: 3,
      maxLives: 3,
      score: 0,
      isCompleted: false,
      isGameOver: false,
      stages
    };

    return this.state;
  }

  public getState(): GauntletState {
    return this.state;
  }

  public getCurrentStage(): GauntletStage | null {
    if (this.state.isCompleted || this.state.isGameOver) return null;
    return this.state.stages[this.state.currentStageIndex] || null;
  }

  public resolveStageMatch(winner: PlayerIndex): { advanced: boolean; gameOver: boolean; completed: boolean } {
    // Terminal states are final: ignore repeat calls so score can't be farmed
    // and lives can't go negative (also guards out-of-bounds stage access).
    if (this.state.isCompleted || this.state.isGameOver) {
      return { advanced: false, gameOver: this.state.isGameOver, completed: this.state.isCompleted };
    }
    if (winner === 1) {
      // Player won!
      const current = this.state.stages[this.state.currentStageIndex];
      current.completed = true;
      const stageMultiplier = 1 + this.state.currentStageIndex * 0.5;
      this.state.score += Math.round((1000 + current.rewardCoins * 10) * stageMultiplier);

      if (this.state.currentStageIndex >= this.state.totalStages - 1) {
        this.state.isCompleted = true;
        return { advanced: false, gameOver: false, completed: true };
      } else {
        this.state.currentStageIndex++;
        return { advanced: true, gameOver: false, completed: false };
      }
    } else {
      // Bot won -> Player loses a life
      this.state.livesRemaining--;
      if (this.state.livesRemaining <= 0) {
        this.state.isGameOver = true;
        return { advanced: false, gameOver: true, completed: false };
      }
      return { advanced: false, gameOver: false, completed: false };
    }
  }

  public revive(): boolean {
    if (this.state.isGameOver) {
      this.state.isGameOver = false;
      this.state.livesRemaining = 1;
      return true;
    }
    return false;
  }
}

