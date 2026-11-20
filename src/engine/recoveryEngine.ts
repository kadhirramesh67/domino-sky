import type { FlightNetwork } from '../types/index';
import type { DisruptionInput, SimulationResult, SimulationMetrics } from '../types/simulation';
import type { RecoveryCandidate, RecoveryAction, MetricsDelta } from '../types/recovery';
import { simulateDisruption } from './simulateDisruption';
import { parseTime } from './timeUtils';
import {
  BUFFER_LIMITS,
  SCORING_WEIGHTS,
  VALIDATION_LIMITS,
  RECOVERY_ACTION_TYPES,
  FLIGHT_STATUS,
} from '../constants/index';

/**
 * Computes difference in operational metrics before and after applying a candidate recovery action.
 *
 * @param before Baseline simulation metrics
 * @param after Metrics after applying recovery action
 * @returns Structured metrics delta
 */
export function computeDelta(before: SimulationMetrics, after: SimulationMetrics): MetricsDelta {
  return {
    deltaDelayMinutes: after.totalDelayMinutes - before.totalDelayMinutes,
    deltaStrandedPax: after.totalStrandedPax - before.totalStrandedPax,
    deltaDelayedFlights: after.delayedFlightsCount - before.delayedFlightsCount,
    deltaCancelledFlights: after.cancelledFlightsCount - before.cancelledFlightsCount,
    deltaBrokenConnections: after.brokenConnectionsCount - before.brokenConnectionsCount,
    deltaCrewBreaches: after.crewBreachCount - before.crewBreachCount,
  };
}

/**
 * Calculates a composite penalty score for a candidate recovery action.
 * Lower (more negative) score indicates greater improvement across stranded pax, delay, and crew breaches.
 *
 * @param delta Metrics delta produced by recovery action
 * @returns Composite operational score
 */
export function scoreCandidate(delta: MetricsDelta): number {
  return (
    delta.deltaStrandedPax * SCORING_WEIGHTS.STRANDED_PAX +
    delta.deltaDelayMinutes * SCORING_WEIGHTS.DELAY_MINUTES +
    delta.deltaCrewBreaches * SCORING_WEIGHTS.CREW_BREACH
  );
}

/**
 * Identifies viable spare aircraft swap candidates from network spare bases (e.g. BLR, DEL).
 */
function findSpareSwapCandidates(
  network: FlightNetwork,
  input: DisruptionInput,
  baseResult: SimulationResult,
  closeEnd: number
): RecoveryCandidate[] {
  const candidates: RecoveryCandidate[] = [];

  for (const spare of network.spare_aircraft) {
    const spareBase = spare.base;

    const eligibleFlights = baseResult.flights.filter(
      (f) =>
        f.origin === spareBase &&
        (f.status === FLIGHT_STATUS.DELAYED || f.status === FLIGHT_STATUS.CREW_GROUNDED) &&
        f.delayMinutes > 0
    );

    for (const targetFlight of eligibleFlights) {
      const tailFlights = baseResult.flights
        .filter((f) => f.tail_id === targetFlight.tail_id)
        .sort((a, b) => a.leg_order - b.leg_order);

      const startIdx = tailFlights.findIndex((f) => f.flight_id === targetFlight.flight_id);
      if (startIdx < 0) continue;

      const targetFlightIds = tailFlights.slice(startIdx).map((f) => f.flight_id);
      const spareAvailableFrom = parseTime(spare.available_from);
      const spareEarliestDep =
        spareBase === input.airport
          ? Math.max(spareAvailableFrom, closeEnd)
          : spareAvailableFrom;

      if (spareEarliestDep > targetFlight.scheduledDep + BUFFER_LIMITS.SPARE_MAX_HORIZON_MINUTES) {
        continue;
      }

      const action: RecoveryAction = {
        id: `SPARE_SWAP_${spare.tail_id}_${targetFlight.flight_id}`,
        type: RECOVERY_ACTION_TYPES.SPARE_SWAP,
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

  return candidates;
}

/**
 * Identifies viable single flight cancellations or out-and-back turn pair cancellations.
 */
function findTurnPairAndCancellationCandidates(
  network: FlightNetwork,
  input: DisruptionInput,
  baseResult: SimulationResult
): RecoveryCandidate[] {
  const candidates: RecoveryCandidate[] = [];
  const delayedFlights = baseResult.flights.filter(
    (f) =>
      (f.status === FLIGHT_STATUS.DELAYED || f.status === FLIGHT_STATUS.CREW_GROUNDED) &&
      f.leg_order === 1
  );

  for (const targetFlight of delayedFlights.slice(0, 5)) {
    const tailFlights = baseResult.flights
      .filter((f) => f.tail_id === targetFlight.tail_id)
      .sort((a, b) => a.leg_order - b.leg_order);

    const firstLeg = tailFlights[0];
    const secondLeg = tailFlights[1];

    const isOutAndBack =
      tailFlights.length >= 2 &&
      firstLeg !== undefined &&
      secondLeg !== undefined &&
      firstLeg.destination === secondLeg.origin &&
      secondLeg.destination === firstLeg.origin;

    if (isOutAndBack && firstLeg && secondLeg) {
      const turnPairIds = [firstLeg.flight_id, secondLeg.flight_id];
      const turnAction: RecoveryAction = {
        id: `CANCEL_TURN_${targetFlight.tail_id}`,
        type: RECOVERY_ACTION_TYPES.CANCEL_TURN_PAIR,
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
        type: RECOVERY_ACTION_TYPES.CANCEL_FLIGHT,
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

  return candidates;
}

/**
 * Identifies bottleneck cancellation candidates directly at the closed airport.
 */
function findBottleneckCancellationCandidates(
  network: FlightNetwork,
  input: DisruptionInput,
  baseResult: SimulationResult,
  existingCandidates: RecoveryCandidate[]
): RecoveryCandidate[] {
  const candidates: RecoveryCandidate[] = [];
  const directlyAffected = baseResult.flights.filter(
    (f) =>
      (f.origin === input.airport || f.destination === input.airport) &&
      f.status === FLIGHT_STATUS.DELAYED &&
      f.leg_order === 1
  );

  for (const f of directlyAffected.slice(0, 3)) {
    const action: RecoveryAction = {
      id: `CANCEL_BOTTLENECK_${f.flight_id}`,
      type: RECOVERY_ACTION_TYPES.CANCEL_FLIGHT,
      label: `Cancel bottleneck ${f.flight_id}`,
      description: `Cancel ${f.origin}→${f.destination} to break cascade chain for tail ${f.tail_id}`,
      targetFlightIds: [f.flight_id],
    };

    if (existingCandidates.some((c) => c.action.targetFlightIds.includes(f.flight_id))) {
      continue;
    }

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

  return candidates;
}

/**
 * Evaluates and ranks candidate operational recovery actions (spare swaps,
 * out-and-back cancellations, and bottleneck breaks) to mitigate disruption domino effects.
 *
 * @param network Static flight network dataset
 * @param input Disruption parameters
 * @param baseResult Baseline simulation result without intervention
 * @returns Ranked, deduplicated list of top recovery candidates
 */
export function generateRecoveryCandidates(
  network: FlightNetwork,
  input: DisruptionInput,
  baseResult: SimulationResult
): RecoveryCandidate[] {
  const closeStart = parseTime(input.startTime);
  const closeEnd = closeStart + input.durationMinutes;

  // 1. Evaluate spare aircraft swaps
  const spareCandidates = findSpareSwapCandidates(network, input, baseResult, closeEnd);

  // 2. Evaluate turn pair & single cancellations
  const turnCandidates = findTurnPairAndCancellationCandidates(network, input, baseResult);

  const combinedSoFar = [...spareCandidates, ...turnCandidates];

  // 3. Evaluate bottleneck cancellations
  const bottleneckCandidates = findBottleneckCancellationCandidates(
    network,
    input,
    baseResult,
    combinedSoFar
  );

  const allCandidates = [...combinedSoFar, ...bottleneckCandidates];

  // Sort by score ascending (most negative = highest operational improvement)
  allCandidates.sort((a, b) => a.score - b.score);

  // Deduplicate by action ID and return top candidates
  const seen = new Set<string>();
  const uniqueCandidates: RecoveryCandidate[] = [];
  for (const c of allCandidates) {
    if (!seen.has(c.action.id)) {
      seen.add(c.action.id);
      uniqueCandidates.push(c);
    }
  }

  return uniqueCandidates.slice(0, VALIDATION_LIMITS.MAX_RECOVERY_CANDIDATES);
}
