import type { FlightRouteClearanceStatus } from "../simulation/types";

export interface DigitalClearanceRouteChoice {
  fixIds: string[];
  label: string;
  turnDegrees: number;
}

export interface DigitalClearanceComposerFlight {
  id: number;
  callsign: string;
  owner: string;
  dataCommSupport: "supported" | "voice-only";
  canIssue: boolean;
  unavailableReason?: string;
  clearanceStatus?: FlightRouteClearanceStatus;
  clearanceSafeToIssue?: boolean;
  clearanceReason?: string;
  routes: DigitalClearanceRouteChoice[];
}

export interface DigitalClearanceComposerModel {
  enabled: boolean;
  replayMode: boolean;
  station: string;
  selectedFlightId: number | null;
  flights: DigitalClearanceComposerFlight[];
}

export interface DigitalClearanceComposerElements {
  form: HTMLFormElement;
  state: HTMLElement;
  flight: HTMLSelectElement;
  route: HTMLSelectElement;
  altitude: HTMLInputElement;
  speed: HTMLInputElement;
  preview: HTMLButtonElement;
  issue: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

export interface DigitalClearanceComposerSelection {
  flightId: number;
  fixIds: string[];
  altitudeFt?: number;
  speedKts?: number;
}

export function digitalClearanceComposerKey(
  model: DigitalClearanceComposerModel,
): string {
  return [
    model.enabled,
    model.replayMode,
    model.station,
    model.selectedFlightId ?? "none",
    ...model.flights.map((flight) =>
      [
        flight.id,
        flight.canIssue,
        flight.dataCommSupport,
        flight.clearanceStatus ?? "none",
        flight.clearanceSafeToIssue ?? "none",
        flight.clearanceReason ?? "",
        flight.routes.map((route) => route.fixIds.join(">")).join("|"),
      ].join(":"),
    ),
  ].join(";");
}

export function renderDigitalClearanceComposer(
  elements: DigitalClearanceComposerElements,
  model: DigitalClearanceComposerModel,
): number | null {
  elements.form.hidden = !model.enabled;
  if (!model.enabled) return null;

  const previousFlightId = Number(elements.flight.value);
  const preferredFlightId =
    model.selectedFlightId ??
    (Number.isFinite(previousFlightId) ? previousFlightId : null);
  const selectedFlight =
    model.flights.find((flight) => flight.id === preferredFlightId) ??
    model.flights[0] ??
    null;

  elements.flight.replaceChildren(
    ...model.flights.map((flight) => {
      const option = document.createElement("option");
      option.value = String(flight.id);
      option.textContent = `${flight.callsign} · ${flight.owner.toUpperCase()} · ${flight.dataCommSupport === "supported" ? "DATA" : "VOICE"}`;
      option.selected = flight.id === selectedFlight?.id;
      return option;
    }),
  );

  const previousRoute = elements.route.value;
  const selectedRoute =
    selectedFlight?.routes.find(
      (route) => route.fixIds.join(">") === previousRoute,
    ) ?? selectedFlight?.routes[0];
  elements.route.replaceChildren(
    ...(selectedFlight?.routes ?? []).map((route) => {
      const option = document.createElement("option");
      option.value = route.fixIds.join(">");
      option.textContent = `${route.label} · ${route.turnDegrees}° turn`;
      option.selected = option.value === selectedRoute?.fixIds.join(">");
      return option;
    }),
  );

  const active =
    selectedFlight?.clearanceStatus === "preview" ||
    selectedFlight?.clearanceStatus === "sent" ||
    selectedFlight?.clearanceStatus === "pending-readback";
  const canPreview = Boolean(
    selectedFlight?.canIssue && selectedRoute && !active && !model.replayMode,
  );
  const canIssue = Boolean(
    selectedFlight?.canIssue &&
    selectedFlight.clearanceStatus === "preview" &&
    selectedFlight.clearanceSafeToIssue &&
    !model.replayMode,
  );
  const canCancel = Boolean(
    selectedFlight?.canIssue && active && !model.replayMode,
  );

  elements.flight.disabled = !model.flights.length || model.replayMode;
  elements.route.disabled = !canPreview;
  elements.altitude.disabled = !canPreview;
  elements.speed.disabled = !canPreview;
  elements.preview.disabled = !canPreview;
  elements.issue.disabled = !canIssue;
  elements.cancel.disabled = !canCancel;

  if (!selectedFlight) {
    elements.state.textContent = "No eligible arrivals";
  } else if (model.replayMode) {
    elements.state.textContent = "Replay is read-only";
  } else if (!selectedFlight.canIssue) {
    elements.state.textContent =
      selectedFlight.unavailableReason ?? "Approach authority required";
  } else if (selectedFlight.clearanceStatus === "preview") {
    elements.state.textContent = selectedFlight.clearanceSafeToIssue
      ? "Preview safe · ready to send"
      : (selectedFlight.clearanceReason ?? "Preview blocked");
  } else if (selectedFlight.clearanceStatus === "sent") {
    elements.state.textContent = "Sent · awaiting delivery";
  } else if (selectedFlight.clearanceStatus === "pending-readback") {
    elements.state.textContent = "Delivered · awaiting readback";
  } else {
    elements.state.textContent = "Choose route and optional constraints";
  }

  return selectedFlight.id;
}

export function readDigitalClearanceComposer(
  elements: DigitalClearanceComposerElements,
): DigitalClearanceComposerSelection | null {
  const flightId = Number(elements.flight.value);
  const fixIds = elements.route.value.split(">").filter(Boolean);
  if (!Number.isInteger(flightId) || !fixIds.length) return null;
  const altitudeFt = optionalNumber(elements.altitude.value);
  const speedKts = optionalNumber(elements.speed.value);
  return {
    flightId,
    fixIds,
    ...(altitudeFt === undefined ? {} : { altitudeFt }),
    ...(speedKts === undefined ? {} : { speedKts }),
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
