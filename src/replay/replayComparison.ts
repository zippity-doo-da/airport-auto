import { stableReplayFingerprint } from "./replayFingerprint";
import {
  MAXIMUM_REPLAY_DIFFERENCES,
  isRecord,
  type ReplayStateComparison,
  type ReplayStateDifference,
  type ReplayStateSummary,
} from "./replayTypes";

function stateSummary(value: unknown): ReplayStateSummary {
  const state = isRecord(value) ? value : {};
  const weather = isRecord(state.weather) ? state.weather : {};
  return {
    elapsedSeconds: typeof state.elapsed === "number" ? state.elapsed : null,
    flights: Array.isArray(state.flights) ? state.flights.length : null,
    arrivals: typeof state.arrivals === "number" ? state.arrivals : null,
    departures: typeof state.departures === "number" ? state.departures : null,
    weather: typeof weather.condition === "string" ? weather.condition : null,
    runwayConfiguration:
      typeof state.runwayConfigurationId === "string"
        ? state.runwayConfigurationId
        : null,
    gameOver: typeof state.gameOver === "boolean" ? state.gameOver : null,
  };
}

function valueDescription(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (isRecord(value)) return `Object(${Object.keys(value).length})`;
  const serialized =
    typeof value === "string" ? JSON.stringify(value) : String(value);
  return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
}

export function compareReplayStates(
  left: unknown,
  right: unknown,
): ReplayStateComparison {
  const leftHash = stableReplayFingerprint(left);
  const rightHash = stableReplayFingerprint(right);
  const differences: ReplayStateDifference[] = [];
  let differenceCount = 0;
  const recordDifference = (difference: ReplayStateDifference): void => {
    differenceCount += 1;
    if (differences.length < MAXIMUM_REPLAY_DIFFERENCES)
      differences.push(difference);
  };
  const visit = (before: unknown, after: unknown, path: string): void => {
    if (Object.is(before, after)) return;
    if (Array.isArray(before) && Array.isArray(after)) {
      if (before.length !== after.length) {
        recordDifference({
          path,
          kind: "length",
          before: String(before.length),
          after: String(after.length),
        });
      }
      const length = Math.max(before.length, after.length);
      for (let index = 0; index < length; index += 1)
        visit(before[index], after[index], `${path}[${index}]`);
      return;
    }
    if (isRecord(before) && isRecord(after)) {
      const keys = [
        ...new Set([...Object.keys(before), ...Object.keys(after)]),
      ].sort();
      for (const key of keys) visit(before[key], after[key], `${path}.${key}`);
      return;
    }
    const beforeMissing = before === undefined;
    const afterMissing = after === undefined;
    recordDifference({
      path,
      kind: beforeMissing
        ? "added"
        : afterMissing
          ? "removed"
          : typeof before !== typeof after
            ? "type"
            : "value",
      before: valueDescription(before),
      after: valueDescription(after),
    });
  };
  if (leftHash !== rightHash) visit(left, right, "$");
  return {
    equal: leftHash === rightHash,
    leftHash,
    rightHash,
    differenceCount,
    truncated: differenceCount > differences.length,
    differences,
    summary: { left: stateSummary(left), right: stateSummary(right) },
  };
}
