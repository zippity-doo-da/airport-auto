import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const ownedDefinitions = [
  ['runwaysConflict', 'src/simulation/runwayConflict.ts'],
  ['runwayRelationship', 'src/simulation/separationRules.ts'],
  ['runwayOperationSpacingSeconds', 'src/simulation/separationRules.ts'],
  ['selectTerminalProcedure', 'src/simulation/airspaceProcedures.ts'],
  ['selectAutomaticRunwayConfiguration', 'src/simulation/runwayConfigurationOperations.ts'],
  ['flightHasCommittedRunwayTrajectory', 'src/simulation/runwayProtection.ts'],
  ['runwayEndPoint', 'src/simulation/runwayGeometry.ts'],
];

const sourceFiles = [
  'src/main.ts',
  'src/render/createWorld.ts',
  'src/simulation/airportSimulation.ts',
  'src/simulation/collisionDetection.ts',
  ...new Set(ownedDefinitions.map(([, owner]) => owner)),
];

for (const [symbol, owner] of ownedDefinitions) {
  const definition = new RegExp(`(?:export\\s+)?function\\s+${symbol}\\s*\\(`);
  const owners = [];
  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    if (definition.test(source)) owners.push(file);
  }
  if (owners.length !== 1 || owners[0] !== owner) {
    throw new Error(`${symbol} must have exactly one canonical owner (${owner}); found ${owners.join(', ') || 'none'}`);
  }
}

const validationSource = `
import {
  OPERATIONAL_RULE_MODULES,
  assessAirborneSeparation,
  flightHasCommittedRunwayTrajectory,
  runwayEndPoint,
  runwayRelationship,
  selectAutomaticRunwayConfiguration,
  selectTerminalProcedure,
} from './src/simulation/operationalRules.ts';

if (Object.keys(OPERATIONAL_RULE_MODULES).length !== 6) throw new Error('canonical rule catalog is incomplete');
for (const value of [assessAirborneSeparation, flightHasCommittedRunwayTrajectory, runwayEndPoint, runwayRelationship, selectAutomaticRunwayConfiguration, selectTerminalProcedure]) {
  if (typeof value !== 'function') throw new Error('canonical rule export is unavailable');
}
console.log(JSON.stringify({ schemaVersion: 1, ruleFamilies: Object.keys(OPERATIONAL_RULE_MODULES).length }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'operational-rule-ownership-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Operational-rule validation bundle was empty.');
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
console.log(JSON.stringify({ uniqueRuleOwners: ownedDefinitions.length }));
