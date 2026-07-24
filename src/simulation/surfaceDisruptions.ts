import type { AirportConfig } from './airportConfig';
import type { AirportSurfaceGraph, SurfaceEdge } from './surfaceGraph';
import type { SurfaceDisruptionKind, SurfaceDisruptionState } from './types';

export interface SurfaceDisruptionTarget {
  targetId: string;
  label: string;
  edgeIds: string[];
  runwayId?: number;
  taxiwayId?: string;
}

/** Active restrictions are a graph-planning input, never a renderer-only flag. */
export function surfaceDisruptionBlockedEdgeIds(
  disruptions: readonly SurfaceDisruptionState[],
): Set<string> {
  return new Set(disruptions
    .filter((disruption) => disruption.status === 'active' || disruption.status === 'recovering')
    .flatMap((disruption) => disruption.edgeIds));
}

export function runwayClosedByDisruption(
  disruptions: readonly SurfaceDisruptionState[],
  runwayId: number,
): boolean {
  return disruptions.some((disruption) => (
    disruption.runwayId === runwayId
    && (disruption.kind === 'runway-closure' || disruption.kind === 'disabled-aircraft')
    && (disruption.kind === 'runway-closure' || disruption.status === 'active' || disruption.status === 'recovering')
  ));
}

export function surfaceDisruptionsForRoute(
  disruptions: readonly SurfaceDisruptionState[],
  edgeIds: readonly string[] | undefined,
  afterEdgeIndex = -1,
): SurfaceDisruptionState[] {
  if (!edgeIds?.length) return [];
  const remaining = new Set(edgeIds.slice(afterEdgeIndex + 1));
  return disruptions.filter((disruption) => (
    (disruption.status === 'active' || disruption.status === 'recovering')
    && disruption.edgeIds.some((edgeId) => remaining.has(edgeId))
  ));
}

export function resolveSurfaceDisruptionTarget(
  config: Pick<AirportConfig, 'runways' | 'surfaceGraph'>,
  kind: Exclude<SurfaceDisruptionKind, 'disabled-aircraft'>,
  targetId: string,
): SurfaceDisruptionTarget | null {
  const graph = config.surfaceGraph;
  if (kind === 'runway-closure') {
    const runwayId = Number(targetId);
    const runway = config.runways.find((candidate) => candidate.id === runwayId);
    if (!runway) return null;
    const edgeIds = graph.edges
      .filter((edge) => edge.runwayId === runwayId && (edge.kind === 'runway' || edge.kind === 'runway-access'))
      .map((edge) => edge.id);
    return {
      targetId: String(runwayId),
      label: `Runway ${runway.designation?.join('/') ?? runwayId}`,
      edgeIds,
      runwayId,
    };
  }

  const taxiway = graph.taxiways.find((candidate) => candidate.id === targetId);
  if (kind === 'taxiway-closure') {
    if (!taxiway?.edgeIds.length) return null;
    return {
      targetId,
      label: taxiway.name,
      edgeIds: [...taxiway.edgeIds],
      taxiwayId: taxiway.id,
    };
  }

  const directEdge = graph.edges.find((edge) => edge.id === targetId && constructionEdge(edge));
  const edge = directEdge ?? taxiway?.edgeIds
    .map((edgeId) => graph.edges.find((candidate) => candidate.id === edgeId))
    .filter((candidate): candidate is SurfaceEdge => Boolean(candidate && constructionEdge(candidate)))
    .sort((first, second) => first.id.localeCompare(second.id))[0];
  if (!edge) return null;
  const edgeTaxiway = graph.taxiways.find((candidate) => candidate.id === edge.taxiwayId);
  return {
    targetId,
    label: `${edgeTaxiway?.name ?? edge.name} work zone`,
    edgeIds: [edge.id],
    taxiwayId: edge.taxiwayId,
  };
}

export function surfaceDisruptionPosition(
  graph: AirportSurfaceGraph,
  disruption: Pick<SurfaceDisruptionState, 'edgeIds'>,
): [number, number] | null {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const points = disruption.edgeIds.flatMap((edgeId): Array<[number, number]> => {
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    const from = edge ? nodeById.get(edge.from) : undefined;
    const to = edge ? nodeById.get(edge.to) : undefined;
    return from && to ? [[(from.position[0] + to.position[0]) / 2, (from.position[1] + to.position[1]) / 2]] : [];
  });
  if (!points.length) return null;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

function constructionEdge(edge: SurfaceEdge): boolean {
  return edge.kind === 'taxiway' || edge.kind === 'apron' || edge.kind === 'stand-lead-in';
}
