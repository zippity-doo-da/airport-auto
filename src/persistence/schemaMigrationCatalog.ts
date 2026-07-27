import {
  STANDALONE_COMMAND_SCHEMA_VERSION,
  migrateStandaloneControlCommand,
} from "../control/controlMigrations";
import {
  STANDALONE_EVENT_SCHEMA_VERSION,
  migrateStandaloneTelemetryEvent,
  type LegacyEventDefaults,
} from "../control/eventMigrations";
import { CONTROL_REPLAY_SCHEMA_VERSION } from "../control/controlProtocol";
import { migrateReplayRecording } from "../replay/replayRecording";
import {
  migrateAirportAssetDocument,
  type AirportAssetDocumentKind,
} from "../assets/airportAssetMigrations";
import {
  INPUT_PREFERENCES_SCHEMA_VERSION,
  migrateInputPreferences,
} from "./inputPreferences";
import {
  SESSION_SAVE_SCHEMA_VERSION,
  migrateAirportSessionSave,
} from "./sessionSave";

export interface SchemaMigrationCatalogEntry {
  id: string;
  label: string;
  currentVersion: number;
  acceptedLegacyVersions: number[];
  unversionedLegacy: boolean;
  failClosedForFutureVersions: true;
}

const CATALOG: readonly SchemaMigrationCatalogEntry[] = [
  {
    id: "airport-stable-manifest",
    label: "Stable public asset manifest",
    currentVersion: 1,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "airport-vector-manifest",
    label: "Airport vector manifest",
    currentVersion: 1,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "airport-context-manifest",
    label: "Airport context manifest",
    currentVersion: 1,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "airport-surface-manifest",
    label: "Airport surface-source manifest",
    currentVersion: 3,
    acceptedLegacyVersions: [0, 1, 2],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "airport-surface-graph",
    label: "Airport surface graph",
    currentVersion: 3,
    acceptedLegacyVersions: [0, 1, 2],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "session-launch-save",
    label: "Portable session launch save",
    currentVersion: SESSION_SAVE_SCHEMA_VERSION,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "input-preferences",
    label: "Saved input preferences",
    currentVersion: INPUT_PREFERENCES_SCHEMA_VERSION,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "standalone-command",
    label: "Standalone control command",
    currentVersion: STANDALONE_COMMAND_SCHEMA_VERSION,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "standalone-event",
    label: "Standalone telemetry event",
    currentVersion: STANDALONE_EVENT_SCHEMA_VERSION,
    acceptedLegacyVersions: [0],
    unversionedLegacy: true,
    failClosedForFutureVersions: true,
  },
  {
    id: "recording",
    label: "Portable deterministic recording",
    currentVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    acceptedLegacyVersions: [3],
    unversionedLegacy: false,
    failClosedForFutureVersions: true,
  },
  {
    id: "replay",
    label: "Verified replay",
    currentVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    acceptedLegacyVersions: [3],
    unversionedLegacy: false,
    failClosedForFutureVersions: true,
  },
] as const;

export function schemaMigrationCatalog(): SchemaMigrationCatalogEntry[] {
  return CATALOG.map((entry) => ({
    ...entry,
    acceptedLegacyVersions: [...entry.acceptedLegacyVersions],
  }));
}

export const schemaMigrationTools = {
  airportAsset: migrateAirportAssetDocument,
  sessionSave: migrateAirportSessionSave,
  inputPreferences: migrateInputPreferences,
  command: migrateStandaloneControlCommand,
  event(input: unknown, defaults: LegacyEventDefaults = {}) {
    return migrateStandaloneTelemetryEvent(input, defaults);
  },
  recording: migrateReplayRecording,
  replay: migrateReplayRecording,
} satisfies Record<string, (...args: never[]) => unknown>;

export type { AirportAssetDocumentKind, LegacyEventDefaults };
