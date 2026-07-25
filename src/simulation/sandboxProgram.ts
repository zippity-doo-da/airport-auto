import type {
  SandboxInjectionRequest,
  SandboxState,
  SandboxTrafficClass,
} from './types';

export const SANDBOX_TRAFFIC_CLASSES: ReadonlyArray<{
  id: SandboxTrafficClass;
  label: string;
}> = [
  { id: 'auto', label: 'Airport mix' },
  { id: 'passenger', label: 'Passenger' },
  { id: 'regional', label: 'Regional' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'general-aviation', label: 'General aviation' },
];

export function createInactiveSandboxState(): SandboxState {
  return {
    active: false,
    backgroundTraffic: true,
    noScore: true,
    startedAtSeconds: 0,
    nextInjectionId: 1,
    injections: [],
    totals: {
      requested: 0,
      releasedArrivals: 0,
      releasedDepartures: 0,
      cancelled: 0,
    },
    lastMessage: 'Sandbox inactive.',
  };
}

export function cloneSandboxInjection(request: SandboxInjectionRequest): SandboxInjectionRequest {
  return {
    ...request,
    releasedFlightIds: [...request.releasedFlightIds],
  };
}

export function cloneSandboxState(state: SandboxState): SandboxState {
  return {
    ...state,
    injections: state.injections.map(cloneSandboxInjection),
    totals: { ...state.totals },
  };
}
