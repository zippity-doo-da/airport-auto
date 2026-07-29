export type StatusMessagePriority =
  "ambient" | "operational" | "warning" | "critical";

/** Controls how much transient UI chatter is presented to the observer. */
export type StatusMessagePolicy =
  | "off"
  | "advisory"
  | "operational"
  | "rare-high";

export const STATUS_MESSAGE_POLICY_LABELS: Readonly<
  Record<StatusMessagePolicy, string>
> = {
  off: "Off · critical safety only",
  advisory: "Advisory only",
  operational: "Operational",
  "rare-high": "Rare high impact",
};

export interface StatusMessageInput {
  label: string;
  detail: string;
  key?: string;
  priority?: StatusMessagePriority;
}

export interface StatusMessageView {
  id: number;
  key: string;
  label: string;
  detail: string;
  priority: StatusMessagePriority;
  enqueuedAtMs: number;
  shownAtMs: number;
  minimumVisibleUntilMs: number;
}

export interface StatusMessageSnapshot {
  policy: StatusMessagePolicy;
  current: StatusMessageView | null;
  queued: ReadonlyArray<{
    key: string;
    label: string;
    detail: string;
    priority: StatusMessagePriority;
    enqueuedAtMs: number;
  }>;
  transitions: number;
}

export const STATUS_MESSAGE_DWELL_MS: Readonly<
  Record<StatusMessagePriority, number>
> = {
  ambient: 2_600,
  operational: 3_200,
  warning: 5_000,
  critical: 7_000,
};

const STATUS_MESSAGE_EXPIRY_MS: Readonly<
  Record<StatusMessagePriority, number>
> = {
  ambient: 9_000,
  operational: 18_000,
  warning: 35_000,
  critical: 60_000,
};

const PRIORITY_RANK: Readonly<Record<StatusMessagePriority, number>> = {
  ambient: 0,
  operational: 1,
  warning: 2,
  critical: 3,
};

interface QueuedStatusMessage extends StatusMessageInput {
  id: number;
  key: string;
  priority: StatusMessagePriority;
  enqueuedAtMs: number;
  expiresAtMs: number;
}

export function inferStatusMessagePriority(
  label: string,
  detail: string,
): StatusMessagePriority {
  const copy = `${label} ${detail}`.toLowerCase();
  if (
    /\b(collision|crash|mayday|emergency)\b|lost separation|runway incursion/.test(
      copy,
    )
  )
    return "critical";
  if (
    /conflict|held for separation|safety hold|overdue|rejected|not accepted|withheld|unsafe|holdover expired|failure|failed|unavailable/.test(
      copy,
    )
  ) {
    return "warning";
  }
  if (
    /entering the scope|ready at the terminal|gate planned|gate changed|clear of stand|ready for push|tug connected|starting engines|tug released|winter route planned|in deicing queue|entering deicing|treatment started|deicing complete|touched down| is away|route preview|readback correct|frequency changed|left the scope|recovered/.test(
      copy,
    )
  ) {
    return "ambient";
  }
  return "operational";
}

function statusMessageKey(label: string, detail: string): string {
  return `${label.trim().toLowerCase()}\u0000${detail.trim().toLowerCase()}`;
}

function safeNow(nowMs?: number): number {
  if (Number.isFinite(nowMs)) return Math.max(0, nowMs ?? 0);
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export class StatusMessageCoordinator {
  private readonly queue: QueuedStatusMessage[] = [];
  private currentMessage: StatusMessageView | null = null;
  private sequence = 0;
  private transitionCount = 0;
  private policy: StatusMessagePolicy = "operational";

  constructor(
    private readonly present: (message: StatusMessageView | null) => void,
    private readonly maxQueued = 8,
  ) {}

  setPolicy(policy: StatusMessagePolicy): StatusMessageSnapshot {
    this.policy = policy;
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (!this.isAllowed(this.queue[index].priority)) this.queue.splice(index, 1);
    }
    if (this.currentMessage && !this.isAllowed(this.currentMessage.priority)) {
      this.currentMessage = null;
      this.present(null);
    }
    return this.snapshot();
  }

  getPolicy(): StatusMessagePolicy {
    return this.policy;
  }

  enqueue(input: StatusMessageInput, nowMs?: number): StatusMessageSnapshot {
    const now = safeNow(nowMs);
    this.advance(now);
    const label = input.label.trim();
    const detail = input.detail.trim();
    if (!label || !detail) return this.snapshot();
    const key = input.key ?? statusMessageKey(label, detail);
    const priority =
      input.priority ?? inferStatusMessagePriority(label, detail);

    if (!this.isAllowed(priority)) return this.snapshot();

    if (this.currentMessage?.key === key) return this.snapshot();
    const queuedMatch = this.queue.find((message) => message.key === key);
    if (queuedMatch) {
      queuedMatch.label = label;
      queuedMatch.detail = detail;
      queuedMatch.expiresAtMs = now + STATUS_MESSAGE_EXPIRY_MS[priority];
      return this.snapshot();
    }

    const message: QueuedStatusMessage = {
      ...input,
      id: ++this.sequence,
      key,
      label,
      detail,
      priority,
      enqueuedAtMs: now,
      expiresAtMs: now + STATUS_MESSAGE_EXPIRY_MS[priority],
    };

    if (!this.currentMessage) {
      this.show(message, now);
      return this.snapshot();
    }

    if (
      priority === "critical" &&
      this.currentMessage.priority !== "critical"
    ) {
      this.show(message, now);
      return this.snapshot();
    }

    this.queue.push(message);
    this.trimQueue();
    this.advance(now);
    return this.snapshot();
  }

  advance(nowMs?: number): StatusMessageSnapshot {
    const now = safeNow(nowMs);
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index].expiresAtMs <= now) this.queue.splice(index, 1);
    }
    if (
      this.queue.length &&
      (!this.currentMessage || now >= this.currentMessage.minimumVisibleUntilMs)
    ) {
      const next = this.takeNext();
      if (next) this.show(next, now);
    }
    return this.snapshot();
  }

  snapshot(): StatusMessageSnapshot {
    return {
      policy: this.policy,
      current: this.currentMessage ? { ...this.currentMessage } : null,
      queued: this.queue.map(
        ({ key, label, detail, priority, enqueuedAtMs }) => ({
          key,
          label,
          detail,
          priority,
          enqueuedAtMs,
        }),
      ),
      transitions: this.transitionCount,
    };
  }

  private show(message: QueuedStatusMessage, now: number): void {
    this.currentMessage = {
      id: message.id,
      key: message.key,
      label: message.label,
      detail: message.detail,
      priority: message.priority,
      enqueuedAtMs: message.enqueuedAtMs,
      shownAtMs: now,
      minimumVisibleUntilMs: now + STATUS_MESSAGE_DWELL_MS[message.priority],
    };
    this.transitionCount += 1;
    this.present({ ...this.currentMessage });
  }

  private takeNext(): QueuedStatusMessage | undefined {
    let bestIndex = 0;
    for (let index = 1; index < this.queue.length; index += 1) {
      const candidate = this.queue[index];
      const best = this.queue[bestIndex];
      if (
        PRIORITY_RANK[candidate.priority] > PRIORITY_RANK[best.priority] ||
        (candidate.priority === best.priority &&
          candidate.enqueuedAtMs < best.enqueuedAtMs)
      ) {
        bestIndex = index;
      }
    }
    return this.queue.splice(bestIndex, 1)[0];
  }

  private trimQueue(): void {
    while (this.queue.length > Math.max(1, this.maxQueued)) {
      let dropIndex = 0;
      for (let index = 1; index < this.queue.length; index += 1) {
        const candidate = this.queue[index];
        const dropped = this.queue[dropIndex];
        if (
          PRIORITY_RANK[candidate.priority] < PRIORITY_RANK[dropped.priority] ||
          (candidate.priority === dropped.priority &&
            candidate.enqueuedAtMs < dropped.enqueuedAtMs)
        ) {
          dropIndex = index;
        }
      }
      this.queue.splice(dropIndex, 1);
    }
  }

  private isAllowed(priority: StatusMessagePriority): boolean {
    // Never hide a safety-critical event; calm policies only govern chatter.
    if (priority === "critical") return true;
    if (this.policy === "off" || this.policy === "rare-high") return false;
    if (this.policy === "advisory") return priority === "warning";
    return true;
  }
}
