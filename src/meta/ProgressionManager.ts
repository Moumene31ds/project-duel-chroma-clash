import { 
  RivalryRecord, 
  MinigameId, 
  PlayerIndex, 
  GameMode, 
  AIDifficulty, 
  GameMutators, 
  RankedTier, 
  DailyQuest,
  Language,
  AudioSettings,
  ChassisMode
} from '../core/types';

export class ProgressionManager {
  private readonly STORAGE_KEY = 'project_duel_save_v4';
  private data: RivalryRecord;

  constructor() {
    this.data = this.loadData();
    this.checkDailyQuestsRefresh();
  }

  private getDefaultData(): RivalryRecord {
    const today = new Date().toISOString().split('T')[0];
    return {
      totalMatches: 0,
      p1TotalWins: 0,
      p2TotalWins: 0,
      currentStreakPlayer: 1,
      currentStreakCount: 0,
      trophies: 0,
      currentRank: 'bronze',
      dailyQuests: this.generateDailyQuests(),
      lastQuestDate: today,
      activeTrail: 'default',
      activeFinisher: 'default',
      unlockedTrails: ['default'],
      unlockedFinishers: ['default'],
      avgReactionTimeMs: 240,
      minigameStats: {
        cyber_hockey: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        physics_sumo: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        tactical_tanks: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        counter_dash: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        laser_drift: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        neon_orbit: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        memory_matrix: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        cyber_simon: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        chroma_pairs: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        cyber_hoops: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        laser_pinball: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        chroma_reaction: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        neon_volley: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        quantum_tug: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        astro_blast: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        cyber_slicer: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        synthwave_rhythm: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        gravity_runner: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        neon_blade: { p1Wins: 0, p2Wins: 0, highestStreak: 0 },
        cyber_bomb: { p1Wins: 0, p2Wins: 0, highestStreak: 0 }
      },
      aiStats: {
        easy: { wins: 0, losses: 0 },
        medium: { wins: 0, losses: 0 },
        hard: { wins: 0, losses: 0 }
      },
      coins: 50, // Starting bonus
      unlockedSkins: ['default'],
      activeP1Skin: 'default',
      activeP2Skin: 'default',
      themePreference: 'day',
      currentMode: 'local_2p',
      aiDifficulty: 'medium',
      mutators: {
        turboSpeed: false,
        lowGravity: false,
        chaosSpawns: false,
        suddenDeath: false,
        bouncyArena: false,
        ghostBall: false,
        megaSize: false,
        invertGravity: false,
        mirrorMode: false,
        hyperFever: false
      },
      language: 'ar',
      audioSettings: {
        masterVolume: 0.8,
        sfxVolume: 0.8,
        musicVolume: 0.5,
        hapticsEnabled: true,
        announcerEnabled: true,
        crtScanlines: false
      },
      chassisMode: 'phone',
      gauntletHighScore: 0,
      favoriteMinigames: ['neon_blade', 'cyber_bomb']
    };
  }

  private generateDailyQuests(): DailyQuest[] {
    return [
      {
        id: 'q1',
        title: 'Cyber Gladiator',
        desc: 'Play 3 matches in any minigame',
        target: 3,
        current: 0,
        rewardCoins: 50,
        rewardTrophies: 20,
        completed: false,
        claimed: false
      },
      {
        id: 'q2',
        title: 'Master Tactician',
        desc: 'Win 2 matches against P2 or AI',
        target: 2,
        current: 0,
        rewardCoins: 75,
        rewardTrophies: 30,
        completed: false,
        claimed: false
      },
      {
        id: 'q3',
        title: 'Party Explorer',
        desc: 'Acquire 40 coins or win a Party Board round',
        target: 40,
        current: 0,
        rewardCoins: 100,
        rewardTrophies: 45,
        completed: false,
        claimed: false
      }
    ];
  }

  private checkDailyQuestsRefresh() {
    const today = new Date().toISOString().split('T')[0];
    if (this.data.lastQuestDate !== today || !this.data.dailyQuests || this.data.dailyQuests.length === 0) {
      this.data.dailyQuests = this.generateDailyQuests();
      this.data.lastQuestDate = today;
      this.saveData();
    }
  }

  private loadData(): RivalryRecord {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) || localStorage.getItem('project_duel_save_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        const defaults = this.getDefaultData();
        return { 
          ...defaults, 
          ...parsed,
          favoriteMinigames: Array.isArray(parsed.favoriteMinigames) ? parsed.favoriteMinigames : defaults.favoriteMinigames,
          minigameStats: { ...defaults.minigameStats, ...(parsed.minigameStats || {}) },
          aiStats: { ...defaults.aiStats, ...(parsed.aiStats || {}) },
          mutators: { ...defaults.mutators, ...(parsed.mutators || {}) },
          audioSettings: { ...defaults.audioSettings, ...(parsed.audioSettings || {}) },
          dailyQuests: parsed.dailyQuests && parsed.dailyQuests.length > 0 ? parsed.dailyQuests : defaults.dailyQuests
        };
      }
    } catch {
      // Return defaults on error
    }
    return this.getDefaultData();
  }

  public saveData() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // LocalStorage quota or privacy mode
    }
  }

  public getLanguage(): Language {
    return this.data.language || 'ar';
  }

  public setLanguage(lang: Language) {
    this.data.language = lang;
    this.saveData();
  }

  public getAudioSettings(): AudioSettings {
    return this.data.audioSettings;
  }

  public setAudioSettings(settings: Partial<AudioSettings>) {
    this.data.audioSettings = { ...this.data.audioSettings, ...settings };
    this.saveData();
  }

  public getChassisMode(): ChassisMode {
    return this.data.chassisMode || 'phone';
  }

  public setChassisMode(mode: ChassisMode) {
    this.data.chassisMode = mode;
    this.saveData();
  }

  public getThemePreference(): 'day' | 'night' {
    return this.data.themePreference || 'day';
  }

  public toggleTheme(): 'day' | 'night' {
    this.data.themePreference = this.data.themePreference === 'day' ? 'night' : 'day';
    this.saveData();
    return this.data.themePreference;
  }

  public getGameMode(): GameMode {
    return this.data.currentMode || 'local_2p';
  }

  public setGameMode(mode: GameMode) {
    this.data.currentMode = mode;
    this.saveData();
  }

  public getAIDifficulty(): AIDifficulty {
    return this.data.aiDifficulty || 'medium';
  }

  public setAIDifficulty(diff: AIDifficulty) {
    this.data.aiDifficulty = diff;
    this.saveData();
  }

  public getFavorites(): MinigameId[] {
    if (!this.data.favoriteMinigames) this.data.favoriteMinigames = [];
    return this.data.favoriteMinigames;
  }

  public isFavorite(id: MinigameId): boolean {
    return this.getFavorites().includes(id);
  }

  public toggleFavorite(id: MinigameId): boolean {
    const favs = this.getFavorites();
    const idx = favs.indexOf(id);
    let isNowFav: boolean;
    if (idx >= 0) {
      favs.splice(idx, 1);
      isNowFav = false;
    } else {
      favs.push(id);
      isNowFav = true;
    }
    this.saveData();
    return isNowFav;
  }

  public getMutators(): GameMutators {
    return this.data.mutators;
  }

  public toggleMutator(key: keyof GameMutators): boolean {
    this.data.mutators[key] = !this.data.mutators[key];
    this.saveData();
    return this.data.mutators[key];
  }

  public getRankTier(trophies: number = this.data.trophies): RankedTier {
    if (trophies >= 3000) return 'celestial';
    if (trophies >= 2000) return 'cyber_master';
    if (trophies >= 1200) return 'diamond';
    if (trophies >= 700) return 'gold';
    if (trophies >= 300) return 'silver';
    return 'bronze';
  }

  public recordMatchResult(minigameId: MinigameId, winner: PlayerIndex) {
    this.data.totalMatches++;

    // Practice mode trains for free: track stats but award no trophies,
    // coins, streaks or quest progress.
    const isPractice = this.data.currentMode === 'practice';

    if (this.data.currentMode === 'vs_ai') {
      const diff = this.data.aiDifficulty;
      if (winner === 1) {
        this.data.aiStats[diff].wins++;
        this.data.p1TotalWins++;
        if (!isPractice) this.data.trophies += 25; // Trophy Gain
        // Streak tracking applies in AI mode too (was missing: streak bonus
        // and per-game highestStreak silently used stale 1v1 values)
        if (this.data.currentStreakPlayer === 1) {
          this.data.currentStreakCount++;
        } else {
          this.data.currentStreakPlayer = 1;
          this.data.currentStreakCount = 1;
        }
      } else {
        this.data.aiStats[diff].losses++;
        this.data.p2TotalWins++;
        if (!isPractice) this.data.trophies = Math.max(0, this.data.trophies - 8); // Minor loss
        if (this.data.currentStreakPlayer === 2) {
          this.data.currentStreakCount++;
        } else {
          this.data.currentStreakPlayer = 2;
          this.data.currentStreakCount = 1;
        }
      }
    } else {
      if (winner === 1) {
        this.data.p1TotalWins++;
        if (this.data.currentStreakPlayer === 1) {
          this.data.currentStreakCount++;
        } else {
          this.data.currentStreakPlayer = 1;
          this.data.currentStreakCount = 1;
        }
      } else {
        this.data.p2TotalWins++;
        if (this.data.currentStreakPlayer === 2) {
          this.data.currentStreakCount++;
        } else {
          this.data.currentStreakPlayer = 2;
          this.data.currentStreakCount = 1;
        }
      }
      if (!isPractice) this.data.trophies += 25; // 1v1 local play awards trophies for both
    }

    // Streak bonus
    if (!isPractice && this.data.currentStreakCount >= 3) {
      this.data.trophies += 10;
    }

    this.data.currentRank = this.getRankTier(this.data.trophies);

    const stat = this.data.minigameStats[minigameId];
    if (stat) {
      if (winner === 1) stat.p1Wins++;
      else stat.p2Wins++;
      stat.highestStreak = Math.max(stat.highestStreak, this.data.currentStreakCount);
    }

    this.data.coins += isPractice ? 0 : 25;

    // Progress daily quests
    if (!isPractice) {
      this.progressQuest('q1', 1);
      if (winner === 1) this.progressQuest('q2', 1);
      this.progressQuest('q3', 25);
    }

    if (!isPractice) this.checkMilestoneUnlocks();
    this.saveData();
  }

  public recordReactionTime(ms: number) {
    if (ms <= 0 || ms > 2000) return;
    this.data.avgReactionTimeMs = Math.round((this.data.avgReactionTimeMs * 0.8) + (ms * 0.2));
    this.saveData();
  }

  public recordGauntletScore(score: number, coins: number, trophies: number) {
    this.data.gauntletHighScore = Math.max(this.data.gauntletHighScore, score);
    this.data.coins += coins;
    this.data.trophies += trophies;
    this.data.currentRank = this.getRankTier(this.data.trophies);
    this.checkMilestoneUnlocks();
    this.saveData();
  }

  public addCoins(amount: number): number {
    this.data.coins += amount;
    this.saveData();
    return this.data.coins;
  }

  public progressQuest(questId: string, amount: number) {
    const quest = this.data.dailyQuests.find(q => q.id === questId);
    if (quest && !quest.completed) {
      quest.current = Math.min(quest.target, quest.current + amount);
      if (quest.current >= quest.target) {
        quest.completed = true;
      }
      this.saveData();
    }
  }

  public claimQuest(questId: string): boolean {
    const quest = this.data.dailyQuests.find(q => q.id === questId);
    if (quest && quest.completed && !quest.claimed) {
      quest.claimed = true;
      this.data.coins += quest.rewardCoins;
      this.data.trophies += quest.rewardTrophies;
      this.data.currentRank = this.getRankTier(this.data.trophies);
      this.saveData();
      return true;
    }
    return false;
  }

  private checkMilestoneUnlocks() {
    if (this.data.totalMatches >= 3 && !this.data.unlockedSkins.includes('synthwave')) {
      this.data.unlockedSkins.push('synthwave');
    }
    if (this.data.totalMatches >= 8 && !this.data.unlockedSkins.includes('matrix')) {
      this.data.unlockedSkins.push('matrix');
    }
    if (this.data.trophies >= 700 && !this.data.unlockedSkins.includes('solar_gold')) {
      this.data.unlockedSkins.push('solar_gold');
    }
    if (this.data.trophies >= 1200 && !this.data.unlockedSkins.includes('galactic')) {
      this.data.unlockedSkins.push('galactic');
    }
    if (this.data.trophies >= 2000 && !this.data.unlockedSkins.includes('hellfire')) {
      this.data.unlockedSkins.push('hellfire');
    }
    if (this.data.trophies >= 3000 && !this.data.unlockedSkins.includes('celestial')) {
      this.data.unlockedSkins.push('celestial');
    }

    // Unlock trails & finishers
    if (this.data.totalMatches >= 5 && !this.data.unlockedTrails.includes('fire')) {
      this.data.unlockedTrails.push('fire');
    }
    if (this.data.trophies >= 500 && !this.data.unlockedTrails.includes('electric')) {
      this.data.unlockedTrails.push('electric');
    }
    if (this.data.trophies >= 1000 && !this.data.unlockedFinishers.includes('coin_shower')) {
      this.data.unlockedFinishers.push('coin_shower');
    }
    if (this.data.trophies >= 2500 && !this.data.unlockedFinishers.includes('plasma_nova')) {
      this.data.unlockedFinishers.push('plasma_nova');
    }
  }

  public getRecord(): RivalryRecord {
    return this.data;
  }

  public getSkinColors(player: PlayerIndex): { primary: string; secondary: string } {
    const skin = player === 1 ? this.data.activeP1Skin : this.data.activeP2Skin;
    switch (skin) {
      case 'synthwave':
        return player === 1 
          ? { primary: '#FF007F', secondary: '#FFAA00' }
          : { primary: '#9D00FF', secondary: '#00F0FF' };
      case 'matrix':
        return player === 1 
          ? { primary: '#00FF66', secondary: '#AAFF00' }
          : { primary: '#00D455', secondary: '#008833' };
      case 'solar_gold':
        return player === 1 
          ? { primary: '#FFD700', secondary: '#FF9900' }
          : { primary: '#FFF0A0', secondary: '#FFCC00' };
      case 'galactic':
        return player === 1 
          ? { primary: '#A855F7', secondary: '#38BDF8' }
          : { primary: '#EC4899', secondary: '#6366F1' };
      case 'hellfire':
        return player === 1 
          ? { primary: '#FF1100', secondary: '#FF8800' }
          : { primary: '#DC2626', secondary: '#F59E0B' };
      case 'celestial':
        return player === 1
          ? { primary: '#E0AAFF', secondary: '#C77DFF' }
          : { primary: '#7B2CBF', secondary: '#3C096C' };
      default: // Cyber Neon / Solar
        return player === 1 
          ? { primary: '#FF0055', secondary: '#FFAA00' }
          : { primary: '#0084FF', secondary: '#00E5A3' };
    }
  }

  public setPlayerSkin(player: PlayerIndex, skinId: string) {
    if (player === 1) this.data.activeP1Skin = skinId;
    else this.data.activeP2Skin = skinId;
    this.saveData();
  }

  public setTrail(trailId: string) {
    this.data.activeTrail = trailId;
    this.saveData();
  }

  public setFinisher(finisherId: string) {
    this.data.activeFinisher = finisherId;
    this.saveData();
  }

  public resetStats() {
    this.data = this.getDefaultData();
    this.saveData();
  }
}
