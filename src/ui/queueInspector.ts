import {
  OPERATION_QUEUE_CATEGORIES,
  type OperationQueueCategory,
  type OperationQueueSnapshot,
} from '../simulation/operationQueues';

export type OperationQueueFilter = 'all' | OperationQueueCategory;

export interface QueueInspectorElements {
  count: HTMLElement;
  longest: HTMLElement;
  list: HTMLElement;
}

export function operationQueueRenderKey(
  snapshot: OperationQueueSnapshot,
  filter: OperationQueueFilter,
  focusedFlightId: number | null,
): string {
  return [
    filter,
    focusedFlightId ?? 'none',
    snapshot.total,
    Math.floor(snapshot.longestWaitSeconds),
    ...snapshot.entries.map((entry) => [
      entry.id,
      entry.priority,
      Math.floor(entry.waitSeconds),
      entry.position,
      entry.queueLength,
      entry.detail,
    ].join(':')),
  ].join('|');
}

export function renderOperationQueueInspector(
  elements: QueueInspectorElements,
  snapshot: OperationQueueSnapshot,
  filter: OperationQueueFilter,
  focusedFlightId: number | null,
): void {
  const entries = filter === 'all'
    ? snapshot.entries
    : snapshot.entries.filter((entry) => entry.category === filter);
  elements.count.textContent = `${entries.length} waiting`;
  elements.longest.textContent = snapshot.longestWaitSeconds > 0
    ? `Longest ${formatWait(snapshot.longestWaitSeconds)}`
    : 'Flowing';

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'queue-panel__empty';
    empty.textContent = filter === 'all'
      ? 'No active operational blockers.'
      : `No ${filter} blockers right now.`;
    elements.list.replaceChildren(empty);
    return;
  }

  const rows = entries.slice(0, 14).map((entry) => {
    const row = entry.flightId === undefined
      ? document.createElement('article')
      : document.createElement('button');
    row.className = `queue-entry queue-entry--${entry.priority}`;
    if (row instanceof HTMLButtonElement) {
      row.type = 'button';
      row.dataset.queueFlight = String(entry.flightId);
      row.classList.toggle('queue-entry--selected', entry.flightId === focusedFlightId);
      row.setAttribute('aria-label', `Focus ${entry.label}. ${entry.detail}`);
    }

    const category = document.createElement('span');
    category.className = 'queue-entry__category';
    category.textContent = shortCategory(entry.category);
    const copy = document.createElement('span');
    copy.className = 'queue-entry__copy';
    const title = document.createElement('b');
    title.textContent = entry.label;
    const detail = document.createElement('small');
    detail.textContent = entry.detail;
    copy.append(title, detail);
    const timing = document.createElement('span');
    timing.className = 'queue-entry__timing';
    timing.textContent = entry.waitSeconds > 0 ? formatWait(entry.waitSeconds) : entry.entity === 'system' ? 'metered' : 'queued';
    if (entry.queueLength > 1) {
      const position = document.createElement('small');
      position.textContent = `${entry.position}/${entry.queueLength}`;
      timing.append(position);
    }
    row.append(category, copy, timing);
    return row;
  });
  elements.list.replaceChildren(...rows);
}

export function isOperationQueueFilter(value: string): value is OperationQueueFilter {
  return value === 'all' || OPERATION_QUEUE_CATEGORIES.includes(value as OperationQueueCategory);
}

function shortCategory(category: OperationQueueCategory): string {
  const labels: Record<OperationQueueCategory, string> = {
    gate: 'GATE',
    ramp: 'RAMP',
    taxi: 'TAXI',
    crossing: 'XING',
    runway: 'RWY',
    wake: 'WAKE',
    weather: 'WX',
    downstream: 'NEXT',
  };
  return labels[category];
}

function formatWait(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
