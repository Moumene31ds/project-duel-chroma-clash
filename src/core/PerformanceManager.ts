// Adaptive performance: dynamic quality scaling + particle budget.
export type QualityLevel = 'ultra' | 'high' | 'balanced' | 'lite';

export class PerformanceManager {
  private static instance: PerformanceManager;
  private level: QualityLevel = 'high';
  private lastFrame = 0;
  private fps = 60;

  public static getInstance(): PerformanceManager {
    if (!PerformanceManager.instance) PerformanceManager.instance = new PerformanceManager();
    return PerformanceManager.instance;
  }

  public tick(now: number): number {
    if (this.lastFrame > 0) {
      const dt = (now - this.lastFrame) / 1000;
      const inst = 1 / Math.max(dt, 0.001);
      this.fps = this.fps * 0.9 + inst * 0.1;
      this.autoScale();
    }
    this.lastFrame = now;
    return this.fps;
  }

  private autoScale(): void {
    if (this.fps < 42 && this.level !== 'lite') this.level = 'lite';
    else if (this.fps < 50 && (this.level === 'ultra' || this.level === 'high')) this.level = 'balanced';
    else if (this.fps > 58 && this.level === 'balanced') this.level = 'high';
  }

  public getQuality(): QualityLevel {
    // respect reduced-motion / lite preference via DPR already capped at 2 in main.ts
    return this.level;
  }

  public particleBudget(): number {
    switch (this.level) {
      case 'ultra': return 220;
      case 'high': return 140;
      case 'balanced': return 80;
      case 'lite': return 36;
    }
  }

  public useShadows(): boolean {
    return this.level === 'ultra' || this.level === 'high';
  }

  public getFps(): number {
    return Math.round(this.fps);
  }
}
