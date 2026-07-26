import type {
  ControllerEvaluationSnapshot,
  ControllerEvaluationStationSnapshot,
} from "../telemetry/controllerEvaluation";
import type { ControllerStation } from "../simulation/types";

export interface ControllerEvaluationPanel {
  element: HTMLDetailsElement;
  update(
    evaluation: ControllerEvaluationSnapshot,
    station: ControllerStation,
  ): void;
}

interface MetricNode {
  value: HTMLElement;
  detail: HTMLElement;
}

export function createControllerEvaluationPanel(): ControllerEvaluationPanel {
  const element = document.createElement("details");
  element.className = "controller-evaluation";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = "Decision evaluation";
  const score = document.createElement("b");
  summary.append(label, score);

  const metrics = document.createElement("div");
  metrics.className = "controller-evaluation__metrics";
  const nodes = new Map<string, MetricNode>();
  for (const [id, metricLabel] of [
    ["commands", "Commands"],
    ["conflicts", "Conflicts"],
    ["incursions", "Incursions"],
    ["delay", "Delay"],
    ["throughput", "Throughput"],
    ["fuel", "Hold fuel"],
    ["holds", "Hold review"],
    ["handoffs", "Late handoffs"],
  ] as const) {
    const item = document.createElement("span");
    const itemLabel = document.createElement("small");
    itemLabel.textContent = metricLabel;
    const value = document.createElement("b");
    const detail = document.createElement("i");
    item.append(itemLabel, value, detail);
    metrics.append(item);
    nodes.set(id, { value, detail });
  }

  const note = document.createElement("p");
  element.append(summary, metrics, note);

  return {
    element,
    update(evaluation, station) {
      const stationEvaluation = evaluation.stations.find(
        (candidate) => candidate.station === station,
      );
      if (!stationEvaluation) return;
      updateSummary(score, stationEvaluation);
      updateMetric(
        nodes,
        "commands",
        `${stationEvaluation.accepted}/${stationEvaluation.attempts}`,
        `${stationEvaluation.rejected} rejected · ${stationEvaluation.deferred} deferred`,
      );
      updateMetric(
        nodes,
        "conflicts",
        String(stationEvaluation.activeConflictForecasts),
        `${stationEvaluation.activeConflictWarnings} warning · ${evaluation.safety.preventedConflicts} prevented`,
      );
      updateMetric(
        nodes,
        "incursions",
        String(evaluation.safety.runwayIncursions),
        `${evaluation.safety.collisionAlerts} collision alerts`,
      );
      updateMetric(
        nodes,
        "delay",
        `${Math.round(evaluation.operations.delayPerOperationSeconds)}s/op`,
        `${Math.round(evaluation.operations.totalDelaySeconds)}s total`,
      );
      updateMetric(
        nodes,
        "throughput",
        `${evaluation.operations.throughputPerHour.toFixed(1)}/h`,
        `${evaluation.operations.completed} completed`,
      );
      updateMetric(
        nodes,
        "fuel",
        `${evaluation.fuel.holdingBurnPercent.toFixed(1)}%`,
        `${Math.round(evaluation.fuel.holdingBurnKg)} kg modeled`,
      );
      updateMetric(
        nodes,
        "holds",
        String(stationEvaluation.unnecessaryHolds),
        `${Math.round(stationEvaluation.unnecessaryHoldSeconds)}s beyond review`,
      );
      updateMetric(
        nodes,
        "handoffs",
        String(stationEvaluation.overdueHandoffs),
        "current desk boundaries",
      );
      element.dataset.rating = stationEvaluation.commandQualityRating;
      note.textContent = `${stationEvaluation.summary}. Read-only evaluation: throughput never offsets safety or rejected-command penalties.`;
      element.title = evaluation.methodology.commandQuality;
    },
  };
}

function updateSummary(
  score: HTMLElement,
  station: ControllerEvaluationStationSnapshot,
): void {
  score.textContent =
    station.commandQualityScore === null
      ? "not rated"
      : `${station.commandQualityScore}/100`;
}

function updateMetric(
  nodes: ReadonlyMap<string, MetricNode>,
  id: string,
  value: string,
  detail: string,
): void {
  const node = nodes.get(id);
  if (!node) return;
  node.value.textContent = value;
  node.detail.textContent = detail;
}
