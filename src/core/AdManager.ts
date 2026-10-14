import { AnalyticsManager } from './AnalyticsManager';

export type AdType = 'rewarded' | 'interstitial' | 'banner';
export type AdPlacement = 'daily_gift' | 'double_victory' | 'gauntlet_revive' | 'skin_unlock' | 'post_match';

export interface AdShowOptions {
  type: AdType;
  placement: AdPlacement;
  title?: string;
  rewardDescription?: string;
}

export interface AdCreative {
  id: string;
  brand: string;
  tagline: string;
  taglineAr: string;
  icon: string;
  ctaText: string;
  ctaTextAr: string;
  badge: string;
  color: string;
  durationSec: number;
}

const CREATIVES: AdCreative[] = [
  {
    id: 'cyber_drift_2099',
    brand: 'CYBER DRIFT: 2099',
    tagline: 'Experience supersonic neon drift racing across orbital hyperways!',
    taglineAr: 'عِش أسرع سباقات الدريفت النيونية في الطرق المدارية الخارقة!',
    icon: '🏎️',
    ctaText: 'INSTALL FREE',
    ctaTextAr: 'تثبيت مجاناً',
    badge: '★ 4.9 EDITOR CHOICE',
    color: '#00F0FF',
    durationSec: 10
  },
  {
    id: 'quantum_strike_tactics',
    brand: 'QUANTUM STRIKE',
    tagline: 'Assemble your mecha cyber squad and conquer the galactic arena!',
    taglineAr: 'اجمع فرقة الروبوتات القتالية واقهر الحلبات الكونية في معارك تكتيكية!',
    icon: '🤖',
    ctaText: 'PLAY NOW',
    ctaTextAr: 'العب فوراً',
    badge: '🏆 #1 ACTION HIT',
    color: '#FF0055',
    durationSec: 10
  },
  {
    id: 'synth_sound_studio',
    brand: 'SYNTH BEAT PRO',
    tagline: 'Create legendary retro 80s synthwave music with AI synthesizer!',
    taglineAr: 'اصنع موسيقى سينث ويف أسطورية بلمسات الذكاء الاصطناعي والمؤثرات!',
    icon: '🎧',
    ctaText: 'TRY FOR FREE',
    ctaTextAr: 'جرّب مجاناً',
    badge: '⚡ TOP MUSIC APP',
    color: '#FFE600',
    durationSec: 8
  }
];

export class AdManager {
  private static instance: AdManager;
  private analytics = AnalyticsManager.getInstance();

  private matchesSinceLastAd: number = 0;
  private lastAdTimestamp: number = 0;
  private readonly INTERSTITIAL_COOLDOWN_SEC = 120; // 2 minutes minimum between interstitials
  private readonly INTERSTITIAL_MATCH_INTERVAL = 3; // Every 3 matches

  // Callbacks for pausing/resuming game audio and timers
  public onAdStart?: () => void;
  public onAdEnd?: () => void;

  private isAdActive: boolean = false;

  private constructor() {}

  public static getInstance(): AdManager {
    if (!AdManager.instance) {
      AdManager.instance = new AdManager();
    }
    return AdManager.instance;
  }

  public getIsAdActive(): boolean {
    return this.isAdActive;
  }

  public recordMatchCompleted(): void {
    this.matchesSinceLastAd++;
  }

  public canShowInterstitial(): boolean {
    const elapsed = (Date.now() - this.lastAdTimestamp) / 1000;
    return (
      !this.isAdActive &&
      this.matchesSinceLastAd >= this.INTERSTITIAL_MATCH_INTERVAL &&
      elapsed >= this.INTERSTITIAL_COOLDOWN_SEC
    );
  }

  /**
   * Shows a rewarded ad. Returns a Promise resolving to true if reward is granted, false if skipped/failed.
   */
  public async showRewardedAd(
    placement: AdPlacement,
    rewardDesc: string = '+100 Coins',
    lang: 'ar' | 'en' = 'ar'
  ): Promise<boolean> {
    if (this.isAdActive) return false;

    this.isAdActive = true;
    if (this.onAdStart) this.onAdStart();

    this.analytics.track('ad_requested', { type: 'rewarded', placement });

    const creative = CREATIVES[Math.floor(Math.random() * CREATIVES.length)];

    return new Promise<boolean>((resolve) => {
      this.renderAdOverlay('rewarded', placement, creative, rewardDesc, lang, (granted) => {
        this.isAdActive = false;
        this.lastAdTimestamp = Date.now();
        if (this.onAdEnd) this.onAdEnd();

        this.analytics.track('ad_completed', { type: 'rewarded', placement, granted: granted ? 1 : 0 });
        resolve(granted);
      });
    });
  }

  /**
   * Shows a smart interstitial ad if frequency capping allows it.
   */
  public async showInterstitialAd(
    placement: AdPlacement = 'post_match',
    lang: 'ar' | 'en' = 'ar'
  ): Promise<boolean> {
    if (!this.canShowInterstitial()) return false;

    this.isAdActive = true;
    if (this.onAdStart) this.onAdStart();

    this.analytics.track('ad_requested', { type: 'interstitial', placement });
    const creative = CREATIVES[Math.floor(Math.random() * CREATIVES.length)];

    return new Promise<boolean>((resolve) => {
      this.renderAdOverlay('interstitial', placement, creative, '', lang, () => {
        this.isAdActive = false;
        this.matchesSinceLastAd = 0;
        this.lastAdTimestamp = Date.now();
        if (this.onAdEnd) this.onAdEnd();

        this.analytics.track('ad_completed', { type: 'interstitial', placement, granted: 1 });
        resolve(true);
      });
    });
  }

  private renderAdOverlay(
    type: AdType,
    _placement: AdPlacement,
    creative: AdCreative,
    rewardDesc: string,
    lang: 'ar' | 'en',
    onFinish: (rewardGranted: boolean) => void
  ): void {
    const isAr = lang === 'ar';
    const isRewarded = type === 'rewarded';
    let timeLeft = isRewarded ? creative.durationSec : 5;
    const canSkipAfterSec = isRewarded ? Math.min(5, creative.durationSec - 2) : 3;
    let elapsedSec = 0;

    const overlay = document.createElement('div');
    overlay.className = 'cyber-ad-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('dir', isAr ? 'rtl' : 'ltr');

    const brandTagline = isAr ? creative.taglineAr : creative.tagline;
    const cta = isAr ? creative.ctaTextAr : creative.ctaText;
    const adHeaderLabel = isAr ? 'إعلان مموّل // SPONSORED' : 'SPONSORED ADVERTISEMENT';
    const rewardNotice = isRewarded ? (isAr ? `المكافأة: ${rewardDesc}` : `Reward: ${rewardDesc}`) : '';

    overlay.innerHTML = `
      <div class="ad-container">
        <!-- Top status bar with countdown & skip button -->
        <div class="ad-top-bar">
          <div class="ad-badge-group">
            <span class="ad-tag">AD</span>
            <span class="ad-category">${adHeaderLabel}</span>
          </div>
          <div class="ad-action-group">
            <span class="ad-timer" id="ad-timer-txt">⏳ ${timeLeft}s</span>
            <button class="ad-close-btn" id="ad-skip-btn" style="display: none;" aria-label="Skip">
              ${isAr ? 'تخطي ✕' : 'Skip ✕'}
            </button>
          </div>
        </div>

        <!-- Creative Showcase Area -->
        <div class="ad-showcase" style="--creative-accent: ${creative.color}">
          <div class="ad-glow-halo"></div>
          <div class="ad-hero-icon">${creative.icon}</div>
          <div class="ad-pill-badge">${creative.badge}</div>
          <h2 class="ad-brand-title">${creative.brand}</h2>
          <p class="ad-tagline">${brandTagline}</p>

          <!-- Interactive Playable Mini Demo -->
          <div class="ad-playable-box" id="ad-playable">
            <div class="ad-interactive-hint">⚡ ${isAr ? 'المس للتفاعل والحصول على سرعة إضافية!' : 'Tap to interact & boost speed!'}</div>
            <div class="ad-demo-track">
              <div class="ad-demo-avatar" id="ad-avatar">${creative.icon}</div>
            </div>
          </div>

          ${rewardNotice ? `<div class="ad-reward-pill">🎁 ${rewardNotice}</div>` : ''}

          <!-- CTA Button -->
          <button class="ad-cta-btn" id="ad-cta-btn" style="background: ${creative.color}">
            <span>${cta}</span>
            <span class="cta-arrow">${isAr ? '←' : '→'}</span>
          </button>
        </div>

        <!-- Bottom trust footer -->
        <div class="ad-footer">
          <span>🛡️ ${isAr ? 'شبكة إعلانات السايبر المعتمدة' : 'Verified Cyber Ad Network'}</span>
          <span>•</span>
          <span>${isAr ? 'آمن ومناسب لجميع الأعمار' : 'Family Safe'}</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const timerTxt = overlay.querySelector('#ad-timer-txt') as HTMLElement;
    const skipBtn = overlay.querySelector('#ad-skip-btn') as HTMLElement;
    const avatar = overlay.querySelector('#ad-avatar') as HTMLElement;
    const playable = overlay.querySelector('#ad-playable') as HTMLElement;

    // Interactive playable demo touch
    let avatarX = 10;
    if (playable && avatar) {
      playable.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        avatarX = (avatarX + 45) % 240;
        avatar.style.transform = `translateX(${avatarX}px) scale(1.2)`;
        setTimeout(() => {
          if (avatar) avatar.style.transform = `translateX(${avatarX}px) scale(1)`;
        }, 150);
      });
    }

    let intervalId: number | null = null;

    const cleanup = (rewarded: boolean) => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      overlay.classList.add('ad-closing');
      setTimeout(() => {
        overlay.remove();
        onFinish(rewarded);
      }, 250);
    };

    skipBtn.addEventListener('click', () => {
      // If skipped before full time, only rewarded if completed or non-rewarded
      const granted = isRewarded ? elapsedSec >= creative.durationSec : true;
      cleanup(granted);
    });

    overlay.querySelector('#ad-cta-btn')?.addEventListener('click', () => {
      // Click-through action: opens demo/store link safely in new tab
      try {
        window.open('https://github.com', '_blank');
      } catch {
        // noop
      }
    });

    intervalId = window.setInterval(() => {
      timeLeft--;
      elapsedSec++;

      if (timerTxt) {
        timerTxt.textContent = `⏳ ${Math.max(0, timeLeft)}s`;
      }

      if (elapsedSec >= canSkipAfterSec && skipBtn) {
        skipBtn.style.display = 'inline-flex';
        if (isRewarded && elapsedSec >= creative.durationSec) {
          skipBtn.textContent = isAr ? 'استلام المكافأة ✓' : 'Claim Reward ✓';
          skipBtn.classList.add('reward-ready');
        }
      }

      if (timeLeft <= 0) {
        if (intervalId !== null) clearInterval(intervalId);
        cleanup(true);
      }
    }, 1000);
  }
}
