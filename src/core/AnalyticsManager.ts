// Lightweight local analytics + crash capture (no external dependency).
export interface AnalyticsEvent {
  name: string;
  at: number;
  props?: Record<string, string | number>;
}

const KEY = 'duel_analytics_v1';
const MAX = 200;

export class AnalyticsManager {
  private static instance: AnalyticsManager;
  private buffer: AnalyticsEvent[] = [];
  private fpsSamples: number[] = [];

  public static getInstance(): AnalyticsManager {
    if (!AnalyticsManager.instance) {
      AnalyticsManager.instance = new AnalyticsManager();
      AnalyticsManager.instance.attachCrashHandlers();
    }
    return AnalyticsManager.instance;
  }

  public track(name: string, props?: Record<string, string | number>): void {
    const ev: AnalyticsEvent = { name, at: Date.now(), props };
    this.buffer.push(ev);
    if (this.buffer.length > MAX) this.buffer.shift();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.buffer));
    } catch { /* noop */ }
  }

  public trackFps(fps: number): void {
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 60) this.fpsSamples.shift();
  }

  public getAvgFps(): number {
    if (this.fpsSamples.length === 0) return 60;
    return Math.round(this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length);
  }

  public getEvents(): AnalyticsEvent[] {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
    } catch {
      return [...this.buffer];
    }
  }

  private attachCrashHandlers(): void {
    window.addEventListener('error', (e) => {
      this.track('crash_js_error', { message: String(e.message).slice(0, 120) });
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.track('crash_unhandled_rejection', { message: String(e.reason).slice(0, 120) });
    });
  }
}
