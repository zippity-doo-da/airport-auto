import {
  INPUT_ACTIONS,
  STANDARD_GAMEPAD_DISCRETE_BUTTONS,
  ZERO_INPUT_AXES,
  cloneInputActionCatalog,
  inputActionDefinition,
  inputActionForKeyboardCode,
  standardGamepadAxes,
  type InputActionContext,
  type InputActionId,
  type InputAxes,
} from "./actionMap";

export type InputDevice = "keyboard" | "mouse" | "touch" | "gamepad";
export type ScreenPoint = { x: number; y: number };
export type CanvasPointerIntent =
  { kind: "camera" } | { kind: "route"; flightId: number } | { kind: "ignore" };

export type UnifiedInputSnapshot = {
  schemaVersion: 1;
  catalogVersion: 1;
  context: InputActionContext;
  lastDevice: InputDevice | null;
  lastAction: InputActionId | null;
  lastGesture: "tap" | "drag" | "pinch" | "wheel" | "route" | null;
  axes: InputAxes;
  heldActions: InputActionId[];
  devices: {
    keyboard: true;
    mouse: true;
    touch: true;
    gamepad: {
      supported: boolean;
      enabled: boolean;
      sensitivity: number;
      connected: boolean;
      index: number | null;
      id: string | null;
      mapping: string | null;
      axes: number;
      buttons: number;
    };
  };
  actions: ReturnType<typeof cloneInputActionCatalog>;
};

export type UnifiedInputOptions = {
  canvas: HTMLCanvasElement;
  getContext(): InputActionContext;
  resolvePointerIntent(
    point: ScreenPoint,
    device: "mouse" | "touch",
    button: number,
  ): CanvasPointerIntent;
  onAction(action: InputActionId, device: InputDevice): void;
  onAxes(
    axes: InputAxes,
    deltaSeconds: number,
    device: "keyboard" | "gamepad",
  ): void;
  onTap(point: ScreenPoint, device: "mouse" | "touch"): void;
  onRouteStart(
    flightId: number,
    point: ScreenPoint,
    device: "mouse" | "touch",
  ): void;
  onRouteMove(point: ScreenPoint, device: "mouse" | "touch"): void;
  onRouteEnd(point: ScreenPoint, device: "mouse" | "touch"): void;
  onRouteCancel(device: "mouse" | "touch"): void;
  onCameraGestureStart(device: "mouse" | "touch"): void;
  onPan(
    previous: ScreenPoint,
    current: ScreenPoint,
    device: "mouse" | "touch",
  ): void;
  onPinch(
    previous: readonly [ScreenPoint, ScreenPoint],
    current: readonly [ScreenPoint, ScreenPoint],
  ): void;
  onWheel(point: ScreenPoint, deltaY: number): void;
  onStateChange?(): void;
  initialGamepadEnabled?: boolean;
  initialGamepadSensitivity?: number;
};

export type UnifiedInput = {
  update(deltaSeconds: number): void;
  snapshot(): UnifiedInputSnapshot;
  setGamepadEnabled(enabled: boolean, persist?: boolean): void;
  setGamepadSensitivity(sensitivity: number, persist?: boolean): void;
  dispose(): void;
};

type PointerRecord = {
  id: number;
  device: "mouse" | "touch";
  button: number;
  start: ScreenPoint;
  point: ScreenPoint;
  moved: boolean;
  cameraStarted: boolean;
  intent: CanvasPointerIntent;
};

type StoredInputPreferences = {
  gamepadEnabled?: boolean;
  gamepadSensitivity?: number;
};

const INPUT_PREFERENCES_KEY = "airport-auto.input.v1";

function inputPreferenceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadInputPreferences(): StoredInputPreferences {
  const storage = inputPreferenceStorage();
  if (!storage) return {};
  try {
    const value = JSON.parse(
      storage.getItem(INPUT_PREFERENCES_KEY) ?? "{}",
    ) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return {};
    return {
      gamepadEnabled:
        typeof value.gamepadEnabled === "boolean"
          ? value.gamepadEnabled
          : undefined,
      gamepadSensitivity:
        typeof value.gamepadSensitivity === "number" &&
        Number.isFinite(value.gamepadSensitivity)
          ? value.gamepadSensitivity
          : undefined,
    };
  } catch {
    return {};
  }
}

function saveInputPreferences(preferences: StoredInputPreferences): void {
  const storage = inputPreferenceStorage();
  if (!storage) return;
  try {
    storage.setItem(INPUT_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Storage may be unavailable in hardened or private browser contexts.
  }
}

function clampSensitivity(value: number): number {
  const finite = Number.isFinite(value) ? value : 1;
  return Math.round(Math.max(0.5, Math.min(2, finite)) * 10) / 10;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, select, textarea, button, a, summary, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function axesMagnitude(axes: InputAxes): number {
  return Math.max(
    Math.abs(axes.panX),
    Math.abs(axes.panY),
    Math.abs(axes.rotate),
    Math.abs(axes.zoom),
  );
}

function combineAxis(first: number, second: number): number {
  return Math.max(
    -1,
    Math.min(1, Math.abs(first) >= Math.abs(second) ? first : second),
  );
}

function combineAxes(first: InputAxes, second: InputAxes): InputAxes {
  return {
    panX: combineAxis(first.panX, second.panX),
    panY: combineAxis(first.panY, second.panY),
    rotate: combineAxis(first.rotate, second.rotate),
    zoom: combineAxis(first.zoom, second.zoom),
  };
}

export function createUnifiedInput(options: UnifiedInputOptions): UnifiedInput {
  const preferences = loadInputPreferences();
  let gamepadEnabled =
    options.initialGamepadEnabled ?? preferences.gamepadEnabled ?? true;
  let gamepadSensitivity = clampSensitivity(
    options.initialGamepadSensitivity ?? preferences.gamepadSensitivity ?? 1,
  );
  const pressedKeyboardCodes = new Set<string>();
  const appliedKeyboardCodes = new Set<string>();
  const pointers = new Map<number, PointerRecord>();
  let multiTouchSequence = false;
  let lastDevice: InputDevice | null = null;
  let lastAction: InputActionId | null = null;
  let lastGesture: UnifiedInputSnapshot["lastGesture"] = null;
  let activeAxes: InputAxes = { ...ZERO_INPUT_AXES };
  let gamepadIndex: number | null = null;
  let gamepadId: string | null = null;
  let gamepadMapping: string | null = null;
  let gamepadAxisCount = 0;
  let gamepadButtonCount = 0;
  let previousGamepadButtons: boolean[] = [];

  const actionAllowed = (action: InputActionId): boolean =>
    inputActionDefinition(action).contexts.includes(options.getContext());

  const markDevice = (
    device: InputDevice,
    action?: InputActionId,
    gesture?: UnifiedInputSnapshot["lastGesture"],
  ): void => {
    const changed =
      lastDevice !== device ||
      (action !== undefined && lastAction !== action) ||
      (gesture !== undefined && lastGesture !== gesture);
    lastDevice = device;
    if (action !== undefined) lastAction = action;
    if (gesture !== undefined) lastGesture = gesture;
    if (changed) options.onStateChange?.();
  };

  const dispatchAction = (action: InputActionId, device: InputDevice): void => {
    if (!actionAllowed(action)) return;
    markDevice(device, action);
    options.onAction(action, device);
  };

  const keyboardAxesForCodes = (codes: Iterable<string>): InputAxes => {
    const active = new Set<InputActionId>();
    for (const code of codes) {
      const action = inputActionForKeyboardCode(code);
      if (action?.kind === "continuous") active.add(action.id);
    }
    return {
      panX:
        Number(active.has("camera.pan-right")) -
        Number(active.has("camera.pan-left")),
      panY:
        Number(active.has("camera.pan-down")) -
        Number(active.has("camera.pan-up")),
      rotate:
        Number(active.has("camera.rotate-right")) -
        Number(active.has("camera.rotate-left")),
      zoom:
        Number(active.has("camera.zoom-in")) -
        Number(active.has("camera.zoom-out")),
    };
  };
  const keyboardAxes = (): InputAxes =>
    keyboardAxesForCodes(pressedKeyboardCodes);

  const handleKeyDown = (event: KeyboardEvent): void => {
    const action = inputActionForKeyboardCode(event.code);
    if (!action) return;
    if (action.id !== "ui.cancel" && isEditableTarget(event.target)) return;
    if (!action.contexts.includes(options.getContext())) return;
    event.preventDefault();
    if (action.kind === "continuous") {
      if (pressedKeyboardCodes.has(event.code)) return;
      pressedKeyboardCodes.add(event.code);
      markDevice("keyboard", action.id);
      return;
    }
    if (!event.repeat) dispatchAction(action.id, "keyboard");
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    const action = inputActionForKeyboardCode(event.code);
    const tapped =
      pressedKeyboardCodes.has(event.code) &&
      !appliedKeyboardCodes.has(event.code) &&
      action?.kind === "continuous" &&
      action.contexts.includes(options.getContext());
    pressedKeyboardCodes.delete(event.code);
    appliedKeyboardCodes.delete(event.code);
    if (tapped)
      options.onAxes(keyboardAxesForCodes([event.code]), 0.08, "keyboard");
  };

  const pointFromPointer = (event: PointerEvent): ScreenPoint => ({
    x: event.clientX,
    y: event.clientY,
  });
  const touchRecords = (): PointerRecord[] =>
    [...pointers.values()]
      .filter((pointer) => pointer.device === "touch")
      .sort((first, second) => first.id - second.id);

  const cancelActiveRoute = (device: "mouse" | "touch"): void => {
    const route = [...pointers.values()].find(
      (pointer) => pointer.intent.kind === "route",
    );
    if (!route) return;
    route.intent = { kind: "camera" };
    route.moved = true;
    options.onRouteCancel(device);
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (options.getContext() !== "gameplay") return;
    const device = event.pointerType === "touch" ? "touch" : "mouse";
    if (device === "mouse" && event.button !== 0 && event.button !== 1) return;
    const point = pointFromPointer(event);
    const record: PointerRecord = {
      id: event.pointerId,
      device,
      button: event.button,
      start: point,
      point,
      moved: false,
      cameraStarted: false,
      intent: options.resolvePointerIntent(point, device, event.button),
    };
    pointers.set(event.pointerId, record);
    markDevice(device);
    try {
      options.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests do not create an operating-system pointer.
    }
    if (device === "touch" && touchRecords().length >= 2) {
      multiTouchSequence = true;
      cancelActiveRoute("touch");
      for (const pointer of touchRecords()) {
        pointer.intent = { kind: "camera" };
        pointer.moved = true;
        pointer.cameraStarted = true;
      }
      options.canvas.classList.add("scene--panning");
      markDevice("touch", undefined, "pinch");
      options.onCameraGestureStart("touch");
      return;
    }
    if (record.intent.kind === "route") {
      markDevice(device, undefined, "route");
      options.onRouteStart(record.intent.flightId, point, device);
    }
  };

  const handlePointerMove = (event: PointerEvent): void => {
    const record = pointers.get(event.pointerId);
    if (!record) return;
    const previous = record.point;
    const current = pointFromPointer(event);
    const beforeTouches =
      record.device === "touch"
        ? touchRecords()
            .slice(0, 2)
            .map((pointer) => ({ ...pointer.point }))
        : [];
    record.point = current;
    const touches = touchRecords();
    if (record.device === "touch" && touches.length >= 2) {
      event.preventDefault();
      const afterTouches = touches
        .slice(0, 2)
        .map((pointer) => ({ ...pointer.point }));
      if (beforeTouches.length === 2 && afterTouches.length === 2) {
        options.onPinch(
          [beforeTouches[0], beforeTouches[1]],
          [afterTouches[0], afterTouches[1]],
        );
      }
      return;
    }
    if (record.intent.kind === "route") {
      event.preventDefault();
      record.moved =
        record.moved ||
        Math.hypot(current.x - record.start.x, current.y - record.start.y) > 3;
      options.onRouteMove(current, record.device);
      return;
    }
    if (record.intent.kind !== "camera") return;
    if (
      !record.moved &&
      Math.hypot(current.x - record.start.x, current.y - record.start.y) < 3
    )
      return;
    event.preventDefault();
    record.moved = true;
    if (!record.cameraStarted) {
      record.cameraStarted = true;
      options.canvas.classList.add("scene--panning");
      markDevice(record.device, undefined, "drag");
      options.onCameraGestureStart(record.device);
    }
    options.onPan(previous, current, record.device);
  };

  const finishPointer = (event: PointerEvent, cancelled: boolean): void => {
    const record = pointers.get(event.pointerId);
    if (!record) return;
    const point = pointFromPointer(event);
    if (record.intent.kind === "route") {
      if (cancelled) options.onRouteCancel(record.device);
      else options.onRouteEnd(point, record.device);
    } else if (
      !cancelled &&
      record.intent.kind === "camera" &&
      !record.moved &&
      !multiTouchSequence
    ) {
      markDevice(record.device, undefined, "tap");
      options.onTap(point, record.device);
    }
    pointers.delete(event.pointerId);
    try {
      options.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers may never have been captured.
    }
    const remainingTouches = touchRecords();
    if (remainingTouches.length === 1 && multiTouchSequence) {
      const remaining = remainingTouches[0];
      remaining.start = { ...remaining.point };
      remaining.moved = true;
      remaining.cameraStarted = true;
    }
    if (!remainingTouches.length) multiTouchSequence = false;
    if (![...pointers.values()].some((pointer) => pointer.cameraStarted))
      options.canvas.classList.remove("scene--panning");
  };

  const handlePointerUp = (event: PointerEvent): void =>
    finishPointer(event, false);
  const handlePointerCancel = (event: PointerEvent): void =>
    finishPointer(event, true);

  const handleWheel = (event: WheelEvent): void => {
    if (options.getContext() !== "gameplay") return;
    event.preventDefault();
    markDevice("mouse", undefined, "wheel");
    options.onCameraGestureStart("mouse");
    options.onWheel({ x: event.clientX, y: event.clientY }, event.deltaY);
  };

  const readGamepad = (): Gamepad | null => {
    if (!gamepadEnabled || typeof navigator.getGamepads !== "function")
      return null;
    try {
      return (
        [...navigator.getGamepads()].find((gamepad): gamepad is Gamepad =>
          Boolean(gamepad?.connected),
        ) ?? null
      );
    } catch {
      return null;
    }
  };

  const updateGamepadMetadata = (gamepad: Gamepad | null): void => {
    const nextIndex = gamepad?.index ?? null;
    const nextId = gamepad?.id ?? null;
    const nextMapping = gamepad?.mapping ?? null;
    const changed =
      gamepadIndex !== nextIndex ||
      gamepadId !== nextId ||
      gamepadMapping !== nextMapping;
    gamepadIndex = nextIndex;
    gamepadId = nextId;
    gamepadMapping = nextMapping;
    gamepadAxisCount = gamepad?.axes.length ?? 0;
    gamepadButtonCount = gamepad?.buttons.length ?? 0;
    if (!gamepad) previousGamepadButtons = [];
    if (changed) options.onStateChange?.();
  };

  const pollGamepad = (): InputAxes => {
    const gamepad = readGamepad();
    updateGamepadMetadata(gamepad);
    if (!gamepad) return { ...ZERO_INPUT_AXES };
    const buttons = gamepad.buttons.map(
      (button) => button.pressed || button.value > 0.55,
    );
    if (options.getContext() !== "modal") {
      for (const [indexText, action] of Object.entries(
        STANDARD_GAMEPAD_DISCRETE_BUTTONS,
      )) {
        const index = Number(indexText);
        if (buttons[index] && !previousGamepadButtons[index])
          dispatchAction(action, "gamepad");
      }
    }
    previousGamepadButtons = buttons;
    if (options.getContext() !== "gameplay") return { ...ZERO_INPUT_AXES };
    const axes = standardGamepadAxes(gamepad, gamepadSensitivity);
    if (axesMagnitude(axes) > 0.01) markDevice("gamepad");
    return axes;
  };

  const update = (deltaSeconds: number): void => {
    const gamepadAxes = pollGamepad();
    const keys =
      options.getContext() === "gameplay"
        ? keyboardAxes()
        : { ...ZERO_INPUT_AXES };
    if (axesMagnitude(keys) > 0.001) {
      for (const code of pressedKeyboardCodes) appliedKeyboardCodes.add(code);
    }
    activeAxes = combineAxes(keys, gamepadAxes);
    if (
      axesMagnitude(activeAxes) <= 0.001 ||
      options.getContext() !== "gameplay"
    )
      return;
    const source = axesMagnitude(gamepadAxes) > 0.001 ? "gamepad" : "keyboard";
    options.onAxes(
      activeAxes,
      Math.max(0, Math.min(0.1, deltaSeconds)),
      source,
    );
  };

  const persistPreferences = (): void =>
    saveInputPreferences({ gamepadEnabled, gamepadSensitivity });

  const setGamepadEnabled = (enabled: boolean, persist = true): void => {
    gamepadEnabled = Boolean(enabled);
    activeAxes = { ...ZERO_INPUT_AXES };
    previousGamepadButtons = [];
    if (!gamepadEnabled) updateGamepadMetadata(null);
    if (persist) persistPreferences();
    options.onStateChange?.();
  };

  const setGamepadSensitivity = (sensitivity: number, persist = true): void => {
    gamepadSensitivity = clampSensitivity(sensitivity);
    if (persist) persistPreferences();
    options.onStateChange?.();
  };

  const resetTransientInput = (): void => {
    const route = [...pointers.values()].find(
      (pointer) => pointer.intent.kind === "route",
    );
    if (route) options.onRouteCancel(route.device);
    pressedKeyboardCodes.clear();
    appliedKeyboardCodes.clear();
    pointers.clear();
    multiTouchSequence = false;
    activeAxes = { ...ZERO_INPUT_AXES };
    options.canvas.classList.remove("scene--panning");
  };

  const handleVisibilityChange = (): void => {
    if (document.hidden) resetTransientInput();
  };
  const handleGamepadConnection = (): void =>
    updateGamepadMetadata(readGamepad());

  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", resetTransientInput);
  window.addEventListener("gamepadconnected", handleGamepadConnection);
  window.addEventListener("gamepaddisconnected", handleGamepadConnection);
  options.canvas.addEventListener("wheel", handleWheel, { passive: false });
  options.canvas.addEventListener("pointerdown", handlePointerDown);
  options.canvas.addEventListener("pointermove", handlePointerMove, {
    passive: false,
  });
  options.canvas.addEventListener("pointerup", handlePointerUp);
  options.canvas.addEventListener("pointercancel", handlePointerCancel);

  return {
    update,
    snapshot() {
      const heldActions = [
        ...new Set(
          [...pressedKeyboardCodes]
            .map((code) => inputActionForKeyboardCode(code))
            .filter((action) => action?.kind === "continuous")
            .map((action) => action!.id),
        ),
      ];
      return {
        schemaVersion: 1,
        catalogVersion: 1,
        context: options.getContext(),
        lastDevice,
        lastAction,
        lastGesture,
        axes: { ...activeAxes },
        heldActions,
        devices: {
          keyboard: true,
          mouse: true,
          touch: true,
          gamepad: {
            supported: typeof navigator.getGamepads === "function",
            enabled: gamepadEnabled,
            sensitivity: gamepadSensitivity,
            connected: gamepadIndex !== null,
            index: gamepadIndex,
            id: gamepadId,
            mapping: gamepadMapping,
            axes: gamepadAxisCount,
            buttons: gamepadButtonCount,
          },
        },
        actions: cloneInputActionCatalog(),
      };
    },
    setGamepadEnabled,
    setGamepadSensitivity,
    dispose() {
      resetTransientInput();
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", resetTransientInput);
      window.removeEventListener("gamepadconnected", handleGamepadConnection);
      window.removeEventListener(
        "gamepaddisconnected",
        handleGamepadConnection,
      );
      options.canvas.removeEventListener("wheel", handleWheel);
      options.canvas.removeEventListener("pointerdown", handlePointerDown);
      options.canvas.removeEventListener("pointermove", handlePointerMove);
      options.canvas.removeEventListener("pointerup", handlePointerUp);
      options.canvas.removeEventListener("pointercancel", handlePointerCancel);
    },
  };
}

export { INPUT_ACTIONS };
