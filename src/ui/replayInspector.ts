import type {
  ReplayMarker,
  ReplayStateComparison,
  ReplayVerificationResult,
} from "../replay/replayRecording";

export interface ReplayInspectorModel {
  source: "live" | "imported";
  sourceLabel: string;
  detail: string;
  schemaVersion: number;
  frames: number;
  durationSeconds: number;
  currentFrame: number | null;
  baselineFrame: number | null;
  markers: ReplayMarker[];
  verification: ReplayVerificationResult | null;
  verificationStale: boolean;
  comparison: ReplayStateComparison | null;
  shareAvailable: boolean;
}

export interface ReplayInspectorHandlers {
  importFile(file: File): void | Promise<void>;
  useLiveBuffer(): void;
  copySeedLink(): void | Promise<void>;
  verify(): void | Promise<void>;
  share(): void | Promise<void>;
  seek(frameIndex: number): void;
  setBaseline(): void;
  compare(): void;
}

export interface ReplayInspector {
  render(model: ReplayInspectorModel): void;
  setBusy(busy: boolean): void;
}

type ReplayInspectorElements = {
  root: HTMLElement;
  source: HTMLElement;
  detail: HTMLElement;
  status: HTMLElement;
  importButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  liveButton: HTMLButtonElement;
  seedButton: HTMLButtonElement;
  verifyButton: HTMLButtonElement;
  shareButton: HTMLButtonElement;
  markerSelect: HTMLSelectElement;
  baselineButton: HTMLButtonElement;
  compareButton: HTMLButtonElement;
  comparison: HTMLElement;
};

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element)
    throw new Error(`Missing replay inspector element: ${selector}`);
  return element;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function verificationText(
  verification: ReplayVerificationResult | null,
  stale: boolean,
): {
  label: string;
  detail: string;
  tone: string;
} {
  if (!verification)
    return {
      label: "Not checked",
      detail: "Verify before importing or sharing a replay.",
      tone: "idle",
    };
  if (!verification.exact)
    return {
      label: "Mismatch",
      detail: verification.reason,
      tone: "critical",
    };
  if (verification.legacyUnsealed)
    return {
      label: "Migrated · unsealed source",
      detail: verification.reason,
      tone: "caution",
    };
  if (stale)
    return {
      label: "Exact fingerprints verified",
      detail: `Live buffer advanced after this receipt · verify again for the latest frame · ${verification.manifestHash ?? "no receipt"}`,
      tone: "caution",
    };
  return {
    label: "Exact fingerprints verified",
    detail: `${verification.checkedFrames.toLocaleString()} frames · ${verification.checkedEvents.toLocaleString()} events · ${verification.manifestHash ?? "no receipt"}`,
    tone: "ok",
  };
}

function comparisonText(comparison: ReplayStateComparison | null): string {
  if (!comparison)
    return "Set a baseline frame, move the replay, then compare.";
  if (comparison.equal) return `Exact match · ${comparison.leftHash}`;
  const first = comparison.differences[0];
  return `${comparison.differenceCount.toLocaleString()} state change${comparison.differenceCount === 1 ? "" : "s"}${comparison.truncated ? "+" : ""}${first ? ` · first at ${first.path}` : ""}`;
}

export function createReplayInspector(
  root: HTMLElement,
  handlers: ReplayInspectorHandlers,
): ReplayInspector {
  const elements: ReplayInspectorElements = {
    root,
    source: required(root, "#replay-source"),
    detail: required(root, "#replay-detail"),
    status: required(root, "#replay-verification"),
    importButton: required(root, "#replay-import"),
    fileInput: required(root, "#replay-file"),
    liveButton: required(root, "#replay-live-buffer"),
    seedButton: required(root, "#replay-seed-link"),
    verifyButton: required(root, "#replay-verify"),
    shareButton: required(root, "#replay-share"),
    markerSelect: required(root, "#replay-marker"),
    baselineButton: required(root, "#replay-baseline"),
    compareButton: required(root, "#replay-compare"),
    comparison: required(root, "#replay-comparison"),
  };
  let busy = false;
  let markerKey = "";

  const run = (operation: () => void | Promise<void>): void => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(operation())
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  elements.importButton.addEventListener("click", () =>
    elements.fileInput.click(),
  );
  elements.fileInput.addEventListener("change", () => {
    const file = elements.fileInput.files?.[0];
    elements.fileInput.value = "";
    if (file) run(() => handlers.importFile(file));
  });
  elements.liveButton.addEventListener("click", () => handlers.useLiveBuffer());
  elements.seedButton.addEventListener("click", () =>
    run(handlers.copySeedLink),
  );
  elements.verifyButton.addEventListener("click", () => run(handlers.verify));
  elements.shareButton.addEventListener("click", () => run(handlers.share));
  elements.markerSelect.addEventListener("change", () => {
    const frameIndex = Number(elements.markerSelect.value);
    if (Number.isInteger(frameIndex) && frameIndex >= 0)
      handlers.seek(frameIndex);
  });
  elements.baselineButton.addEventListener("click", handlers.setBaseline);
  elements.compareButton.addEventListener("click", handlers.compare);

  const setBusy = (nextBusy: boolean): void => {
    busy = nextBusy;
    elements.root.toggleAttribute("aria-busy", busy);
    elements.importButton.disabled = busy;
    elements.seedButton.disabled = busy;
    elements.verifyButton.disabled = busy;
    elements.shareButton.disabled = busy || elements.shareButton.hidden;
  };

  const render = (model: ReplayInspectorModel): void => {
    elements.source.textContent = model.sourceLabel;
    elements.detail.textContent = model.detail;
    elements.liveButton.disabled = busy || model.source === "live";
    elements.verifyButton.disabled = busy || model.frames === 0;
    elements.shareButton.hidden = !model.shareAvailable;
    elements.shareButton.disabled =
      busy || !model.shareAvailable || model.frames === 0;
    elements.baselineButton.disabled = model.currentFrame === null;
    elements.compareButton.disabled =
      model.currentFrame === null || model.baselineFrame === null;
    elements.baselineButton.textContent =
      model.baselineFrame === null ? "Set A" : `A · ${model.baselineFrame + 1}`;

    const verification = verificationText(
      model.verification,
      model.verificationStale,
    );
    elements.status.dataset.tone = verification.tone;
    elements.status.replaceChildren();
    const verificationLabel = document.createElement("b");
    verificationLabel.textContent = verification.label;
    const verificationDetail = document.createElement("small");
    verificationDetail.textContent = verification.detail;
    elements.status.append(verificationLabel, verificationDetail);

    const nextMarkerKey = model.markers
      .map((marker) => `${marker.id}:${marker.frameIndex}`)
      .join("|");
    if (nextMarkerKey !== markerKey) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = model.markers.length
        ? `${model.markers.length} event markers`
        : "No event markers yet";
      const options = model.markers.map((marker) => {
        const option = document.createElement("option");
        option.value = String(marker.frameIndex);
        option.textContent = `${formatClock(marker.elapsed)} · ${marker.label}`;
        option.dataset.priority = marker.priority;
        option.title = marker.detail || marker.type;
        return option;
      });
      elements.markerSelect.replaceChildren(placeholder, ...options);
      markerKey = nextMarkerKey;
    }
    elements.markerSelect.disabled = model.markers.length === 0;
    elements.markerSelect.value = "";
    elements.comparison.textContent = comparisonText(model.comparison);
    elements.comparison.dataset.equal = String(
      model.comparison?.equal ?? false,
    );
  };

  return { render, setBusy };
}
