import {
  OPERATION_QUEUE_CATEGORIES,
  type OperationQueueCategory,
  type OperationQueueSnapshot,
} from "../simulation/operationQueues";
import type { TrafficFlowSnapshot } from "../simulation/trafficFlowManagement";
import { trafficFlowConstraint } from "../simulation/trafficFlowManagement";
import type { TrafficFlowEntry } from "../simulation/types";

export type OperationQueueFilter = "all" | OperationQueueCategory;

export interface QueueInspectorElements {
  count: HTMLElement;
  longest: HTMLElement;
  list: HTMLElement;
  meter: HTMLElement;
  meterSummary: HTMLElement;
  capacity: HTMLElement;
}

export interface TrafficFlowMeterRow {
  id: string;
  direction: "arrival" | "departure";
  label: string;
  slotInSeconds: number;
  delaySeconds: number;
  revisionCount: number;
  constraintLabel: string;
  constraintCategory: string;
  status: TrafficFlowEntry["status"];
  reason: string;
  targets: Array<{
    id: string;
    kind: TrafficFlowEntry["meterTargets"][number]["kind"];
    label: string;
    targetInSeconds: number;
    toleranceBeforeSeconds: number;
    toleranceAfterSeconds: number;
  }>;
}

export interface TrafficFlowAdvisoryInteractions {
  canIgnore: boolean;
  canRecover: boolean;
}

export function operationQueueRenderKey(
  snapshot: OperationQueueSnapshot,
  filter: OperationQueueFilter,
  focusedQueueId: string | null,
  flow: TrafficFlowSnapshot,
  interactionKey = "read-only",
): string {
  return [
    interactionKey,
    filter,
    focusedQueueId ?? "none",
    snapshot.total,
    Math.floor(snapshot.longestWaitSeconds),
    flow.backPressure.arrivalsHolding,
    flow.backPressure.departuresWaiting,
    ...trafficFlowMeterRows(flow).map((row) =>
      [
        row.id,
        row.status,
        Math.floor(row.slotInSeconds),
        Math.floor(row.delaySeconds),
        row.reason,
        row.targets
          .map(
            (target) =>
              `${target.id}:${Math.floor(target.targetInSeconds)}:${target.toleranceBeforeSeconds}:${target.toleranceAfterSeconds}`,
          )
          .join(","),
      ].join(":"),
    ),
    ...flow.capacityWindows.map((window) =>
      [
        window.direction,
        window.demandCount,
        window.plannedReleaseCount,
        window.delayedCount,
        window.revisedCount,
        window.confidence,
      ].join(":"),
    ),
    ...flow.recommendations.map((recommendation) =>
      [
        recommendation.id,
        recommendation.priority,
        Math.floor(recommendation.targetSlotSeconds),
        recommendation.rationale,
      ].join(":"),
    ),
    ...flow.advisoryResponses.map((response) =>
      [
        response.recommendationId,
        response.status,
        Math.floor(response.elapsedSeconds),
        Math.floor(response.additionalDelaySeconds),
        response.holdingFuelBurnDeltaKg.toFixed(1),
        response.queueDelta,
      ].join(":"),
    ),
    ...snapshot.entries.map((entry) =>
      [
        entry.id,
        entry.priority,
        Math.floor(entry.waitSeconds),
        entry.position,
        entry.queueLength,
        entry.detail,
      ].join(":"),
    ),
  ].join("|");
}

export function renderOperationQueueInspector(
  elements: QueueInspectorElements,
  snapshot: OperationQueueSnapshot,
  filter: OperationQueueFilter,
  focusedQueueId: string | null,
  flow: TrafficFlowSnapshot,
  interactions: TrafficFlowAdvisoryInteractions = {
    canIgnore: false,
    canRecover: false,
  },
): void {
  const entries =
    filter === "all"
      ? snapshot.entries
      : snapshot.entries.filter((entry) => entry.category === filter);
  elements.count.textContent = `${entries.length} waiting`;
  elements.longest.textContent =
    snapshot.longestWaitSeconds > 0
      ? `Longest ${formatWait(snapshot.longestWaitSeconds)}`
      : "Flowing";
  renderMeterPlan(elements, flow);
  renderCapacitySummary(elements.capacity, flow, interactions);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "queue-panel__empty";
    empty.textContent =
      filter === "all"
        ? "No active operational blockers."
        : `No ${filter} blockers right now.`;
    elements.list.replaceChildren(empty);
    return;
  }

  const rows = entries.slice(0, 14).map((entry) => {
    const row = document.createElement("button");
    row.type = "button";
    row.dataset.queueFocus = entry.id;
    row.className = `queue-entry queue-entry--${entry.priority}`;
    row.classList.toggle("queue-entry--selected", entry.id === focusedQueueId);
    row.setAttribute("aria-label", `Focus ${entry.label}. ${entry.detail}`);

    const category = document.createElement("span");
    category.className = "queue-entry__category";
    category.textContent = shortCategory(entry.category);
    const copy = document.createElement("span");
    copy.className = "queue-entry__copy";
    const title = document.createElement("b");
    title.textContent = entry.label;
    const detail = document.createElement("small");
    detail.textContent = entry.detail;
    copy.append(title, detail);
    const timing = document.createElement("span");
    timing.className = "queue-entry__timing";
    timing.textContent =
      entry.waitSeconds > 0
        ? formatWait(entry.waitSeconds)
        : entry.entity === "system"
          ? "metered"
          : "queued";
    if (entry.queueLength > 1) {
      const position = document.createElement("small");
      position.textContent = `${entry.position}/${entry.queueLength}`;
      timing.append(position);
    }
    row.append(category, copy, timing);
    return row;
  });
  elements.list.replaceChildren(...rows);
}

export function trafficFlowMeterRows(
  flow: TrafficFlowSnapshot,
): TrafficFlowMeterRow[] {
  return [
    ...flow.arrivalQueue.slice(0, 3).map((entry) => meterRow("arrival", entry)),
    ...flow.departureQueue
      .slice(0, 3)
      .map((entry) => meterRow("departure", entry)),
  ];
}

export function isOperationQueueFilter(
  value: string,
): value is OperationQueueFilter {
  return (
    value === "all" ||
    OPERATION_QUEUE_CATEGORIES.includes(value as OperationQueueCategory)
  );
}

function shortCategory(category: OperationQueueCategory): string {
  const labels: Record<OperationQueueCategory, string> = {
    gate: "GATE",
    ramp: "RAMP",
    taxi: "TAXI",
    crossing: "XING",
    runway: "RWY",
    wake: "WAKE",
    weather: "WX",
    downstream: "NEXT",
  };
  return labels[category];
}

function renderMeterPlan(
  elements: QueueInspectorElements,
  flow: TrafficFlowSnapshot,
): void {
  const rows = trafficFlowMeterRows(flow);
  if (!rows.length) {
    elements.meterSummary.textContent = "Flow clear";
    const empty = document.createElement("small");
    empty.className = "queue-panel__meter-empty";
    empty.textContent = "No arrival or departure slots pending.";
    elements.meter.replaceChildren(empty);
    return;
  }

  const nextArrival = flow.arrivalQueue[0];
  const nextDeparture = flow.departureQueue[0];
  const summary = [
    nextArrival ? `ARR ${formatWait(slotInSeconds(nextArrival))}` : null,
    nextDeparture ? `DEP ${formatWait(slotInSeconds(nextDeparture))}` : null,
  ].filter(Boolean);
  elements.meterSummary.textContent = summary.join(" · ");

  const slots = rows.map((row) => {
    const slot = document.createElement("div");
    slot.className = "queue-meter-slot";
    slot.dataset.direction = row.direction === "arrival" ? "arr" : "dep";
    const label = document.createElement("b");
    label.textContent = `${row.direction === "arrival" ? "ARR" : "DEP"} · ${row.label} · ${row.constraintLabel}`;
    slot.dataset.constraint = row.constraintCategory;
    const timing = document.createElement("small");
    timing.textContent = `${row.status} · slot ${formatWait(row.slotInSeconds)}${row.delaySeconds > 0 ? ` · delay ${formatWait(row.delaySeconds)}` : ""}`;
    const reason = document.createElement("small");
    reason.textContent = row.reason;
    reason.title =
      row.revisionCount > 1
        ? `${row.revisionCount} slot revisions`
        : "Initial slot reason";
    const targets = document.createElement("small");
    targets.className = "queue-meter-slot__targets";
    targets.textContent = row.targets
      .map(
        (target) =>
          `${meterTargetLabel(target.kind)} ${formatWait(target.targetInSeconds)} −${target.toleranceBeforeSeconds}/+${target.toleranceAfterSeconds}s`,
      )
      .join(" · ");
    targets.title = row.targets
      .map(
        (target) =>
          `${target.label}: target in ${formatWait(target.targetInSeconds)}, window ${target.toleranceBeforeSeconds} seconds early to ${target.toleranceAfterSeconds} seconds late`,
      )
      .join("\n");
    slot.append(label, timing, targets, reason);
    return slot;
  });
  elements.meter.replaceChildren(...slots);
}

function renderCapacitySummary(
  container: HTMLElement,
  flow: TrafficFlowSnapshot,
  interactions: TrafficFlowAdvisoryInteractions,
): void {
  container.replaceChildren(
    ...flow.capacityWindows.map((window) => {
      const row = document.createElement("div");
      row.className = "queue-panel__capacity-row";
      row.dataset.direction = window.direction === "arrival" ? "arr" : "dep";
      row.dataset.confidence = window.confidence;

      const heading = document.createElement("b");
      heading.textContent = `${window.direction === "arrival" ? "ARR" : "DEP"} · ${window.predictedCapacityCount}/${window.predictedDemandCount} forecast slots`;
      const detail = document.createElement("small");
      detail.textContent = `${window.horizonSeconds / 60} min · ${window.confidence} confidence${window.delayedCount ? ` · ${window.delayedCount} delayed` : ""}${window.uncertainty.weather || window.uncertainty.wind || window.uncertainty.runwayCondition || window.uncertainty.pilotResponse ? " · uncertainty active" : ""}`;
      detail.title = window.confidenceReason;

      const meter = document.createElement("span");
      meter.className = "queue-panel__capacity-bar";
      const fill = document.createElement("i");
      fill.style.width = `${Math.round(window.utilization * 100)}%`;
      meter.append(fill);
      row.append(heading, detail, meter);
      return row;
    }),
  );
  const advisory = flow.recommendations.slice(0, 3).map((recommendation) => {
    const row = document.createElement("div");
    row.className =
      "queue-panel__capacity-row queue-panel__capacity-row--advisory";
    row.dataset.direction =
      recommendation.direction === "arrival" ? "arr" : "dep";
    row.dataset.priority = recommendation.priority;
    const heading = document.createElement("b");
    heading.textContent = `${recommendation.authority.toUpperCase()} · ${recommendation.callsign ?? recommendation.direction} · review slot`;
    const detail = document.createElement("small");
    detail.textContent = `${recommendation.priority} · advisory only · ignoring does not change score`;
    detail.title = recommendation.rationale;
    row.append(heading, detail);
    if (interactions.canIgnore) {
      const actions = document.createElement("span");
      actions.className = "queue-panel__advisory-actions";
      const ignore = document.createElement("button");
      ignore.type = "button";
      ignore.dataset.flowAdvisoryAction = "ignore";
      ignore.dataset.recommendationId = recommendation.id;
      ignore.textContent = "Ignore";
      ignore.title = `Ignore this advisory and continue tracking its delay, holding-fuel, and queue consequences. ${recommendation.rationale}`;
      actions.append(ignore);
      row.append(actions);
    }
    return row;
  });
  const responses = flow.advisoryResponses.slice(-3).map((response) => {
    const row = document.createElement("div");
    row.className =
      "queue-panel__capacity-row queue-panel__capacity-row--response";
    row.dataset.direction = response.direction === "arrival" ? "arr" : "dep";
    row.dataset.status = response.status;
    const heading = document.createElement("b");
    heading.textContent = `${response.authority.toUpperCase()} · ${response.callsign ?? response.direction} · ${response.status}`;
    const detail = document.createElement("small");
    detail.textContent = response.consequence;
    detail.title =
      "Only actual delay and modeled fuel burn are counted; ignoring or recovering the advisory itself does not change score.";
    row.append(heading, detail);
    if (response.status === "ignored") {
      const actions = document.createElement("span");
      actions.className = "queue-panel__advisory-actions";
      const recover = document.createElement("button");
      recover.type = "button";
      recover.dataset.flowAdvisoryAction = "recover";
      recover.dataset.recommendationId = response.recommendationId;
      recover.textContent = interactions.canRecover
        ? "Recover flow"
        : "Supervisor required";
      recover.disabled = !interactions.canRecover;
      recover.title = interactions.canRecover
        ? `Select ${response.direction === "arrival" ? "Minimum Holding" : "Minimum Taxi Delay"}; all aircraft still require ordinary clearances.`
        : "Select the Supervisor workstation in Manual mode to recover this airport-wide schedule.";
      actions.append(recover);
      row.append(actions);
    }
    return row;
  });
  container.append(...advisory, ...responses);
}

function meterRow(
  direction: TrafficFlowMeterRow["direction"],
  entry: TrafficFlowEntry,
): TrafficFlowMeterRow {
  const constraint = trafficFlowConstraint(entry.reason);
  return {
    id: entry.id,
    direction,
    label: entry.callsign ?? entry.id,
    slotInSeconds: slotInSeconds(entry),
    delaySeconds: entry.delaySeconds,
    revisionCount: entry.slotRevisions.length,
    constraintLabel: constraint.label,
    constraintCategory: constraint.category,
    status: entry.status,
    reason: entry.reason,
    targets: (entry.meterTargets ?? []).map((target) => ({
      id: target.id,
      kind: target.kind,
      label: target.label,
      targetInSeconds: Math.max(
        0,
        target.targetSeconds - entry.updatedAtSeconds,
      ),
      toleranceBeforeSeconds: target.toleranceBeforeSeconds,
      toleranceAfterSeconds: target.toleranceAfterSeconds,
    })),
  };
}

function meterTargetLabel(
  kind: TrafficFlowMeterRow["targets"][number]["kind"],
): string {
  switch (kind) {
    case "arrival-meter-fix":
      return "FIX";
    case "runway-threshold":
      return "THR";
    case "runway-crossing":
      return "XING";
    case "departure-release":
      return "REL";
  }
}

function slotInSeconds(entry: TrafficFlowEntry): number {
  return Math.max(0, entry.releaseSlotSeconds - entry.updatedAtSeconds);
}

function formatWait(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
