import type { FlightNetwork } from '../types/index';
import type { DisruptionInput, SimulationResult, SimulationMetrics } from '../types/simulation';
import type { RecoveryCandidate, RecoveryAction, MetricsDelta } from '../types/recovery';
import { simulateDisruption } from './simulateDisruption';
import { parseTime } from './timeUtils';

function computeDelta(before: SimulationMetrics, after: SimulationMetrics): MetricsDelta {
  return {
    deltaDelayMinutes: after.totalDelayMinutes - before.totalDelayMinutes,
    deltaStrandedPax: after.totalStrandedPax - before.totalStrandedPax,
    deltaDelayedFlights: after.delayedFlightsCount - before.delayedFlightsCount,
    deltaCancelledFlights: after.cancelledFlightsCount - before.cancelledFlightsCount,
    deltaBrokenConnections: after.brokenConnectionsCount - before.brokenConnectionsCount,
    deltaCrewBreaches: after.crewBreachCount - before.crewBreachCount,
  };
}

function scoreCandidate(delta: MetricsDelta): number {
  // Negative = improvement; lower score = better
  return (
    delta.deltaStrandedPax * 3 +
    delta.deltaDelayMinutes * 0.1 +
    delta.deltaCrewBreaches * 50
  );
}

export function generateRecoveryCandidates(
  network: FlightNetwork,
  input: DisruptionInput,
  baseResult: SimulationResult
): RecoveryCandidate[] {
  const candidates: RecoveryCandidate[] = [];
  const closeStart = parseTime(input.startTime);
  const closeEnd = closeStart + input.durationMinutes;

  // ── Spare Swap Candidates ────────────────────────────────────────────────
  for (const spare of network.spare_aircraft) {
    const spareBase = spare.base;

    // Find delayed or crew_grounded flights departing from spare's base
    const eligibleFlights = baseResult.flights.filter(
      f =>
        f.origin === spareBase &&
        (f.status === 'delayed' || f.status === 'crew_grounded') &&
        f.delayMinutes > 0
    );

    for (const targetFlight of eligibleFlights) {
      // Find all subsequent flights in this aircraft chain
      const tailFlights = baseResult.flights
        .filter(f => f.tail_id === targetFlight.tail_id)
        .sort((a, b) => a.leg_order - b.leg_order);

      const startIdx = tailFlights.findIndex(f => f.flight_id === targetFlight.flight_id);
      if (startIdx < 0) continue;

      const targetFlightIds = tailFlights.slice(startIdx).map(f => f.flight_id);

      // Spare can depart from base unless base is the closed airport
      const spareAvailableFrom = parseTime(spare.available_from);
      const spareEarliestDep = spareBase === input.airport
        ? Math.max(spareAvailableFrom, closeEnd)
        : spareAvailableFrom;

      if (spareEarliestDep > targetFlight.scheduledDep + 240) {
        continue; // Spare available too late to help
      }

      const action: RecoveryAction = {
        id: `SPARE_SWAP_${spare.tail_id}_${targetFlight.flight_id}`,
        type: 'SPARE_SWAP',
        label: `Swap ${spare.tail_id} onto ${targetFlight.flight_id} chain`,
        description: `Deploy spare ${spare.tail_id} (base: ${spareBase}) to take over ${targetFlight.flight_id} and ${targetFlightIds.length - 1} subsequent leg(s), resetting crew duty`,
        targetFlightIds,
        spareTailId: spare.tail_id,
        spareBase,
      };

      const afterResult = simulateDisruption(network, input, action);
      const delta = computeDelta(baseResult.metrics, afterResult.metrics);
      const score = scoreCandidate(delta);

      candidates.push({
        action,
        beforeMetrics: baseResult.metrics,
        afterMetrics: afterResult.metrics,
        delta,
        score,
      });
    }
  }

  // ── Cancel Single Flight Candidates ─────────────────────────────────────
  const delayedFlights = baseResult.flights.filter(
    f => (f.status === 'delayed' || f.status === 'crew_grounded') && f.leg_order === 1
  );

  for (const targetFlight of delayedFlights.slice(0, 5)) { // Limit candidates
    // Find all legs for this tail
    const tailFlights = baseResult.flights
      .filter(f => f.tail_id === targetFlight.tail_id)
      .sort((a, b) => a.leg_order - b.leg_order);

    // Check if it's an out-and-back (first leg goes somewhere, second returns)
    const isOutAndBack =
      tailFlights.length >= 2 &&
      tailFlights[0].destination === tailFlights[1].origin &&
      tailFlights[1].destination === tailFlights[0].origin;

    if (isOutAndBack) {
      const turnPairIds = [tailFlights[0].flight_id, tailFlights[1].flight_id];
      const turnAction: RecoveryAction = {
        id: `CANCEL_TURN_${targetFlight.tail_id}`,
        type: 'CANCEL_TURN_PAIR',
        label: `Cancel ${turnPairIds[0]}/${turnPairIds[1]} turn`,
        description: `Cancel out-and-back turn ${targetFlight.origin}→${targetFlight.destination}→${targetFlight.origin} to stop delay propagation`,
        targetFlightIds: turnPairIds,
      };

      const afterResult = simulateDisruption(network, input, turnAction);
      const delta = computeDelta(baseResult.metrics, afterResult.metrics);

      if (delta.deltaDelayMinutes < 0 || delta.deltaStrandedPax < 0) {
        candidates.push({
          action: turnAction,
          beforeMetrics: baseResult.metrics,
          afterMetrics: afterResult.metrics,
          delta,
          score: scoreCandidate(delta),
        });
      }
    } else {
      const cancelAction: RecoveryAction = {
        id: `CANCEL_FLIGHT_${targetFlight.flight_id}`,
        type: 'CANCEL_FLIGHT',
        label: `Cancel ${targetFlight.flight_id}`,
        description: `Cancel ${targetFlight.origin}→${targetFlight.destination} (${targetFlight.pax} pax) to stop delay propagation`,
        targetFlightIds: [targetFlight.flight_id],
      };

      const afterResult = simulateDisruption(network, input, cancelAction);
      const delta = computeDelta(baseResult.metrics, afterResult.metrics);

      if (delta.deltaDelayMinutes < 0 || delta.deltaStrandedPax < 0) {
        candidates.push({
          action: cancelAction,
          beforeMetrics: baseResult.metrics,
          afterMetrics: afterResult.metrics,
          delta,
          score: scoreCandidate(delta),
        });
      }
    }
  }

  // Also try cancelling the first affected flight of the closed airport directly
  const directlyAffected = baseResult.flights.filter(
    f =>
      (f.origin === input.airport || f.destination === input.airport) &&
      f.status === 'delayed' &&
      f.leg_order === 1
  );

  for (const f of directlyAffected.slice(0, 3)) {
    const action: RecoveryAction = {
      id: `CANCEL_BOTTLENECK_${f.flight_id}`,
      type: 'CANCEL_FLIGHT',
      label: `Cancel bottleneck ${f.flight_id}`,
      description: `Cancel ${f.origin}→${f.destination} to break cascade chain for tail ${f.tail_id}`,
      targetFlightIds: [f.flight_id],
    };

    if (candidates.some(c => c.action.targetFlightIds.includes(f.flight_id))) continue;

    const afterResult = simulateDisruption(network, input, action);
    const delta = computeDelta(baseResult.metrics, afterResult.metrics);
    candidates.push({
      action,
      beforeMetrics: baseResult.metrics,
      afterMetrics: afterResult.metrics,
      delta,
      score: scoreCandidate(delta),
    });
  }

  // Sort by score ascending (most negative = best improvement)
  candidates.sort((a, b) => a.score - b.score);

  // Deduplicate by action id, return top 6
  const seen = new Set<string>();
  const unique: RecoveryCandidate[] = [];
  for (const c of candidates) {
    if (!seen.has(c.action.id)) {
      seen.add(c.action.id);
      unique.push(c);
    }
  }

  return unique.slice(0, 6);
}
