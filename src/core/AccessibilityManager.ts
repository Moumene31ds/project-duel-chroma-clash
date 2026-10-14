export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface AccessibilitySettings {
  colorblind: ColorblindMode;
  reduceMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
}

const KEY = 'duel_a11y_v1';

const DEFAULTS: AccessibilitySettings = {
  colorblind: 'none',
  reduceMotion: false,
  largeText: false,
  highContrast: false
};

export class AccessibilityManager {
  private static instance: AccessibilityManager;
  private settings: AccessibilitySettings = { ...DEFAULTS };

  public static getInstance(): AccessibilityManager {
    if (!AccessibilityManager.instance) {
      AccessibilityManager.instance = new AccessibilityManager();
      AccessibilityManager.instance.load();
    }
    return AccessibilityManager.instance;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.settings = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AccessibilitySettings>) };
    } catch { /* noop */ }
    this.apply();
  }

  public get(): AccessibilitySettings {
    return { ...this.settings };
  }

  public set(patch: Partial<AccessibilitySettings>): void {
    this.settings = { ...this.settings, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* noop */ }
    this.apply();
  }

  public apply(): void {
    const root = document.documentElement;
    root.classList.toggle('a11y-reduce-motion', this.settings.reduceMotion);
    root.classList.toggle('a11y-large-text', this.settings.largeText);
    root.classList.toggle('a11y-high-contrast', this.settings.highContrast);
    root.dataset.colorblind = this.settings.colorblind;
  }

  // Remap P1/P2 colors for colorblind safety
  public palette(p1: string, p2: string): { p1: string; p2: string } {
    switch (this.settings.colorblind) {
      case 'protanopia':
      case 'deuteranopia':
        return { p1: '#0072B2', p2: '#E69F00' };
      case 'tritanopia':
        return { p1: '#D55E00', p2: '#009E73' };
      default:
        return { p1, p2 };
    }
  }
}
