import {
  isSchemaMigrationRecord,
  migrateVersionedRecord,
  type SchemaMigrationResult,
} from "./schemaMigrations";

export const INPUT_PREFERENCES_SCHEMA_VERSION = 1 as const;

export interface StoredInputPreferences extends Record<string, unknown> {
  schemaVersion: typeof INPUT_PREFERENCES_SCHEMA_VERSION;
  gamepadEnabled?: boolean;
  gamepadSensitivity?: number;
}

function validSensitivity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateInputPreferences(
  value: Record<string, unknown>,
): string | null {
  if (value.schemaVersion !== INPUT_PREFERENCES_SCHEMA_VERSION)
    return "schemaVersion does not match the current input-preference schema";
  if (
    value.gamepadEnabled !== undefined &&
    typeof value.gamepadEnabled !== "boolean"
  )
    return "gamepadEnabled must be boolean when present";
  if (
    value.gamepadSensitivity !== undefined &&
    !validSensitivity(value.gamepadSensitivity)
  )
    return "gamepadSensitivity must be a finite number when present";
  return null;
}

export function migrateInputPreferences(
  input: unknown,
): SchemaMigrationResult<StoredInputPreferences> {
  return migrateVersionedRecord(input, {
    documentName: "Input preferences",
    currentVersion: INPUT_PREFERENCES_SCHEMA_VERSION,
    unversionedVersion: 0,
    steps: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate(value) {
          const migrated: StoredInputPreferences = {
            schemaVersion: INPUT_PREFERENCES_SCHEMA_VERSION,
          };
          if (typeof value.gamepadEnabled === "boolean")
            migrated.gamepadEnabled = value.gamepadEnabled;
          if (validSensitivity(value.gamepadSensitivity))
            migrated.gamepadSensitivity = value.gamepadSensitivity;
          return migrated;
        },
      },
    ],
    validate: validateInputPreferences,
    finalize(value) {
      const preferences: StoredInputPreferences = {
        schemaVersion: INPUT_PREFERENCES_SCHEMA_VERSION,
      };
      if (typeof value.gamepadEnabled === "boolean")
        preferences.gamepadEnabled = value.gamepadEnabled;
      if (validSensitivity(value.gamepadSensitivity))
        preferences.gamepadSensitivity = value.gamepadSensitivity;
      return preferences;
    },
  });
}

export function serializeInputPreferences(
  preferences: Omit<StoredInputPreferences, "schemaVersion">,
): StoredInputPreferences {
  const migrated = migrateInputPreferences({
    schemaVersion: INPUT_PREFERENCES_SCHEMA_VERSION,
    ...preferences,
  });
  if (!migrated.accepted || !migrated.value)
    throw new Error(migrated.reason);
  return migrated.value;
}

export function isStoredInputPreferences(
  value: unknown,
): value is StoredInputPreferences {
  return (
    isSchemaMigrationRecord(value) &&
    validateInputPreferences(value) === null
  );
}
