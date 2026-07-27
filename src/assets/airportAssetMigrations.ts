import {
  migrateVersionedRecord,
  type SchemaMigrationRecord,
  type SchemaMigrationResult,
  type SchemaMigrationStep,
} from "../persistence/schemaMigrations";

export type AirportAssetDocumentKind =
  | "stable-manifest"
  | "vector-manifest"
  | "context-manifest"
  | "surface-manifest"
  | "surface-graph";

export type MigratedAirportAssetDocument = SchemaMigrationRecord;

const CURRENT_VERSIONS: Record<AirportAssetDocumentKind, number> = {
  "stable-manifest": 1,
  "vector-manifest": 1,
  "context-manifest": 1,
  "surface-manifest": 3,
  "surface-graph": 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return isRecord(value[key]) ? null : `${key} must be an object`;
}

function requireArray(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return Array.isArray(value[key]) ? null : `${key} must be an array`;
}

function requireString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return typeof value[key] === "string" && (value[key] as string).length > 0
    ? null
    : `${key} must be a non-empty string`;
}

function firstReason(reasons: Array<string | null>): string | null {
  return reasons.find((reason): reason is string => reason !== null) ?? null;
}

function validateStableManifest(value: Record<string, unknown>): string | null {
  const identityReason = firstReason([
    value.manifestId === "airport-auto-assets"
      ? null
      : "manifestId must identify airport-auto-assets",
    requireString(value, "applicationVersion"),
    requireArray(value, "assets"),
  ]);
  if (identityReason) return identityReason;
  const assets = value.assets as unknown[];
  if (assets.length === 0) return "assets must not be empty";
  for (const [index, asset] of assets.entries()) {
    if (!isRecord(asset)) return `assets[${index}] must be an object`;
    const reason = firstReason([
      requireString(asset, "key"),
      requireString(asset, "kind"),
      requireString(asset, "path"),
      requireString(asset, "sha256"),
      requireString(asset, "licenseRef"),
    ]);
    if (reason) return `assets[${index}].${reason}`;
  }
  return null;
}

function validateAirportManifest(value: Record<string, unknown>): string | null {
  const reason = firstReason([
    requireRecord(value, "airport"),
    requireRecord(value, "coordinateSystem"),
    requireString(value, "assetPath"),
    requireString(value, "assetSha256"),
  ]);
  if (reason) return reason;
  const airport = value.airport as Record<string, unknown>;
  return firstReason([
    requireString(airport, "faaId"),
    requireString(airport, "icaoId"),
    requireString(airport, "name"),
  ]);
}

function validateVectorManifest(value: Record<string, unknown>): string | null {
  const reason = firstReason([
    validateAirportManifest(value),
    requireRecord(value, "runtimeReference"),
  ]);
  return reason ?? requireArray(
    value.runtimeReference as Record<string, unknown>,
    "runways",
  );
}

function validateContextManifest(value: Record<string, unknown>): string | null {
  return firstReason([
    validateAirportManifest(value),
    requireRecord(value, "source"),
    requireRecord(value, "counts"),
  ]);
}

function validateSurfaceManifest(value: Record<string, unknown>): string | null {
  return firstReason([
    validateAirportManifest(value),
    requireString(value, "graphPath"),
    requireString(value, "graphSha256"),
    requireRecord(value, "source"),
    requireRecord(value, "validationRules"),
  ]);
}

function validateSurfaceGraph(value: Record<string, unknown>): string | null {
  return firstReason([
    requireString(value, "airportCode"),
    Number.isSafeInteger(value.seed) ? null : "seed must be a safe integer",
    ...[
      "nodes",
      "edges",
      "taxiways",
      "stands",
      "passengerFacilities",
      "runwayAccess",
      "controlPoints",
      "zones",
      "hotspots",
    ].map((key) => requireArray(value, key)),
  ]);
}

const VERSION_ONE_STEP: SchemaMigrationStep = {
  fromVersion: 0,
  toVersion: 1,
  migrate: (value) => ({ ...value, schemaVersion: 1 }),
};

const SURFACE_MANIFEST_STEPS: readonly SchemaMigrationStep[] = [
  VERSION_ONE_STEP,
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (value) => ({
      ...value,
      schemaVersion: 2,
      graphPath: value.graphPath ?? "src/data/airports/legacy.surfaceGraph.json",
      graphSha256: value.graphSha256 ?? value.assetSha256,
    }),
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (value) => ({
      ...value,
      schemaVersion: 3,
      validationRules: value.validationRules ?? {
        minimumBuildingClearanceMeters: 0,
        minimumStandReferenceClearanceMeters: 0,
        minimumStandReferenceOffsetMeters: 0,
        standLeadInWidthWorld: 1,
      },
      passengerFacilityReference: value.passengerFacilityReference ?? {
        provider: "legacy-import",
        url: "about:blank",
        retrievedOn: "1970-01-01",
        totalPassengerGates: 0,
      },
    }),
  },
];

const SURFACE_GRAPH_STEPS: readonly SchemaMigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: (value) => ({
      ...value,
      schemaVersion: 1,
      nodes: value.nodes ?? [],
      edges: value.edges ?? [],
      taxiways: value.taxiways ?? [],
      stands: value.stands ?? [],
      runwayAccess: value.runwayAccess ?? [],
    }),
  },
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (value) => ({
      ...value,
      schemaVersion: 2,
      controlPoints: value.controlPoints ?? [],
      zones: value.zones ?? [],
      hotspots: value.hotspots ?? [],
    }),
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (value) => ({
      ...value,
      schemaVersion: 3,
      passengerFacilities: value.passengerFacilities ?? [],
    }),
  },
];

export function migrateAirportAssetDocument(
  kind: AirportAssetDocumentKind,
  input: unknown,
): SchemaMigrationResult<MigratedAirportAssetDocument> {
  const currentVersion = CURRENT_VERSIONS[kind];
  const steps =
    kind === "surface-manifest"
      ? SURFACE_MANIFEST_STEPS
      : kind === "surface-graph"
        ? SURFACE_GRAPH_STEPS
        : [VERSION_ONE_STEP];
  const validate =
    kind === "stable-manifest"
      ? validateStableManifest
      : kind === "vector-manifest"
        ? validateVectorManifest
        : kind === "context-manifest"
          ? validateContextManifest
          : kind === "surface-manifest"
            ? validateSurfaceManifest
            : validateSurfaceGraph;
  return migrateVersionedRecord(input, {
    documentName: `Airport ${kind}`,
    currentVersion,
    unversionedVersion: 0,
    steps,
    validate,
    finalize: (value) => structuredClone(value),
  });
}

export function requireCurrentAirportAsset(
  kind: AirportAssetDocumentKind,
  input: unknown,
): MigratedAirportAssetDocument {
  const migration = migrateAirportAssetDocument(kind, input);
  if (!migration.accepted || !migration.value)
    throw new Error(migration.reason);
  return migration.value;
}
