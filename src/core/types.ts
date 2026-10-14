export type PlayerIndex = 1 | 2;

export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TouchInput {
  id: number;
  player: PlayerIndex;
  normX: number;
  normY: number;
  arenaX: number;
  arenaY: number;
  rawX: number;
  rawY: number;
  vx: number;
  vy: number;
  phase: 'began' | 'moved' | 'ended' | 'canceled';
  startTime: number;
}

export type MinigameId = 
  | 'cyber_hockey' 
  | 'physics_sumo' 
  | 'tactical_tanks' 
  | 'counter_dash'
  | 'laser_drift'
  | 'neon_orbit'
  | 'memory_matrix'
  | 'cyber_simon'
  | 'chroma_pairs'
  | 'cyber_hoops'
  | 'laser_pinball'
  | 'chroma_reaction'
  | 'neon_volley'
  | 'quantum_tug'
  | 'astro_blast'
  | 'cyber_slicer'
  | 'synthwave_rhythm'
  | 'gravity_runner'
  | 'neon_blade'
  | 'cyber_bomb';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type GameMode = 'local_2p' | 'vs_ai' | 'party_board' | 'ai_gauntlet' | 'practice' | 'online';

export type RankedTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'cyber_master' | 'celestial';

export type Language = 'ar' | 'en';
export type ChassisMode = 'phone' | 'tablet' | 'fullscreen';

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  hapticsEnabled: boolean;
  announcerEnabled: boolean;
  crtScanlines: boolean;
}

export interface DailyQuest {
  id: string;
  title: string;
  desc: string;
  target: number;
  current: number;
  rewardCoins: number;
  rewardTrophies: number;
  completed: boolean;
  claimed: boolean;
}

export interface CosmeticItem {
  id: string;
  type: 'skin' | 'trail' | 'finisher';
  name: string;
  reqTrophies: number;
  icon: string;
}

export type BoardTileType = 'bonus' | 'hazard' | 'star_station' | 'minigame_duel' | 'warp_gate';

export interface BoardTile {
  id: number;
  type: BoardTileType;
  label: string;
  icon: string;
  x: number;
  y: number;
}

export interface PartyBoardPlayer {
  index: PlayerIndex;
  name: string;
  tileIndex: number;
  coins: number;
  stars: number;
  color: string;
}

export interface PartyBoardState {
  currentRound: number;
  maxRounds: number;
  activePlayer: PlayerIndex;
  players: Record<PlayerIndex, PartyBoardPlayer>;
  isRolling: boolean;
  diceValue: number;
  starStationTileIndex: number;
  lastEventMessage: string;
  phase: 'roll' | 'moving' | 'tile_event' | 'duel_pending' | 'game_over';
  winner: PlayerIndex | null;
}

export interface GameMutators {
  turboSpeed: boolean;
  lowGravity: boolean;
  chaosSpawns: boolean;
  suddenDeath: boolean;
  bouncyArena: boolean;
  ghostBall: boolean;
  megaSize: boolean;
  invertGravity: boolean;
  mirrorMode: boolean;
  hyperFever: boolean;
}

export interface MinigameMetadata {
  id: MinigameId;
  title: string;
  subtitle: string;
  category: string;
  icon: string;
  targetScore: number;
  timeLimitSec: number;
  instructionsP1: string;
  instructionsP2: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  shape: 'circle' | 'spark' | 'square' | 'line';
  rotation: number;
  rotSpeed: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
  width: number;
  color: string;
  time: number;
}

export interface ShakeEvent {
  trauma: number;
  maxOffset: number;
  maxRoll: number;
  decayRate: number;
}

export interface RivalryRecord {
  totalMatches: number;
  p1TotalWins: number;
  p2TotalWins: number;
  currentStreakPlayer: PlayerIndex;
  currentStreakCount: number;
  trophies: number;
  currentRank: RankedTier;
  dailyQuests: DailyQuest[];
  lastQuestDate: string;
  activeTrail: string;
  activeFinisher: string;
  unlockedTrails: string[];
  unlockedFinishers: string[];
  avgReactionTimeMs: number;
  minigameStats: Record<MinigameId, {
    p1Wins: number;
    p2Wins: number;
    highestStreak: number;
  }>;
  aiStats: Record<AIDifficulty, {
    wins: number;
    losses: number;
  }>;
  coins: number;
  unlockedSkins: string[];
  activeP1Skin: string;
  activeP2Skin: string;
  themePreference: 'day' | 'night';
  currentMode: GameMode;
  aiDifficulty: AIDifficulty;
  mutators: GameMutators;
  language: Language;
  audioSettings: AudioSettings;
  chassisMode: ChassisMode;
  gauntletHighScore: number;
}

export interface TournamentMatch {
  id: number;
  round: number;
  playerA: string;
  playerB: string;
  scoreA: number;
  scoreB: number;
  winner: string | null;
  minigame: MinigameId;
  completed: boolean;
}

export interface TournamentState {
  title: string;
  mode: 'single_elim' | 'round_robin' | 'best_of_series';
  players: string[];
  matches: TournamentMatch[];
  currentMatchIndex: number;
  champion: string | null;
  seriesTarget: number;
}

export interface GauntletStage {
  stageNumber: number;
  bossName: string;
  bossTitle: string;
  minigame: MinigameId;
  difficulty: AIDifficulty;
  rewardCoins: number;
  rewardTrophies: number;
  completed: boolean;
}

export interface GauntletState {
  currentStageIndex: number;
  totalStages: number;
  livesRemaining: number;
  maxLives: number;
  score: number;
  isCompleted: boolean;
  isGameOver: boolean;
  stages: GauntletStage[];
}

export interface PracticeReport {
  minigame: MinigameId;
  attempts: number;
  wins: number;
  bestStreak: number;
  avgScore: number;
  lastPlayedAt: number;
}

export interface OnlineMatchState {
  roomCode: string;
  minigame: MinigameId;
  latencyMs: number;
  connected: boolean;
}
