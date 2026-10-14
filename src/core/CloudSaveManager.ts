// Cloud-save abstraction: localStorage primary + JSON export/import for future backend.
export class CloudSaveManager {
  private static instance: CloudSaveManager;
  public backendUrl: string | null = null;

  public static getInstance(): CloudSaveManager {
    if (!CloudSaveManager.instance) CloudSaveManager.instance = new CloudSaveManager();
    return CloudSaveManager.instance;
  }

  public configure(url: string | null): void {
    this.backendUrl = url;
  }

  public exportAll(): string {
    const dump: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('project_duel')) dump[k] = localStorage.getItem(k);
      if (k && k.startsWith('duel_')) dump[k] = localStorage.getItem(k);
    }
    return JSON.stringify({ v: 1, exportedAt: Date.now(), data: dump });
  }

  public importAll(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as { data: Record<string, string | null> };
      if (!parsed.data) return false;
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
      return true;
    } catch {
      return false;
    }
  }

  public async syncToCloud(): Promise<boolean> {
    if (!this.backendUrl) return false; // no backend configured yet
    try {
      const res = await fetch(this.backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.exportAll()
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
