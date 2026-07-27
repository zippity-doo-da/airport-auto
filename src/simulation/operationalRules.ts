/**
 * Canonical public boundary for airport operating rules.
 *
 * Consumers may continue importing the focused modules directly, but new rule
 * implementations belong behind this boundary. Keeping the catalog explicit
 * lets validation reject a second runway, separation, protection, or procedure
 * implementation before it can drift from the simulation and renderer.
 */
export * from './airspaceProcedures';
export * from './runwayConfigurationOperations';
export * from './runwayConflict';
export * from './runwayGeometry';
export * from './runwayProtection';
export * from './separationRules';

export const OPERATIONAL_RULE_MODULES = Object.freeze({
  procedures: 'airspaceProcedures.ts',
  runwayConfiguration: 'runwayConfigurationOperations.ts',
  runwayConflict: 'runwayConflict.ts',
  runwayGeometry: 'runwayGeometry.ts',
  runwayProtection: 'runwayProtection.ts',
  separation: 'separationRules.ts',
});
