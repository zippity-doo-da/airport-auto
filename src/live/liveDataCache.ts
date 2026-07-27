import type { LiveDataKind, LiveDataReport } from "./liveDataTypes";

export interface LiveDataStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CacheIndexEntry {
  key: string;
  touchedAt: number;
  bytes: number;
}

const CACHE_PREFIX = "airport-auto:live-data:v1:";
const INDEX_KEY = `${CACHE_PREFIX}index`;

function reportKey(kind: LiveDataKind, station: string): string {
  return `${CACHE_PREFIX}${kind}:${station.toUpperCase()}`;
}

export class BoundedLiveDataCache {
  constructor(
    private readonly storage: LiveDataStorage | null,
    private readonly maximumEntries = 18,
    private readonly maximumBytes = 256 * 1_024,
    private readonly now: () => number = Date.now,
  ) {}

  get(kind: LiveDataKind, station: string): unknown | null {
    if (!this.storage) return null;
    const key = reportKey(kind, station);
    try {
      const serialized = this.storage.getItem(key);
      if (!serialized) return null;
      this.touch(key, serialized.length);
      return JSON.parse(serialized) as unknown;
    } catch {
      this.removeKey(key);
      return null;
    }
  }

  put(report: LiveDataReport): boolean {
    if (!this.storage) return false;
    const key = reportKey(report.kind, report.station);
    const serialized = JSON.stringify(report);
    if (serialized.length > this.maximumBytes) return false;
    try {
      this.storage.setItem(key, serialized);
      this.touch(key, serialized.length);
      this.prune();
      return true;
    } catch {
      this.prune(true);
      try {
        this.storage.setItem(key, serialized);
        this.touch(key, serialized.length);
        return true;
      } catch {
        return false;
      }
    }
  }

  clear(): void {
    if (!this.storage) return;
    for (const entry of this.index()) this.removeKey(entry.key);
    try {
      this.storage.removeItem(INDEX_KEY);
    } catch {
      // Storage can be disabled independently of the simulation.
    }
  }

  diagnostics(): {
    entries: number;
    bytes: number;
    maximumEntries: number;
    maximumBytes: number;
  } {
    const index = this.index();
    return {
      entries: index.length,
      bytes: index.reduce((sum, entry) => sum + entry.bytes, 0),
      maximumEntries: this.maximumEntries,
      maximumBytes: this.maximumBytes,
    };
  }

  private index(): CacheIndexEntry[] {
    if (!this.storage) return [];
    try {
      const value = JSON.parse(
        this.storage.getItem(INDEX_KEY) ?? "[]",
      ) as unknown;
      if (!Array.isArray(value)) return [];
      return value.filter(
        (entry): entry is CacheIndexEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as CacheIndexEntry).key === "string" &&
          (entry as CacheIndexEntry).key.startsWith(CACHE_PREFIX) &&
          (entry as CacheIndexEntry).key !== INDEX_KEY &&
          Number.isFinite((entry as CacheIndexEntry).touchedAt) &&
          Number.isFinite((entry as CacheIndexEntry).bytes),
      );
    } catch {
      return [];
    }
  }

  private saveIndex(index: CacheIndexEntry[]): void {
    try {
      this.storage?.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      // Cache metadata is best effort and never blocks offline play.
    }
  }

  private touch(key: string, bytes: number): void {
    const index = this.index().filter((entry) => entry.key !== key);
    index.push({ key, touchedAt: this.now(), bytes });
    this.saveIndex(index);
  }

  private removeKey(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Ignore unavailable storage.
    }
    this.saveIndex(this.index().filter((entry) => entry.key !== key));
  }

  private prune(aggressive = false): void {
    const index = this.index().sort(
      (first, second) => first.touchedAt - second.touchedAt,
    );
    let bytes = index.reduce((sum, entry) => sum + entry.bytes, 0);
    const entryLimit = aggressive
      ? Math.max(1, Math.floor(this.maximumEntries / 2))
      : this.maximumEntries;
    const byteLimit = aggressive
      ? Math.floor(this.maximumBytes / 2)
      : this.maximumBytes;
    while (index.length > entryLimit || bytes > byteLimit) {
      const removed = index.shift();
      if (!removed) break;
      bytes -= removed.bytes;
      try {
        this.storage?.removeItem(removed.key);
      } catch {
        // Continue pruning metadata even if an entry cannot be removed.
      }
    }
    this.saveIndex(index);
  }
}
