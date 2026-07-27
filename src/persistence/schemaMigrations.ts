export type SchemaMigrationRecord = Record<string, unknown>;

export interface SchemaMigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate(value: SchemaMigrationRecord): SchemaMigrationRecord;
}

export interface SchemaMigrationOptions<TCurrent extends SchemaMigrationRecord> {
  documentName: string;
  currentVersion: number;
  steps: readonly SchemaMigrationStep[];
  unversionedVersion?: number;
  validate(value: SchemaMigrationRecord): string | null;
  finalize(value: SchemaMigrationRecord): TCurrent;
}

export interface SchemaMigrationResult<TCurrent> {
  accepted: boolean;
  reason: string;
  sourceSchemaVersion: number | null;
  targetSchemaVersion: number;
  migrated: boolean;
  appliedVersions: number[];
  value: TCurrent | null;
}

export function isSchemaMigrationRecord(
  value: unknown,
): value is SchemaMigrationRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejected<TCurrent>(
  options: SchemaMigrationOptions<SchemaMigrationRecord>,
  sourceSchemaVersion: number | null,
  reason: string,
  appliedVersions: number[] = [],
): SchemaMigrationResult<TCurrent> {
  return {
    accepted: false,
    reason,
    sourceSchemaVersion,
    targetSchemaVersion: options.currentVersion,
    migrated: appliedVersions.length > 0,
    appliedVersions,
    value: null,
  };
}

/**
 * Applies every registered numeric schema step in order. Documents from a
 * future version, documents with a missing step, and invalid migrated output
 * fail closed instead of being interpreted as the current contract.
 */
export function migrateVersionedRecord<
  TCurrent extends SchemaMigrationRecord,
>(
  input: unknown,
  options: SchemaMigrationOptions<TCurrent>,
): SchemaMigrationResult<TCurrent> {
  const commonOptions = options as SchemaMigrationOptions<SchemaMigrationRecord>;
  if (!isSchemaMigrationRecord(input)) {
    return rejected<TCurrent>(
      commonOptions,
      null,
      `${options.documentName} must be a JSON object.`,
    );
  }

  const declaredVersion = input.schemaVersion;
  const sourceSchemaVersion = Number.isInteger(declaredVersion)
    ? (declaredVersion as number)
    : declaredVersion === undefined
      ? (options.unversionedVersion ?? null)
      : null;
  if (sourceSchemaVersion === null || sourceSchemaVersion < 0) {
    return rejected<TCurrent>(
      commonOptions,
      null,
      `${options.documentName} schemaVersion is missing or invalid.`,
    );
  }
  if (sourceSchemaVersion > options.currentVersion) {
    return rejected<TCurrent>(
      commonOptions,
      sourceSchemaVersion,
      `${options.documentName} schema ${sourceSchemaVersion} is newer than supported schema ${options.currentVersion}.`,
    );
  }

  const steps = new Map(options.steps.map((step) => [step.fromVersion, step]));
  if (steps.size !== options.steps.length) {
    return rejected<TCurrent>(
      commonOptions,
      sourceSchemaVersion,
      `${options.documentName} migration registry contains duplicate source versions.`,
    );
  }

  let version = sourceSchemaVersion;
  let value: SchemaMigrationRecord = structuredClone(input);
  const appliedVersions: number[] = [];
  try {
    while (version < options.currentVersion) {
      const step = steps.get(version);
      if (!step || step.toVersion !== version + 1) {
        return rejected<TCurrent>(
          commonOptions,
          sourceSchemaVersion,
          `${options.documentName} has no migration from schema ${version} to ${version + 1}.`,
          appliedVersions,
        );
      }
      const migrated = step.migrate(value);
      if (
        !isSchemaMigrationRecord(migrated) ||
        migrated.schemaVersion !== step.toVersion
      ) {
        return rejected<TCurrent>(
          commonOptions,
          sourceSchemaVersion,
          `${options.documentName} migration ${version}→${step.toVersion} produced an invalid version marker.`,
          appliedVersions,
        );
      }
      value = migrated;
      version = step.toVersion;
      appliedVersions.push(version);
    }
  } catch (error) {
    return rejected<TCurrent>(
      commonOptions,
      sourceSchemaVersion,
      error instanceof Error
        ? `${options.documentName} migration failed: ${error.message}`
        : `${options.documentName} migration failed.`,
      appliedVersions,
    );
  }

  const validationReason = options.validate(value);
  if (validationReason) {
    return rejected<TCurrent>(
      commonOptions,
      sourceSchemaVersion,
      `${options.documentName} schema ${options.currentVersion} is invalid: ${validationReason}`,
      appliedVersions,
    );
  }

  return {
    accepted: true,
    reason:
      appliedVersions.length > 0
        ? `${options.documentName} migrated from schema ${sourceSchemaVersion} to ${options.currentVersion}.`
        : `${options.documentName} schema ${options.currentVersion} accepted.`,
    sourceSchemaVersion,
    targetSchemaVersion: options.currentVersion,
    migrated: appliedVersions.length > 0,
    appliedVersions,
    value: options.finalize(value),
  };
}
