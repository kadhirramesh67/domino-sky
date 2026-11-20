import type { SimulationMetrics } from './simulation';

export type RecoveryActionType = 'SPARE_SWAP' | 'CANCEL_FLIGHT' | 'CANCEL_TURN_PAIR';

export interface RecoveryAction {
  id: string;
  type: RecoveryActionType;
  label: string;
  description: string;
  targetFlightIds: string[];
  spareTailId?: string;
  spareBase?: string;
}

export interface MetricsDelta {
  deltaDelayMinutes: number;
  deltaStrandedPax: number;
  deltaDelayedFlights: number;
  deltaCancelledFlights: number;
  deltaBrokenConnections: number;
  deltaCrewBreaches: number;
}

export interface RecoveryCandidate {
  action: RecoveryAction;
  beforeMetrics: SimulationMetrics;
  afterMetrics: SimulationMetrics;
  delta: MetricsDelta;
  score: number;
}
