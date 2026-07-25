import { build } from "esbuild";

const validationSource = `
import {
  INPUT_ACTIONS,
  INPUT_HELP_ROWS,
  STANDARD_GAMEPAD_DISCRETE_BUTTONS,
  applyInputDeadzone,
  inputActionForKeyboardCode,
  standardGamepadAxes,
} from './src/input/actionMap.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(INPUT_ACTIONS.length === 24, 'the canonical action catalog should contain 24 actions');
assert(new Set(INPUT_ACTIONS.map((action) => action.id)).size === INPUT_ACTIONS.length, 'action IDs must be unique');
assert(INPUT_ACTIONS.filter((action) => action.kind === 'continuous').length === 8, 'all eight camera axes must be continuous actions');
assert(INPUT_ACTIONS.filter((action) => action.kind === 'continuous').every((action) => (
  action.id.startsWith('camera.') && action.contexts.length === 1 && action.contexts[0] === 'gameplay'
)), 'continuous input must be camera-only and gameplay-scoped');

const keyboardCodes = INPUT_ACTIONS.flatMap((action) => action.keyboardCodes.map((code) => [code, action.id]));
assert(new Set(keyboardCodes.map(([code]) => code)).size === keyboardCodes.length, 'keyboard codes must map to exactly one action');
for (const [code, id] of keyboardCodes) {
  assert(inputActionForKeyboardCode(code)?.id === id, 'keyboard lookup disagrees with the catalog for ' + code);
}
assert(inputActionForKeyboardCode('F13') === null, 'unknown keyboard codes must remain unbound');
assert(INPUT_ACTIONS.find((action) => action.id === 'ui.cancel')?.contexts.join(',') === 'gameplay,ui,modal', 'cancel must remain available in every context');
assert(INPUT_ACTIONS.find((action) => action.id === 'ui.focus')?.keyboardCodes.join(',') === 'KeyF', 'observer focus must remain available from F');

assert(applyInputDeadzone(0.17) === 0, 'values inside the gamepad deadzone must be ignored');
assert(applyInputDeadzone(Number.NaN) === 0, 'non-finite gamepad values must be ignored');
assert(applyInputDeadzone(1) === 1 && applyInputDeadzone(-1) === -1, 'full stick travel must remain full scale');

const buttons = Array.from({ length: 18 }, () => ({ value: 0, pressed: false }));
const leftStick = standardGamepadAxes({ axes: [0.8, -0.7, 0, 0], buttons });
assert(leftStick.panX > 0.7 && leftStick.panY < -0.6, 'left stick must control camera pan');
const rightStick = standardGamepadAxes({ axes: [0, 0, -0.9, 0.75], buttons });
assert(rightStick.rotate < -0.8 && rightStick.zoom < -0.65, 'right stick must control orbit and zoom');
buttons[15].value = 1;
buttons[12].value = 1;
buttons[7].value = 0.8;
const digital = standardGamepadAxes({ axes: [0, 0, 0, 0], buttons }, 1.5);
assert(digital.panX === 1 && digital.panY === -1 && digital.zoom === 1, 'D-pad and triggers must drive clamped camera axes');
assert(Object.keys(STANDARD_GAMEPAD_DISCRETE_BUTTONS).length === 10, 'standard gamepad action buttons are incomplete');
for (const action of ['selection.primary', 'ui.cancel', 'flight.hold', 'flight.go-around', 'selection.previous', 'selection.next', 'ui.controls', 'ui.pause', 'camera.reset', 'camera.next-view']) {
  assert(Object.values(STANDARD_GAMEPAD_DISCRETE_BUTTONS).includes(action), 'missing standard gamepad action ' + action);
}

assert(INPUT_HELP_ROWS.length >= 6, 'compact input help is incomplete');
assert(INPUT_HELP_ROWS.every((row) => row.keyboard && row.pointer && row.gamepad), 'each help row must explain keyboard, pointer, and gamepad input');
assert(INPUT_HELP_ROWS.some((row) => row.pointer.includes('pinch')), 'touch pinch help is missing');

console.log(JSON.stringify({
  actions: INPUT_ACTIONS.length,
  continuous: INPUT_ACTIONS.filter((action) => action.kind === 'continuous').length,
  keyboardBindings: keyboardCodes.length,
  gamepadButtons: Object.keys(STANDARD_GAMEPAD_DISCRETE_BUTTONS).length,
  helpRows: INPUT_HELP_ROWS.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "input-actions-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Input-action validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);
