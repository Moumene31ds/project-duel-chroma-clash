import { MinigameId, PlayerIndex, TournamentState, AIDifficulty, ChassisMode, Language } from '../core/types';
import { JuiceEngine } from '../core/JuiceEngine';
import { ProgressionManager } from '../meta/ProgressionManager';
import { AudioHaptics } from '../core/AudioHaptics';
import { PartyBoardManager } from '../meta/PartyBoardManager';
import { LocalizationManager } from '../core/LocalizationManager';
import { GauntletManager } from '../meta/GauntletManager';
import { DailyChallengeManager } from '../meta/DailyChallengeManager';
import { AchievementManager } from '../meta/AchievementManager';
import { TutorialManager } from '../meta/TutorialManager';
import { ReplayManager } from '../core/ReplayManager';
import { NetplayManager } from '../core/NetplayManager';
import { AccessibilityManager } from '../core/AccessibilityManager';
import { CloudSaveManager } from '../core/CloudSaveManager';
import { AdManager } from '../core/AdManager';

export class UIManager {
  private root: HTMLElement;
  private progression: ProgressionManager;
  private audio: AudioHaptics;
  private juice: JuiceEngine;
  private loc: LocalizationManager;

  public onSelectMinigame?: (id: MinigameId) => void;
  public onStartTournament?: (mode: 'bo3' | 'bracket') => void;
  public onStartPartyBoard?: () => void;
  public onStartGauntlet?: () => void;
  public onStartPractice?: (id: MinigameId) => void;
  public onStartDaily?: (id: MinigameId) => void;
  public onJoinOnline?: (code: string, id: MinigameId) => void;
  public onResumeMatch?: () => void;
  public onRestartMatch?: () => void;
  public onQuitToMenu?: () => void;
  public onThemeChanged?: (theme: 'day' | 'night') => void;
  public onLanguageChanged?: (lang: Language) => void;
  public onChassisChanged?: (mode: ChassisMode) => void;
  // History integration: the engine pushes/pops a browser history entry per
  // modal so the Android back button closes screens instead of exiting.
  public onModalOpened?: () => void;
  public onModalClosed?: (followedByPush: boolean) => void;

  // Current full-screen context for back-button routing
  public currentScreen: 'menu' | 'match' | 'party' | 'tournament' = 'menu';
  // Stack of open modal overlays (top = last). Back closes from the top.
  public modalStack: HTMLElement[] = [];

  private previewAnimFrameId: number | null = null;
  private previewTime: number = 0;

  private activeCategory: 'all' | 'trending' | 'action_duel' | 'speed_reflex' | 'memory_puzzle' | 'favorites' = 'all';
  private searchQuery: string = '';
  private sortMode: 'default' | 'popular' | 'newest' = 'default';

  private readonly ALL_MINIGAMES: MinigameId[] = [
    'cyber_hoops',
    'laser_pinball',
    'chroma_reaction',
    'neon_volley',
    'quantum_tug',
    'astro_blast',
    'chroma_pairs',
    'cyber_hockey',
    'physics_sumo',
    'tactical_tanks',
    'counter_dash',
    'laser_drift',
    'neon_orbit',
    'memory_matrix',
    'cyber_simon',
    'cyber_slicer',
    'synthwave_rhythm',
    'gravity_runner',
    'neon_blade',
    'cyber_bomb'
  ];

  private readonly GAME_ICONS: Record<MinigameId, string> = {
    cyber_hoops: '🏀',
    laser_pinball: '🎯',
    chroma_reaction: '⚡',
    neon_volley: '🏐',
    quantum_tug: '🌀',
    astro_blast: '🚀',
    chroma_pairs: '🃏',
    cyber_hockey: '🏒',
    physics_sumo: '🤼',
    tactical_tanks: '🛡️',
    counter_dash: '⚔️',
    laser_drift: '🏎️',
    neon_orbit: '🪐',
    memory_matrix: '🧠',
    cyber_simon: '🔔',
    cyber_slicer: '🔪',
    synthwave_rhythm: '🎧',
    gravity_runner: '🌌',
    neon_blade: '⚔️',
    cyber_bomb: '💣'
  };

  constructor(root: HTMLElement, progression: ProgressionManager, audio: AudioHaptics, juice?: JuiceEngine) {
    this.root = root;
    this.progression = progression;
    this.audio = audio;
    this.juice = juice || new JuiceEngine();
    this.loc = LocalizationManager.getInstance();
    this.loc.setLanguage(this.progression.getLanguage());
  }

  private spotlightMinigameId: MinigameId = 'neon_blade';

  private gameCardHtml(id: MinigameId, idx: number, record: ReturnType<ProgressionManager['getRecord']>): string {
    const meta = this.loc.getMinigameText(id);
    const stats = record.minigameStats[id] || { p1Wins: 0, p2Wins: 0 };
    const isAction = ['cyber_hoops', 'laser_pinball', 'neon_volley', 'quantum_tug', 'astro_blast', 'cyber_hockey', 'physics_sumo', 'tactical_tanks', 'counter_dash', 'laser_drift', 'neon_orbit', 'cyber_slicer', 'synthwave_rhythm', 'gravity_runner', 'neon_blade', 'cyber_bomb'].includes(id);
    const category = isAction ? 'action' : 'memory';
    const icon = this.GAME_ICONS[id] || '🎮';
    const isNew = ['cyber_slicer', 'synthwave_rhythm', 'gravity_runner', 'neon_blade', 'cyber_bomb'].includes(id);
    const isFav = this.progression.isFavorite(id);
    const num = String(idx + 1).padStart(2, '0');

    return `
      <div class="game-card" data-id="${id}" data-category="${category}" role="button" tabindex="0" aria-label="${meta.title}">
        <div class="card-thumb">
          <canvas class="mini-canvas" id="canvas-mini-${id}" width="144" height="144"></canvas>
          <span class="card-index">${num}</span>
          <span class="card-icon">${icon}</span>
        </div>
        <div class="card-main">
          <div class="card-title-row">
            <h3 class="card-title">${meta.title}</h3>
            ${isNew ? '<span class="card-new">NEW</span>' : ''}
          </div>
          <p class="card-sub">${meta.subtitle}</p>
          <div class="card-meta">
            <span class="card-badge badge-orbit">${meta.badge}</span>
            <span class="card-score">P1 ${stats.p1Wins}–${stats.p2Wins} P2</span>
          </div>
        </div>
        <div class="card-actions-col">
          <button class="btn-fav-star ${isFav ? 'active' : ''}" data-fav-id="${id}" aria-label="Favorite" title="Favorite">
            ${isFav ? '⭐' : '☆'}
          </button>
          <button class="btn-play-card" aria-label="${this.loc.t('play_now')} ${meta.title}" tabindex="-1">▶</button>
        </div>
      </div>
    `;
  }

  public getFilteredAndSortedGames(): MinigameId[] {
    const record = this.progression.getRecord();
    const query = this.searchQuery.trim().toLowerCase();

    const actionDuels: MinigameId[] = [
      'neon_blade', 'physics_sumo', 'tactical_tanks', 'counter_dash',
      'cyber_hockey', 'cyber_slicer', 'astro_blast'
    ];
    const speedReflex: MinigameId[] = [
      'cyber_bomb', 'laser_drift', 'neon_orbit', 'cyber_hoops',
      'laser_pinball', 'neon_volley', 'quantum_tug', 'synthwave_rhythm', 'gravity_runner'
    ];
    const memoryPuzzle: MinigameId[] = [
      'chroma_pairs', 'memory_matrix', 'cyber_simon', 'chroma_reaction'
    ];

    let list: MinigameId[] = [...this.ALL_MINIGAMES];

    // 1. Category Filter
    if (this.activeCategory === 'trending') {
      list.sort((a, b) => {
        const aPlays = (record.minigameStats[a]?.p1Wins || 0) + (record.minigameStats[a]?.p2Wins || 0);
        const bPlays = (record.minigameStats[b]?.p1Wins || 0) + (record.minigameStats[b]?.p2Wins || 0);
        return bPlays - aPlays;
      });
      list = list.slice(0, 8);
    } else if (this.activeCategory === 'action_duel') {
      list = list.filter(id => actionDuels.includes(id));
    } else if (this.activeCategory === 'speed_reflex') {
      list = list.filter(id => speedReflex.includes(id));
    } else if (this.activeCategory === 'memory_puzzle') {
      list = list.filter(id => memoryPuzzle.includes(id));
    } else if (this.activeCategory === 'favorites') {
      const favs = this.progression.getFavorites();
      list = list.filter(id => favs.includes(id));
    }

    // 2. Search Filter
    if (query) {
      list = list.filter(id => {
        const meta = this.loc.getMinigameText(id);
        const title = meta.title.toLowerCase();
        const sub = meta.subtitle.toLowerCase();
        const badge = meta.badge.toLowerCase();
        const rawId = id.replace('_', ' ').toLowerCase();
        return title.includes(query) || sub.includes(query) || badge.includes(query) || rawId.includes(query);
      });
    }

    // 3. Sorting
    if (this.sortMode === 'popular') {
      list.sort((a, b) => {
        const aPlays = (record.minigameStats[a]?.p1Wins || 0) + (record.minigameStats[a]?.p2Wins || 0);
        const bPlays = (record.minigameStats[b]?.p1Wins || 0) + (record.minigameStats[b]?.p2Wins || 0);
        return bPlays - aPlays;
      });
    } else if (this.sortMode === 'newest') {
      const newestOrder: MinigameId[] = [
        'cyber_bomb', 'neon_blade', 'gravity_runner', 'synthwave_rhythm', 'cyber_slicer'
      ];
      list.sort((a, b) => {
        const aIdx = newestOrder.indexOf(a);
        const bIdx = newestOrder.indexOf(b);
        if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
        if (aIdx >= 0) return -1;
        if (bIdx >= 0) return 1;
        return 0;
      });
    }

    return list;
  }

  private refreshGameGrid() {
    const grid = this.root.querySelector('#main-minigame-grid');
    const countEl = this.root.querySelector('#m-games-count');
    if (!grid) return;

    this.stopMicroPreviews();
    const filteredGames = this.getFilteredAndSortedGames();
    const record = this.progression.getRecord();
    const currentLang = this.loc.getLanguage();

    if (countEl) {
      countEl.textContent = `${filteredGames.length} ${currentLang === 'ar' ? 'لعبة متاحة' : 'GAMES READY'}`;
    }

    if (filteredGames.length === 0) {
      grid.innerHTML = `
        <div class="no-games-card">
          <div class="no-games-icon">🔍</div>
          <div class="no-games-title">${this.loc.t('search_no_results')}</div>
          <button class="no-games-btn" id="btn-empty-shuffle">🎲 ${this.loc.t('random_pick')}</button>
        </div>
      `;
      grid.querySelector('#btn-empty-shuffle')?.addEventListener('click', () => {
        this.executeQuickShuffle();
      });
      return;
    }

    grid.innerHTML = filteredGames.map((id, idx) => this.gameCardHtml(id, idx, record)).join('');
    this.attachCardEvents(grid);
    this.initMicroPreviews();
  }

  private attachCardEvents(container: Element) {
    container.querySelectorAll('.game-card').forEach((card) => {
      const el = card as HTMLElement;
      this.attach3DCardTilt(el);

      const id = el.getAttribute('data-id') as MinigameId;

      const select = (e: Event) => {
        if ((e.target as HTMLElement).closest('.btn-fav-star')) return;
        this.audio.playPuckBounce(1.4);
        this.stopMicroPreviews();
        if (this.onSelectMinigame) this.onSelectMinigame(id);
      };

      el.addEventListener('click', select);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(e);
        }
      });

      const favBtn = el.querySelector('.btn-fav-star');
      favBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isNowFav = this.progression.toggleFavorite(id);
        favBtn.textContent = isNowFav ? '⭐' : '☆';
        favBtn.classList.toggle('active', isNowFav);
        this.audio.playPowerUp();
        if (this.activeCategory === 'favorites') {
          this.refreshGameGrid();
        }
      });
    });
  }

  private openCyberDrawer() {
    const backdrop = this.root.querySelector('#cyber-drawer-backdrop') as HTMLElement | null;
    const sheet = this.root.querySelector('#cyber-drawer-sheet') as HTMLElement | null;
    if (backdrop && sheet) {
      backdrop.style.display = 'flex';
      requestAnimationFrame(() => {
        backdrop.classList.add('open');
        sheet.classList.add('open');
      });
      this.audio.playPuckBounce(1.2);
    }
  }

  private closeCyberDrawer() {
    const backdrop = this.root.querySelector('#cyber-drawer-backdrop') as HTMLElement | null;
    const sheet = this.root.querySelector('#cyber-drawer-sheet') as HTMLElement | null;
    if (backdrop && sheet) {
      backdrop.classList.remove('open');
      sheet.classList.remove('open');
      setTimeout(() => {
        backdrop.style.display = 'none';
      }, 250);
    }
  }

  public showMainMenu() {
    this.stopMicroPreviews();
    this.wipeModals();
    this.currentScreen = 'menu';
    const record = this.progression.getRecord();
    const currentTheme = this.progression.getThemePreference();
    const currentMode = this.progression.getGameMode();
    const aiDiff = this.progression.getAIDifficulty();
    const currentLang = this.loc.getLanguage();
    const p2Name = currentMode === 'vs_ai' ? this.loc.t('ai_label') : this.loc.t('p2_label');

    const spotlightMeta = this.loc.getMinigameText(this.spotlightMinigameId);
    const filteredGames = this.getFilteredAndSortedGames();

    this.root.innerHTML = `
      <div class="ui-overlay menu-screen">
        <!-- Sticky phone header: brand + trophies + quick toggles -->
        <header class="m-top">
          <div class="m-brand">
            <span class="m-logo">⚡</span>
            <div class="m-brand-txt">
              <div class="m-title">${this.loc.t('hero_title')}</div>
              <div class="m-sub">${this.ALL_MINIGAMES.length} • 1v1</div>
            </div>
          </div>
          <div class="m-trophy" id="m-trophy">🏆 ${record.trophies}<em>${this.loc.getRankName(record.currentRank)}</em></div>
          <div class="m-icons">
            <button class="m-icon-btn" id="btn-lang-toggle" aria-label="Language">${currentLang === 'ar' ? '🇬🇧' : '🇸🇦'}</button>
            <button class="m-icon-btn" id="btn-theme-toggle" aria-label="Theme">${currentTheme === 'day' ? '☀️' : '🌙'}</button>
          </div>
        </header>

        <!-- Score strip -->
        <div class="m-scorebar">
          <span class="p1-tag">${this.loc.t('p1_label')} ${record.p1TotalWins}</span>
          <span class="vs-divider">VS</span>
          <span class="p2-tag">${p2Name} ${record.p2TotalWins}</span>
        </div>

        <!-- Mode + difficulty -->
        <div class="mode-selector-bar">
          <button class="mode-toggle-btn ${currentMode === 'local_2p' ? 'active' : ''}" id="btn-mode-2p">
            ${this.loc.t('mode_2p')}
          </button>
          <button class="mode-toggle-btn ${currentMode === 'vs_ai' ? 'active' : ''}" id="btn-mode-ai">
            ${this.loc.t('mode_ai')}
          </button>
        </div>

        ${currentMode === 'vs_ai' ? `
          <div class="difficulty-pill-group">
            <button class="diff-pill ${aiDiff === 'easy' ? 'active' : ''}" data-diff="easy">${this.loc.t('diff_casual')}</button>
            <button class="diff-pill ${aiDiff === 'medium' ? 'active' : ''}" data-diff="medium">${this.loc.t('diff_adaptive')}</button>
            <button class="diff-pill ${aiDiff === 'hard' ? 'active' : ''}" data-diff="hard">${this.loc.t('diff_pro')}</button>
          </div>
        ` : ''}

        <!-- Hero Spotlight Card (Game of the Day) -->
        <div class="m-hero-spotlight" id="hero-spotlight-card" data-id="${this.spotlightMinigameId}">
          <div class="spotlight-glow"></div>
          <div class="spotlight-badge-row">
            <span class="spotlight-tag">🌟 ${this.loc.t('spotlight_title')}</span>
            <span class="spotlight-status">LIVE ⚡</span>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-thumb">
              <canvas class="mini-canvas" id="canvas-mini-spotlight" width="160" height="160"></canvas>
              <span class="spotlight-icon">${this.GAME_ICONS[this.spotlightMinigameId]}</span>
            </div>
            <div class="spotlight-info">
              <h3 class="spotlight-title">${spotlightMeta.title}</h3>
              <p class="spotlight-sub">${spotlightMeta.subtitle}</p>
              <div class="spotlight-badge">${spotlightMeta.badge}</div>
            </div>
          </div>
          <button class="spotlight-play-btn" id="btn-spotlight-play">
            <span>⚡ ${this.loc.t('spotlight_play')}</span>
          </button>
        </div>

        <!-- Quick Shuffle & Party Hub Row -->
        <div class="m-quick-actions-row">
          <button class="btn-shuffle-roulette" id="btn-quick-shuffle">
            <span>🎲</span>
            <span>${this.loc.t('quick_shuffle')}</span>
          </button>
          <div class="m-party-slim" id="hero-party-banner">
            <span class="m-party-icon">👑</span>
            <div class="m-party-txt">
              <div class="m-party-title">${this.loc.t('party_hero_title')}</div>
            </div>
            <button class="m-party-go" id="btn-hero-party">▶</button>
          </div>
        </div>

        <!-- Instant Search Box -->
        <div class="m-search-bar-wrap">
          <div class="cyber-search-box">
            <span class="search-icon">🔍</span>
            <input type="text" class="cyber-search-input" id="menu-search-input" placeholder="${this.loc.t('search_placeholder')}" value="${this.searchQuery}" autocomplete="off" />
            <button class="search-clear-btn" id="btn-clear-search" style="display: ${this.searchQuery ? 'inline-flex' : 'none'};">✕</button>
          </div>
        </div>

        <!-- Horizontal Scrollable Category Filter Pills -->
        <div class="category-tabs-bar" role="tablist">
          <button class="cat-pill ${this.activeCategory === 'all' ? 'active' : ''}" data-cat="all">${this.loc.t('cat_all')} (${this.ALL_MINIGAMES.length})</button>
          <button class="cat-pill ${this.activeCategory === 'trending' ? 'active' : ''}" data-cat="trending">${this.loc.t('cat_trending')}</button>
          <button class="cat-pill ${this.activeCategory === 'action_duel' ? 'active' : ''}" data-cat="action_duel">${this.loc.t('cat_action_duel')}</button>
          <button class="cat-pill ${this.activeCategory === 'speed_reflex' ? 'active' : ''}" data-cat="speed_reflex">${this.loc.t('cat_speed_reflex')}</button>
          <button class="cat-pill ${this.activeCategory === 'memory_puzzle' ? 'active' : ''}" data-cat="memory_puzzle">${this.loc.t('cat_memory_puzzle')}</button>
          <button class="cat-pill ${this.activeCategory === 'favorites' ? 'active' : ''}" data-cat="favorites">${this.loc.t('cat_favorites')}</button>
        </div>

        <!-- Sort Bar & Total Count -->
        <div class="m-sort-bar">
          <span class="m-games-count" id="m-games-count">${filteredGames.length} ${currentLang === 'ar' ? 'لعبة متاحة' : 'GAMES READY'}</span>
          <div class="m-sort-pills">
            <button class="sort-pill ${this.sortMode === 'default' ? 'active' : ''}" data-sort="default">${this.loc.t('sort_default')}</button>
            <button class="sort-pill ${this.sortMode === 'popular' ? 'active' : ''}" data-sort="popular">${this.loc.t('sort_popular')}</button>
            <button class="sort-pill ${this.sortMode === 'newest' ? 'active' : ''}" data-sort="newest">${this.loc.t('sort_newest')}</button>
          </div>
        </div>

        <!-- Dynamic Filtered Minigame Grid -->
        <div class="minigame-grid" id="main-minigame-grid">
          ${filteredGames.map((id, idx) => this.gameCardHtml(id, idx, record)).join('')}
        </div>

        <!-- Mobile Floating Cyber Navigation Bar -->
        <nav class="m-floating-nav" aria-label="Main Navigation">
          <button class="nav-item active" id="nav-btn-home">
            <span class="nav-icon">🏠</span>
            <span class="nav-label">${this.loc.t('btn_nav_home')}</span>
          </button>
          <button class="nav-item" id="nav-btn-party">
            <span class="nav-icon">👑</span>
            <span class="nav-label">${this.loc.t('btn_nav_party')}</span>
          </button>
          <button class="nav-item" id="nav-btn-gauntlet">
            <span class="nav-icon">💀</span>
            <span class="nav-label">${this.loc.t('btn_nav_gauntlet')}</span>
          </button>
          <button class="nav-item" id="nav-btn-cups">
            <span class="nav-icon">🏆</span>
            <span class="nav-label">${this.loc.t('btn_nav_cups')}</span>
          </button>
          <button class="nav-item" id="nav-btn-more">
            <span class="nav-icon">🧰</span>
            <span class="nav-label">${this.loc.t('btn_nav_more')}</span>
          </button>
        </nav>

        <!-- Slide-up Cyber Bottom Sheet Drawer (Hub) -->
        <div class="cyber-drawer-backdrop" id="cyber-drawer-backdrop" style="display: none;">
          <div class="cyber-drawer-sheet" id="cyber-drawer-sheet">
            <div class="drawer-drag-handle"></div>
            <div class="drawer-header">
              <h3 class="drawer-title">${this.loc.t('drawer_title')}</h3>
              <button class="drawer-close-btn" id="btn-close-drawer">${this.loc.t('drawer_close')}</button>
            </div>
            <div class="drawer-grid">
              <button class="drawer-tool-btn highlight" id="drawer-reward-ad">
                <span class="tool-icon">🎁</span>
                <span class="tool-name">${this.loc.t('btn_reward_ad')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-mutators">
                <span class="tool-icon">🎲</span>
                <span class="tool-name">Mutators</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-quests">
                <span class="tool-icon">📜</span>
                <span class="tool-name">${this.loc.t('btn_quests')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-daily">
                <span class="tool-icon">⚡</span>
                <span class="tool-name">${this.loc.t('btn_daily')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-passport">
                <span class="tool-icon">🛂</span>
                <span class="tool-name">${this.loc.t('btn_passport')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-tournament">
                <span class="tool-icon">🏆</span>
                <span class="tool-name">${this.loc.t('btn_cups')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-practice">
                <span class="tool-icon">🎯</span>
                <span class="tool-name">${this.loc.t('btn_practice')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-achieve">
                <span class="tool-icon">🏅</span>
                <span class="tool-name">${this.loc.t('btn_achieve')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-online">
                <span class="tool-icon">🌐</span>
                <span class="tool-name">${this.loc.t('btn_online')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-replays">
                <span class="tool-icon">🎬</span>
                <span class="tool-name">${this.loc.t('btn_replays')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-locker">
                <span class="tool-icon">👕</span>
                <span class="tool-name">${this.loc.t('btn_locker')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-a11y">
                <span class="tool-icon">♿</span>
                <span class="tool-name">${this.loc.t('btn_a11y')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-cloud">
                <span class="tool-icon">☁️</span>
                <span class="tool-name">${this.loc.t('btn_cloud')}</span>
              </button>
              <button class="drawer-tool-btn" id="drawer-settings">
                <span class="tool-icon">⚙️</span>
                <span class="tool-name">${this.loc.t('btn_settings')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Hook Mode Switcher
    this.root.querySelector('#btn-mode-2p')?.addEventListener('click', () => {
      this.progression.setGameMode('local_2p');
      this.audio.playPuckBounce(1.2);
      this.showMainMenu();
    });

    this.root.querySelector('#btn-mode-ai')?.addEventListener('click', () => {
      this.progression.setGameMode('vs_ai');
      this.audio.playPuckBounce(1.4);
      this.showMainMenu();
    });

    // Hook AI Difficulty Pills
    this.root.querySelectorAll('.diff-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const diff = (e.currentTarget as HTMLElement).getAttribute('data-diff') as AIDifficulty;
        this.progression.setAIDifficulty(diff);
        this.audio.playPuckBounce(1.5);
        this.showMainMenu();
      });
    });

    // Hook Spotlight Play
    this.root.querySelector('#btn-spotlight-play')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playPuckBounce(1.5);
      this.stopMicroPreviews();
      if (this.onSelectMinigame) this.onSelectMinigame(this.spotlightMinigameId);
    });
    this.root.querySelector('#hero-spotlight-card')?.addEventListener('click', () => {
      this.audio.playPuckBounce(1.5);
      this.stopMicroPreviews();
      if (this.onSelectMinigame) this.onSelectMinigame(this.spotlightMinigameId);
    });

    // Hook Quick Shuffle
    this.root.querySelector('#btn-quick-shuffle')?.addEventListener('click', () => {
      this.executeQuickShuffle();
    });

    // Hook Party Hero Banner
    const launchParty = () => {
      this.audio.playDiceRoll();
      this.stopMicroPreviews();
      if (this.onStartPartyBoard) this.onStartPartyBoard();
    };
    this.root.querySelector('#hero-party-banner')?.addEventListener('click', launchParty);
    this.root.querySelector('#btn-hero-party')?.addEventListener('click', launchParty);

    // Hook Category Filter Pills
    this.root.querySelectorAll('.cat-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const cat = (e.currentTarget as HTMLElement).getAttribute('data-cat') as typeof this.activeCategory;
        this.activeCategory = cat;
        this.root.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
        this.audio.playPuckBounce(1.3);
        this.refreshGameGrid();
      });
    });

    // Hook Search Input
    const searchInput = this.root.querySelector('#menu-search-input') as HTMLInputElement | null;
    const clearBtn = this.root.querySelector('#btn-clear-search') as HTMLElement | null;
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'inline-flex' : 'none';
      this.refreshGameGrid();
    });
    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      this.refreshGameGrid();
    });

    // Hook Sort Pills
    this.root.querySelectorAll('.sort-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const sort = (e.currentTarget as HTMLElement).getAttribute('data-sort') as typeof this.sortMode;
        this.sortMode = sort;
        this.root.querySelectorAll('.sort-pill').forEach(p => p.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
        this.audio.playPuckBounce(1.2);
        this.refreshGameGrid();
      });
    });

    // Hook Floating Navigation Bar
    this.root.querySelector('#nav-btn-home')?.addEventListener('click', () => {
      this.audio.playPuckBounce(1.1);
      this.root.querySelector('.ui-overlay')?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    this.root.querySelector('#nav-btn-party')?.addEventListener('click', () => {
      launchParty();
    });

    this.root.querySelector('#nav-btn-gauntlet')?.addEventListener('click', () => {
      this.audio.playPuckBounce(1.4);
      if (this.onStartGauntlet) this.onStartGauntlet();
    });

    this.root.querySelector('#nav-btn-cups')?.addEventListener('click', () => {
      this.audio.playPuckBounce(1.2);
      this.showTournamentModal();
    });

    this.root.querySelector('#nav-btn-more')?.addEventListener('click', () => {
      this.openCyberDrawer();
    });

    // Hook Cyber Drawer Close
    this.root.querySelector('#btn-close-drawer')?.addEventListener('click', () => {
      this.closeCyberDrawer();
    });
    this.root.querySelector('#cyber-drawer-backdrop')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'cyber-drawer-backdrop') {
        this.closeCyberDrawer();
      }
    });

    // Hook Drawer Tools
    this.root.querySelector('#drawer-reward-ad')?.addEventListener('click', async () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      const granted = await AdManager.getInstance().showRewardedAd(
        'daily_gift',
        '+100 Coins',
        this.loc.getLanguage()
      );
      if (granted) {
        this.progression.addCoins(100);
        this.audio.playPowerUp();
        this.showMainMenu();
      }
    });

    this.root.querySelector('#drawer-mutators')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showMutatorsModal();
    });

    this.root.querySelector('#drawer-quests')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showQuestsModal();
    });

    this.root.querySelector('#drawer-daily')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showDailyModal();
    });

    this.root.querySelector('#drawer-passport')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showRivalryPassport();
    });

    this.root.querySelector('#drawer-tournament')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showTournamentModal();
    });

    this.root.querySelector('#drawer-practice')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showPracticeModal();
    });

    this.root.querySelector('#drawer-achieve')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showAchievementsModal();
    });

    this.root.querySelector('#drawer-online')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showOnlineModal();
    });

    this.root.querySelector('#drawer-replays')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showReplaysModal();
    });

    this.root.querySelector('#drawer-locker')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showLockerModal();
    });

    this.root.querySelector('#drawer-a11y')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showAccessibilityModal();
    });

    this.root.querySelector('#drawer-cloud')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showCloudModal();
    });

    this.root.querySelector('#drawer-settings')?.addEventListener('click', () => {
      this.closeCyberDrawer();
      this.audio.playPuckBounce(1.2);
      this.showSettingsModal();
    });

    // Hook Header Lang / Theme Toggles
    this.root.querySelector('#btn-lang-toggle')?.addEventListener('click', () => {
      const nextLang = this.loc.toggleLanguage();
      this.progression.setLanguage(nextLang);
      this.audio.playReflexChime();
      if (this.onLanguageChanged) this.onLanguageChanged(nextLang);
      this.showMainMenu();
    });

    this.root.querySelector('#btn-theme-toggle')?.addEventListener('click', () => {
      const newTheme = this.progression.toggleTheme();
      this.audio.playPowerUp();
      if (this.onThemeChanged) this.onThemeChanged(newTheme);
      this.showMainMenu();
    });

    // Attach card clicks & tilts
    const mainGrid = this.root.querySelector('#main-minigame-grid');
    if (mainGrid) this.attachCardEvents(mainGrid);

    this.initMicroPreviews();
  }

  private attach3DCardTilt(card: HTMLElement) {
    // Skip tilt on touch devices: saves GPU + avoids sticky transforms
    if (window.matchMedia('(hover: none)').matches) return;
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -7;
      const rotateY = ((x - centerX) / centerX) * 7;
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('pointerleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
  }

  private executeQuickShuffle() {
    let count = 0;
    const maxSteps = 16;

    const shuffleStep = () => {
      const randIdx = Math.floor(Math.random() * this.ALL_MINIGAMES.length);
      const chosen = this.ALL_MINIGAMES[randIdx];

      this.root.querySelectorAll('.game-card').forEach(c => {
        (c as HTMLElement).style.outline = 'none';
        if (c.getAttribute('data-id') === chosen) {
          (c as HTMLElement).style.outline = '3px solid #FFD700';
          c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      this.audio.playPuckBounce(1.0 + (count / maxSteps) * 0.8);
      count++;

      if (count < maxSteps) {
        setTimeout(shuffleStep, 60 + count * 15);
      } else {
        setTimeout(() => {
          this.stopMicroPreviews();
          if (this.onSelectMinigame) this.onSelectMinigame(chosen);
        }, 350);
      }
    };

    shuffleStep();
  }

  // --- 30 FPS Micro-Previews (throttled + offscreen-culled for battery) ---
  private previewObserver: IntersectionObserver | null = null;

  private initMicroPreviews() {
    const contexts: Map<string, { ctx: CanvasRenderingContext2D; w: number; h: number; visible: boolean }> = new Map();

    for (const id of this.ALL_MINIGAMES) {
      const c = document.getElementById(`canvas-mini-${id}`) as HTMLCanvasElement;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) contexts.set(id, { ctx, w: c.width, h: c.height, visible: true });
      }
    }

    const spot = document.getElementById('canvas-mini-spotlight') as HTMLCanvasElement;
    if (spot) {
      const sCtx = spot.getContext('2d');
      if (sCtx) contexts.set('spotlight', { ctx: sCtx, w: spot.width, h: spot.height, visible: true });
    }

    // Cull offscreen cards: the menu scrolls, most of the previews are
    // offscreen at any time — painting all of them every frame wastes GPU.
    try {
      this.previewObserver?.disconnect();
      this.previewObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const canvas = e.target as HTMLCanvasElement;
          const key = canvas.id === 'canvas-mini-spotlight' ? 'spotlight' : canvas.id.replace('canvas-mini-', '');
          const rec = contexts.get(key);
          if (rec) rec.visible = e.isIntersecting;
        }
      }, { root: this.root.querySelector('.ui-overlay'), threshold: 0.05 });
      for (const id of contexts.keys()) {
        const c = id === 'spotlight' ? document.getElementById('canvas-mini-spotlight') : document.getElementById(`canvas-mini-${id}`);
        if (c) this.previewObserver.observe(c);
      }
    } catch {
      // IntersectionObserver unavailable: render everything (old behavior)
    }

    let lastT = performance.now();
    let acc = 0;

    const renderLoop = (t: number) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      this.previewTime += dt;
      // Throttle painting to ~30fps; animation time still advances smoothly
      acc += dt;
      if (acc >= 1 / 30) {
        acc = 0;
        for (const [idKey, target] of contexts.entries()) {
          if (!target.visible) continue;
          const cleanId = (idKey === 'spotlight' ? this.spotlightMinigameId : idKey) as MinigameId;
          this.renderSpecificMiniPreview(cleanId, target.ctx, target.w, target.h);
        }
      }

      this.previewAnimFrameId = requestAnimationFrame(renderLoop);
    };

    this.previewAnimFrameId = requestAnimationFrame(renderLoop);
  }

  public stopMicroPreviews() {
    if (this.previewAnimFrameId !== null) {
      cancelAnimationFrame(this.previewAnimFrameId);
      this.previewAnimFrameId = null;
    }
    try {
      this.previewObserver?.disconnect();
    } catch {
      // noop
    }
    this.previewObserver = null;
  }

  // Append a modal AND register it for back-button handling.
  // backAction decides what the system back button does on this modal:
  // 'close' removes it, 'menu' quits to the menu, 'resume' unpauses.
  public presentModal(modal: HTMLElement, backAction: 'close' | 'menu' | 'resume' = 'close'): void {
    modal.dataset.back = backAction;
    this.root.appendChild(modal); // NOTE: direct DOM append (do NOT route through presentModal)
    this.modalStack.push(modal);
    if (this.onModalOpened) this.onModalOpened();
  }

  // Button-driven close: removes the modal and consumes its history entry.
  // Pass followedByPush=true when the caller pushes a new entry right away
  // (match/modal launches): history.back() is async, so backing then pushing
  // in the same task resolves against the wrong entry and corrupts the stack.
  // Dropping just forgets the counter — the stale forward entry is discarded
  // by the upcoming pushState and the back handler is state-based anyway.
  public dismissModal(modal: HTMLElement, followedByPush = false): void {
    const idx = this.modalStack.indexOf(modal);
    if (idx !== -1) this.modalStack.splice(idx, 1);
    modal.remove(); // NOTE: direct DOM remove (do NOT route through dismissModal)
    if (this.onModalClosed) this.onModalClosed(followedByPush);
  }

  // History-driven close (system back button): the entry is already popped,
  // so this only updates the DOM/stack. Returns the closed modal or null.
  public popModal(): HTMLElement | null {
    const top = this.modalStack.pop() ?? null;
    if (top) top.remove();
    return top;
  }

  // Full-screen renders wipe all modal DOM: keep the stack in sync.
  private wipeModals(): void {
    this.modalStack = [];
  }

  private drawMiniBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, glowColor = '#00F0FF') {
    const isDay = this.progression.getThemePreference() === 'day';
    
    // 1. Deep atmospheric cyber gradient
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.55);
    if (isDay) {
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.65, '#EEF4FB');
      grad.addColorStop(1, '#D8E4F4');
    } else {
      grad.addColorStop(0, '#101626');
      grad.addColorStop(0.6, '#090D18');
      grad.addColorStop(1, '#04060A');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 2. Center ambient spotlight glow
    ctx.save();
    ctx.globalAlpha = isDay ? 0.12 : 0.22;
    const centerGlow = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.45);
    centerGlow.addColorStop(0, glowColor);
    centerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 3. Subtle cyber grid
    ctx.save();
    ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.08)' : 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridStep = 24;
    for (let x = gridStep; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = gridStep; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 4. Tech corner brackets
    ctx.strokeStyle = isDay ? 'rgba(0, 132, 255, 0.4)' : 'rgba(0, 240, 255, 0.45)';
    ctx.lineWidth = 1.5;
    const bLen = 8;
    ctx.beginPath(); ctx.moveTo(6, 6 + bLen); ctx.lineTo(6, 6); ctx.lineTo(6 + bLen, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 6 - bLen, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, 6 + bLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, h - 6 - bLen); ctx.lineTo(6, h - 6); ctx.lineTo(6 + bLen, h - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 6 - bLen, h - 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6, h - 6 - bLen); ctx.stroke();

    // 5. Scanline sheen beam sweep
    const sweepY = ((this.previewTime * 35) % (h + 30)) - 15;
    ctx.fillStyle = isDay ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 240, 255, 0.06)';
    ctx.fillRect(0, sweepY, w, 2);
    ctx.restore();
  }

  private renderSpecificMiniPreview(id: MinigameId, ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);

    switch (id) {
      case 'neon_volley': {
        this.drawMiniBackdrop(ctx, w, h, '#00F0FF');
        const t = (this.previewTime * 2.0) % (Math.PI * 2);

        // Ground line
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, h - 14);
        ctx.lineTo(w - 14, h - 14);
        ctx.stroke();

        // High-tech laser net
        ctx.save();
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.38);
        ctx.lineTo(w * 0.5, h - 14);
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(w * 0.5 - 4, h * 0.38 - 3, 8, 4);
        ctx.restore();

        // Parabolic ball flight
        const ballX = w * 0.5 + Math.sin(t) * (w * 0.36);
        const ballY = (h - 18) - Math.abs(Math.cos(t)) * (h * 0.62);

        // Flame comet trail
        for (let i = 1; i <= 4; i++) {
          const trailT = t - i * 0.12;
          const tx = w * 0.5 + Math.sin(trailT) * (w * 0.36);
          const ty = (h - 18) - Math.abs(Math.cos(trailT)) * (h * 0.62);
          ctx.fillStyle = i === 1 ? '#FFD700' : '#FF4400';
          ctx.globalAlpha = 0.5 - i * 0.1;
          ctx.beginPath();
          ctx.arc(tx, ty, 7 - i * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Blazing volleyball
        ctx.save();
        ctx.shadowColor = '#FF9900';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ballX - 2, ballY - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Jumping player silhouettes
        const p1Jump = Math.max(0, -Math.sin(t)) * 16;
        const p2Jump = Math.max(0, Math.sin(t)) * 16;
        // P1 (Left - Pink)
        ctx.fillStyle = '#FF0055';
        ctx.beginPath();
        ctx.arc(w * 0.22, h - 22 - p1Jump, 8, 0, Math.PI * 2);
        ctx.fill();
        // P2 (Right - Blue)
        ctx.fillStyle = '#0084FF';
        ctx.beginPath();
        ctx.arc(w * 0.78, h - 22 - p2Jump, 8, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'quantum_tug': {
        this.drawMiniBackdrop(ctx, w, h, '#7928CA');
        const coreX = w * 0.5 + Math.sin(this.previewTime * 3.5) * (w * 0.22);
        const cy = h * 0.5;

        // Magnetic Pylons
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.fillRect(18, cy - 14, 8, 28);
        ctx.fillStyle = '#0084FF';
        ctx.shadowColor = '#0084FF';
        ctx.fillRect(w - 26, cy - 14, 8, 28);
        ctx.restore();

        // Crackling electric lightning rope
        const drawLightning = (x1: number, x2: number, color: string) => {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(x1, cy);
          const steps = 6;
          for (let i = 1; i < steps; i++) {
            const frac = i / steps;
            const px = x1 + (x2 - x1) * frac;
            const jitter = Math.sin(this.previewTime * 24 + i * 2) * 8;
            ctx.lineTo(px, cy + jitter);
          }
          ctx.lineTo(x2, cy);
          ctx.stroke();
          ctx.restore();
        };

        drawLightning(26, coreX, '#FF0055');
        drawLightning(coreX, w - 26, '#00F0FF');

        // Central Quantum Plasma Core
        ctx.save();
        ctx.translate(coreX, cy);
        ctx.rotate(this.previewTime * 4);
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(coreX, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'astro_blast': {
        this.drawMiniBackdrop(ctx, w, h, '#0084FF');
        // Twinkling cosmos
        for (let i = 0; i < 9; i++) {
          const sx = (i * 37 + 19) % w;
          const sy = (i * 23 + 11) % h;
          const alpha = 0.3 + 0.7 * Math.abs(Math.sin(this.previewTime * 3 + i));
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.fillRect(sx, sy, 2, 2);
        }

        // P1 Ship (Pink)
        const s1x = w * 0.25;
        const s1y = h * 0.5 + Math.sin(this.previewTime * 2.4) * 12;
        ctx.save();
        ctx.translate(s1x, s1y);
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-10, -9); ctx.lineTo(-6, 0); ctx.lineTo(-10, 9);
        ctx.closePath();
        ctx.fill();
        // Ion flame
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(-14 - Math.random() * 5, -2, 6, 4);
        ctx.restore();

        // P2 Ship (Blue)
        const s2x = w * 0.75;
        const s2y = h * 0.5 + Math.cos(this.previewTime * 2.4) * 12;
        ctx.save();
        ctx.translate(s2x, s2y);
        ctx.fillStyle = '#0084FF';
        ctx.shadowColor = '#0084FF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(-12, 0); ctx.lineTo(10, -9); ctx.lineTo(6, 0); ctx.lineTo(10, 9);
        ctx.closePath();
        ctx.fill();
        // Ion flame
        ctx.fillStyle = '#FF0055';
        ctx.fillRect(8 + Math.random() * 5, -2, 6, 4);
        ctx.restore();

        // Lasers firing & crossing
        const laserT = (this.previewTime * 280) % (w * 0.6);
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.fillRect(s1x + 14 + laserT, s1y - 1.5, 14, 3);
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.fillRect(s2x - 14 - laserT, s2y - 1.5, 14, 3);
        ctx.restore();
        break;
      }

      case 'cyber_hoops': {
        this.drawMiniBackdrop(ctx, w, h, '#FF9900');
        const hoopX = w - 42;
        const hoopY = h * 0.44;

        // Backboard
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.strokeRect(hoopX + 16, hoopY - 22, 4, 36);

        // Neon Orange Rim & Cyber Net
        ctx.save();
        ctx.strokeStyle = '#FF6B00';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#FF6B00';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(hoopX - 16, hoopY);
        ctx.lineTo(hoopX + 16, hoopY);
        ctx.stroke();
        // Dangling Net Strings
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(hoopX - 14, hoopY);
        ctx.lineTo(hoopX - 6, hoopY + 16);
        ctx.lineTo(hoopX + 6, hoopY + 16);
        ctx.lineTo(hoopX + 14, hoopY);
        ctx.stroke();
        ctx.restore();

        // Ball Arc Shot
        const shotT = (this.previewTime * 1.3) % 1;
        const bx = 28 + shotT * (hoopX - 28);
        const by = (h * 0.8) - Math.sin(shotT * Math.PI) * (h * 0.58);

        // Fiery Trail
        for (let i = 1; i <= 3; i++) {
          const tOld = Math.max(0, shotT - i * 0.05);
          const oldX = 28 + tOld * (hoopX - 28);
          const oldY = (h * 0.8) - Math.sin(tOld * Math.PI) * (h * 0.58);
          ctx.fillStyle = '#FF4400';
          ctx.globalAlpha = 0.5 - i * 0.12;
          ctx.beginPath();
          ctx.arc(oldX, oldY, 7 - i * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Flaming Basketball
        ctx.save();
        ctx.shadowColor = '#FF8800';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#FFAA00';
        ctx.beginPath();
        ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Swish Particle Flash
        if (shotT > 0.88) {
          ctx.save();
          ctx.strokeStyle = '#FFD700';
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(hoopX, hoopY, (shotT - 0.88) * 120, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case 'laser_pinball': {
        this.drawMiniBackdrop(ctx, w, h, '#00F0FF');
        // Slanted Outer Guide Rails
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(14, 10, w - 28, h - 20);

        // 3 Neon Bumpers
        const bumpers = [
          { x: w * 0.35, y: h * 0.42, color: '#00F0FF' },
          { x: w * 0.65, y: h * 0.42, color: '#FF0055' },
          { x: w * 0.50, y: h * 0.64, color: '#FFB800' }
        ];

        bumpers.forEach((bmp, idx) => {
          const pulse = Math.sin(this.previewTime * 6 + idx * 2) * 2;
          ctx.save();
          ctx.fillStyle = bmp.color;
          ctx.shadowColor = bmp.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(bmp.x, bmp.y, 8 + pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(bmp.x, bmp.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });

        // Flippers
        const flipAngle = Math.sin(this.previewTime * 8) > 0.3 ? -0.4 : 0.2;
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        // Left Flipper
        ctx.beginPath();
        ctx.moveTo(w * 0.35, h - 16);
        ctx.lineTo(w * 0.35 + Math.cos(flipAngle) * 22, (h - 16) + Math.sin(flipAngle) * 12);
        ctx.stroke();
        // Right Flipper
        ctx.beginPath();
        ctx.moveTo(w * 0.65, h - 16);
        ctx.lineTo(w * 0.65 - Math.cos(flipAngle) * 22, (h - 16) + Math.sin(flipAngle) * 12);
        ctx.stroke();
        ctx.restore();

        // Chrome Ball Ricochet
        const ballT = this.previewTime * 3.2;
        const ballX = w * 0.5 + Math.sin(ballT) * (w * 0.28);
        const ballY = h * 0.5 + Math.cos(ballT * 1.5) * (h * 0.26);

        ctx.save();
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'chroma_reaction': {
        this.drawMiniBackdrop(ctx, w, h, '#FF0055');
        const cx = w * 0.5;
        const cy = h * 0.5;

        // Rotating Calibration Reticle
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.previewTime * 2.2);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Pulsing Target Crosshairs
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 36, cy); ctx.lineTo(cx + 36, cy);
        ctx.moveTo(cx, cy - 36); ctx.lineTo(cx, cy + 36);
        ctx.stroke();

        // Center Chromatic Core (Cycling Neon Color)
        const palette = ['#FF0055', '#00F0FF', '#00FF66', '#FFB800'];
        const colIdx = Math.floor(this.previewTime * 2.5) % palette.length;
        const curColor = palette[colIdx];

        ctx.save();
        ctx.shadowColor = curColor;
        ctx.shadowBlur = 24;
        ctx.fillStyle = curColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Telemetry Digital Readout
        ctx.save();
        ctx.fillStyle = curColor;
        ctx.font = '900 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚡ 0.128s REFLEX', cx, h - 10);
        ctx.restore();
        break;
      }

      case 'chroma_pairs': {
        this.drawMiniBackdrop(ctx, w, h, '#7928CA');
        const cardW = 38;
        const cardH = 50;
        const startX = (w - (4 * cardW + 3 * 10)) * 0.5;
        const cy = h * 0.5;

        for (let i = 0; i < 4; i++) {
          const x = startX + i * (cardW + 10);
          const flipT = Math.cos(this.previewTime * 2.5 + i * 0.6);
          const scaleX = Math.abs(flipT);

          ctx.save();
          ctx.translate(x + cardW * 0.5, cy);
          ctx.scale(scaleX, 1);

          if (flipT >= 0) {
            // Front face (Holographic Glyph)
            ctx.fillStyle = 'rgba(24, 32, 54, 0.9)';
            ctx.strokeStyle = i % 2 === 0 ? '#00F0FF' : '#FFD700';
            ctx.lineWidth = 2;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 8;
            ctx.fillRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH);
            ctx.strokeRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH);
            // Glyph icon
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i % 2 === 0 ? '⚡' : '⭐', 0, 0);
          } else {
            // Back face (Cyber Lattice)
            ctx.fillStyle = 'rgba(121, 40, 202, 0.7)';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.fillRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH);
            ctx.strokeRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH);
          }
          ctx.restore();
        }

        // Match Lightning Tether between pair (cards 1 and 3)
        if (Math.sin(this.previewTime * 2.5) > 0.5) {
          ctx.save();
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(startX + cardW * 0.5, cy);
          ctx.lineTo(startX + 2 * (cardW + 10) + cardW * 0.5, cy);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case 'cyber_hockey': {
        this.drawMiniBackdrop(ctx, w, h, '#00F0FF');
        // Rink Markings
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(16, 10, w - 32, h - 20);
        // Center ice line
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.4)';
        ctx.beginPath();
        ctx.moveTo(w * 0.5, 10); ctx.lineTo(w * 0.5, h - 10);
        ctx.stroke();
        // Center faceoff circle
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, 18, 0, Math.PI * 2);
        ctx.stroke();

        // P1 Mallet (Pink - Left)
        const m1x = w * 0.22 + Math.cos(this.previewTime * 3) * 14;
        const m1y = h * 0.5 + Math.sin(this.previewTime * 3.5) * 12;
        ctx.save();
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(m1x, m1y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // P2 Mallet (Cyan - Right)
        const m2x = w * 0.78 - Math.cos(this.previewTime * 3) * 14;
        const m2y = h * 0.5 - Math.sin(this.previewTime * 3.5) * 12;
        ctx.save();
        ctx.fillStyle = '#0084FF';
        ctx.shadowColor = '#0084FF';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(m2x, m2y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Supersonic Puck with comet trail
        const puckX = w * 0.5 + Math.sin(this.previewTime * 5.5) * (w * 0.32);
        const puckY = h * 0.5 + Math.cos(this.previewTime * 4.2) * 14;

        for (let i = 1; i <= 4; i++) {
          const oldX = w * 0.5 + Math.sin(this.previewTime * 5.5 - i * 0.08) * (w * 0.32);
          const oldY = h * 0.5 + Math.cos(this.previewTime * 4.2 - i * 0.08) * 14;
          ctx.fillStyle = '#00F0FF';
          ctx.globalAlpha = 0.5 - i * 0.1;
          ctx.beginPath();
          ctx.arc(oldX, oldY, 6 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(puckX, puckY, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'physics_sumo': {
        this.drawMiniBackdrop(ctx, w, h, '#FFCC00');
        const cx = w * 0.5;
        const cy = h * 0.5;

        // Circular Dojo Electric Ring
        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Charging cycle
        const clashDist = Math.abs(Math.sin(this.previewTime * 3.2)) * 26 + 6;
        const p1x = cx - clashDist;
        const p2x = cx + clashDist;

        // P1 Mech (Pink)
        ctx.save();
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p1x, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(p1x + 2, cy - 2, 4, 4);
        ctx.restore();

        // P2 Mech (Blue)
        ctx.save();
        ctx.fillStyle = '#0084FF';
        ctx.shadowColor = '#0084FF';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p2x, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(p2x - 6, cy - 2, 4, 4);
        ctx.restore();

        // Collision Sparks & Shockwave on Impact
        if (clashDist < 9) {
          ctx.save();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(cx, cy, 16, 0, Math.PI * 2);
          ctx.stroke();
          // Radiating spark burst
          for (let a = 0; a < 6; a++) {
            const ang = (a * Math.PI) / 3;
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 12, 3, 3);
          }
          ctx.restore();
        }
        break;
      }

      case 'tactical_tanks': {
        this.drawMiniBackdrop(ctx, w, h, '#00F0FF');
        // Battlefield Obstacles
        ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.5;
        ctx.fillRect(w * 0.44, h * 0.25, 8, 20);
        ctx.strokeRect(w * 0.44, h * 0.25, 8, 20);
        ctx.fillRect(w * 0.54, h * 0.55, 8, 20);
        ctx.strokeRect(w * 0.54, h * 0.55, 8, 20);

        // P1 Tank (Pink)
        const t1x = w * 0.22 + Math.sin(this.previewTime * 2) * 10;
        const t1y = h * 0.65;
        ctx.save();
        ctx.translate(t1x, t1y);
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 10;
        ctx.fillRect(-10, -7, 20, 14);
        // Turret barrel
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(14, -6);
        ctx.stroke();
        ctx.restore();

        // P2 Tank (Blue)
        const t2x = w * 0.78 - Math.sin(this.previewTime * 2) * 10;
        const t2y = h * 0.35;
        ctx.save();
        ctx.translate(t2x, t2y);
        ctx.fillStyle = '#0084FF';
        ctx.shadowColor = '#0084FF';
        ctx.shadowBlur = 10;
        ctx.fillRect(-10, -7, 20, 14);
        // Turret barrel
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-14, 6);
        ctx.stroke();
        ctx.restore();

        // Laser Shell Shot & Ricochet
        const shellT = (this.previewTime * 2.8) % 1;
        const sx = t1x + shellT * (t2x - t1x);
        const sy = t1y + shellT * (t2y - t1y);
        ctx.save();
        ctx.fillStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'counter_dash': {
        this.drawMiniBackdrop(ctx, w, h, '#FF0055');
        const cx = w * 0.5;
        const cy = h * 0.52;

        // Cyber Sakura / Sparks
        for (let i = 0; i < 6; i++) {
          const px = (i * 43 + this.previewTime * 15) % w;
          const py = (i * 27 + Math.sin(this.previewTime + i) * 10) % h;
          ctx.fillStyle = 'rgba(255, 0, 85, 0.4)';
          ctx.fillRect(px, py, 3, 3);
        }

        // Lunge & Clash Cycle
        const lunge = Math.sin(this.previewTime * 3) > 0.2;
        const p1x = cx - (lunge ? 18 : 42);
        const p2x = cx + (lunge ? 18 : 42);

        // P1 Duelist (Pink)
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p1x, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        // Katana Blade
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p1x, cy);
        ctx.lineTo(p1x + (lunge ? 22 : 12), cy - (lunge ? 4 : 10));
        ctx.stroke();

        // P2 Duelist (Blue)
        ctx.fillStyle = '#0084FF';
        ctx.shadowColor = '#0084FF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p2x, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        // Katana Blade
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p2x, cy);
        ctx.lineTo(p2x - (lunge ? 22 : 12), cy - (lunge ? 4 : 10));
        ctx.stroke();

        // Gold Parry Clash Ring
        if (lunge) {
          ctx.save();
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(cx, cy - 4, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('PARRY!', cx, cy - 20);
          ctx.restore();
        }
        break;
      }

      case 'laser_drift': {
        this.drawMiniBackdrop(ctx, w, h, '#FF6B00');
        const cx = w * 0.5;
        const cy = h * 0.5;

        // Glowing Synthwave Curved Track
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 107, 0, 0.35)';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.36, h * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Neon Curbs
        ctx.strokeStyle = '#FF6B00';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#FF6B00';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.36 + 10, h * 0.32 + 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Drifting Car Position & Angle
        const carAngle = this.previewTime * 2.4;
        const carX = cx + Math.cos(carAngle) * (w * 0.36);
        const carY = cy + Math.sin(carAngle) * (h * 0.32);
        const slipAngle = carAngle + Math.PI * 0.5 + 0.35; // Drift slip

        // Skid mark particles behind car
        for (let s = 1; s <= 4; s++) {
          const oldA = carAngle - s * 0.08;
          ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
          ctx.fillRect(cx + Math.cos(oldA) * (w * 0.36), cy + Math.sin(oldA) * (h * 0.32), 3, 3);
        }

        // Drifting Supercar
        ctx.save();
        ctx.translate(carX, carY);
        ctx.rotate(slipAngle);
        ctx.fillStyle = '#FF4400';
        ctx.shadowColor = '#FF6B00';
        ctx.shadowBlur = 12;
        ctx.fillRect(-10, -6, 20, 12);
        // Windshield
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(1, -4, 5, 8);
        // Nitro Flames
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(-15 - Math.random() * 4, -4, 5, 3);
        ctx.fillRect(-15 - Math.random() * 4, 1, 5, 3);
        ctx.restore();
        break;
      }

      case 'neon_orbit': {
        this.drawMiniBackdrop(ctx, w, h, '#9D00FF');
        const cx = w * 0.5;
        const cy = h * 0.5;

        // Concentric Orbital Gravitational Rings
        for (let r = 1; r <= 3; r++) {
          ctx.save();
          ctx.strokeStyle = `rgba(157, 0, 255, ${0.15 + r * 0.1})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.arc(cx, cy, r * 13, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Singularity Black Hole Core
        ctx.save();
        ctx.fillStyle = '#06080F';
        ctx.strokeStyle = '#9D00FF';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#9D00FF';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Orbiting Curved Paddles
        const padAngle1 = this.previewTime * 2.2;
        const padAngle2 = padAngle1 + Math.PI;

        ctx.save();
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        // P1 Paddle (Cyan)
        ctx.strokeStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, 32, padAngle1 - 0.35, padAngle1 + 0.35);
        ctx.stroke();
        // P2 Paddle (Pink)
        ctx.strokeStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, 32, padAngle2 - 0.35, padAngle2 + 0.35);
        ctx.stroke();
        ctx.restore();

        // Plasma Comet Particle
        const cometAngle = this.previewTime * 4.5;
        const cometR = 24 + Math.sin(this.previewTime * 3) * 6;
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(cometAngle) * cometR, cy + Math.sin(cometAngle) * cometR, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'memory_matrix': {
        this.drawMiniBackdrop(ctx, w, h, '#00F0FF');
        const cx = w * 0.5;
        const cy = h * 0.5;
        const step = Math.floor(this.previewTime * 3.2) % 4;
        const seq = [0, 4, 8, 2];
        const activeNode = seq[step];

        // Circuit board traces connecting nodes
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 26, cy - 26, 52, 52);

        // 3x3 Nodes
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const id = r * 3 + c;
            const nx = cx - 24 + c * 24;
            const ny = cy - 24 + r * 24;
            const isLit = id === activeNode;

            ctx.save();
            if (isLit) {
              ctx.fillStyle = '#00F0FF';
              ctx.shadowColor = '#00F0FF';
              ctx.shadowBlur = 18;
              ctx.beginPath();
              ctx.arc(nx, ny, 8, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(nx, ny, 4, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
              ctx.beginPath();
              ctx.arc(nx, ny, 6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }
        break;
      }

      case 'cyber_simon': {
        this.drawMiniBackdrop(ctx, w, h, '#00FF66');
        const cx = w * 0.5;
        const cy = h * 0.5;
        const colors = ['#00F0FF', '#FF0055', '#FFB800', '#00FF66'];
        const lit = Math.floor(this.previewTime * 2.8) % 4;

        // 4 Illuminated Quarters
        for (let i = 0; i < 4; i++) {
          const isLit = lit === i;
          const col = colors[i];
          const startAngle = (i * Math.PI) / 2 + 0.08;
          const endAngle = ((i + 1) * Math.PI) / 2 - 0.08;

          ctx.save();
          ctx.strokeStyle = isLit ? col : 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 14;
          if (isLit) {
            ctx.shadowColor = col;
            ctx.shadowBlur = 18;
          }
          ctx.beginPath();
          ctx.arc(cx, cy, 26, startAngle, endAngle);
          ctx.stroke();
          ctx.restore();
        }

        // Rotating Holographic Radar Scanner Beam
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.previewTime * 3);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(34, 0);
        ctx.stroke();
        ctx.restore();

        // Center Acoustic Core
        ctx.save();
        ctx.fillStyle = '#0B0E14';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'cyber_slicer': {
        this.drawMiniBackdrop(ctx, w, h, '#FF0055');
        const cx = w * 0.5;
        const cy = h * 0.5;
        // slashing blade sweep
        const sweepX = cx + Math.sin(this.previewTime * 4) * (w * 0.3);
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(sweepX - 40, cy - 26);
        ctx.quadraticCurveTo(sweepX, cy, sweepX + 40, cy + 26);
        ctx.stroke();
        ctx.restore();
        // orbs
        for (let i = 0; i < 3; i++) {
          const ox = 40 + i * 70 + Math.sin(this.previewTime * 2 + i) * 8;
          const oy = cy + Math.cos(this.previewTime * 3 + i * 2) * 14;
          ctx.save();
          ctx.fillStyle = i === 1 ? '#FFD700' : '#00F0FF';
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(ox, oy, 9, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      }

      case 'synthwave_rhythm': {
        this.drawMiniBackdrop(ctx, w, h, '#FF00FF');
        const lineY = h * 0.72;
        ctx.save();
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#FF00FF'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(16, lineY); ctx.lineTo(w - 16, lineY); ctx.stroke();
        ctx.restore();
        for (let l = 0; l < 4; l++) {
          const x = 20 + (l + 0.5) * ((w - 40) / 4);
          const ny = lineY - ((this.previewTime * 120 + l * 34) % 70);
          ctx.save();
          ctx.fillStyle = l % 2 === 0 ? '#00F0FF' : '#FFD700';
          ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(x, Math.max(8, ny), 7, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      }

      case 'gravity_runner': {
        this.drawMiniBackdrop(ctx, w, h, '#00FF99');
        const top = h * 0.3;
        const bottom = h * 0.7;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,255,153,0.4)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(10, top); ctx.lineTo(w - 10, top); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, bottom); ctx.lineTo(w - 10, bottom); ctx.stroke();
        ctx.restore();
        const onTop = Math.sin(this.previewTime * 2.4) > 0;
        const ry = onTop ? top : bottom;
        const rx = w * 0.32;
        ctx.save();
        ctx.fillStyle = '#00FF99';
        ctx.shadowColor = '#00FF99'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(rx, ry, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        const ox = w - ((this.previewTime * 90) % (w + 40)) + 20;
        ctx.save();
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(ox - 5, top - 8, 10, (bottom + 8) - (top - 8));
        ctx.fillStyle = '#06080F';
        ctx.fillRect(ox - 5, (onTop ? bottom : top) - 12, 10, 24);
        ctx.restore();
        break;
      }

      case 'neon_blade': {
        this.drawMiniBackdrop(ctx, w, h, '#FFE600');
        const cy = h * 0.5;

        // Center line
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 230, 0, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(10, cy);
        ctx.lineTo(w - 10, cy);
        ctx.stroke();
        ctx.restore();

        // Top blade (Red)
        ctx.save();
        ctx.strokeStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.25);
        ctx.lineTo(w * 0.8, h * 0.25);
        ctx.stroke();
        ctx.restore();

        // Bottom blade (Cyan)
        ctx.save();
        ctx.strokeStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.75);
        ctx.lineTo(w * 0.8, h * 0.75);
        ctx.stroke();
        ctx.restore();

        // Animated Slash Strike
        const phase = (this.previewTime * 1.8) % 2.5;
        if (phase > 1.2) {
          const slashProgress = Math.min(1.0, (phase - 1.2) * 5.0);
          ctx.save();
          ctx.strokeStyle = '#FFE600';
          ctx.shadowColor = '#FFE600';
          ctx.shadowBlur = 14;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(15, h * 0.2 + 20);
          ctx.lineTo(15 + (w - 30) * slashProgress, (h * 0.2 + 20) + (h * 0.55) * slashProgress);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case 'cyber_bomb': {
        this.drawMiniBackdrop(ctx, w, h, '#FF0055');
        const cy = h * 0.5;
        const t = this.previewTime * 3.0;

        // Danger net
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.35)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(8, cy);
        ctx.lineTo(w - 8, cy);
        ctx.stroke();
        ctx.restore();

        // Bouncing bomb
        const bx = w * 0.5 + Math.sin(t * 0.8) * (w * 0.3);
        const by = cy + Math.sin(t) * (h * 0.32);

        // Bomb glow
        ctx.save();
        ctx.fillStyle = '#FF0055';
        ctx.shadowColor = '#FF0055';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Paddles
        const p1x = w * 0.5 + Math.sin(t * 0.8) * (w * 0.25);
        const p2x = w * 0.5 - Math.sin(t * 0.8) * (w * 0.25);

        ctx.save();
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(p1x - 18, h * 0.88, 36, 6);
        ctx.fillStyle = '#FF0055';
        ctx.fillRect(p2x - 18, h * 0.12 - 6, 36, 6);
        ctx.restore();
        break;
      }
    }
  }

  // --- SETTINGS MODAL (Audio, Announcer, CRT Scanlines, Chassis Mode) ---
  public showSettingsModal() {
    const audio = this.progression.getAudioSettings();

    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal settings-modal">
        <h2 class="modal-title">${this.loc.t('sound_settings')}</h2>
        
        <!-- Music Volume Slider -->
        <div class="setting-row">
          <div class="setting-label">${this.loc.t('music_volume')}</div>
          <input type="range" min="0" max="100" value="${Math.round(audio.musicVolume * 100)}" id="slider-music">
        </div>

        <!-- SFX Volume Slider -->
        <div class="setting-row">
          <div class="setting-label">${this.loc.t('sfx_volume')}</div>
          <input type="range" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}" id="slider-sfx">
        </div>

        <!-- Dynamic Announcer Toggle -->
        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('voice_announcer')}</div>
          </div>
          <button class="mutator-toggle ${audio.announcerEnabled ? 'active' : ''}" id="toggle-announcer"></button>
        </div>

        <!-- CRT Scanlines Retro Toggle -->
        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('crt_scanlines')}</div>
          </div>
          <button class="mutator-toggle ${audio.crtScanlines ? 'active' : ''}" id="toggle-crt"></button>
        </div>

        <!-- Exclusive Mobile Mode Indicator -->
        <div style="margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.28); display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 22px;">📱</span>
          <div>
            <div style="font-size: 13px; font-weight: 900; color: #00F0FF;">${this.loc.getLanguage() === 'ar' ? 'وضع الهاتف الذكي الحصري' : 'Smartphone Exclusive Mode'}</div>
            <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">${this.loc.getLanguage() === 'ar' ? 'مصممة خصيصاً للوضع العمودي لمواجهات 1v1 وجهاً لوجه' : 'Engineered strictly for portrait 1v1 face-to-face duels'}</div>
          </div>
        </div>

        <!-- Real Fullscreen Trigger -->
        <div style="margin-top: 14px;">
          <button class="modal-btn" id="btn-toggle-native-fs">${this.loc.t('btn_fullscreen')}</button>
        </div>

        <div class="modal-btn-group" style="margin-top: 20px;">
          <button class="modal-btn primary" id="btn-close-settings">${this.loc.t('close')}</button>
        </div>
      </div>
    `;

    // Sliders
    modal.querySelector('#slider-music')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value) / 100;
      this.progression.setAudioSettings({ musicVolume: val });
      this.audio.setMusicVolume(val);
    });

    modal.querySelector('#slider-sfx')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value) / 100;
      this.progression.setAudioSettings({ sfxVolume: val });
      this.audio.setSfxVolume(val);
    });

    // Toggles
    const btnAnnounce = modal.querySelector('#toggle-announcer') as HTMLElement;
    btnAnnounce?.addEventListener('click', () => {
      const cur = !this.progression.getAudioSettings().announcerEnabled;
      this.progression.setAudioSettings({ announcerEnabled: cur });
      this.audio.music.setAnnouncerEnabled(cur);
      btnAnnounce.classList.toggle('active', cur);
      if (cur) this.audio.announce('Announcer Enabled', this.loc.getLanguage());
    });

    const btnCrt = modal.querySelector('#toggle-crt') as HTMLElement;
    btnCrt?.addEventListener('click', () => {
      const cur = !this.progression.getAudioSettings().crtScanlines;
      this.progression.setAudioSettings({ crtScanlines: cur });
      this.juice.crtScanlinesEnabled = cur;
      btnCrt.classList.toggle('active', cur);
    });

    // Native Fullscreen
    modal.querySelector('#btn-toggle-native-fs')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    modal.querySelector('#btn-close-settings')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  // --- GAUNTLET MODAL (AI Boss Rush Screen) ---
  public showGauntletModal(gauntlet: GauntletManager, onStartMatch: (minigame: MinigameId) => void, onExit: () => void) {
    const state = gauntlet.getState();
    const stage = gauntlet.getCurrentStage();

    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';

    if (state.isGameOver) {
      modal.innerHTML = `
        <div class="glass-modal">
          <div class="trophy-icon">💀</div>
          <h2 class="modal-title" style="color: #FF0055">${this.loc.t('gauntlet_defeat')}</h2>
          <p class="modal-sub">Final Score: ${state.score} PTS</p>
          <div class="modal-btn-group">
            <button class="modal-btn reward-revive-btn" id="btn-revive-gauntlet">${this.loc.t('ad_revive_gauntlet')}</button>
            <button class="modal-btn primary" id="btn-retry-gauntlet">RETRY</button>
            <button class="modal-btn danger" id="btn-quit-gauntlet">QUIT</button>
          </div>
        </div>
      `;
      modal.querySelector('#btn-revive-gauntlet')?.addEventListener('click', async () => {
        this.audio.playPuckBounce(1.2);
        const granted = await AdManager.getInstance().showRewardedAd(
          'gauntlet_revive',
          '+1 Extra Life ❤️',
          this.loc.getLanguage()
        );
        if (granted) {
          gauntlet.revive();
          this.audio.playPowerUp();
          this.dismissModal(modal, true);
          this.showGauntletModal(gauntlet, onStartMatch, onExit);
        }
      });
      modal.querySelector('#btn-retry-gauntlet')?.addEventListener('click', () => {
        gauntlet.initNewGauntlet();
        this.dismissModal(modal, true);
        this.showGauntletModal(gauntlet, onStartMatch, onExit);
      });
      modal.querySelector('#btn-quit-gauntlet')?.addEventListener('click', () => {
        this.dismissModal(modal);
        onExit();
      });
    } else if (state.isCompleted) {
      modal.innerHTML = `
        <div class="glass-modal">
          <div class="trophy-icon">👑</div>
          <h2 class="modal-title" style="color: #FFD700">${this.loc.t('gauntlet_cleared')}</h2>
          <p class="modal-sub">Total Score: ${state.score} PTS | +200 COINS | +120 TROPHIES</p>
          <div class="modal-btn-group">
            <button class="modal-btn primary" id="btn-claim-gauntlet">CLAIM GLORY</button>
          </div>
        </div>
      `;
      modal.querySelector('#btn-claim-gauntlet')?.addEventListener('click', () => {
        this.progression.recordGauntletScore(state.score, 200, 120);
        this.dismissModal(modal);
        onExit();
      });
    } else if (stage) {
      const meta = this.loc.getMinigameText(stage.minigame);
      modal.innerHTML = `
        <div class="glass-modal gauntlet-modal">
          <h2 class="modal-title">${this.loc.t('gauntlet_title')}</h2>
          <p class="modal-sub">${this.loc.t('gauntlet_sub')}</p>

          <div class="gauntlet-lives-bar">
            <span>${this.loc.t('gauntlet_lives')}:</span>
            <span>${'❤️ '.repeat(state.livesRemaining)}</span>
          </div>

          <div class="tournament-match-card">
            <div style="font-size: 11px; color: #FFD700; font-weight: 800;">${this.loc.t('gauntlet_stage')} ${stage.stageNumber} / ${state.totalStages}</div>
            <h3 style="color: #00F0FF; font-size: 20px; margin: 6px 0;">${stage.bossName}</h3>
            <p style="color: #94A3B8; font-size: 13px;">${stage.bossTitle} // ${stage.difficulty.toUpperCase()} AI</p>
            <div style="margin-top: 12px; font-weight: 900; color: #FFF;">ARENA: ${meta.title}</div>
          </div>

          <div class="modal-btn-group">
            <button class="modal-btn primary" id="btn-fight-boss">${this.loc.t('gauntlet_start')}</button>
            <button class="modal-btn danger" id="btn-abort-gauntlet">${this.loc.t('quit')}</button>
          </div>
        </div>
      `;

      modal.querySelector('#btn-fight-boss')?.addEventListener('click', () => {
        this.dismissModal(modal, true);
        onStartMatch(stage.minigame);
      });
      modal.querySelector('#btn-abort-gauntlet')?.addEventListener('click', () => {
        this.dismissModal(modal);
        onExit();
      });
    }

    this.presentModal(modal);
  }

  // --- TROPHY ROAD MODAL ---
  public showTrophyRoadModal() {
    const record = this.progression.getRecord();
    const rank = record.currentRank;

    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal trophy-road-modal">
        <h2 class="modal-title">🏆 RANKED TROPHY ROAD</h2>
        <div class="trophy-tier-badge">CURRENT LEAGUE: <span style="color: #FFD700">${this.loc.getRankName(rank).toUpperCase()}</span></div>
        <p class="modal-sub">Earn trophies from 1v1 & AI battles to unlock exclusive cyber rewards</p>

        <div class="trophy-bar-container">
          <div class="trophy-bar-fill" style="width: ${Math.min(100, (record.trophies / 3000) * 100)}%"></div>
        </div>
        <div style="font-size: 12px; font-weight: 800; text-align: center; margin-bottom: 12px;">
          ${record.trophies} / 3000 🏆 TO CELESTIAL OVERLORD 🌌
        </div>

        <div class="minigame-stats-list">
          <div class="stat-row">
            <span>🥉 Bronze Arena (0 - 299 🏆)</span>
            <span>${record.trophies >= 0 ? '✅ UNLOCKED' : '🔒'}</span>
          </div>
          <div class="stat-row">
            <span>🥈 Silver Circuit (300 - 699 🏆)</span>
            <span>${record.trophies >= 300 ? '✅ UNLOCKED' : '🔒'}</span>
          </div>
          <div class="stat-row">
            <span>🥇 Gold Nexus (700 - 1199 🏆)</span>
            <span>${record.trophies >= 700 ? '✅ UNLOCKED' : '🔒'}</span>
          </div>
          <div class="stat-row">
            <span>💎 Diamond Matrix (1200 - 1999 🏆)</span>
            <span>${record.trophies >= 1200 ? '✅ UNLOCKED' : '🔒'}</span>
          </div>
          <div class="stat-row">
            <span>👑 Cyber Master (2000 - 2999 🏆)</span>
            <span>${record.trophies >= 2000 ? '✅ UNLOCKED' : '🔒'}</span>
          </div>
          <div class="stat-row">
            <span>🌌 Celestial Overlord (3000+ 🏆)</span>
            <span>${record.trophies >= 3000 ? '🏆 CELESTIAL' : '🔒'}</span>
          </div>
        </div>

        <div class="modal-btn-group">
          <button class="modal-btn danger" id="btn-close-road">CLOSE</button>
        </div>
      </div>
    `;

    modal.querySelector('#btn-close-road')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showQuestsModal() {
    const record = this.progression.getRecord();

    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal quests-modal">
        <h2 class="modal-title">📜 DAILY MISSIONS & CRATES</h2>
        <p class="modal-sub">Complete daily offline challenges to earn coins and trophies</p>

        <div class="quests-list">
          ${record.dailyQuests.map(q => `
            <div class="quest-card">
              <div class="quest-info">
                <div class="quest-title">${q.title}</div>
                <div class="quest-desc">${q.desc} (${q.current}/${q.target})</div>
                <div style="font-size: 10px; color: #FFD700; font-weight: 800;">+${q.rewardCoins} 🪙 | +${q.rewardTrophies} 🏆</div>
              </div>
              <button class="btn-claim-quest" data-qid="${q.id}" ${q.completed && !q.claimed ? '' : 'disabled'}>
                ${q.claimed ? 'CLAIMED' : q.completed ? 'CLAIM' : 'IN PROGRESS'}
              </button>
            </div>
          `).join('')}
        </div>

        <div class="modal-btn-group">
          <button class="modal-btn danger" id="btn-close-quests">CLOSE</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('.btn-claim-quest').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qid = (e.currentTarget as HTMLElement).getAttribute('data-qid');
        if (qid && this.progression.claimQuest(qid)) {
          this.audio.playPowerUp();
          this.dismissModal(modal);
          this.showQuestsModal();
        }
      });
    });

    modal.querySelector('#btn-close-quests')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showRivalryPassport() {
    const record = this.progression.getRecord();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal passport-modal">
        <h2 class="modal-title">🛂 RIVALRY PASSPORT</h2>
        <div class="passport-grid">
          <div class="passport-stat-box">
            <div class="passport-stat-num">${record.totalMatches}</div>
            <div class="passport-stat-lbl">TOTAL DUELS</div>
          </div>
          <div class="passport-stat-box">
            <div class="passport-stat-num">${record.avgReactionTimeMs}ms</div>
            <div class="passport-stat-lbl">AVG REACTION</div>
          </div>
          <div class="passport-stat-box">
            <div class="passport-stat-num">${record.currentStreakCount}</div>
            <div class="passport-stat-lbl">LONGEST STREAK</div>
          </div>
        </div>

        <div class="minigame-stats-list">
          ${Object.entries(record.minigameStats).map(([id, s]) => `
            <div class="stat-row">
              <span style="text-transform: capitalize;">${id.replace('_', ' ')}</span>
              <span>P1: ${s.p1Wins} | P2: ${s.p2Wins}</span>
            </div>
          `).join('')}
        </div>

        <div class="modal-btn-group">
          <button class="modal-btn danger" id="btn-close-passport">CLOSE</button>
        </div>
      </div>
    `;

    modal.querySelector('#btn-close-passport')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showMatchVictory(winner: PlayerIndex, minigameTitle: string, onRematch: () => void, onMenu: () => void) {
    const mode = this.progression.getGameMode();
    const isAiMode = mode === 'vs_ai';
    const isPractice = mode === 'practice';
    const winnerColor = winner === 1 ? '#FF0055' : '#0084FF';
    const winnerName = winner === 1 ? this.loc.t('p1_label') : (isAiMode ? this.loc.t('ai_label') : this.loc.t('p2_label'));
    // Credits line must mirror the real economy (practice: none, AI loss: -8)
    const creditsLine = isPractice
      ? `🎯 ${this.loc.t('practice_title')} • NO REWARDS`
      : (isAiMode && winner === 2 ? `-8 ${this.loc.t('trophies_count')}` : `+25 ${this.loc.t('trophies_count')} // +25 COINS`);

    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop victory-backdrop';
    modal.innerHTML = `
      <div class="glass-modal victory-modal">
        <div class="trophy-icon">${winner === 1 || !isAiMode ? '🏆' : '🤖'}</div>
        <h1 class="victory-title" style="color: ${winnerColor}">${winnerName} ${this.loc.t('victory')}</h1>
        <p class="victory-subtitle">${minigameTitle.toUpperCase()}</p>
        <div class="credits-awarded">${creditsLine}</div>
        <div class="modal-btn-group">
          ${!isPractice ? `<button class="modal-btn reward-double-btn" id="btn-double-reward">${this.loc.t('ad_double_reward')}</button>` : ''}
          <button class="modal-btn action-snap-btn" id="btn-share-snap">${this.loc.t('share_snap')}</button>
          <button class="modal-btn primary" id="btn-rematch">${this.loc.t('rematch')}</button>
          <button class="modal-btn" id="btn-menu">${this.loc.t('return_menu')}</button>
        </div>
      </div>
    `;

    const doubleBtn = modal.querySelector('#btn-double-reward') as HTMLButtonElement | null;
    doubleBtn?.addEventListener('click', async () => {
      this.audio.playPuckBounce(1.2);
      const granted = await AdManager.getInstance().showRewardedAd(
        'double_victory',
        '+50 COINS & +25 TROPHIES',
        this.loc.getLanguage()
      );
      if (granted) {
        this.progression.addCoins(50);
        this.audio.playPowerUp();
        if (doubleBtn) {
          doubleBtn.textContent = this.loc.t('ad_double_claimed');
          doubleBtn.disabled = true;
          doubleBtn.style.opacity = '0.6';
          doubleBtn.style.filter = 'grayscale(1)';
        }
      }
    });

    modal.querySelector('#btn-share-snap')?.addEventListener('click', () => {
      this.generateVictorySnap(winner, minigameTitle);
    });

    modal.querySelector('#btn-rematch')?.addEventListener('click', () => {
      this.audio.playPuckBounce(1.3);
      this.dismissModal(modal);
      onRematch();
    });

    modal.querySelector('#btn-menu')?.addEventListener('click', () => {
      this.audio.playPuckBounce(1.0);
      this.dismissModal(modal);
      onMenu();
    });

    // System back on the victory screen quits to the menu (same as MENU)
    this.presentModal(modal, 'menu');
  }

  public generateVictorySnap(winner: PlayerIndex, minigameTitle: string) {
    const record = this.progression.getRecord();
    const winnerName = winner === 1 ? 'PLAYER 1' : (this.progression.getGameMode() === 'vs_ai' ? 'CYBER AI BOT' : 'PLAYER 2');
    const winnerColor = winner === 1 ? '#FF0055' : '#0084FF';

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = 600;
    snapCanvas.height = 900;
    const ctx = snapCanvas.getContext('2d')!;

    // Background Gradient
    const bg = ctx.createLinearGradient(0, 0, 0, 900);
    bg.addColorStop(0, '#0F172A');
    bg.addColorStop(0.5, '#1E1B4B');
    bg.addColorStop(1, '#080C14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 600, 900);

    // Cyber Border
    ctx.strokeStyle = winnerColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 568, 868);

    // Header Branding
    ctx.fillStyle = '#00F0FF';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ PROJECT DUEL // CHROMA CLASH v2.0 ⚡', 300, 80);

    // Trophy Icon
    ctx.font = '100px sans-serif';
    ctx.fillText('🏆', 300, 240);

    // Winner Announcement
    ctx.font = '900 48px sans-serif';
    ctx.fillStyle = winnerColor;
    ctx.fillText(`${winnerName} WINS!`, 300, 340);

    ctx.font = '700 24px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${minigameTitle.toUpperCase()}`, 300, 390);

    // Stats Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.roundRect(80, 460, 440, 180, 20);
    ctx.fill();

    ctx.font = '800 20px sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`🏆 ${record.trophies} TOTAL TROPHIES`, 300, 510);

    ctx.fillStyle = '#00FF66';
    ctx.fillText(`TIER: ${this.loc.getRankName(record.currentRank).toUpperCase()}`, 300, 560);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(`AVG REACTION: ${record.avgReactionTimeMs}ms | TOTAL DUELS: ${record.totalMatches}`, 300, 610);

    // Footer Stamp
    ctx.fillStyle = '#64748B';
    ctx.font = '900 14px sans-serif';
    ctx.fillText('#1 SAME-DEVICE LOCAL MULTIPLAYER IN THE WORLD', 300, 810);
    ctx.fillText(new Date().toLocaleDateString(), 300, 840);

    snapCanvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'project-duel-victory.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: 'Project Duel Victory!',
          text: `Check out my victory in ${minigameTitle} on Project Duel!`
        }).catch(() => {});
      } else {
        const link = document.createElement('a');
        link.download = 'project-duel-victory.png';
        link.href = URL.createObjectURL(blob);
        link.click();
        const btn = document.getElementById('btn-share-snap');
        if (btn) btn.textContent = '📸 SAVED ✓';
      }
    });
  }

  // --- PARTY BOARD GAME UI ---
  public showPartyBoard(
    board: PartyBoardManager,
    onTriggerDuel: (minigame: MinigameId) => void,
    onExit: () => void
  ) {
    this.stopMicroPreviews();
    this.wipeModals();
    this.currentScreen = 'party';
    const state = board.getState();
    const isAi = this.progression.getGameMode() === 'vs_ai';

    this.root.innerHTML = `
      <div class="party-board-container">
        <div class="board-header">
          <div class="board-player-badge" style="color: #FF0055;">
            <span>${state.players[1].name}</span>
            <span>⭐ ${state.players[1].stars} | 🪙 ${state.players[1].coins}</span>
          </div>
          <div style="font-size: 13px; font-weight: 900; color: #FFD700;">
            ROUND ${state.currentRound} / ${state.maxRounds}
          </div>
          <div class="board-player-badge" style="color: #0084FF; text-align: right;">
            <span>${isAi ? 'CYBER BOT' : state.players[2].name}</span>
            <span>⭐ ${state.players[2].stars} | 🪙 ${state.players[2].coins}</span>
          </div>
        </div>

        <div style="flex: 1; position: relative; width: 100%;">
          <canvas id="party-board-canvas" width="420" height="660" style="width: 100%; height: 100%; display: block;"></canvas>
        </div>

        <div class="board-footer">
          <div class="event-ticker" id="party-event-ticker">${state.lastEventMessage}</div>
          <div style="display: flex; gap: 8px; width: 100%;">
            <button class="btn-roll-dice" id="btn-roll-dice">
              🎲 ROLL CYBER DICE (${state.activePlayer === 1 ? 'P1' : isAi ? 'BOT' : 'P2'} TURN)
            </button>
            <button class="action-btn" id="btn-exit-party" style="padding: 12px;">QUIT</button>
          </div>
        </div>
      </div>
    `;

    const canvas = document.getElementById('party-board-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    const renderBoard = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Board track loop
      const tiles = board.tiles;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const next = tiles[(i + 1) % tiles.length];
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(next.x, next.y);
      }
      ctx.stroke();

      // Render Tiles
      for (const t of tiles) {
        ctx.fillStyle = t.type === 'bonus' ? '#00FF66' : t.type === 'hazard' ? '#FF0055' : t.type === 'star_station' ? '#FFD700' : '#00F0FF';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t.icon, t.x, t.y + 5);
      }

      // Render Players on tiles
      for (const p of [state.players[1], state.players[2]]) {
        const tile = tiles[p.tileIndex];
        const px = tile.x + (p.index === 1 ? -12 : 12);
        const py = tile.y + (p.index === 1 ? -12 : 12);

        ctx.fillStyle = p.index === 1 ? '#FF0055' : '#0084FF';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    renderBoard();

    const rollBtn = document.getElementById('btn-roll-dice');
    rollBtn?.addEventListener('click', () => {
      if (board.getState().phase !== 'roll') return;
      const roll = board.rollDice();
      board.advanceActivePlayer(roll);
      renderBoard();

      const curState = board.getState();
      const ticker = document.getElementById('party-event-ticker');
      if (ticker) ticker.innerText = curState.lastEventMessage;

      if (curState.phase === 'duel_pending') {
        const duelGame = board.getRandomDuelMinigame();
        setTimeout(() => onTriggerDuel(duelGame), 800);
      } else if (curState.phase !== 'game_over') {
        setTimeout(() => {
          board.endTurn();
          this.showPartyBoard(board, onTriggerDuel, onExit);
        }, 1200);
      }
    });

    document.getElementById('btn-exit-party')?.addEventListener('click', onExit);
  }

  public showTournamentModal() {
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">⚔️ TOURNAMENT CUPS</h2>
        <div class="modal-btn-group">
          <button class="modal-btn primary" id="btn-tourney-bo3">BEST OF 3 SERIES</button>
          <button class="modal-btn primary" id="btn-tourney-bracket">4-PLAYER BRACKET</button>
          <button class="modal-btn danger" id="btn-close-tourney">CLOSE</button>
        </div>
      </div>
    `;

    modal.querySelector('#btn-tourney-bo3')?.addEventListener('click', () => {
      this.dismissModal(modal);
      if (this.onStartTournament) this.onStartTournament('bo3');
    });

    modal.querySelector('#btn-tourney-bracket')?.addEventListener('click', () => {
      this.dismissModal(modal);
      if (this.onStartTournament) this.onStartTournament('bracket');
    });

    modal.querySelector('#btn-close-tourney')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showTournamentProgress(state: TournamentState, onPlayNext: () => void, onExit: () => void) {
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    const isChampion = state.champion !== null;

    modal.innerHTML = `
      <div class="glass-modal tournament-modal">
        <h2 class="modal-title">⚔️ ${state.title.toUpperCase()}</h2>
        ${isChampion ? `
          <div class="trophy-icon">👑</div>
          <h1 class="victory-title" style="color: #FF9900">${state.champion} IS THE CHAMPION!</h1>
        ` : `
          <div class="tournament-match-card">
            <h3>MATCH ${state.currentMatchIndex + 1} / ${state.matches.length}</h3>
            <p>${state.matches[state.currentMatchIndex]?.playerA} vs ${state.matches[state.currentMatchIndex]?.playerB}</p>
          </div>
        `}
        <div class="modal-btn-group">
          ${isChampion ? `
            <button class="modal-btn primary" id="btn-finish-tourney">FINISH</button>
          ` : `
            <button class="modal-btn primary" id="btn-play-match">PLAY MATCH</button>
            <button class="modal-btn danger" id="btn-abort">EXIT</button>
          `}
        </div>
      </div>
    `;

    modal.querySelector('#btn-play-match')?.addEventListener('click', () => {
      this.dismissModal(modal, true);
      onPlayNext();
    });
    modal.querySelector('#btn-finish-tourney')?.addEventListener('click', () => {
      this.dismissModal(modal);
      onExit();
    });
    modal.querySelector('#btn-abort')?.addEventListener('click', () => {
      this.dismissModal(modal);
      onExit();
    });

    this.presentModal(modal);
  }

  public showMutatorsModal() {
    const mut = this.progression.getMutators();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('mutators_title')}</h2>
        
        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('mutator_turbo')}</div>
          </div>
          <button class="mutator-toggle ${mut.turboSpeed ? 'active' : ''}" data-key="turboSpeed"></button>
        </div>

        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('mutator_gravity')}</div>
          </div>
          <button class="mutator-toggle ${mut.lowGravity ? 'active' : ''}" data-key="lowGravity"></button>
        </div>

        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('mutator_sudden')}</div>
          </div>
          <button class="mutator-toggle ${mut.suddenDeath ? 'active' : ''}" data-key="suddenDeath"></button>
        </div>

        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('mutator_bouncy')}</div>
          </div>
          <button class="mutator-toggle ${mut.bouncyArena ? 'active' : ''}" data-key="bouncyArena"></button>
        </div>

        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('mutator_mirror')}</div>
          </div>
          <button class="mutator-toggle ${mut.mirrorMode ? 'active' : ''}" data-key="mirrorMode"></button>
        </div>

        <div class="mutator-switch-row">
          <div class="mutator-info">
            <div class="mutator-name">${this.loc.t('mutator_fever')}</div>
          </div>
          <button class="mutator-toggle ${mut.hyperFever ? 'active' : ''}" data-key="hyperFever"></button>
        </div>

        <div class="modal-btn-group">
          <button class="modal-btn primary" id="btn-save-mutators">${this.loc.t('close')}</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('.mutator-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const key = target.getAttribute('data-key') as keyof typeof mut;
        const active = this.progression.toggleMutator(key);
        target.classList.toggle('active', active);
      });
    });

    modal.querySelector('#btn-save-mutators')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showPauseModal() {
    this.audio.music.setLowPass(true);
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('pause_title')}</h2>
        <div class="modal-btn-group">
          <button class="modal-btn primary" id="btn-resume">${this.loc.t('resume')}</button>
          <button class="modal-btn" id="btn-restart">${this.loc.t('restart')}</button>
          <button class="modal-btn danger" id="btn-quit">${this.loc.t('quit')}</button>
        </div>
      </div>
    `;

    modal.querySelector('#btn-resume')?.addEventListener('click', () => {
      this.audio.music.setLowPass(false);
      this.dismissModal(modal);
      if (this.onResumeMatch) this.onResumeMatch();
    });
    modal.querySelector('#btn-restart')?.addEventListener('click', () => {
      this.audio.music.setLowPass(false);
      this.dismissModal(modal);
      if (this.onRestartMatch) this.onRestartMatch();
    });
    modal.querySelector('#btn-quit')?.addEventListener('click', () => {
      this.audio.music.setLowPass(false);
      this.dismissModal(modal);
      if (this.onQuitToMenu) this.onQuitToMenu();
    });

    // System back on the pause screen resumes the match (same as RESUME)
    this.presentModal(modal, 'resume');
  }

  public showLockerModal() {
    const record = this.progression.getRecord();
    const skins = [
      { id: 'default', name: 'Cyber Neon / Solar', req: 'Default' },
      { id: 'synthwave', name: 'Synthwave 80s', req: '3 Matches' },
      { id: 'matrix', name: 'Toxic Terminal', req: '8 Matches' },
      { id: 'solar_gold', name: 'Solar Gold', req: '700 🏆' },
      { id: 'galactic', name: 'Galactic Nebula', req: '1200 🏆' },
      { id: 'hellfire', name: 'Hellfire Dragon', req: '2000 🏆' },
      { id: 'celestial', name: 'Celestial Overlord', req: '3000 🏆' }
    ];

    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal locker-modal">
        <h2 class="modal-title">🎨 CYBER ARSENAL LOCKER</h2>
        <p class="modal-sub">Earn skins and trails through Trophy Road leagues</p>
        <div class="skin-list">
          ${skins.map(s => {
            const isUnlocked = record.unlockedSkins.includes(s.id);
            const isP1 = record.activeP1Skin === s.id;
            const isP2 = record.activeP2Skin === s.id;
            return `
              <div class="skin-item ${isUnlocked ? '' : 'locked'}">
                <div class="skin-info">
                  <div class="skin-name">${s.name} ${isUnlocked ? '' : '🔒'}</div>
                  <div class="skin-req">${s.req}</div>
                </div>
                ${isUnlocked ? `
                  <div class="skin-actions">
                    <button class="skin-btn ${isP1 ? 'active' : ''}" data-p="1" data-skin="${s.id}">P1</button>
                    <button class="skin-btn ${isP2 ? 'active' : ''}" data-p="2" data-skin="${s.id}">P2</button>
                  </div>
                ` : `<span class="lock-tag">LOCKED</span>`}
              </div>
            `;
          }).join('')}
        </div>
        <div class="modal-btn-group">
          <button class="modal-btn danger" id="btn-close-locker">CLOSE</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('.skin-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const player = parseInt(btn.getAttribute('data-p') || '1') as PlayerIndex;
        const skin = btn.getAttribute('data-skin') || 'default';
        this.progression.setPlayerSkin(player, skin);
        this.dismissModal(modal, true);
        this.showLockerModal();
      });
    });

    modal.querySelector('#btn-close-locker')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showDailyModal() {
    const daily = DailyChallengeManager.getDaily();
    const meta = this.loc.getMinigameText(daily.minigame);
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('daily_title')}</h2>
        <p class="modal-sub">${daily.title} • Seed ${daily.seed}</p>
        <div class="skin-item"><div class="skin-info"><div class="skin-name">${meta.title}</div><div class="skin-req">${meta.desc}</div></div></div>
        <p class="modal-sub">Mutators: ${Object.keys(daily.mutators).join(', ') || 'none'} • Target ${daily.targetScore}</p>
        <div class="modal-btn-group">
          <button class="modal-btn primary" id="btn-play-daily">PLAY</button>
          <button class="modal-btn" id="btn-close-daily">${this.loc.t('close')}</button>
        </div>
      </div>
    `;
    modal.querySelector('#btn-close-daily')?.addEventListener('click', () => this.dismissModal(modal));
    modal.querySelector('#btn-play-daily')?.addEventListener('click', () => {
      this.dismissModal(modal, true);
      this.stopMicroPreviews();
      if (this.onStartDaily) this.onStartDaily(daily.minigame);
      else if (this.onSelectMinigame) this.onSelectMinigame(daily.minigame);
    });
    this.presentModal(modal);
  }

  public showAchievementsModal() {
    const list = AchievementManager.getInstance().list();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal locker-modal">
        <h2 class="modal-title">${this.loc.t('ach_title')}</h2>
        <div class="skin-list">
          ${list.map(a => `<div class="skin-item ${a.unlocked ? '' : 'locked'}"><div class="skin-info"><div class="skin-name">${a.unlocked ? '🏅' : '🔒'} ${a.title}</div><div class="skin-req">${a.desc}</div></div></div>`).join('')}
        </div>
        <div class="modal-btn-group"><button class="modal-btn primary" id="btn-close-ach">${this.loc.t('close')}</button></div>
      </div>
    `;
    modal.querySelector('#btn-close-ach')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showOnlineModal() {
    const net = NetplayManager.getInstance();
    const existing = net.getRoom();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('online_title')}</h2>
        <p class="modal-sub">${existing ? `Room ${existing.code} • ${existing.minigame}` : 'Create or join with a 4-letter code (same-device / multi-tab netplay)'}</p>
        <div class="setting-row"><input id="inp-room-code" maxlength="6" placeholder="CODE" style="text-transform:uppercase" value="${existing?.code ?? ''}" /></div>
        <div class="modal-btn-group">
          <button class="modal-btn primary" id="btn-create-room">CREATE</button>
          <button class="modal-btn" id="btn-join-room">JOIN</button>
          <button class="modal-btn danger" id="btn-close-online">${this.loc.t('close')}</button>
        </div>
      </div>
    `;
    modal.querySelector('#btn-close-online')?.addEventListener('click', () => this.dismissModal(modal));
    modal.querySelector('#btn-create-room')?.addEventListener('click', () => {
      const room = net.createRoom('cyber_hockey');
      (modal.querySelector('#inp-room-code') as HTMLInputElement).value = room.code;
      this.audio.playPowerUp();
    });
    modal.querySelector('#btn-join-room')?.addEventListener('click', () => {
      const code = (modal.querySelector('#inp-room-code') as HTMLInputElement).value || '';
      if (!NetplayManager.isValidCode(code)) return;
      const room = net.joinRoom(code);
      this.dismissModal(modal, true);
      this.stopMicroPreviews();
      if (room && this.onJoinOnline) this.onJoinOnline(room.code, room.minigame);
      else if (room && this.onSelectMinigame) this.onSelectMinigame(room.minigame);
    });
    this.presentModal(modal);
  }

  public showReplaysModal() {
    const reps = ReplayManager.getInstance().list();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal locker-modal">
        <h2 class="modal-title">${this.loc.t('replay_title')} (${reps.length})</h2>
        <div class="skin-list">
          ${reps.length === 0 ? '<p class="modal-sub">No replays yet — finish a match to auto-record.</p>' : reps.map(r => `<div class="skin-item"><div class="skin-info"><div class="skin-name">${r.minigame} • P${r.winner} wins</div><div class="skin-req">${r.events.length} events • ${r.durationMs}ms</div></div><button class="skin-btn" data-rep="${r.id}">COPY</button></div>`).join('')}
        </div>
        <div class="modal-btn-group">
          <button class="modal-btn" id="btn-clear-rep">CLEAR</button>
          <button class="modal-btn primary" id="btn-close-rep">${this.loc.t('close')}</button>
        </div>
      </div>
    `;
    modal.querySelector('#btn-close-rep')?.addEventListener('click', () => this.dismissModal(modal));
    modal.querySelector('#btn-clear-rep')?.addEventListener('click', () => { ReplayManager.getInstance().clear(); this.dismissModal(modal); });
    modal.querySelectorAll('[data-rep]').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-rep') || '';
        const json = ReplayManager.getInstance().exportReplay(id);
        if (json) void navigator.clipboard?.writeText(json).catch(() => undefined);
      });
    });
    this.presentModal(modal);
  }

  public showAccessibilityModal() {
    const a11y = AccessibilityManager.getInstance();
    const s = a11y.get();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('a11y_title')}</h2>
        <div class="mutator-switch-row"><div class="mutator-info"><div class="mutator-name">Reduce motion</div></div><button class="mutator-toggle ${s.reduceMotion ? 'active' : ''}" id="tg-motion"></button></div>
        <div class="mutator-switch-row"><div class="mutator-info"><div class="mutator-name">Large text</div></div><button class="mutator-toggle ${s.largeText ? 'active' : ''}" id="tg-text"></button></div>
        <div class="mutator-switch-row"><div class="mutator-info"><div class="mutator-name">High contrast</div></div><button class="mutator-toggle ${s.highContrast ? 'active' : ''}" id="tg-contrast"></button></div>
        <div class="setting-row"><div class="setting-label">Colorblind</div>
          <select id="sel-cb"><option value="none">none</option><option value="protanopia">protanopia</option><option value="deuteranopia">deuteranopia</option><option value="tritanopia">tritanopia</option></select>
        </div>
        <div class="modal-btn-group"><button class="modal-btn primary" id="btn-close-a11y">${this.loc.t('close')}</button></div>
      </div>
    `;
    const sel = modal.querySelector('#sel-cb') as HTMLSelectElement;
    sel.value = s.colorblind;
    sel.addEventListener('change', () => a11y.set({ colorblind: sel.value as never }));
    const wire = (id: string, key: 'reduceMotion' | 'largeText' | 'highContrast') => {
      modal.querySelector(id)?.addEventListener('click', (e) => {
        const cur = !a11y.get()[key];
        a11y.set({ [key]: cur } as never);
        (e.currentTarget as HTMLElement).classList.toggle('active', cur);
      });
    };
    wire('#tg-motion', 'reduceMotion');
    wire('#tg-text', 'largeText');
    wire('#tg-contrast', 'highContrast');
    modal.querySelector('#btn-close-a11y')?.addEventListener('click', () => this.dismissModal(modal));
    this.presentModal(modal);
  }

  public showCloudModal() {
    const cloud = CloudSaveManager.getInstance();
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('cloud_title')}</h2>
        <p class="modal-sub">Export / import all saves as JSON. Optional backend sync.</p>
        <div class="setting-row"><input id="inp-cloud-url" placeholder="https://api.example.com/sync" value="${cloud.backendUrl ?? ''}" /></div>
        <div class="modal-btn-group">
          <button class="modal-btn" id="btn-cloud-export">EXPORT</button>
          <button class="modal-btn" id="btn-cloud-import">IMPORT</button>
          <button class="modal-btn primary" id="btn-close-cloud">${this.loc.t('close')}</button>
        </div>
      </div>
    `;
    modal.querySelector('#btn-close-cloud')?.addEventListener('click', () => {
      const url = (modal.querySelector('#inp-cloud-url') as HTMLInputElement).value.trim();
      cloud.configure(url || null);
      this.dismissModal(modal);
    });
    modal.querySelector('#btn-cloud-export')?.addEventListener('click', () => {
      void navigator.clipboard?.writeText(cloud.exportAll()).catch(() => undefined);
    });
    modal.querySelector('#btn-cloud-import')?.addEventListener('click', () => {
      const json = prompt('Paste save JSON:');
      if (json && cloud.importAll(json)) window.location.reload();
    });
    this.presentModal(modal);
  }

  public showPracticeModal() {
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('practice_title')}</h2>
        <p class="modal-sub">Train vs Adaptive AI — no trophies lost. Pick a game:</p>
        <div class="skin-list" style="max-height:220px;overflow:auto">
          ${this.ALL_MINIGAMES.map(id => `<div class="skin-item"><div class="skin-info"><div class="skin-name">${this.loc.getMinigameText(id).title}</div></div><button class="skin-btn" data-game="${id}">TRAIN</button></div>`).join('')}
        </div>
        <div class="modal-btn-group"><button class="modal-btn primary" id="btn-close-pr">${this.loc.t('close')}</button></div>
      </div>
    `;
    modal.querySelector('#btn-close-pr')?.addEventListener('click', () => this.dismissModal(modal));
    modal.querySelectorAll('[data-game]').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-game') as MinigameId;
        this.dismissModal(modal, true);
        this.stopMicroPreviews();
        if (this.onStartPractice) this.onStartPractice(id);
        else if (this.onSelectMinigame) this.onSelectMinigame(id);
      });
    });
    this.presentModal(modal);
  }

  public showTutorialModal(id: MinigameId, onStart: () => void) {
    const steps = TutorialManager.stepsFor(id);
    const meta = this.loc.getMinigameText(id);
    const modal = document.createElement('div');
    modal.className = 'ui-modal-backdrop';
    modal.innerHTML = `
      <div class="glass-modal">
        <h2 class="modal-title">${this.loc.t('tutorial_title')}: ${meta.title}</h2>
        ${steps.map(s => `<div class="skin-item"><div class="skin-info"><div class="skin-name">${s.title}</div><div class="skin-req">${s.body}${s.tip ? ` • 💡 ${s.tip}` : ''}</div></div></div>`).join('')}
        <div class="modal-btn-group">
          <button class="modal-btn primary" id="btn-tut-go">FIGHT!</button>
          <button class="modal-btn" id="btn-tut-skip">SKIP</button>
        </div>
      </div>
    `;
    const go = () => { TutorialManager.markSeen(id); this.dismissModal(modal, true); onStart(); };
    modal.querySelector('#btn-tut-go')?.addEventListener('click', go);
    modal.querySelector('#btn-tut-skip')?.addEventListener('click', go);
    this.presentModal(modal);
  }

  public clearOverlay() {
    this.stopMicroPreviews();
    this.wipeModals();
    this.currentScreen = 'match';
    this.root.innerHTML = '';
  }
}
