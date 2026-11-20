export type DelayReason =
  | 'DIRECT_DEPARTURE_HOLD'
  | 'DIRECT_ARRIVAL_HOLD'
  | 'INBOUND_ROTATION_DELAY'
  | 'CREW_DUTY_BREACH';

export type FlightStatus = 'on_time' | 'delayed' | 'cancelled' | 'crew_grounded';

export interface CausalLink {
  flightId: string;
  reason: DelayReason;
  delayMinutes: number;
}

export interface SimulatedFlight {
  flight_id: string;
  tail_id: string;
  leg_order: number;
  origin: string;
  destination: string;
  scheduledDep: number;
  scheduledArr: number;
  actualDep: number;
  actualArr: number;
  block_minutes: number;
  pax: number;
  status: FlightStatus;
  delayMinutes: number;
  reason: DelayReason | null;
  causedByFlightId: string | null;
  causalChain: CausalLink[];
  crewDutyBreach: boolean;
  breachMinutes: number;
}

export interface BrokenConnection {
  connection_id: string;
  airport: string;
  from_flight: string;
  to_flight: string;
  passengers: number;
  min_connect_minutes: number;
  actualGapMinutes: number;
  reason: 'FROM_CANCELLED' | 'TO_CANCELLED' | 'MISSED_CONNECTION';
  countsInMissedPax: boolean;
}

export interface CrewBreach {
  crew_id: string;
  tail_id: string;
  dutyMinutes: number;
  maxDutyMins: number;
  breachMinutes: number;
  groundedFlightIds: string[];
}

export interface SimulationMetrics {
  delayedFlightsCount: number;
  cancelledFlightsCount: number;
  crewBreachCount: number;
  brokenConnectionsCount: number;
  totalDelayMinutes: number;
  maxDelayMinutes: number;
  affectedAirportsCount: number;
  cancelledOrGroundedPax: number;
  missedConnectionPax: number;
  totalStrandedPax: number;
}

export interface SimulationResult {
  input: DisruptionInput;
  flights: SimulatedFlight[];
  brokenConnections: BrokenConnection[];
  crewBreaches: CrewBreach[];
  metrics: SimulationMetrics;
}

export interface DisruptionInput {
  airport: string;
  startTime: string;
  durationMinutes: number;
}
