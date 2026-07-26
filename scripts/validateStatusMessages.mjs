import { build } from "esbuild";

const validationSource = `
import {
  STATUS_MESSAGE_DWELL_MS,
  StatusMessageCoordinator,
  inferStatusMessagePriority,
} from './src/presentation/statusMessages.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presented = [];
const coordinator = new StatusMessageCoordinator((message) => presented.push(message), 4);
coordinator.enqueue({ label: 'American 610 held for separation', detail: 'Projected path conflict with flight 11' }, 0);
assert(presented.length === 1, 'the first message should be presented immediately');
assert(presented[0].priority === 'warning', 'a projected separation conflict should be a warning');

coordinator.enqueue({ label: 'American 610 held for separation', detail: 'Projected path conflict with flight 11' }, 50);
assert(presented.length === 1, 'an identical active warning must not restart or animate');

coordinator.enqueue({ label: 'United 204 held for separation', detail: 'Protected arrival envelope occupied' }, 100);
coordinator.enqueue({ label: 'Delta 88 gate planned', detail: 'Concourse E stand schedule confirmed' }, 110);
coordinator.advance(STATUS_MESSAGE_DWELL_MS.warning - 1);
assert(presented.length === 1, 'a queued notice replaced a warning before its readable dwell elapsed');
coordinator.advance(STATUS_MESSAGE_DWELL_MS.warning);
assert(presented.length === 2 && presented[1].label.startsWith('United 204'), 'the next warning did not follow after the dwell');

coordinator.enqueue({ label: 'Runway incursion', detail: 'Vehicle entered protected pavement' }, 5_100);
assert(presented.length === 3 && presented[2].priority === 'critical', 'a critical safety alert must interrupt a lower-priority notice');
coordinator.enqueue({ label: 'Gate changed', detail: 'Routine stand revision' }, 5_200);
coordinator.advance(5_100 + STATUS_MESSAGE_DWELL_MS.critical - 1);
assert(presented.length === 3, 'routine copy interrupted a critical safety dwell');

const bounded = new StatusMessageCoordinator(() => {}, 3);
bounded.enqueue({ label: 'Current operation', detail: 'Readable first message' }, 0);
for (let index = 0; index < 8; index += 1) {
  bounded.enqueue({ label: 'Gate planned ' + index, detail: 'Routine event ' + index, priority: 'ambient' }, index + 1);
}
bounded.enqueue({ label: 'Conflict forecast', detail: 'Projected path conflict', priority: 'warning' }, 20);
const boundedSnapshot = bounded.snapshot();
assert(boundedSnapshot.queued.length === 3, 'the queue must remain bounded during an event burst');
assert(boundedSnapshot.queued.some((message) => message.priority === 'warning'), 'queue pressure discarded the safety warning');

assert(inferStatusMessagePriority('Flight selected', 'Following aircraft') === 'operational', 'ordinary interaction priority changed');
assert(inferStatusMessagePriority('Aircraft emergency', 'Priority handling active') === 'critical', 'emergency priority changed');

console.log(JSON.stringify({
  firstDwellMs: STATUS_MESSAGE_DWELL_MS.warning,
  criticalDwellMs: STATUS_MESSAGE_DWELL_MS.critical,
  transitions: presented.length,
  boundedQueue: boundedSnapshot.queued.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "status-message-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Status-message validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);
