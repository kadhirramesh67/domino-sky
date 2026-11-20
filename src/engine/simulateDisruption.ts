import type { FlightNetwork, Flight, Connection, Crew } from '../types/index';
import type {
  DisruptionInput,
  SimulationResult,
  SimulatedFlight,
  BrokenConnection,
  CrewBreach,
  SimulationMetrics,
  FlightStatus,
  DelayReason,
  CausalLink,
} from '../types/simulation';
import type { RecoveryAction } from '../types/recovery';
import { parseTime } from './timeUtils';
import {
  MIN_TURNAROUND_MINUTES,
  TIME_CONSTANTS,
  FLIGHT_STATUS,
  DELAY_REASONS,
  CONNECTION_BREAK_REASONS,
  RECOVERY_ACTION_TYPES,
} from '../constants/index';

/**
 * Evaluates whether a flight is cancelled by an active recovery action.
 */
function isFlightCancelledByRecovery(
  flightId: string,
  recoveryAction?: RecoveryAction
): boolean {
  if (!recoveryAction) return false;
  const isCancelAction =
    recoveryAction.type === RECOVERY_ACTION_TYPES.CANCEL_FLIGHT ||
    recoveryAction.type === RECOVERY_ACTION_TYPES.CANCEL_TURN_PAIR;
  return isCancelAction && recoveryAction.targetFlightIds.includes(flightId);
}

/**
 * Computes the earliest feasible departure time for an aircraft leg,
 * taking into account turnaround buffers, previous leg arrivals, and spare aircraft swaps.
 */
function calculateEarliestDeparture(
  scheduledDep: number,
  legOrder: number,
  prevActualArr: number | null,
  spareSwapActive: boolean,
  prevFlightId: string | null,
  prevCausalChain: CausalLink[],
  input: DisruptionInput,
  closeEnd: number,
  recoveryAction?: RecoveryAction
): {
  earliestDep: number;
  reason: DelayReason | null;
  causedByFlightId: string | null;
  causalChain: CausalLink[];
} {
  if (legOrder === 1 || prevActualArr === null || spareSwapActive) {
    let earliestDep = scheduledDep;
    if (spareSwapActive && recoveryAction?.type === RECOVERY_ACTION_TYPES.SPARE_SWAP) {
      const spareAvailableFrom = parseTime(TIME_CONSTANTS.SPARE_DEFAULT_AVAILABLE_TIME);
      const spareBase = recoveryAction.spareBase ?? '';
      earliestDep =
        spareBase === input.airport
          ? Math.max(scheduledDep, closeEnd)
          : Math.max(scheduledDep, spareAvailableFrom);
    }
    return { earliestDep, reason: null, causedByFlightId: null, causalChain: [] };
  }

  const minDep = prevActualArr + MIN_TURNAROUND_MINUTES;
  if (minDep > scheduledDep) {
    const causalChain: CausalLink[] = [...prevCausalChain];
    if (prevFlightId) {
      causalChain.push({
        flightId: prevFlightId,
        reason: DELAY_REASONS.INBOUND_ROTATION_DELAY,
        delayMinutes: minDep - scheduledDep,
      });
    }
    return {
      earliestDep: minDep,
      reason: DELAY_REASONS.INBOUND_ROTATION_DELAY,
      causedByFlightId: prevFlightId,
      causalChain,
    };
  }

  return { earliestDep: scheduledDep, reason: null, causedByFlightId: null, causalChain: [] };
}

/**
 * Propagates airport closure holds (origin departure holds and destination arrival holds).
 */
function applyAirportHolds(
  earliestDep: number,
  blockMinutes: number,
  origin: string,
  destination: string,
  closedAirport: string,
  closeStart: number,
  closeEnd: number,
  currentReason: DelayReason | null,
  currentCausedBy: string | null,
  currentChain: CausalLink[]
): {
  actualDep: number;
  actualArr: number;
  reason: DelayReason | null;
  causedByFlightId: string | null;
  causalChain: CausalLink[];
} {
  let actualDep = earliestDep;
  let reason = currentReason;
  let causedByFlightId = currentCausedBy;
  let causalChain = currentChain;

  // Origin departure hold
  if (origin === closedAirport && actualDep >= closeStart && actualDep < closeEnd) {
    actualDep = closeEnd;
    reason = DELAY_REASONS.DIRECT_DEPARTURE_HOLD;
    causedByFlightId = null;
    causalChain = [];
  }

  // Destination arrival hold
  let actualArr = actualDep + blockMinutes;
  if (destination === closedAirport && actualArr > closeStart && actualArr < closeEnd) {
    const requiredDep = closeEnd - blockMinutes;
    if (requiredDep > actualDep) {
      actualDep = requiredDep;
      actualArr = actualDep + blockMinutes;
      if (reason !== DELAY_REASONS.DIRECT_DEPARTURE_HOLD) {
        reason = DELAY_REASONS.DIRECT_ARRIVAL_HOLD;
        causedByFlightId = null;
        causalChain = [];
      }
    }
  }

  return { actualDep, actualArr, reason, causedByFlightId, causalChain };
}

/**
 * Creates a cancelled flight representation when a leg is withdrawn by recovery.
 */
function createCancelledLeg(
  leg: Flight,
  tailId: string,
  scheduledDep: number,
  scheduledArr: number
): SimulatedFlight {
  return {
    flight_id: leg.flight_id,
    tail_id: tailId,
    leg_order: leg.leg_order,
    origin: leg.origin,
    destination: leg.destination,
    scheduledDep,
    scheduledArr,
    actualDep: scheduledDep,
    actualArr: scheduledArr,
    block_minutes: leg.block_minutes,
    pax: leg.pax,
    status: FLIGHT_STATUS.CANCELLED,
    delayMinutes: 0,
    reason: null,
    causedByFlightId: null,
    causalChain: [],
    crewDutyBreach: false,
    breachMinutes: 0,
  };
}

/**
 * Simulates a single leg in an aircraft rotation, calculating holds and delays.
 */
function processFlightLeg(
  leg: Flight,
  tailId: string,
  scheduledDep: number,
  scheduledArr: number,
  prevActualArr: number | null,
  prevFlightId: string | null,
  prevCausalChain: CausalLink[],
  spareSwapActive: boolean,
  input: DisruptionInput,
  closeStart: number,
  closeEnd: number,
  recoveryAction?: RecoveryAction
): SimulatedFlight {
  const depCalc = calculateEarliestDeparture(
    scheduledDep,
    leg.leg_order,
    prevActualArr,
    spareSwapActive,
    prevFlightId,
    prevCausalChain,
    input,
    closeEnd,
    recoveryAction
  );

  const holdCalc = applyAirportHolds(
    depCalc.earliestDep,
    leg.block_minutes,
    leg.origin,
    leg.destination,
    input.airport,
    closeStart,
    closeEnd,
    depCalc.reason,
    depCalc.causedByFlightId,
    depCalc.causalChain
  );

  const delayMinutes = holdCalc.actualDep - scheduledDep;
  const status: FlightStatus = delayMinutes > 0 ? FLIGHT_STATUS.DELAYED : FLIGHT_STATUS.ON_TIME;

  return {
    flight_id: leg.flight_id,
    tail_id: tailId,
    leg_order: leg.leg_order,
    origin: leg.origin,
    destination: leg.destination,
    scheduledDep,
    scheduledArr,
    actualDep: holdCalc.actualDep,
    actualArr: holdCalc.actualArr,
    block_minutes: leg.block_minutes,
    pax: leg.pax,
    status,
    delayMinutes,
    reason: holdCalc.reason,
    causedByFlightId: holdCalc.causedByFlightId,
    causalChain: holdCalc.causalChain,
    crewDutyBreach: false,
    breachMinutes: 0,
  };
}

/**
 * PASS 1: Propagates aircraft rotational cascades and delays across all aircraft tails.
 */
function propagateAircraftChains(
  flights: Flight[],
  input: DisruptionInput,
  closeStart: number,
  closeEnd: number,
  recoveryAction?: RecoveryAction
): Map<string, SimulatedFlight> {
  const byTail = new Map<string, Flight[]>();
  for (const f of flights) {
    const arr = byTail.get(f.tail_id) ?? [];
    arr.push(f);
    byTail.set(f.tail_id, arr);
  }
  for (const [, legs] of byTail) {
    legs.sort((a, b) => a.leg_order - b.leg_order);
  }

  const simFlights = new Map<string, SimulatedFlight>();

  for (const [tailId, legs] of byTail) {
    const isSpareSwapped =
      recoveryAction?.type === RECOVERY_ACTION_TYPES.SPARE_SWAP &&
      legs.some((l) => recoveryAction.targetFlightIds.includes(l.flight_id));

    const firstTargetId = recoveryAction?.targetFlightIds[0];
    const spareSwapStartIndex = isSpareSwapped
      ? legs.findIndex((l) => l.flight_id === firstTargetId)
      : -1;

    let prevActualArr: number | null = null;
    let prevFlightId: string | null = null;
    let prevCausalChain: CausalLink[] = [];
    let spareSwapActive = false;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (!leg) continue;
      const scheduledDep = parseTime(leg.dep);
      const scheduledArr = parseTime(leg.arr);

      if (isFlightCancelledByRecovery(leg.flight_id, recoveryAction)) {
        simFlights.set(leg.flight_id, createCancelledLeg(leg, tailId, scheduledDep, scheduledArr));
        prevActualArr = null;
        prevFlightId = null;
        prevCausalChain = [];
        continue;
      }

      if (isSpareSwapped && i === spareSwapStartIndex) {
        spareSwapActive = true;
        prevActualArr = null;
        prevFlightId = null;
        prevCausalChain = [];
      }

      const sf = processFlightLeg(
        leg,
        tailId,
        scheduledDep,
        scheduledArr,
        prevActualArr,
        prevFlightId,
        prevCausalChain,
        spareSwapActive,
        input,
        closeStart,
        closeEnd,
        recoveryAction
      );
      if (spareSwapActive) spareSwapActive = false;

      simFlights.set(leg.flight_id, sf);
      prevActualArr = sf.actualArr;
      prevFlightId = leg.flight_id;
      prevCausalChain = sf.causalChain;
    }
  }

  return simFlights;
}

/**
 * PASS 2: Evaluates crew duty limits and grounds flights exceeding max duty hours.
 */
function evaluateCrewDutyBreaches(
  crews: Crew[],
  simFlights: Map<string, SimulatedFlight>,
  recoveryAction?: RecoveryAction
): CrewBreach[] {
  const crewBreaches: CrewBreach[] = [];

  for (const crew of crews) {
    const isSwappedCrew =
      recoveryAction?.type === RECOVERY_ACTION_TYPES.SPARE_SWAP &&
      recoveryAction.targetFlightIds.some((id) => crew.flight_ids.includes(id));

    const dutyStart = parseTime(crew.duty_start);
    let breached = false;
    const groundedFlightIds: string[] = [];

    for (const fid of crew.flight_ids) {
      const sf = simFlights.get(fid);
      if (!sf || sf.status === FLIGHT_STATUS.CANCELLED) continue;
      if (isSwappedCrew && recoveryAction?.targetFlightIds.includes(fid)) continue;

      if (breached) {
        sf.status = FLIGHT_STATUS.CREW_GROUNDED;
        sf.reason = DELAY_REASONS.CREW_DUTY_BREACH;
        groundedFlightIds.push(fid);
        continue;
      }

      const dutyMinutes = sf.actualArr - dutyStart;
      if (dutyMinutes > crew.max_duty_mins) {
        breached = true;
        sf.crewDutyBreach = true;
        sf.breachMinutes = dutyMinutes - crew.max_duty_mins;
        sf.status = FLIGHT_STATUS.CREW_GROUNDED;
        sf.reason = DELAY_REASONS.CREW_DUTY_BREACH;
        groundedFlightIds.push(fid);

        crewBreaches.push({
          crew_id: crew.crew_id,
          tail_id: crew.tail_id,
          dutyMinutes,
          maxDutyMins: crew.max_duty_mins,
          breachMinutes: dutyMinutes - crew.max_duty_mins,
          groundedFlightIds: [],
        });
      }
    }

    if (breached && groundedFlightIds.length > 0) {
      const existing = crewBreaches.find((b) => b.crew_id === crew.crew_id);
      if (existing) {
        existing.groundedFlightIds = groundedFlightIds;
      }
    }
  }

  return crewBreaches;
}

/**
 * PASS 3: Evaluates passenger connection feasibility across delayed and cancelled flights.
 */
function evaluatePassengerConnections(
  connections: Connection[],
  simFlights: Map<string, SimulatedFlight>
): BrokenConnection[] {
  const brokenConnections: BrokenConnection[] = [];

  for (const conn of connections) {
    const fromFlight = simFlights.get(conn.from_flight);
    const toFlight = simFlights.get(conn.to_flight);
    if (!fromFlight || !toFlight) continue;

    const fromCancelled =
      fromFlight.status === FLIGHT_STATUS.CANCELLED ||
      fromFlight.status === FLIGHT_STATUS.CREW_GROUNDED;
    const toCancelled =
      toFlight.status === FLIGHT_STATUS.CANCELLED ||
      toFlight.status === FLIGHT_STATUS.CREW_GROUNDED;

    if (fromCancelled || toCancelled) {
      brokenConnections.push({
        connection_id: conn.connection_id,
        airport: conn.airport,
        from_flight: conn.from_flight,
        to_flight: conn.to_flight,
        passengers: conn.passengers,
        min_connect_minutes: conn.min_connect_minutes,
        actualGapMinutes: toFlight.actualDep - fromFlight.actualArr,
        reason: fromCancelled
          ? CONNECTION_BREAK_REASONS.FROM_CANCELLED
          : CONNECTION_BREAK_REASONS.TO_CANCELLED,
        countsInMissedPax: false,
      });
      continue;
    }

    const gap = toFlight.actualDep - fromFlight.actualArr;
    if (gap < conn.min_connect_minutes) {
      brokenConnections.push({
        connection_id: conn.connection_id,
        airport: conn.airport,
        from_flight: conn.from_flight,
        to_flight: conn.to_flight,
        passengers: conn.passengers,
        min_connect_minutes: conn.min_connect_minutes,
        actualGapMinutes: gap,
        reason: CONNECTION_BREAK_REASONS.MISSED_CONNECTION,
        countsInMissedPax: true,
      });
    }
  }

  return brokenConnections;
}

/**
 * Aggregates all simulation performance indicators into a structured metrics summary.
 */
function aggregateSimulationMetrics(
  allFlights: SimulatedFlight[],
  brokenConnections: BrokenConnection[],
  crewBreaches: CrewBreach[]
): SimulationMetrics {
  const delayedFlightsCount = allFlights.filter((f) => f.status === FLIGHT_STATUS.DELAYED).length;
  const cancelledFlightsCount = allFlights.filter(
    (f) => f.status === FLIGHT_STATUS.CANCELLED || f.status === FLIGHT_STATUS.CREW_GROUNDED
  ).length;
  const totalDelayMinutes = allFlights.reduce((s, f) => s + Math.max(0, f.delayMinutes), 0);
  const maxDelayMinutes = Math.max(0, ...allFlights.map((f) => Math.max(0, f.delayMinutes)));

  const affectedAirports = new Set<string>();
  for (const f of allFlights) {
    if (f.status !== FLIGHT_STATUS.ON_TIME) {
      affectedAirports.add(f.origin);
      affectedAirports.add(f.destination);
    }
  }

  const cancelledOrGroundedPax = allFlights
    .filter(
      (f) => f.status === FLIGHT_STATUS.CANCELLED || f.status === FLIGHT_STATUS.CREW_GROUNDED
    )
    .reduce((s, f) => s + f.pax, 0);

  const missedConnectionPax = brokenConnections
    .filter((c) => c.countsInMissedPax)
    .reduce((s, c) => s + c.passengers, 0);

  return {
    delayedFlightsCount,
    cancelledFlightsCount,
    crewBreachCount: crewBreaches.length,
    brokenConnectionsCount: brokenConnections.length,
    totalDelayMinutes,
    maxDelayMinutes,
    affectedAirportsCount: affectedAirports.size,
    cancelledOrGroundedPax,
    missedConnectionPax,
    totalStrandedPax: cancelledOrGroundedPax + missedConnectionPax,
  };
}

/**
 * Primary deterministic simulation engine. Computes aircraft rotation cascades,
 * crew duty hour breaches, passenger connection breaks, and operational KPIs
 * during airport closures.
 *
 * @param network Static flight network dataset
 * @param input Disruption parameters (closure airport, start time, duration)
 * @param recoveryAction Optional operational recovery action to apply
 * @returns Complete deterministic simulation result
 */
export function simulateDisruption(
  network: FlightNetwork,
  input: DisruptionInput,
  recoveryAction?: RecoveryAction
): SimulationResult {
  const closeStart = parseTime(input.startTime);
  const closeEnd = closeStart + input.durationMinutes;

  const flights: Flight[] = network.flights.map((f) => ({ ...f }));

  // PASS 1: Aircraft rotation and airport closure holds
  const simFlights = propagateAircraftChains(
    flights,
    input,
    closeStart,
    closeEnd,
    recoveryAction
  );

  // PASS 2: Crew duty evaluation
  const crewBreaches = evaluateCrewDutyBreaches(network.crews, simFlights, recoveryAction);

  // PASS 3: Passenger connection feasibility
  const brokenConnections = evaluatePassengerConnections(
    network.connections,
    simFlights
  );

  // PASS 4: Operational KPI aggregation
  const allFlights = Array.from(simFlights.values());
  const metrics = aggregateSimulationMetrics(allFlights, brokenConnections, crewBreaches);

  const sortedFlights = allFlights.sort(
    (a, b) => a.scheduledDep - b.scheduledDep || a.flight_id.localeCompare(b.flight_id)
  );

  return {
    input,
    flights: sortedFlights,
    brokenConnections,
    crewBreaches,
    metrics,
  };
}
