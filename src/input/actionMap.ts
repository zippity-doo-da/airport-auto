export type InputActionContext = "gameplay" | "ui" | "modal";

export type InputActionId =
  | "camera.pan-up"
  | "camera.pan-down"
  | "camera.pan-left"
  | "camera.pan-right"
  | "camera.rotate-left"
  | "camera.rotate-right"
  | "camera.zoom-in"
  | "camera.zoom-out"
  | "camera.reset"
  | "camera.next-view"
  | "ui.cancel"
  | "ui.pause"
  | "ui.controls"
  | "ui.radar"
  | "ui.queues"
  | "selection.previous"
  | "selection.next"
  | "selection.primary"
  | "flight.land"
  | "flight.go-around"
  | "flight.hold"
  | "flight.runway-entry"
  | "flight.takeoff";

export type InputActionKind = "continuous" | "discrete";

export type InputActionDefinition = {
  id: InputActionId;
  label: string;
  description: string;
  kind: InputActionKind;
  contexts: readonly InputActionContext[];
  keyboardCodes: readonly string[];
  keyboardLabel: string;
  gamepadLabel?: string;
};

const GAMEPLAY: readonly InputActionContext[] = ["gameplay"];

export const INPUT_ACTIONS: readonly InputActionDefinition[] = [
  {
    id: "camera.pan-up",
    label: "Pan north",
    description: "Move the free camera toward the top of the screen.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyW", "ArrowUp"],
    keyboardLabel: "W / ↑",
    gamepadLabel: "Left stick / D-pad",
  },
  {
    id: "camera.pan-down",
    label: "Pan south",
    description: "Move the free camera toward the bottom of the screen.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyS", "ArrowDown"],
    keyboardLabel: "S / ↓",
    gamepadLabel: "Left stick / D-pad",
  },
  {
    id: "camera.pan-left",
    label: "Pan left",
    description: "Move the free camera toward the left side of the screen.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyA", "ArrowLeft"],
    keyboardLabel: "A / ←",
    gamepadLabel: "Left stick / D-pad",
  },
  {
    id: "camera.pan-right",
    label: "Pan right",
    description: "Move the free camera toward the right side of the screen.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyD", "ArrowRight"],
    keyboardLabel: "D / →",
    gamepadLabel: "Left stick / D-pad",
  },
  {
    id: "camera.rotate-left",
    label: "Rotate left",
    description: "Orbit the camera counter-clockwise.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyQ"],
    keyboardLabel: "Q",
    gamepadLabel: "Right stick",
  },
  {
    id: "camera.rotate-right",
    label: "Rotate right",
    description: "Orbit the camera clockwise.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyE"],
    keyboardLabel: "E",
    gamepadLabel: "Right stick",
  },
  {
    id: "camera.zoom-in",
    label: "Zoom in",
    description: "Move closer to the airport.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["Equal", "NumpadAdd"],
    keyboardLabel: "+",
    gamepadLabel: "RT / right stick",
  },
  {
    id: "camera.zoom-out",
    label: "Zoom out",
    description: "Move toward the terminal-scope view.",
    kind: "continuous",
    contexts: GAMEPLAY,
    keyboardCodes: ["Minus", "NumpadSubtract"],
    keyboardLabel: "−",
    gamepadLabel: "LT / right stick",
  },
  {
    id: "camera.reset",
    label: "Reset camera",
    description: "Return to the centered airport view and release follow.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["Digit0", "Numpad0"],
    keyboardLabel: "0",
    gamepadLabel: "Left-stick click",
  },
  {
    id: "camera.next-view",
    label: "Next view",
    description: "Cycle the authored airport camera views.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyV"],
    keyboardLabel: "V",
    gamepadLabel: "Right-stick click",
  },
  {
    id: "ui.cancel",
    label: "Cancel or release",
    description:
      "Close the active drawer or overlay, leave group selection, or release camera follow.",
    kind: "discrete",
    contexts: ["gameplay", "ui", "modal"],
    keyboardCodes: ["Escape"],
    keyboardLabel: "Esc",
    gamepadLabel: "B / Circle",
  },
  {
    id: "ui.pause",
    label: "Pause or resume",
    description:
      "Toggle the simulation clock when the current mode permits it.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["Space"],
    keyboardLabel: "Space",
    gamepadLabel: "Start",
  },
  {
    id: "ui.controls",
    label: "Controls drawer",
    description: "Open or close the full Controls drawer.",
    kind: "discrete",
    contexts: ["gameplay", "ui"],
    keyboardCodes: ["KeyC"],
    keyboardLabel: "C",
    gamepadLabel: "Back / Select",
  },
  {
    id: "ui.radar",
    label: "Radar inset",
    description: "Toggle the compact terminal radar.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyM"],
    keyboardLabel: "M",
  },
  {
    id: "ui.queues",
    label: "Queue inspector",
    description: "Toggle the operation queue inspector.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyO"],
    keyboardLabel: "O",
  },
  {
    id: "selection.previous",
    label: "Previous aircraft",
    description: "Focus the previous aircraft in the current station scope.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["BracketLeft"],
    keyboardLabel: "[",
    gamepadLabel: "LB",
  },
  {
    id: "selection.next",
    label: "Next aircraft",
    description: "Focus the next aircraft in the current station scope.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["BracketRight"],
    keyboardLabel: "]",
    gamepadLabel: "RB",
  },
  {
    id: "selection.primary",
    label: "Context action",
    description:
      "Issue the first enabled action shown for the selected aircraft.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["Enter", "NumpadEnter"],
    keyboardLabel: "Enter",
    gamepadLabel: "A / Cross",
  },
  {
    id: "flight.land",
    label: "Landing clearance",
    description: "Clear the selected arrival to its assigned runway.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyL"],
    keyboardLabel: "L",
  },
  {
    id: "flight.go-around",
    label: "Go around",
    description: "Send the selected arrival through its missed-approach path.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyG"],
    keyboardLabel: "G",
    gamepadLabel: "Y / Triangle",
  },
  {
    id: "flight.hold",
    label: "Hold or resume",
    description: "Toggle controller hold for the selected aircraft.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyH"],
    keyboardLabel: "H",
    gamepadLabel: "X / Square",
  },
  {
    id: "flight.runway-entry",
    label: "Line up",
    description: "Clear the selected departure onto its assigned runway.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyR"],
    keyboardLabel: "R",
  },
  {
    id: "flight.takeoff",
    label: "Takeoff clearance",
    description: "Clear the selected lined-up aircraft for takeoff.",
    kind: "discrete",
    contexts: GAMEPLAY,
    keyboardCodes: ["KeyT"],
    keyboardLabel: "T",
  },
] as const;

export type InputHelpRow = {
  label: string;
  keyboard: string;
  pointer: string;
  gamepad: string;
};

export const INPUT_HELP_ROWS: readonly InputHelpRow[] = [
  {
    label: "Move map",
    keyboard: "WASD / arrows",
    pointer: "Drag",
    gamepad: "Left stick / D-pad",
  },
  { label: "Rotate", keyboard: "Q / E", pointer: "—", gamepad: "Right stick" },
  {
    label: "Zoom",
    keyboard: "+ / −",
    pointer: "Wheel / pinch",
    gamepad: "Triggers / right stick",
  },
  {
    label: "Track traffic",
    keyboard: "[ / ]",
    pointer: "Select aircraft",
    gamepad: "LB / RB",
  },
  {
    label: "Context action",
    keyboard: "Enter",
    pointer: "Shown button",
    gamepad: "A / Cross",
  },
  {
    label: "Cancel / release",
    keyboard: "Esc",
    pointer: "Empty ground",
    gamepad: "B / Circle",
  },
] as const;

const KEYBOARD_ACTION_BY_CODE = new Map<string, InputActionId>();
for (const action of INPUT_ACTIONS) {
  for (const code of action.keyboardCodes)
    KEYBOARD_ACTION_BY_CODE.set(code, action.id);
}

const ACTION_BY_ID = new Map<InputActionId, InputActionDefinition>(
  INPUT_ACTIONS.map((action) => [action.id, action]),
);

export function inputActionForKeyboardCode(
  code: string,
): InputActionDefinition | null {
  const id = KEYBOARD_ACTION_BY_CODE.get(code);
  return id ? (ACTION_BY_ID.get(id) ?? null) : null;
}

export function inputActionDefinition(
  id: InputActionId,
): InputActionDefinition {
  const action = ACTION_BY_ID.get(id);
  if (!action) throw new Error(`Unknown input action ${id}`);
  return action;
}

export const STANDARD_GAMEPAD_DISCRETE_BUTTONS: Readonly<
  Record<number, InputActionId>
> = {
  0: "selection.primary",
  1: "ui.cancel",
  2: "flight.hold",
  3: "flight.go-around",
  4: "selection.previous",
  5: "selection.next",
  8: "ui.controls",
  9: "ui.pause",
  10: "camera.reset",
  11: "camera.next-view",
};

export type InputAxes = {
  panX: number;
  panY: number;
  rotate: number;
  zoom: number;
};

export type GamepadLike = {
  axes: readonly number[];
  buttons: readonly { value: number; pressed?: boolean }[];
};

export const ZERO_INPUT_AXES: InputAxes = {
  panX: 0,
  panY: 0,
  rotate: 0,
  zoom: 0,
};

export function applyInputDeadzone(value: number, deadzone = 0.18): number {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return (
    Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone))
  );
}

function gamepadButtonValue(gamepad: GamepadLike, index: number): number {
  const button = gamepad.buttons[index];
  if (!button) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(button.value) ? button.value : button.pressed ? 1 : 0,
    ),
  );
}

export function standardGamepadAxes(
  gamepad: GamepadLike,
  sensitivity = 1,
): InputAxes {
  const amount = Math.max(
    0.5,
    Math.min(2, Number.isFinite(sensitivity) ? sensitivity : 1),
  );
  const axis = (index: number): number =>
    applyInputDeadzone(gamepad.axes[index] ?? 0) * amount;
  const dpadX =
    gamepadButtonValue(gamepad, 15) - gamepadButtonValue(gamepad, 14);
  const dpadY =
    gamepadButtonValue(gamepad, 13) - gamepadButtonValue(gamepad, 12);
  const triggerZoom =
    gamepadButtonValue(gamepad, 7) - gamepadButtonValue(gamepad, 6);
  const strongest = (first: number, second: number): number =>
    Math.abs(first) >= Math.abs(second) ? first : second;
  return {
    panX: Math.max(-1, Math.min(1, strongest(axis(0), dpadX))),
    panY: Math.max(-1, Math.min(1, strongest(axis(1), dpadY))),
    rotate: Math.max(-1, Math.min(1, axis(2))),
    zoom: Math.max(-1, Math.min(1, strongest(-axis(3), triggerZoom * amount))),
  };
}

export function cloneInputActionCatalog(): InputActionDefinition[] {
  return INPUT_ACTIONS.map((action) => ({
    ...action,
    contexts: [...action.contexts],
    keyboardCodes: [...action.keyboardCodes],
  }));
}
