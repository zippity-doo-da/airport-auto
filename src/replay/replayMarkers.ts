import type { ReplayFrame } from "../simulation/types";
import {
  MAXIMUM_REPLAY_MARKERS,
  type ReplayMarker,
  type ReplayMarkerCategory,
  type ReplayMarkerPriority,
  type ReplayTelemetryEvent,
} from "./replayTypes";

function nearestFrameIndex(
  frames: readonly ReplayFrame[],
  elapsed: number,
): number {
  if (!frames.length) return 0;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].clock < elapsed) low = middle + 1;
    else high = middle;
  }
  if (
    low > 0 &&
    Math.abs(frames[low - 1].clock - elapsed) <=
      Math.abs(frames[low].clock - elapsed)
  )
    return low - 1;
  return low;
}

function markerCategory(type: string): ReplayMarkerCategory {
  const lower = type.toLowerCase();
  if (
    /(collision|incursion|separation|emergency|go-around|microburst|wind-shear|safety)/.test(
      lower,
    )
  )
    return "safety";
  if (lower.startsWith("weather") || /(deicing|gust|thunder)/.test(lower))
    return "weather";
  if (
    lower.startsWith("command:") ||
    lower.includes("clearance") ||
    lower.includes("readback")
  )
    return "command";
  if (/(handoff|contact|controller-decision)/.test(lower))
    return "coordination";
  if (
    /(landing|touchdown|takeoff|pushback|taxi|gate|runway|service|turnaround|diversion)/.test(
      lower,
    )
  )
    return "movement";
  return "system";
}

function markerPriority(event: ReplayTelemetryEvent): ReplayMarkerPriority {
  const lower = `${event.type} ${event.detail ?? ""}`.toLowerCase();
  if (
    /(collision|incursion|emergency|microburst|wind-shear|critical)/.test(lower)
  )
    return "critical";
  if (
    event.accepted === false ||
    /(separation|go-around|hold|rejected|overdue|closure|warning)/.test(lower)
  )
    return "caution";
  return "normal";
}

function eventLabel(event: ReplayTelemetryEvent): string {
  const type = event.type
    .replace(/^command:/, "")
    .replace(/[:_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  const subject =
    event.callsign ??
    (event.flightId === undefined ? "" : `Flight ${event.flightId}`);
  const result =
    event.accepted === undefined
      ? ""
      : event.accepted
        ? "accepted"
        : "rejected";
  return [subject, type, result].filter(Boolean).join(" · ");
}

export function deriveReplayMarkers(
  events: readonly ReplayTelemetryEvent[],
  frames: readonly ReplayFrame[],
): ReplayMarker[] {
  return events
    .filter((event) => !event.type.startsWith("sound:"))
    .slice(-MAXIMUM_REPLAY_MARKERS)
    .map((event) => ({
      id: event.eventKey || `event-${event.eventId}`,
      eventId: event.eventId,
      sequence: event.sequence,
      frameIndex: nearestFrameIndex(frames, event.elapsed),
      elapsed: event.elapsed,
      category: markerCategory(event.type),
      priority: markerPriority(event),
      type: event.type,
      label: eventLabel(event),
      detail: event.detail ?? "",
      flightId: event.flightId ?? null,
      callsign: event.callsign ?? null,
      runway: event.runway ?? null,
      accepted: event.accepted ?? null,
    }));
}
