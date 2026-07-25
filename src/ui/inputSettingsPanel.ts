import { INPUT_HELP_ROWS } from "../input/actionMap";
import type { UnifiedInputSnapshot } from "../input/unifiedInput";

export type InputSettingsElements = {
  enabled: HTMLInputElement;
  sensitivity: HTMLInputElement;
  sensitivityOutput: HTMLOutputElement;
  device: HTMLElement;
  status: HTMLElement;
  bindings: HTMLElement;
};

export type InputSettingsCallbacks = {
  onEnabledChange(enabled: boolean): void;
  onSensitivityChange(sensitivity: number): void;
};

export type InputSettingsPanel = {
  render(snapshot: UnifiedInputSnapshot, force?: boolean): void;
};

function deviceLabel(snapshot: UnifiedInputSnapshot): string {
  const gamepad = snapshot.devices.gamepad;
  if (gamepad.connected)
    return gamepad.id?.trim() || `Gamepad ${gamepad.index ?? 0}`;
  if (!gamepad.supported) return "Keyboard · pointer · touch";
  if (!gamepad.enabled) return "Keyboard · pointer · touch · gamepad off";
  return "Keyboard · pointer · touch";
}

function inputStatus(snapshot: UnifiedInputSnapshot): string {
  const gamepad = snapshot.devices.gamepad;
  if (gamepad.connected)
    return `Gamepad ready · ${gamepad.mapping || "browser mapping"} · ${gamepad.axes} axes · ${gamepad.buttons} buttons`;
  if (!gamepad.supported)
    return "This browser does not expose the Gamepad API. All other controls remain available.";
  if (!gamepad.enabled)
    return "Gamepad polling is disabled. Keyboard, mouse, and touch remain active.";
  return "Connect a standard-mapped controller at any time; no restart is required.";
}

export function createInputSettingsPanel(
  elements: InputSettingsElements,
  callbacks: InputSettingsCallbacks,
): InputSettingsPanel {
  let renderKey = "";
  for (const row of INPUT_HELP_ROWS) {
    const item = document.createElement("div");
    const label = document.createElement("b");
    label.textContent = row.label;
    const keyboard = document.createElement("span");
    keyboard.innerHTML = `<i>Keys</i>${row.keyboard}`;
    const pointer = document.createElement("span");
    pointer.innerHTML = `<i>Pointer</i>${row.pointer}`;
    const gamepad = document.createElement("span");
    gamepad.innerHTML = `<i>Pad</i>${row.gamepad}`;
    item.append(label, keyboard, pointer, gamepad);
    elements.bindings.append(item);
  }

  elements.enabled.addEventListener("change", () =>
    callbacks.onEnabledChange(elements.enabled.checked),
  );
  elements.sensitivity.addEventListener("input", () =>
    callbacks.onSensitivityChange(Number(elements.sensitivity.value)),
  );

  return {
    render(snapshot, force = false) {
      const gamepad = snapshot.devices.gamepad;
      const key = JSON.stringify({
        enabled: gamepad.enabled,
        sensitivity: gamepad.sensitivity,
        supported: gamepad.supported,
        connected: gamepad.connected,
        index: gamepad.index,
        id: gamepad.id,
        mapping: gamepad.mapping,
        axes: gamepad.axes,
        buttons: gamepad.buttons,
        lastDevice: snapshot.lastDevice,
      });
      if (!force && key === renderKey) return;
      renderKey = key;
      elements.enabled.checked = gamepad.enabled;
      elements.enabled.disabled = !gamepad.supported;
      elements.sensitivity.value = String(gamepad.sensitivity);
      elements.sensitivity.disabled = !gamepad.enabled || !gamepad.supported;
      elements.sensitivityOutput.value = `${gamepad.sensitivity.toFixed(1)}×`;
      elements.device.textContent = deviceLabel(snapshot);
      elements.status.textContent = inputStatus(snapshot);
      elements.status.dataset.connected = String(gamepad.connected);
    },
  };
}
