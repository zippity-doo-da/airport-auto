import {
  AUDIO_PRESET_IDS,
  type AudioPreset,
} from "../audio/ambientAudio";
import { AMBIENT_PROGRAM_IDS, type AmbientProgramId } from "../simulation/ambientPrograms";
import type { StatusMessagePolicy } from "./statusMessages";

export const WATCH_PRESET_STORAGE_KEY = "airport-auto.watch-preset.v1";

export interface WatchPreset {
  schemaVersion: 1;
  ambientProgramId: AmbientProgramId | null;
  audioPreset: AudioPreset;
  radioChatterEnabled: boolean;
  radioCaptionsEnabled: boolean;
  cameraDirectorEnabled: boolean;
  windOverlayVisible: boolean;
  serviceVehiclesVisible: boolean;
  airportLifeVisible: boolean;
  alertPolicy: StatusMessagePolicy;
}

export function loadWatchPreset(storage: Storage | null): WatchPreset | null {
  if (!storage) return null;
  try {
    return parseWatchPreset(storage.getItem(WATCH_PRESET_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveWatchPreset(storage: Storage | null, preset: WatchPreset): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WATCH_PRESET_STORAGE_KEY, JSON.stringify(preset));
    return true;
  } catch {
    return false;
  }
}

export function parseWatchPreset(raw: string | null): WatchPreset | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WatchPreset>;
    if (
      value.schemaVersion !== 1 ||
      (value.ambientProgramId !== null &&
        !AMBIENT_PROGRAM_IDS.includes(value.ambientProgramId as AmbientProgramId)) ||
      !AUDIO_PRESET_IDS.includes(value.audioPreset as AudioPreset) ||
      !isBoolean(value.radioChatterEnabled) ||
      !isBoolean(value.radioCaptionsEnabled) ||
      !isBoolean(value.cameraDirectorEnabled) ||
      !isBoolean(value.windOverlayVisible) ||
      !isBoolean(value.serviceVehiclesVisible) ||
      !isBoolean(value.airportLifeVisible) ||
      (value.alertPolicy !== undefined && !isStatusMessagePolicy(value.alertPolicy))
    )
      return null;
    return {
      schemaVersion: 1,
      ambientProgramId: value.ambientProgramId as AmbientProgramId | null,
      audioPreset: value.audioPreset as AudioPreset,
      radioChatterEnabled: value.radioChatterEnabled,
      radioCaptionsEnabled: value.radioCaptionsEnabled,
      cameraDirectorEnabled: value.cameraDirectorEnabled,
      windOverlayVisible: value.windOverlayVisible,
      serviceVehiclesVisible: value.serviceVehiclesVisible,
      airportLifeVisible: value.airportLifeVisible,
      alertPolicy: isStatusMessagePolicy(value.alertPolicy)
        ? value.alertPolicy
        : "rare-high",
    };
  } catch {
    return null;
  }
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStatusMessagePolicy(value: unknown): value is StatusMessagePolicy {
  return (
    value === "off" ||
    value === "advisory" ||
    value === "operational" ||
    value === "rare-high"
  );
}
