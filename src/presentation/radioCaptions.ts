import type { SoundscapeEventPriority } from "../audio/soundscapeEvents";

export interface RadioCaptionInput {
  id: string;
  station: string;
  copy: string;
  priority: SoundscapeEventPriority;
  dwellMs?: number;
}

export interface RadioCaptionView extends RadioCaptionInput {
  shownAtMs: number;
  visibleUntilMs: number;
}

export interface RadioCaptionSnapshot {
  current: RadioCaptionView | null;
  queued: RadioCaptionInput[];
  transitions: number;
}

const CAPTION_DWELL_MS: Record<SoundscapeEventPriority, number> = {
  ambient: 4_200,
  operational: 4_800,
  warning: 6_200,
  critical: 8_000,
};

const PRIORITY_RANK: Record<SoundscapeEventPriority, number> = {
  ambient: 0,
  operational: 1,
  warning: 2,
  critical: 3,
};

export class RadioCaptionCoordinator {
  private current: RadioCaptionView | null = null;
  private readonly queued: RadioCaptionInput[] = [];
  private transitions = 0;

  constructor(
    private readonly present: (caption: RadioCaptionView | null) => void,
    private readonly maximumQueued = 5,
  ) {}

  enqueue(input: RadioCaptionInput, nowMs = performance.now()): void {
    if (!input.copy.trim() || !input.station.trim()) return;
    if (
      this.current?.id === input.id ||
      this.queued.some((item) => item.id === input.id)
    ) {
      return;
    }
    if (!this.current) {
      this.show(input, nowMs);
      return;
    }
    if (input.priority === "critical" && this.current.priority !== "critical") {
      this.queued.unshift({
        id: this.current.id,
        station: this.current.station,
        copy: this.current.copy,
        priority: this.current.priority,
        dwellMs: this.current.dwellMs,
      });
      this.show(input, nowMs);
      this.trim();
      return;
    }
    this.queued.push({ ...input });
    this.trim();
  }

  advance(nowMs = performance.now()): RadioCaptionSnapshot {
    if (this.current && nowMs >= this.current.visibleUntilMs) {
      const next = this.takeNext();
      if (next) this.show(next, nowMs);
      else {
        this.current = null;
        this.present(null);
      }
    }
    return this.snapshot();
  }

  reset(): void {
    this.current = null;
    this.queued.length = 0;
    this.present(null);
  }

  snapshot(): RadioCaptionSnapshot {
    return {
      current: this.current ? { ...this.current } : null,
      queued: this.queued.map((item) => ({ ...item })),
      transitions: this.transitions,
    };
  }

  private show(input: RadioCaptionInput, nowMs: number): void {
    this.current = {
      ...input,
      shownAtMs: nowMs,
      visibleUntilMs:
        nowMs +
        Math.max(
          CAPTION_DWELL_MS[input.priority],
          Math.min(16_000, Math.round(input.dwellMs ?? 0)),
        ),
    };
    this.transitions += 1;
    this.present({ ...this.current });
  }

  private takeNext(): RadioCaptionInput | undefined {
    let selected = 0;
    for (let index = 1; index < this.queued.length; index += 1) {
      if (
        PRIORITY_RANK[this.queued[index].priority] >
        PRIORITY_RANK[this.queued[selected].priority]
      ) {
        selected = index;
      }
    }
    return this.queued.splice(selected, 1)[0];
  }

  private trim(): void {
    while (this.queued.length > Math.max(1, this.maximumQueued)) {
      let selected = 0;
      for (let index = 1; index < this.queued.length; index += 1) {
        if (
          PRIORITY_RANK[this.queued[index].priority] <
          PRIORITY_RANK[this.queued[selected].priority]
        ) {
          selected = index;
        }
      }
      this.queued.splice(selected, 1);
    }
  }
}
