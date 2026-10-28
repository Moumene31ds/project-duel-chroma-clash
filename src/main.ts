import { MinigameId, PlayerIndex, ChassisMode } from './core/types';
import { InputManager } from './core/InputManager';
import { AudioHaptics } from './core/AudioHaptics';
import { JuiceEngine } from './core/JuiceEngine';
import { ProgressionManager } from './meta/ProgressionManager';
import { TournamentManager } from './meta/TournamentManager';
import { GauntletManager } from './meta/GauntletManager';
import { UIManager } from './ui/UIManager';

import { BaseMinigame } from './minigames/BaseMinigame';
import { CyberHockey } from './minigames/CyberHockey';
import { PhysicsSumo } from './minigames/PhysicsSumo';
import { TacticalTanks } from './minigames/TacticalTanks';
import { CounterDash } from './minigames/CounterDash';
import { LaserDriftRacers } from './minigames/LaserDriftRacers';
import { NeonOrbitBreaker } from './minigames/NeonOrbitBreaker';
import { ChromaPairs } from './minigames/ChromaPairs';
import { MemoryMatrix } from './minigames/MemoryMatrix';
import { CyberSimon } from './minigames/CyberSimon';
import { CyberHoops } from './minigames/CyberHoops';
import { LaserPinball } from './minigames/LaserPinball';
import { ChromaReaction } from './minigames/ChromaReaction';
import { NeonVolley } from './minigames/NeonVolley';
import { QuantumTug } from './minigames/QuantumTug';
import { AstroBlast } from './minigames/AstroBlast';
import { PartyBoardManager } from './meta/PartyBoardManager';
import { AIBotEngine } from './core/AIBotEngine';
import { CyberSlicer } from './minigames/CyberSlicer';
import { SynthwaveRhythm } from './minigames/SynthwaveRhythm';
import { GravityRunner } from './minigames/GravityRunner';
import { NeonBladeDuel } from './minigames/NeonBladeDuel';
import { CyberBombRelay } from './minigames/CyberBombRelay';
import { TutorialManager } from './meta/TutorialManager';
import { AchievementManager } from './meta/AchievementManager';
import { DailyChallengeManager } from './meta/DailyChallengeManager';
import { ReplayManager } from './core/ReplayManager';
import { AnalyticsManager } from './core/AnalyticsManager';
import { PerformanceManager } from './core/PerformanceManager';
import { AccessibilityManager } from './core/AccessibilityManager';
import { AdManager } from './core/AdManager';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Vercel Observability & Real-Time Performance Telemetry
try {
  injectVercelAnalytics();
  injectSpeedInsights();
} catch {
  // Silent fallback when running offline or non-Vercel hosts
}

class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private uiLayer: HTMLElement;

  private input: InputManager;
  private audio: AudioHaptics;
  private juice: JuiceEngine;
  private progression: ProgressionManager;
  private tournament: TournamentManager;
  private gauntlet: GauntletManager;
  private botAI: AIBotEngine;
  private partyBoard: PartyBoardManager;
  private ui: UIManager;
  private analytics = AnalyticsManager.getInstance();
  private replay = ReplayManager.getInstance();
  private perf = PerformanceManager.getInstance();

  // Saved user mutators before starting daily challenge
  private savedMutatorsBeforeDaily: ReturnType<ProgressionManager['getMutators']> | null = null;

  // In-app history: mirrors browser entries WE pushed (modals + matches) so
  // the Android back button navigates inside the game instead of exiting.
  private histDepth = 0;
  private suppressPop = false;
  private isPushingHist = false;

  private pushHist() {
    if (this.isPushingHist) return;
    this.isPushingHist = true;
    try {
      this.histDepth++;
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      history.pushState({ duelDepth: this.histDepth }, '', currentUrl);
    } catch {
      // non-browser / restricted context
    } finally {
      this.isPushingHist = false;
    }
  }

  private popHist() {
    if (this.histDepth <= 0) return;
    this.histDepth--;
    this.suppressPop = true;
    try {
      history.back();
    } catch {
      this.suppressPop = false;
    }
  }

  private minigames: Map<MinigameId, BaseMinigame> = new Map();
  private activeMinigame: BaseMinigame | null = null;

  private isRunning: boolean = true;
  private isPaused: boolean = false;
  private isInTournament: boolean = false;
  private isInPartyBoard: boolean = false;
  private isInGauntlet: boolean = false;
  private lastTime: number = performance.now();

  // Internal logical resolution
  private arenaWidth: number = 420;
  private arenaHeight: number = 840;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.uiLayer = document.getElementById('ui-layer') as HTMLElement;

    this.input = new InputManager(this.canvas);
    this.audio = new AudioHaptics();
    this.juice = new JuiceEngine();
    this.progression = new ProgressionManager();
    this.tournament = new TournamentManager();
    this.gauntlet = new GauntletManager();
    this.partyBoard = new PartyBoardManager(this.audio);
    this.botAI = new AIBotEngine();
    this.ui = new UIManager(this.uiLayer, this.progression, this.audio, this.juice);
    AccessibilityManager.getInstance(); // apply saved a11y settings

    const adMgr = AdManager.getInstance();
    adMgr.onAdStart = () => {
      this.audio.music.setLowPass(true);
    };
    adMgr.onAdEnd = () => {
      this.audio.music.setLowPass(false);
    };

    // PWA service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      });
    }

    // Apply active theme & CRT scanlines & chassis
    this.applyTheme(this.progression.getThemePreference());
    this.applyChassis(this.progression.getChassisMode());
    this.juice.crtScanlinesEnabled = this.progression.getAudioSettings().crtScanlines;

    const checkOrientation = () => {
      this.initCanvasSize();
      const blocker = document.getElementById('orientation-blocker');
      if (blocker) {
        const isCoarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const vv = window.visualViewport;
        const w = vv?.width ?? window.innerWidth;
        const h = vv?.height ?? window.innerHeight;
        const isLandscape = w > h && (isCoarse || h < 620);
        blocker.style.display = isLandscape ? 'flex' : '';
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 120));
    window.visualViewport?.addEventListener('resize', checkOrientation);
    window.visualViewport?.addEventListener('scroll', checkOrientation);
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => this.initCanvasSize()).observe(this.canvas.parentElement ?? this.canvas);
    }

    // System back button: navigate inside the game (close modal / quit to
    // menu) instead of leaving the site. Only entries we pushed are handled;
    // at the base menu entry the browser exits normally.
    try {
      history.replaceState({ duelDepth: 0 }, '');
    } catch {
      // noop
    }
    window.addEventListener('popstate', () => {
      if (this.suppressPop) {
        this.suppressPop = false;
        return;
      }
      this.histDepth = Math.max(0, this.histDepth - 1);

      // 1. Close the topmost modal
      const top = this.ui.popModal();
      if (top) {
        const action = top.dataset.back || 'close';
        if (action === 'menu') {
          this.exitMatchToMenu();
          return;
        }
        if (action === 'resume' && this.activeMinigame) {
          this.isPaused = false;
          this.audio.music.setLowPass(false);
          if (this.ui.onResumeMatch) this.ui.onResumeMatch();
          return;
        }
        // Plain close: a modal over a blank post-match screen falls back menu
        if (this.ui.modalStack.length === 0 && this.ui.currentScreen !== 'menu' && !this.activeMinigame) {
          this.ui.showMainMenu();
        }
        return;
      }

      // 2. Quit an active match to the menu
      if (this.activeMinigame) {
        this.exitMatchToMenuNoPop();
        return;
      }

      // 3. Leave any sub-screen (party / tournament progress) to the menu
      if (this.ui.currentScreen !== 'menu') {
        this.ui.showMainMenu();
      }
      // Base menu: nothing — the browser exits the site.
    });
    // Kill iOS double-tap zoom / long-press callout on the game surface
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Prevent pull-to-refresh when swiping on the canvas (menu scroll still works)
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    checkOrientation();

    // Register All 15 Legendary Minigames with AI Bot Support
    this.minigames.set('cyber_hockey', new CyberHockey(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('physics_sumo', new PhysicsSumo(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('tactical_tanks', new TacticalTanks(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('counter_dash', new CounterDash(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('laser_drift', new LaserDriftRacers(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('neon_orbit', new NeonOrbitBreaker(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('chroma_pairs', new ChromaPairs(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('memory_matrix', new MemoryMatrix(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('cyber_simon', new CyberSimon(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('cyber_hoops', new CyberHoops(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('laser_pinball', new LaserPinball(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('chroma_reaction', new ChromaReaction(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('neon_volley', new NeonVolley(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('quantum_tug', new QuantumTug(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('astro_blast', new AstroBlast(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('cyber_slicer', new CyberSlicer(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('synthwave_rhythm', new SynthwaveRhythm(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('gravity_runner', new GravityRunner(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('neon_blade', new NeonBladeDuel(this.input, this.audio, this.juice, this.progression, this.botAI));
    this.minigames.set('cyber_bomb', new CyberBombRelay(this.input, this.audio, this.juice, this.progression, this.botAI));

    this.setupUIHandlers();
    this.ui.showMainMenu();

    // Start 60/120 FPS render loop
    requestAnimationFrame((t) => this.loop(t));

    // Handle user activation for Web Audio & Music
    const resumeAudio = () => {
      this.audio.init();
      this.audio.playMusic('menu');
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
    window.addEventListener('pointerdown', resumeAudio);
    window.addEventListener('keydown', resumeAudio);
  }

  private applyTheme(theme: 'day' | 'night') {
    document.body.className = `theme-${theme}`;
  }

  private applyChassis(mode: ChassisMode) {
    const chassis = document.querySelector('.phone-chassis') as HTMLElement;
    if (!chassis) return;
    chassis.classList.remove('chassis-phone', 'chassis-tablet', 'chassis-fullscreen');
    chassis.classList.add(`chassis-${mode}`);
  }

  private initCanvasSize() {
    // Cap DPR lower on small / low-power phones to hold 60fps
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 420;
    const dprCap = coarse && smallScreen ? 1.75 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const rect = this.canvas.getBoundingClientRect();
    // Guard against zero-size rect during rotation / hidden states
    const cssW = Math.max(1, rect.width || this.canvas.parentElement?.clientWidth || window.innerWidth);
    const cssH = Math.max(1, rect.height || this.canvas.parentElement?.clientHeight || window.innerHeight);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;

    this.arenaWidth = cssW;
    this.arenaHeight = cssH;

    if (this.activeMinigame) {
      this.activeMinigame.init(this.arenaWidth, this.arenaHeight);
    }
  }

  private setupUIHandlers() {
    this.ui.onThemeChanged = (theme: 'day' | 'night') => {
      this.applyTheme(theme);
    };

    this.ui.onChassisChanged = (mode: ChassisMode) => {
      this.applyChassis(mode);
      setTimeout(() => this.initCanvasSize(), 50);
    };

    this.ui.onSelectMinigame = (id: MinigameId) => {
      this.isInTournament = false;
      this.isInPartyBoard = false;
      this.isInGauntlet = false;
      this.startMinigameWithTutorial(id);
    };

    this.ui.onStartPractice = (id: MinigameId) => {
      this.progression.setGameMode('practice');
      this.isInTournament = false;
      this.isInPartyBoard = false;
      this.isInGauntlet = false;
      this.analytics.track('practice_start', { game: id });
      this.startMinigame(id);
    };

    this.ui.onStartDaily = (id: MinigameId) => {
      const daily = DailyChallengeManager.getDaily();
      this.savedMutatorsBeforeDaily = { ...this.progression.getMutators() };
      const mut = this.progression.getMutators();
      for (const [k, v] of Object.entries(daily.mutators)) {
        if (v && !mut[k as keyof typeof mut]) this.progression.toggleMutator(k as keyof typeof mut);
      }
      this.isInTournament = false;
      this.isInPartyBoard = false;
      this.isInGauntlet = false;
      this.analytics.track('daily_start', { game: id });
      this.startMinigame(id);
    };

    this.ui.onJoinOnline = (code: string, id: MinigameId) => {
      this.progression.setGameMode('online');
      this.isInTournament = false;
      this.isInPartyBoard = false;
      this.isInGauntlet = false;
      this.analytics.track('online_join', { code, game: id });
      this.startMinigame(id);
    };

    this.ui.onModalOpened = () => {
      queueMicrotask(() => this.pushHist());
    };
    this.ui.onModalClosed = (followedByPush) => {
      if (followedByPush) {
        // A pushState lands immediately after: skip history.back() (async and
        // racy) and just forget the dropped entry.
        this.histDepth = Math.max(0, this.histDepth - 1);
      } else {
        this.popHist();
      }
    };

    this.ui.onStartGauntlet = () => {
      this.isInGauntlet = true;
      this.isInPartyBoard = false;
      this.isInTournament = false;
      this.ui.showGauntletModal(
        this.gauntlet,
        (bossMinigame) => this.startMinigame(bossMinigame),
        () => {
          this.isInGauntlet = false;
          this.exitMatchToMenu();
        }
      );
    };

    this.ui.onStartPartyBoard = () => {
      this.isInPartyBoard = true;
      this.isInTournament = false;
      this.isInGauntlet = false;
      this.audio.playMusic('party');
      const isAi = this.progression.getGameMode() === 'vs_ai';
      this.partyBoard.startNewGame('PLAYER 1', isAi ? 'CYBER BOT' : 'PLAYER 2');
      this.ui.showPartyBoard(
        this.partyBoard,
        (duelMinigame) => {
          this.startMinigame(duelMinigame);
        },
        () => {
          this.isInPartyBoard = false;
          this.exitMatchToMenu();
        }
      );
    };

    this.ui.onStartTournament = (mode: 'bo3' | 'bracket') => {
      this.isInTournament = true;
      this.isInPartyBoard = false;
      this.isInGauntlet = false;
      if (mode === 'bo3') {
        this.tournament.createBestOfSeries('Player 1', 'Player 2', 3);
      } else {
        this.tournament.createSingleElimination(['Player 1', 'Player 2', 'Titan', 'Viper']);
      }
      this.showNextTournamentMatch();
    };

    this.ui.onResumeMatch = () => {
      this.isPaused = false;
      this.audio.music.setLowPass(false);
    };

    this.ui.onRestartMatch = () => {
      this.isPaused = false;
      this.audio.music.setLowPass(false);
      if (this.activeMinigame) {
        this.activeMinigame.beginMatch(this.arenaWidth, this.arenaHeight);
      }
    };

    this.ui.onQuitToMenu = () => {
      this.exitMatchToMenu();
    };
  }

  // Central quit path: consumes one history entry (the match) when present,
  // then returns to the menu (or back to the party board mid-party).
  private exitMatchToMenu() {
    this.popHist();
    this.exitMatchToMenuNoPop();
  }

  // Same quit without touching history (used after a popstate already popped).
  private exitMatchToMenuNoPop() {
    this.isPaused = false;
    this.activeMinigame = null;
    this.audio.music.setLowPass(false);
    this.audio.playMusic('menu');
    if (this.savedMutatorsBeforeDaily) {
      const current = this.progression.getMutators();
      for (const [k, v] of Object.entries(this.savedMutatorsBeforeDaily)) {
        if (current[k as keyof typeof current] !== v) {
          this.progression.toggleMutator(k as keyof typeof current);
        }
      }
      this.savedMutatorsBeforeDaily = null;
    }
    if (this.isInPartyBoard) {
      this.ui.showPartyBoard(
        this.partyBoard,
        (duelMinigame) => this.startMinigame(duelMinigame),
        () => {
          this.isInPartyBoard = false;
          this.activeMinigame = null;
          this.ui.showMainMenu();
        }
      );
    } else {
      this.ui.showMainMenu();
    }
  }

  private startMinigameWithTutorial(id: MinigameId) {
    if (!TutorialManager.hasSeen(id)) {
      this.ui.showTutorialModal(id, () => this.startMinigame(id));
    } else {
      this.startMinigame(id);
    }
  }

  private startMinigame(id: MinigameId) {
    const game = this.minigames.get(id);
    if (!game) return;

    // Browser history: menu -> match pushes one entry (rematches and
    // tournament progressions reuse it) so the back button quits to menu.
    if (this.ui.currentScreen !== 'match') this.pushHist();

    this.input.mirrorModeEnabled = !!this.progression.getMutators().mirrorMode;
    this.activeMinigame = game;
    this.activeMinigame.beginMatch(this.arenaWidth, this.arenaHeight);

    this.audio.playMusic('battle');
    this.audio.announce('Fight!', this.progression.getLanguage());
    this.replay.startRecording(id);
    this.analytics.track('match_start', { game: id, mode: this.progression.getGameMode() });

    this.activeMinigame.onMatchCompleteCallback = (winner: PlayerIndex) => {
      this.audio.playMusic('victory');
      this.audio.announce('Victory!', this.progression.getLanguage());
      this.replay.stopAndSave(winner);
      this.analytics.track('match_end', { game: id, winner });
      const ach = AchievementManager.getInstance();
      const record = this.progression.getRecord();
      if (record.totalMatches <= 1) ach.unlock('first_blood');
      if (record.currentStreakCount >= 3) ach.unlock('streak_3');
      const playedCount = Object.values(record.minigameStats).filter(s => (s.p1Wins + s.p2Wins) > 0).length;
      if (playedCount >= 5) ach.unlock('explorer');
      if (playedCount >= 20) ach.unlock('completionist');
      if (this.progression.getMutators().turboSpeed) ach.unlock('speed_demon');
      if (this.progression.getMutators().suddenDeath) ach.unlock('survivor');

      const adMgr = AdManager.getInstance();
      adMgr.recordMatchCompleted();

      if (this.isInGauntlet) {
        this.gauntlet.resolveStageMatch(winner);
        this.activeMinigame = null;
        this.ui.showGauntletModal(
          this.gauntlet,
          (bossMinigame) => this.startMinigame(bossMinigame),
          () => {
            this.isInGauntlet = false;
            this.exitMatchToMenu();
          }
        );
      } else if (this.isInPartyBoard) {
        this.partyBoard.resolveMinigameDuel(winner);
        this.activeMinigame = null;
        this.audio.playMusic('party');
        this.ui.showPartyBoard(
          this.partyBoard,
          (duelMinigame) => this.startMinigame(duelMinigame),
          () => {
            this.isInPartyBoard = false;
            this.exitMatchToMenu();
          }
        );
      } else if (this.isInTournament) {
        this.handleTournamentMatchComplete(winner);
      } else {
        const showVictory = () => {
          this.ui.showMatchVictory(
            winner,
            game.meta.title,
            () => this.startMinigame(id), // Rematch
            () => this.exitMatchToMenu()
          );
        };

        if (adMgr.canShowInterstitial()) {
          adMgr.showInterstitialAd('post_match', this.progression.getLanguage()).then(() => {
            showVictory();
          });
        } else {
          showVictory();
        }
      }
    };

    this.ui.clearOverlay();
  }

  private showNextTournamentMatch() {
    const state = this.tournament.getState();
    if (!state) return;

    this.ui.showTournamentProgress(
      state,
      () => {
        const match = this.tournament.getCurrentMatch();
        if (match) {
          this.startMinigame(match.minigame);
        }
      },
      () => {
        this.isInTournament = false;
        this.exitMatchToMenu();
      }
    );
  }

  private handleTournamentMatchComplete(winner: PlayerIndex) {
    const result = this.tournament.recordMatchScore(winner);
    const state = this.tournament.getState();
    if (!state) return;

    if (result.tournamentOver) {
      this.ui.showTournamentProgress(
        state,
        () => {},
        () => {
          this.isInTournament = false;
          this.exitMatchToMenu();
        }
      );
    } else {
      this.showNextTournamentMatch();
    }
  }

  private loop(now: number) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const fps = this.perf.tick(now);
    if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
      this.analytics.trackFps(Math.min(120, Math.round(fps)));
    }

    if (this.isRunning && !this.isPaused) {
      this.update(dt);
    }
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    this.input.pollGamepads();
    this.juice.update(dt);

    if (this.activeMinigame) {
      // Check if match point to trigger high tension overdrive music
      if (
        !this.activeMinigame.matchWinner &&
        this.activeMinigame.targetScore > 1 &&
        (this.activeMinigame.p1Score === this.activeMinigame.targetScore - 1 ||
          this.activeMinigame.p2Score === this.activeMinigame.targetScore - 1)
      ) {
        this.audio.music.playTrack('match_point');
      }

      // Bullet-time slow-mo scales gameplay dt (juice.update already scales
      // its own particles internally)
      this.activeMinigame.update(dt * this.juice.timeScale, this.arenaWidth, this.arenaHeight);
    }
  }

  private render() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 420;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse && smallScreen ? 1.75 : 2);
    // Reset transform each frame (canvas backing store matches initCanvasSize)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.save();

    const isDay = this.progression.getThemePreference() === 'day';
    this.ctx.fillStyle = isDay ? '#F8FAFC' : '#08090C';
    this.ctx.fillRect(0, 0, this.arenaWidth, this.arenaHeight);

    if (this.activeMinigame) {
      // Screen Shake Trauma Transform
      this.ctx.save();
      this.juice.applyCameraShake(this.ctx, this.arenaWidth / 2, this.arenaHeight / 2);

      // Render Minigame
      this.activeMinigame.render(this.ctx, this.arenaWidth, this.arenaHeight);
      this.ctx.restore();

      // Render Tactile Pause Button in Dead Zone Center
      this.renderCenterPauseButton(isDay);
    }

    // Retro CRT scanline overlay if enabled
    this.juice.renderCRTOverlay(this.ctx, this.arenaWidth, this.arenaHeight);

    this.ctx.restore();
  }

  private renderCenterPauseButton(isDay: boolean) {
    const cx = this.arenaWidth / 2;
    const cy = this.arenaHeight / 2;
    const r = Math.max(18, Math.min(24, Math.min(this.arenaWidth, this.arenaHeight) * 0.055));

    this.ctx.save();
    this.ctx.fillStyle = isDay ? 'rgba(255, 255, 255, 0.92)' : 'rgba(20, 26, 38, 0.85)';
    this.ctx.strokeStyle = isDay ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = isDay ? 'rgba(30, 50, 90, 0.1)' : 'rgba(0, 0, 0, 0.4)';
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // Pause bars
    this.ctx.fillStyle = isDay ? '#0F172A' : '#FFFFFF';
    this.ctx.shadowBlur = 0;
    this.ctx.fillRect(cx - 6, cy - 8, 4, 16);
    this.ctx.fillRect(cx + 2, cy - 8, 4, 16);
    this.ctx.restore();
  }
}

// Boot Game Engine on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  const engine = new GameEngine();

  // Listen for clicks on center pause button (in-match ONLY: an active match
  // with no modal open. Without these guards, taps near the screen center on
  // menus and centered modal buttons falsely open the pause screen and steal
  // the tap — e.g. the tutorial FIGHT button — making games unstartable.
  window.addEventListener('pointerdown', (e: PointerEvent) => {
    const eng = engine as unknown as { isPaused: boolean; activeMinigame: unknown; ui: UIManager };
    if (!eng.activeMinigame || eng.isPaused) return;
    if (document.querySelector('.ui-modal-backdrop')) return;
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const hitR = Math.max(32, Math.min(40, Math.min(rect.width, rect.height) * 0.075));
    const distSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);

    if (distSq < hitR * hitR) {
      (engine as unknown as { isPaused: boolean; ui: UIManager }).isPaused = true;
      (engine as unknown as { isPaused: boolean; ui: UIManager }).ui.showPauseModal();
    }
  });
});
