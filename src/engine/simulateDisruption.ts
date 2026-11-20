import type { FlightNetwork, Flight, Connection } from '../types/index';
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

export function simulateDisruption(
  network: FlightNetwork,
  input: DisruptionInput,
  recoveryAction?: RecoveryAction
): SimulationResult {
  const closeStart = parseTime(input.startTime);
  const closeEnd = closeStart + input.durationMinutes;

  // Build a working copy of flights (may be modified by recovery action)
  let flights: Flight[] = network.flights.map(f => ({ ...f }));
  
  // If recovery action cancels flights, remove them
  if (recoveryAction && (recoveryAction.type === 'CANCEL_FLIGHT' || recoveryAction.type === 'CANCEL_TURN_PAIR')) {
    // Mark cancelled flights - they will be set to cancelled status
  }

  // Group flights by tail_id, sort by leg_order
  const byTail = new Map<string, Flight[]>();
  for (const f of flights) {
    const arr = byTail.get(f.tail_id) ?? [];
    arr.push(f);
    byTail.set(f.tail_id, arr);
  }
  for (const [, legs] of byTail) {
    legs.sort((a, b) => a.leg_order - b.leg_order);
  }

  // ── PASS 1: propagate delays per aircraft chain ──────────────────────────
  const simFlights = new Map<string, SimulatedFlight>();

  for (const [tailId, legs] of byTail) {
    // Determine if this tail is replaced by a spare swap recovery
    const isSpareSwapped = recoveryAction?.type === 'SPARE_SWAP' &&
      legs.some(l => recoveryAction.targetFlightIds.includes(l.flight_id));

    let spareSwapStartIndex = -1;
    if (isSpareSwapped && recoveryAction) {
      // Find the first flight in targetFlightIds for this tail
      const firstTargetId = recoveryAction.targetFlightIds[0];
      spareSwapStartIndex = legs.findIndex(l => l.flight_id === firstTargetId);
    }

    let prevActualArr: number | null = null;
    let prevFlightId: string | null = null;
    let prevCausalChain: CausalLink[] = [];
    let spareSwapActive = false;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const scheduledDep = parseTime(leg.dep);
      const scheduledArr = parseTime(leg.arr);

      // Check if this leg is cancelled by recovery action
      const isCancelledByRecovery = recoveryAction &&
        (recoveryAction.type === 'CANCEL_FLIGHT' || recoveryAction.type === 'CANCEL_TURN_PAIR') &&
        recoveryAction.targetFlightIds.includes(leg.flight_id);

      if (isCancelledByRecovery) {
        const sf: SimulatedFlight = {
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
          status: 'cancelled',
          delayMinutes: 0,
          reason: null,
          causedByFlightId: null,
          causalChain: [],
          crewDutyBreach: false,
          breachMinutes: 0,
        };
        simFlights.set(leg.flight_id, sf);
        // After a cancellation, subsequent legs still depart on schedule (no inbound)
        prevActualArr = null;
        prevFlightId = null;
        prevCausalChain = [];
        continue;
      }

      // If spare swap is active from this index, treat as fresh start (no inbound delay)
      if (isSpareSwapped && i === spareSwapStartIndex) {
        spareSwapActive = true;
        prevActualArr = null;
        prevFlightId = null;
        prevCausalChain = [];
      }

      // Step 1: Compute earliestDep
      let earliestDep: number;
      let currentReason: DelayReason | null = null;
      let causedByFlightId: string | null = null;
      let causalChain: CausalLink[] = [];

      if (leg.leg_order === 1 || prevActualArr === null || spareSwapActive) {
        earliestDep = scheduledDep;
        // Spare swap: available from 05:00, so if spare base is closed, can't depart before closeEnd
        if (spareSwapActive && recoveryAction?.type === 'SPARE_SWAP') {
          const spareAvailableFrom = parseTime('05:00');
          const spareBase = recoveryAction.spareBase ?? '';
          if (spareBase === input.airport) {
            // spare base is the closed airport
            earliestDep = Math.max(scheduledDep, closeEnd);
          } else {
            earliestDep = Math.max(scheduledDep, spareAvailableFrom);
          }
        }
        spareSwapActive = false; // Reset after first leg of spare
      } else {
        const minDep = prevActualArr + 30; // min_turnaround_minutes
        if (minDep > scheduledDep) {
          earliestDep = minDep;
          currentReason = 'INBOUND_ROTATION_DELAY';
          causedByFlightId = prevFlightId;
          causalChain = [...prevCausalChain];
          if (prevFlightId) {
            causalChain.push({
              flightId: prevFlightId,
              reason: 'INBOUND_ROTATION_DELAY',
              delayMinutes: minDep - scheduledDep,
            });
          }
        } else {
          earliestDep = scheduledDep;
        }
      }

      let actualDep = earliestDep;

      // Step 2: Departure hold — origin is closed
      if (leg.origin === input.airport && actualDep >= closeStart && actualDep < closeEnd) {
        actualDep = closeEnd;
        currentReason = 'DIRECT_DEPARTURE_HOLD';
        causedByFlightId = null;
        causalChain = [];
      }

      // Step 3: Arrival hold — destination is closed
      let actualArr = actualDep + leg.block_minutes;
      if (leg.destination === input.airport && actualArr > closeStart && actualArr < closeEnd) {
        // Push departure so arrival lands at closeEnd
        const requiredDep = closeEnd - leg.block_minutes;
        if (requiredDep > actualDep) {
          actualDep = requiredDep;
          actualArr = actualDep + leg.block_minutes;
          if (currentReason !== 'DIRECT_DEPARTURE_HOLD') {
            currentReason = 'DIRECT_ARRIVAL_HOLD';
            causedByFlightId = null;
            causalChain = [];
          }
        }
      }

      const delayMinutes = actualDep - scheduledDep;
      let status: FlightStatus = 'on_time';
      if (delayMinutes > 0) status = 'delayed';

      const sf: SimulatedFlight = {
        flight_id: leg.flight_id,
        tail_id: tailId,
        leg_order: leg.leg_order,
        origin: leg.origin,
        destination: leg.destination,
        scheduledDep,
        scheduledArr,
        actualDep,
        actualArr,
        block_minutes: leg.block_minutes,
        pax: leg.pax,
        status,
        delayMinutes,
        reason: currentReason,
        causedByFlightId,
        causalChain,
        crewDutyBreach: false,
        breachMinutes: 0,
      };

      simFlights.set(leg.flight_id, sf);
      prevActualArr = actualArr;
      prevFlightId = leg.flight_id;
      prevCausalChain = sf.causalChain;
    }
  }

  // ── PASS 2: Crew duty check ───────────────────────────────────────────────
  const crewBreaches: CrewBreach[] = [];

  for (const crew of network.crews) {
    // If spare swap replaces this crew's tail, skip duty check for swapped legs
    const isSwappedCrew = recoveryAction?.type === 'SPARE_SWAP' &&
      recoveryAction.targetFlightIds.some(id => crew.flight_ids.includes(id));

    const dutyStart = parseTime(crew.duty_start);
    let breached = false;
    const groundedFlightIds: string[] = [];

    for (const fid of crew.flight_ids) {
      const sf = simFlights.get(fid);
      if (!sf || sf.status === 'cancelled') continue;

      // If this flight is covered by spare swap, skip crew duty for it
      if (isSwappedCrew && recoveryAction?.targetFlightIds.includes(fid)) {
        continue;
      }

      if (breached) {
        // Ground all subsequent flights
        sf.status = 'crew_grounded';
        sf.reason = 'CREW_DUTY_BREACH';
        groundedFlightIds.push(fid);
        continue;
      }

      const dutyMinutes = sf.actualArr - dutyStart;
      if (dutyMinutes > crew.max_duty_mins) {
        breached = true;
        sf.crewDutyBreach = true;
        sf.breachMinutes = dutyMinutes - crew.max_duty_mins;
        sf.status = 'crew_grounded';
        sf.reason = 'CREW_DUTY_BREACH';
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
      const existing = crewBreaches.find(b => b.crew_id === crew.crew_id);
      if (existing) {
        existing.groundedFlightIds = groundedFlightIds;
      }
    }
  }

  // ── PASS 3: Connection check ──────────────────────────────────────────────
  const brokenConnections: BrokenConnection[] = [];

  for (const conn of network.connections as Connection[]) {
    const fromFlight = simFlights.get(conn.from_flight);
    const toFlight = simFlights.get(conn.to_flight);

    if (!fromFlight || !toFlight) continue;

    const fromCancelled = fromFlight.status === 'cancelled' || fromFlight.status === 'crew_grounded';
    const toCancelled = toFlight.status === 'cancelled' || toFlight.status === 'crew_grounded';

    if (fromCancelled || toCancelled) {
      brokenConnections.push({
        connection_id: conn.connection_id,
        airport: conn.airport,
        from_flight: conn.from_flight,
        to_flight: conn.to_flight,
        passengers: conn.passengers,
        min_connect_minutes: conn.min_connect_minutes,
        actualGapMinutes: toFlight.actualDep - fromFlight.actualArr,
        reason: fromCancelled ? 'FROM_CANCELLED' : 'TO_CANCELLED',
        countsInMissedPax: false, // already counted in cancelled pax
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
        reason: 'MISSED_CONNECTION',
        countsInMissedPax: true,
      });
    }
  }

  // ── Metrics aggregation ───────────────────────────────────────────────────
  const allFlights = Array.from(simFlights.values());

  const delayedFlightsCount = allFlights.filter(f => f.status === 'delayed').length;
  const cancelledFlightsCount = allFlights.filter(
    f => f.status === 'cancelled' || f.status === 'crew_grounded'
  ).length;
  const totalDelayMinutes = allFlights.reduce((s, f) => s + Math.max(0, f.delayMinutes), 0);
  const maxDelayMinutes = Math.max(0, ...allFlights.map(f => Math.max(0, f.delayMinutes)));
  const affectedAirports = new Set<string>();
  for (const f of allFlights) {
    if (f.status !== 'on_time') {
      affectedAirports.add(f.origin);
      affectedAirports.add(f.destination);
    }
  }

  const cancelledOrGroundedPax = allFlights
    .filter(f => f.status === 'cancelled' || f.status === 'crew_grounded')
    .reduce((s, f) => s + f.pax, 0);

  const missedConnectionPax = brokenConnections
    .filter(c => c.countsInMissedPax)
    .reduce((s, c) => s + c.passengers, 0);

  const metrics: SimulationMetrics = {
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

  return {
    input,
    flights: allFlights.sort((a, b) => a.scheduledDep - b.scheduledDep || a.flight_id.localeCompare(b.flight_id)),
    brokenConnections,
    crewBreaches,
    metrics,
  };
}
