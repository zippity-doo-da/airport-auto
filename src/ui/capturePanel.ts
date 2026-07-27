import type {
  LocalCapture,
  LocalCaptureSnapshot,
} from "../presentation/localCapture";

export interface CapturePanelOptions {
  capture: LocalCapture;
  filenameBase: () => string;
  beforeCleanView: () => void;
  announce: (label: string, detail: string, warning?: boolean) => void;
}

export interface CapturePanel {
  setCleanView(enabled: boolean): boolean;
  cleanView(): boolean;
  render(snapshot?: LocalCaptureSnapshot): void;
  dispose(): void;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing capture control ${selector}`);
  return element;
}

export function createCapturePanel(
  root: HTMLElement,
  options: CapturePanelOptions,
): CapturePanel {
  const clean = required<HTMLInputElement>(root, "[data-capture-clean]");
  const screenshot = required<HTMLButtonElement>(
    root,
    "[data-capture-screenshot]",
  );
  const record = required<HTMLButtonElement>(root, "[data-capture-record]");
  const duration = required<HTMLSelectElement>(root, "[data-capture-duration]");
  const status = required<HTMLElement>(root, "[data-capture-status]");
  const exit = required<HTMLButtonElement>(document, "#capture-clean-exit");

  const setCleanView = (enabled: boolean): boolean => {
    if (enabled) options.beforeCleanView();
    document.body.classList.toggle("capture-clean", enabled);
    clean.checked = enabled;
    exit.hidden = !enabled;
    exit.setAttribute("aria-pressed", String(enabled));
    if (enabled) exit.focus({ preventScroll: true });
    options.announce(
      enabled ? "Clean spectator view" : "Interface restored",
      enabled
        ? "All presentation chrome is hidden. Press Escape or use the corner button to return."
        : "Capture and control panels are available again.",
    );
    return enabled;
  };

  const render = (snapshot = options.capture.snapshot()): void => {
    screenshot.disabled = !snapshot.supported.screenshot || snapshot.recording;
    duration.disabled = snapshot.recording || !snapshot.supported.clip;
    record.disabled = !snapshot.supported.clip && !snapshot.recording;
    record.textContent =
      snapshot.status === "recording"
        ? `Stop clip · ${Math.ceil(snapshot.maximumDurationSeconds - snapshot.elapsedSeconds)}s max`
        : snapshot.status === "finalizing"
          ? "Finalizing…"
          : "Record local clip";
    status.dataset.state = snapshot.status;
    status.textContent =
      snapshot.status === "recording"
        ? `Recording ${snapshot.mimeType ?? "WebM"} locally · no microphone or upload`
        : snapshot.status === "finalizing"
          ? "Finalizing the local WebM clip…"
          : snapshot.error
            ? snapshot.error
            : snapshot.lastFilename
              ? `${snapshot.lastFilename} · ${Math.max(1, Math.round(snapshot.lastBytes / 1_024)).toLocaleString()} KiB saved locally`
              : "PNG screenshots and 3–15 second silent WebM clips stay on this device.";
  };

  const onClean = (): void => {
    setCleanView(clean.checked);
  };
  const onExit = (): void => {
    setCleanView(false);
  };
  const onScreenshot = async (): Promise<void> => {
    screenshot.disabled = true;
    const snapshot = await options.capture.screenshot(options.filenameBase());
    render(snapshot);
    options.announce(
      snapshot.error ? "Screenshot failed" : "Screenshot saved",
      snapshot.error ?? `${snapshot.lastFilename} stayed on this device.`,
      Boolean(snapshot.error),
    );
  };
  const onRecord = (): void => {
    const current = options.capture.snapshot();
    const snapshot =
      current.status === "recording"
        ? options.capture.stopClip()
        : options.capture.startClip(
            Number(duration.value),
            options.filenameBase(),
          );
    render(snapshot);
    options.announce(
      snapshot.error
        ? "Clip capture unavailable"
        : snapshot.status === "recording"
          ? "Local clip recording"
          : "Finalizing local clip",
      snapshot.error ??
        "Canvas video only · no microphone · no automatic upload.",
      Boolean(snapshot.error),
    );
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("capture-clean")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setCleanView(false);
    }
  };

  clean.addEventListener("change", onClean);
  exit.addEventListener("click", onExit);
  screenshot.addEventListener("click", onScreenshot);
  record.addEventListener("click", onRecord);
  document.addEventListener("keydown", onKeyDown);
  render();

  return {
    setCleanView,
    cleanView: () => document.body.classList.contains("capture-clean"),
    render,
    dispose() {
      clean.removeEventListener("change", onClean);
      exit.removeEventListener("click", onExit);
      screenshot.removeEventListener("click", onScreenshot);
      record.removeEventListener("click", onRecord);
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("capture-clean");
    },
  };
}
