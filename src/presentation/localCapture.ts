export type LocalCaptureStatus = "idle" | "recording" | "finalizing" | "error";

export interface LocalCaptureSnapshot {
  supported: {
    screenshot: boolean;
    clip: boolean;
  };
  status: LocalCaptureStatus;
  recording: boolean;
  startedAtMs: number | null;
  maximumDurationSeconds: number;
  elapsedSeconds: number;
  mimeType: string | null;
  lastFilename: string | null;
  lastBytes: number;
  error: string | null;
  localOnly: true;
  microphone: false;
  automaticUpload: false;
}

interface RecorderLike {
  readonly state: string;
  readonly mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

type RecorderConstructor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions,
) => RecorderLike;

export interface LocalCaptureOptions {
  now?: () => number;
  recorder?: RecorderConstructor | null;
  isTypeSupported?: (mimeType: string) => boolean;
  onStateChange?: (snapshot: LocalCaptureSnapshot) => void;
  download?: (blob: Blob, filename: string) => void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

function safeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "airport-auto"
  );
}

function defaultDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function screenshotBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Browser returned an empty screenshot."));
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

export class LocalCapture {
  private readonly now: () => number;
  private readonly Recorder: RecorderConstructor | null;
  private readonly isTypeSupported: (mimeType: string) => boolean;
  private readonly onStateChange: (snapshot: LocalCaptureSnapshot) => void;
  private readonly download: (blob: Blob, filename: string) => void;
  private readonly schedule: typeof globalThis.setTimeout;
  private readonly cancelSchedule: typeof globalThis.clearTimeout;
  private status: LocalCaptureStatus = "idle";
  private recorder: RecorderLike | null = null;
  private stream: MediaStream | null = null;
  private recordingStartedAtMs: number | null = null;
  private maximumDurationSeconds = 0;
  private mimeType: string | null = null;
  private filename: string | null = null;
  private chunks: Blob[] = [];
  private stopTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private lastFilename: string | null = null;
  private lastBytes = 0;
  private error: string | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: LocalCaptureOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.Recorder =
      options.recorder ??
      (typeof MediaRecorder === "undefined"
        ? null
        : (MediaRecorder as RecorderConstructor));
    this.isTypeSupported =
      options.isTypeSupported ??
      ((mimeType) =>
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(mimeType));
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.download = options.download ?? defaultDownload;
    this.schedule = options.setTimeout ?? globalThis.setTimeout;
    this.cancelSchedule = options.clearTimeout ?? globalThis.clearTimeout;
  }

  snapshot(): LocalCaptureSnapshot {
    return {
      supported: {
        screenshot: typeof this.canvas.toBlob === "function",
        clip:
          typeof this.canvas.captureStream === "function" &&
          this.Recorder !== null,
      },
      status: this.status,
      recording: this.status === "recording" || this.status === "finalizing",
      startedAtMs: this.recordingStartedAtMs,
      maximumDurationSeconds: this.maximumDurationSeconds,
      elapsedSeconds:
        this.recordingStartedAtMs === null
          ? 0
          : Math.min(
              this.maximumDurationSeconds,
              Math.max(0, (this.now() - this.recordingStartedAtMs) / 1_000),
            ),
      mimeType: this.mimeType,
      lastFilename: this.lastFilename,
      lastBytes: this.lastBytes,
      error: this.error,
      localOnly: true,
      microphone: false,
      automaticUpload: false,
    };
  }

  async screenshot(basename: string): Promise<LocalCaptureSnapshot> {
    if (this.status !== "idle" && this.status !== "error")
      return this.snapshot();
    this.error = null;
    try {
      const blob = await screenshotBlob(this.canvas);
      const filename = `${safeFilename(basename)}.png`;
      this.download(blob, filename);
      this.lastFilename = filename;
      this.lastBytes = blob.size;
      this.status = "idle";
    } catch (error) {
      this.status = "error";
      this.error =
        error instanceof Error ? error.message : "Screenshot capture failed.";
    }
    return this.emit();
  }

  startClip(durationSeconds: number, basename: string): LocalCaptureSnapshot {
    if (this.status === "recording" || this.status === "finalizing")
      return this.snapshot();
    if (typeof this.canvas.captureStream !== "function" || !this.Recorder) {
      this.status = "error";
      this.error = "This browser does not support local canvas recording.";
      return this.emit();
    }
    this.clearTimer();
    this.chunks = [];
    this.error = null;
    this.lastBytes = 0;
    this.maximumDurationSeconds = Math.max(
      3,
      Math.min(15, Math.round(durationSeconds)),
    );
    this.recordingStartedAtMs = this.now();
    this.filename = `${safeFilename(basename)}.webm`;
    const mimeType =
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
        (candidate) => this.isTypeSupported(candidate),
      ) ?? "";
    try {
      const stream = this.canvas.captureStream(30);
      this.stream = stream;
      this.recorder = new this.Recorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined,
      );
      this.mimeType = this.recorder.mimeType || mimeType || "video/webm";
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = () => {
        this.error = "The browser stopped the local recording unexpectedly.";
        this.status = "error";
        if (this.recorder) this.recorder.onstop = null;
        this.finishStream(stream);
        this.resetRecording();
        this.emit();
      };
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: this.mimeType ?? "video/webm",
        });
        if (blob.size > 0 && this.filename) {
          this.download(blob, this.filename);
          this.lastFilename = this.filename;
          this.lastBytes = blob.size;
          this.status = "idle";
        } else {
          this.status = "error";
          this.error = "Browser returned an empty video clip.";
        }
        this.finishStream(stream);
        this.resetRecording();
        this.emit();
      };
      this.recorder.start(1_000);
      this.status = "recording";
      this.stopTimer = this.schedule(
        () => this.stopClip(),
        this.maximumDurationSeconds * 1_000,
      );
    } catch (error) {
      this.status = "error";
      this.error =
        error instanceof Error ? error.message : "Clip capture failed.";
      if (this.stream) this.finishStream(this.stream);
      this.resetRecording();
    }
    return this.emit();
  }

  stopClip(): LocalCaptureSnapshot {
    if (this.status !== "recording" || !this.recorder) return this.snapshot();
    this.clearTimer();
    this.status = "finalizing";
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
    } catch (error) {
      this.status = "error";
      this.error =
        error instanceof Error
          ? error.message
          : "Could not stop the local clip.";
      if (this.stream) this.finishStream(this.stream);
      this.resetRecording();
    }
    return this.emit();
  }

  dispose(): void {
    this.clearTimer();
    const recorder = this.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Page teardown owns the remaining media tracks.
      }
    }
    if (this.stream) this.finishStream(this.stream);
    this.resetRecording();
  }

  private finishStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) track.stop();
    if (this.stream === stream) this.stream = null;
  }

  private clearTimer(): void {
    if (this.stopTimer !== null) this.cancelSchedule(this.stopTimer);
    this.stopTimer = null;
  }

  private resetRecording(): void {
    this.clearTimer();
    this.recorder = null;
    this.recordingStartedAtMs = null;
    this.maximumDurationSeconds = 0;
    this.mimeType = null;
    this.filename = null;
    this.chunks = [];
  }

  private emit(): LocalCaptureSnapshot {
    const snapshot = this.snapshot();
    this.onStateChange(snapshot);
    return snapshot;
  }
}
