import type {
  SurfaceSafetySnapshot,
  SurfaceTrack,
  SurfaceVehicleTrack,
} from "../simulation/surfaceSafety";
import type { AirportConfig } from "../simulation/airportConfig";

export interface SurfaceSafetyPanelElements {
  panel: HTMLElement;
  diagram: HTMLElement;
  tracks: HTMLElement;
  vehicles: HTMLElement;
  advisories: HTMLElement;
  movers: HTMLElement;
  protectedRunways: HTMLElement;
  holds: HTMLElement;
}

export type SurfaceSafetyFilter =
  | "all"
  | "tower"
  | "ground"
  | "ramp"
  | "supervisor"
  | "watch";

export interface SurfaceSafetyLookaheadTarget {
  track: SurfaceTrack;
  severity: SurfaceSafetySnapshot["advisories"][number]["severity"];
  etaSeconds: number;
}

export function surfaceSafetyPanelKey(snapshot: SurfaceSafetySnapshot): string {
  return [
    // The compact diagram is a radar-like operational aid, not a frame-by-frame
    // renderer. Four hertz keeps symbols current without rebuilding the panel
    // alongside every Three.js animation frame.
    Math.floor(snapshot.generatedAtSeconds * 4),
    snapshot.protectedRunwayOccupancy,
    snapshot.heldTracks,
    snapshot.tracks
      .map(
        (track) =>
          `${track.id}:${track.state}:${track.location}:${track.groundspeedKts}`,
      )
      .join(","),
    snapshot.vehicles
      .map(
        (vehicle) =>
          `${vehicle.id}:${vehicle.state}:${vehicle.location}:${vehicle.groundspeedKts}`,
      )
      .join(","),
    snapshot.advisories
      .map(
        (advisory) =>
          `${advisory.id}:${advisory.severity}:${advisory.status}:${advisory.etaSeconds}:${advisory.firstSeenAtSeconds}:${advisory.resolvedAtSeconds ?? "active"}:${advisory.acknowledgedAtSeconds ?? "none"}`,
      )
      .join(","),
  ].join("|");
}

export function renderSurfaceSafetyPanel(
  elements: SurfaceSafetyPanelElements,
  config: AirportConfig,
  snapshot: SurfaceSafetySnapshot,
  focusedFlightId: number | null,
  filter: SurfaceSafetyFilter,
  lookaheadSeconds: number,
): void {
  elements.movers.textContent = String(
    snapshot.tracks.filter((track) => track.state !== "parked").length,
  );
  elements.protectedRunways.textContent = String(
    snapshot.protectedRunwayOccupancy,
  );
  elements.holds.textContent = String(snapshot.heldTracks);
  const visibleTracks = surfaceSafetyTracksForFilter(snapshot, filter);
  const visibleVehicles = surfaceSafetyVehiclesForFilter(snapshot, filter);
  renderSurfaceDiagram(
    elements.diagram,
    config,
    visibleTracks,
    visibleVehicles,
    snapshot.advisories,
    lookaheadSeconds,
  );
  elements.tracks.replaceChildren(
    ...visibleTracks
      .slice(0, 10)
      .map((track) => trackRow(track, focusedFlightId)),
  );
  if (!visibleTracks.length) {
    const empty = document.createElement("small");
    empty.className = "surface-safety__clear";
    empty.textContent = "No tracks match this station view.";
    elements.tracks.append(empty);
  }
  elements.vehicles.replaceChildren(
    ...visibleVehicles.slice(0, 8).map(vehicleRow),
  );
  if (!visibleVehicles.length) {
    const empty = document.createElement("small");
    empty.className = "surface-safety__clear";
    empty.textContent = "No active service vehicles.";
    elements.vehicles.append(empty);
  }
  elements.advisories.replaceChildren(...snapshot.advisories.map(advisoryRow));
  if (!snapshot.advisories.length) {
    const clear = document.createElement("small");
    clear.className = "surface-safety__clear";
    clear.textContent = "No active surface forecasts.";
    elements.advisories.append(clear);
  }
}

/**
 * Returns the flights relevant to a control position without reading renderer
 * state. Keeping this selection pure lets the panel, API, and tests share the
 * exact same operational picture.
 */
export function surfaceSafetyTracksForFilter(
  snapshot: SurfaceSafetySnapshot,
  filter: SurfaceSafetyFilter,
): SurfaceTrack[] {
  return snapshot.tracks.filter((track) => trackMatchesFilter(track, filter));
}

/** Returns the service vehicles relevant to a control position. */
export function surfaceSafetyVehiclesForFilter(
  snapshot: SurfaceSafetySnapshot,
  filter: SurfaceSafetyFilter,
): SurfaceVehicleTrack[] {
  return snapshot.vehicles.filter((vehicle) =>
    vehicleMatchesFilter(vehicle, filter),
  );
}

/**
 * Selects only forecast-backed tracks inside the viewer's chosen horizon.
 * Geometry stays a presentation concern; this pure selection is shared with
 * validation so the radar cannot silently display a speculative target.
 */
export function surfaceSafetyLookaheadTargets(
  tracks: SurfaceTrack[],
  advisories: SurfaceSafetySnapshot["advisories"],
  lookaheadSeconds: number,
): SurfaceSafetyLookaheadTarget[] {
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  return advisories.flatMap((advisory) => {
    if (
      advisory.status !== "active" ||
      advisory.etaSeconds <= 0 ||
      advisory.etaSeconds > lookaheadSeconds
    ) {
      return [];
    }
    return advisory.flightIds.flatMap((flightId) => {
      const track = trackById.get(flightId);
      return track
        ? [{ track, severity: advisory.severity, etaSeconds: advisory.etaSeconds }]
        : [];
    });
  });
}

/** Compact ASDE-inspired diagram built only from the shared surface snapshot. */
function renderSurfaceDiagram(
  container: HTMLElement,
  config: AirportConfig,
  tracks: SurfaceTrack[],
  vehicles: SurfaceVehicleTrack[],
  advisories: SurfaceSafetySnapshot["advisories"],
  lookaheadSeconds: number,
): void {
  const runwayPoints = config.runways.flatMap((runway) => {
    const half = runway.length / 2;
    const x = Math.cos(runway.heading) * half;
    const y = Math.sin(runway.heading) * half;
    return [
      [runway.center[0] - x, runway.center[1] - y],
      [runway.center[0] + x, runway.center[1] + y],
    ];
  });
  const points = [
    ...runwayPoints,
    ...tracks.map((track) => [track.x, track.y]),
    ...vehicles.map((vehicle) => [vehicle.x, vehicle.y]),
  ];
  const minX = Math.min(...points.map((point) => point[0])) - 8;
  const maxX = Math.max(...points.map((point) => point[0])) + 8;
  const minY = Math.min(...points.map((point) => point[1])) - 8;
  const maxY = Math.max(...points.map((point) => point[1])) + 8;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const svgY = (value: number) => maxY - value + minY;
  const runwayLines = config.runways
    .map((runway) => {
      const half = runway.length / 2;
      const x = Math.cos(runway.heading) * half;
      const y = Math.sin(runway.heading) * half;
      const occupied = tracks.some(
        (track) => track.protectedRunway && track.runwayId === runway.id,
      );
      return `<line class="surface-safety__diagram-runway" data-occupied="${occupied}" x1="${runway.center[0] - x}" y1="${svgY(runway.center[1] - y)}" x2="${runway.center[0] + x}" y2="${svgY(runway.center[1] + y)}" />`;
    })
    .join("");
  const trackMarks = tracks
    .map((track) => {
      const color = track.protectedRunway
        ? "#ef6f62"
        : track.state.includes("hold")
          ? "#f2c84b"
          : "#79c8e8";
      // SVG has a downward Y axis, so invert the authoritative mathematical
      // heading. The triangle itself faces right at zero degrees.
      return `<path class="surface-safety__diagram-track" d="M -2.4 1.9 L 2.8 0 L -2.4 -1.9 Z" fill="${color}" transform="translate(${track.x} ${svgY(track.y)}) rotate(${-track.headingDegrees})" />`;
    })
    .join("");
  const lookaheadArcs = surfaceSafetyLookaheadTargets(
    tracks,
    advisories,
    lookaheadSeconds,
  )
    .map(({ track, severity, etaSeconds }) => {
      const radius = Math.max(
        3.5,
        Math.min(11, (track.groundspeedKts * etaSeconds) / 95),
      );
      const centerX = track.x;
      const centerY = svgY(track.y);
      const direction = (-track.headingDegrees * Math.PI) / 180;
      const spread = (52 * Math.PI) / 180;
      const startX = centerX + Math.cos(direction - spread) * radius;
      const startY = centerY + Math.sin(direction - spread) * radius;
      const endX = centerX + Math.cos(direction + spread) * radius;
      const endY = centerY + Math.sin(direction + spread) * radius;
      return `<path class="surface-safety__diagram-lookahead" data-severity="${severity}" d="M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}" aria-label="${severity} forecast for ${track.callsign} in ${etaSeconds} seconds" />`;
    })
    .join("");
  const vehicleMarks = vehicles
    .map(
      (vehicle) =>
        `<rect class="surface-safety__diagram-vehicle" x="${vehicle.x - 1.3}" y="${svgY(vehicle.y) - 1.3}" width="2.6" height="2.6" />`,
    )
    .join("");
  container.innerHTML = `<svg viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="Surface diagram: ${tracks.length} aircraft tracks, ${vehicles.length} service vehicles, ${lookaheadArcs ? "active forecast arcs" : "no forecast arcs"}">${runwayLines}${lookaheadArcs}${vehicleMarks}${trackMarks}</svg>`;
}

function trackMatchesFilter(
  track: SurfaceTrack,
  filter: SurfaceSafetyFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "tower")
    return (
      track.protectedRunway ||
      track.state === "hold-short" ||
      track.state === "safety-hold"
    );
  if (filter === "ground") return track.state !== "parked";
  if (filter === "supervisor") {
    // Supervisor needs the active movement picture plus every exception that
    // can consume capacity; ordinary quiet parked stands stay out of the way.
    return track.state !== "parked" || track.protectedRunway;
  }
  if (filter === "watch") {
    // Watch is an ambient, read-only presentation: keep only motion, not a
    // wall of parked aircraft or controller exception states.
    return track.state === "taxiing" || track.state === "protected-runway";
  }
  return (
    track.state === "parked" ||
    track.location.startsWith("Ramp") ||
    track.location.startsWith("Apron")
  );
}

function vehicleMatchesFilter(
  vehicle: SurfaceVehicleTrack,
  filter: SurfaceSafetyFilter,
): boolean {
  if (filter === "all" || filter === "ground") return true;
  if (filter === "tower") return vehicle.protectedMovementArea || vehicle.held;
  if (filter === "supervisor") return vehicle.state !== "scheduled" && vehicle.state !== "complete";
  if (filter === "watch") {
    return ["dispatching", "approaching", "clearing", "returning", "servicing"].includes(vehicle.state);
  }
  return !vehicle.protectedMovementArea;
}

function trackRow(
  track: SurfaceTrack,
  focusedFlightId: number | null,
): HTMLButtonElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "surface-safety__track";
  row.dataset.flightId = String(track.id);
  row.dataset.state = track.state;
  row.setAttribute("aria-pressed", String(track.id === focusedFlightId));
  row.innerHTML = `<b>${escapeHtml(track.callsign)}</b><i>${trackStateLabel(track)}</i><span>${escapeHtml(track.location)} · ${track.groundspeedKts} kt · ${track.headingDegrees.toString().padStart(3, "0")}°</span><small>${escapeHtml(track.routeIntent)} · ${escapeHtml(track.clearanceSummary)} · ${track.surveillanceAgeSeconds}s track age</small>`;
  return row;
}

function advisoryRow(
  advisory: SurfaceSafetySnapshot["advisories"][number],
): HTMLElement {
  const row = document.createElement("div");
  row.className = "surface-safety__advisory";
  row.dataset.severity = advisory.severity;
  row.dataset.status = advisory.status;
  const eta = advisory.etaSeconds > 0 ? ` · ETA ${advisory.etaSeconds}s` : "";
  const age = Math.max(
    0,
    Math.round(advisory.lastSeenAtSeconds - advisory.firstSeenAtSeconds),
  );
  const detail = document.createElement("span");
  detail.textContent = `${advisory.status === "resolved" ? "RESOLVED" : advisory.severity.toUpperCase()}${eta} · ${age}s — ${advisory.detail}`;
  row.append(detail);
  if (advisory.acknowledgedAtSeconds !== undefined) {
    const acknowledgment = document.createElement("small");
    acknowledgment.className = "surface-safety__acknowledged";
    acknowledgment.textContent = "ACK";
    row.append(acknowledgment);
  } else if (advisory.status === "active" && advisory.severity !== "critical") {
    const acknowledge = document.createElement("button");
    acknowledge.type = "button";
    acknowledge.className = "surface-safety__acknowledge";
    acknowledge.dataset.advisoryId = advisory.id;
    acknowledge.textContent = "Ack";
    acknowledge.setAttribute("aria-label", `Acknowledge ${advisory.detail}`);
    row.append(acknowledge);
  }
  return row;
}

function vehicleRow(vehicle: SurfaceVehicleTrack): HTMLElement {
  const row = document.createElement("div");
  row.className = "surface-safety__vehicle";
  row.dataset.state = vehicle.state;
  row.textContent = `${vehicle.callsign} · ${vehicle.location} · ${vehicle.groundspeedKts} kt · ${vehicle.state.replace("-", " ")}`;
  return row;
}

function trackStateLabel(track: SurfaceTrack): string {
  switch (track.state) {
    case "safety-hold":
      return "Safety hold";
    case "hold-short":
      return "Hold short";
    case "controller-hold":
      return "Held";
    case "protected-runway":
      return "Runway";
    case "taxiing":
      return "Taxi";
    default:
      return "Stand";
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}
