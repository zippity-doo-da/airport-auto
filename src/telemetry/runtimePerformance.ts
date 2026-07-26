export const RUNTIME_PERFORMANCE_SCHEMA_VERSION = 1 as const;

export type RuntimeBudgetStatus =
  "warming" | "nominal" | "attention" | "exceeded" | "unavailable";

export interface RuntimePerformanceBudgets {
  frameWorkP95Ms: number;
  frameGapP95Ms: number;
  simulationTickP95Ms: number;
  heapMiB: number;
  heapGrowthMiBPerHour: number;
  aircraft: number;
  serviceVehicles: number;
  audioVoices: number;
  queues: number;
  lowDetailDrawCalls: number;
  highDetailDrawCalls: number;
  lowDetailGeometries: number;
  highDetailGeometries: number;
}

export const DEFAULT_RUNTIME_PERFORMANCE_BUDGETS: RuntimePerformanceBudgets = {
  frameWorkP95Ms: 20,
  frameGapP95Ms: 34,
  simulationTickP95Ms: 10,
  heapMiB: 512,
  heapGrowthMiBPerHour: 32,
  aircraft: 160,
  serviceVehicles: 96,
  audioVoices: 14,
  queues: 64,
  lowDetailDrawCalls: 320,
  highDetailDrawCalls: 700,
  lowDetailGeometries: 280,
  highDetailGeometries: 760,
};

export interface RuntimeCounterSample {
  elapsedSeconds: number;
  heapBytes: number | null;
  aircraft: number;
  serviceVehicles: number;
  audioVoices: number;
  queues: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  detail: "low" | "high";
}

export interface RuntimeDistribution {
  samples: number;
  latest: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface RuntimeBudgetCheck {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  limit: number;
  status: RuntimeBudgetStatus;
}

export interface RuntimeGrowthSnapshot {
  observedSeconds: number;
  sampleCount: number;
  heapMiBPerHour: number | null;
  aircraftPerHour: number;
  serviceVehiclesPerHour: number;
  queuesPerHour: number;
  drawCallsPerHour: number;
  baseline: RuntimeCounterSample | null;
  latest: RuntimeCounterSample | null;
}

export interface RuntimePerformanceSnapshot {
  schemaVersion: typeof RUNTIME_PERFORMANCE_SCHEMA_VERSION;
  status: Exclude<RuntimeBudgetStatus, "unavailable">;
  sampledAtSeconds: number;
  frameWorkMs: RuntimeDistribution;
  frameGapMs: RuntimeDistribution;
  simulationTickMs: RuntimeDistribution;
  droppedSimulationSeconds: number;
  maximumTicksPerFrame: number;
  counters: RuntimeCounterSample | null;
  growth: RuntimeGrowthSnapshot;
  budgets: RuntimePerformanceBudgets;
  checks: RuntimeBudgetCheck[];
  retention: {
    frameSamples: number;
    simulationSamples: number;
    counterSamples: number;
    maximumFrameSamples: number;
    maximumSimulationSamples: number;
    maximumCounterSamples: number;
  };
  disclosure: string;
}

const MAX_FRAME_SAMPLES = 1_200;
const MAX_SIMULATION_SAMPLES = 1_200;
const MAX_COUNTER_SAMPLES = 21_600;
const MIN_GROWTH_OBSERVATION_SECONDS = 300;
const MIB = 1_048_576;

export class RuntimePerformanceMonitor {
  private readonly frameWorkSamples: number[] = [];
  private readonly frameGapSamples: number[] = [];
  private readonly simulationTickSamples: number[] = [];
  private readonly counterSamples: RuntimeCounterSample[] = [];
  private droppedSimulationSeconds = 0;
  private maximumTicksPerFrame = 0;

  constructor(
    private readonly budgets: RuntimePerformanceBudgets = DEFAULT_RUNTIME_PERFORMANCE_BUDGETS,
  ) {}

  recordFrame(workMs: number, gapMs: number, simulationTicks: number): void {
    pushBounded(
      this.frameWorkSamples,
      finiteNonnegative(workMs),
      MAX_FRAME_SAMPLES,
    );
    pushBounded(
      this.frameGapSamples,
      finiteNonnegative(gapMs),
      MAX_FRAME_SAMPLES,
    );
    this.maximumTicksPerFrame = Math.max(
      this.maximumTicksPerFrame,
      Math.max(0, Math.floor(simulationTicks)),
    );
  }

  recordSimulationTick(durationMs: number): void {
    pushBounded(
      this.simulationTickSamples,
      finiteNonnegative(durationMs),
      MAX_SIMULATION_SAMPLES,
    );
  }

  recordDroppedSimulationTime(seconds: number): void {
    this.droppedSimulationSeconds += finiteNonnegative(seconds);
  }

  sample(input: RuntimeCounterSample): void {
    const previous = this.counterSamples.at(-1);
    const normalized: RuntimeCounterSample = {
      elapsedSeconds: Math.max(
        previous?.elapsedSeconds ?? 0,
        finiteNonnegative(input.elapsedSeconds),
      ),
      heapBytes:
        input.heapBytes === null ? null : finiteNonnegative(input.heapBytes),
      aircraft: Math.floor(finiteNonnegative(input.aircraft)),
      serviceVehicles: Math.floor(finiteNonnegative(input.serviceVehicles)),
      audioVoices: Math.floor(finiteNonnegative(input.audioVoices)),
      queues: Math.floor(finiteNonnegative(input.queues)),
      drawCalls: Math.floor(finiteNonnegative(input.drawCalls)),
      geometries: Math.floor(finiteNonnegative(input.geometries)),
      textures: Math.floor(finiteNonnegative(input.textures)),
      detail: input.detail,
    };
    pushBounded(this.counterSamples, normalized, MAX_COUNTER_SAMPLES);
  }

  reset(): void {
    this.frameWorkSamples.length = 0;
    this.frameGapSamples.length = 0;
    this.simulationTickSamples.length = 0;
    this.counterSamples.length = 0;
    this.droppedSimulationSeconds = 0;
    this.maximumTicksPerFrame = 0;
  }

  snapshot(): RuntimePerformanceSnapshot {
    const frameWorkMs = distribution(this.frameWorkSamples);
    const frameGapMs = distribution(this.frameGapSamples);
    const simulationTickMs = distribution(this.simulationTickSamples);
    const counters = cloneCounter(this.counterSamples.at(-1) ?? null);
    const growth = this.growthSnapshot();
    const checks = this.budgetChecks(
      frameWorkMs,
      frameGapMs,
      simulationTickMs,
      counters,
      growth,
    );
    const statuses = checks.map((check) => check.status);
    const status = statuses.includes("exceeded")
      ? "exceeded"
      : statuses.includes("attention")
        ? "attention"
        : statuses.some((value) => value === "warming")
          ? "warming"
          : "nominal";
    return {
      schemaVersion: RUNTIME_PERFORMANCE_SCHEMA_VERSION,
      status,
      sampledAtSeconds: counters?.elapsedSeconds ?? 0,
      frameWorkMs,
      frameGapMs,
      simulationTickMs,
      droppedSimulationSeconds: Number(
        this.droppedSimulationSeconds.toFixed(3),
      ),
      maximumTicksPerFrame: this.maximumTicksPerFrame,
      counters,
      growth,
      budgets: { ...this.budgets },
      checks,
      retention: {
        frameSamples: this.frameWorkSamples.length,
        simulationSamples: this.simulationTickSamples.length,
        counterSamples: this.counterSamples.length,
        maximumFrameSamples: MAX_FRAME_SAMPLES,
        maximumSimulationSamples: MAX_SIMULATION_SAMPLES,
        maximumCounterSamples: MAX_COUNTER_SAMPLES,
      },
      disclosure:
        "Local diagnostic measurements vary by device and browser; they never relax simulation safety rules or upload automatically.",
    };
  }

  private growthSnapshot(): RuntimeGrowthSnapshot {
    const latest = this.counterSamples.at(-1) ?? null;
    if (!latest || this.counterSamples.length < 2) {
      return {
        observedSeconds: 0,
        sampleCount: this.counterSamples.length,
        heapMiBPerHour: null,
        aircraftPerHour: 0,
        serviceVehiclesPerHour: 0,
        queuesPerHour: 0,
        drawCallsPerHour: 0,
        baseline: cloneCounter(this.counterSamples[0] ?? null),
        latest: cloneCounter(latest),
      };
    }
    const target = Math.max(0, latest.elapsedSeconds - 3_600);
    const baseline =
      this.counterSamples.find((sample) => sample.elapsedSeconds >= target) ??
      this.counterSamples[0];
    const observedSeconds = Math.max(
      0,
      latest.elapsedSeconds - baseline.elapsedSeconds,
    );
    const scale = observedSeconds > 0 ? 3_600 / observedSeconds : 0;
    const heapMiBPerHour =
      baseline.heapBytes === null || latest.heapBytes === null
        ? null
        : ((latest.heapBytes - baseline.heapBytes) / MIB) * scale;
    return {
      observedSeconds: Number(observedSeconds.toFixed(2)),
      sampleCount: this.counterSamples.length,
      heapMiBPerHour:
        heapMiBPerHour === null ? null : Number(heapMiBPerHour.toFixed(3)),
      aircraftPerHour: rate(latest.aircraft - baseline.aircraft, scale),
      serviceVehiclesPerHour: rate(
        latest.serviceVehicles - baseline.serviceVehicles,
        scale,
      ),
      queuesPerHour: rate(latest.queues - baseline.queues, scale),
      drawCallsPerHour: rate(latest.drawCalls - baseline.drawCalls, scale),
      baseline: cloneCounter(baseline),
      latest: cloneCounter(latest),
    };
  }

  private budgetChecks(
    frameWorkMs: RuntimeDistribution,
    frameGapMs: RuntimeDistribution,
    simulationTickMs: RuntimeDistribution,
    counters: RuntimeCounterSample | null,
    growth: RuntimeGrowthSnapshot,
  ): RuntimeBudgetCheck[] {
    const warmedFrames = frameWorkMs.samples >= 30;
    const warmedSimulation = simulationTickMs.samples >= 20;
    const warmedGrowth =
      growth.observedSeconds >= MIN_GROWTH_OBSERVATION_SECONDS;
    const detail = counters?.detail ?? "low";
    return [
      check(
        "frame-work-p95",
        "Frame work p95",
        warmedFrames ? frameWorkMs.p95 : null,
        "ms",
        this.budgets.frameWorkP95Ms,
        warmedFrames,
      ),
      check(
        "frame-gap-p95",
        "Frame gap p95",
        warmedFrames ? frameGapMs.p95 : null,
        "ms",
        this.budgets.frameGapP95Ms,
        warmedFrames,
      ),
      check(
        "simulation-tick-p95",
        "Simulation tick p95",
        warmedSimulation ? simulationTickMs.p95 : null,
        "ms",
        this.budgets.simulationTickP95Ms,
        warmedSimulation,
      ),
      check(
        "heap",
        "JavaScript heap",
        counters?.heapBytes === null || counters?.heapBytes === undefined
          ? null
          : counters.heapBytes / MIB,
        "MiB",
        this.budgets.heapMiB,
        true,
        counters?.heapBytes === null || counters?.heapBytes === undefined,
      ),
      check(
        "heap-growth",
        "Heap growth",
        warmedGrowth ? growth.heapMiBPerHour : null,
        "MiB/h",
        this.budgets.heapGrowthMiBPerHour,
        warmedGrowth,
        warmedGrowth && growth.heapMiBPerHour === null,
      ),
      check(
        "aircraft",
        "Active aircraft",
        counters?.aircraft ?? null,
        "",
        this.budgets.aircraft,
        counters !== null,
      ),
      check(
        "service-vehicles",
        "Service vehicles",
        counters?.serviceVehicles ?? null,
        "",
        this.budgets.serviceVehicles,
        counters !== null,
      ),
      check(
        "audio-voices",
        "Spatial audio voices",
        counters?.audioVoices ?? null,
        "",
        this.budgets.audioVoices,
        counters !== null,
      ),
      check(
        "queues",
        "Queued operations",
        counters?.queues ?? null,
        "",
        this.budgets.queues,
        counters !== null,
      ),
      check(
        "draw-calls",
        `${detail} detail draw calls`,
        counters?.drawCalls ?? null,
        "",
        detail === "low"
          ? this.budgets.lowDetailDrawCalls
          : this.budgets.highDetailDrawCalls,
        counters !== null,
      ),
      check(
        "geometries",
        `${detail} detail geometries`,
        counters?.geometries ?? null,
        "",
        detail === "low"
          ? this.budgets.lowDetailGeometries
          : this.budgets.highDetailGeometries,
        counters !== null,
      ),
    ];
  }
}

export function runtimeHeapBytes(): number | null {
  const memory = (
    globalThis.performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }
  ).memory;
  return Number.isFinite(memory?.usedJSHeapSize)
    ? Math.max(0, memory?.usedJSHeapSize ?? 0)
    : null;
}

function check(
  id: string,
  label: string,
  value: number | null,
  unit: string,
  limit: number,
  warmed: boolean,
  unavailable = false,
): RuntimeBudgetCheck {
  return {
    id,
    label,
    value: value === null ? null : Number(value.toFixed(3)),
    unit,
    limit,
    status: unavailable
      ? "unavailable"
      : !warmed || value === null
        ? "warming"
        : value > limit
          ? "exceeded"
          : value > limit * 0.85
            ? "attention"
            : "nominal",
  };
}

function distribution(samples: readonly number[]): RuntimeDistribution {
  if (!samples.length) {
    return { samples: 0, latest: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...samples].sort((first, second) => first - second);
  const percentile = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    samples: samples.length,
    latest: rounded(samples[samples.length - 1]),
    mean: rounded(
      samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
    ),
    p50: rounded(percentile(0.5)),
    p95: rounded(percentile(0.95)),
    p99: rounded(percentile(0.99)),
    max: rounded(sorted[sorted.length - 1]),
  };
}

function pushBounded<T>(values: T[], value: T, limit: number): void {
  values.push(value);
  if (values.length > limit) values.splice(0, values.length - limit);
}

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function rate(delta: number, scale: number): number {
  return rounded(delta * scale);
}

function cloneCounter(
  sample: RuntimeCounterSample | null,
): RuntimeCounterSample | null {
  return sample ? { ...sample } : null;
}
