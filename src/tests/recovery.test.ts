import { describe, it, expect } from 'vitest';
import { generateRecoveryCandidates } from '../engine/recoveryEngine';
import { simulateDisruption } from '../engine/simulateDisruption';
import networkData from '../data/flight_network.json';
import type { FlightNetwork } from '../types/index';
import type { DisruptionInput } from '../types/simulation';

const network = networkData as FlightNetwork;

describe('Recovery Engine: Spare swaps', () => {
  it('identifies and evaluates spare swap with VT-DS18 at DEL during Delhi disruption', () => {
    // Delhi Fog Hold: DEL closed 08:00 for 120 mins
    const input: DisruptionInput = {
      airport: 'DEL',
      startTime: '08:00',
      durationMinutes: 120,
    };
    const baseResult = simulateDisruption(network, input);
    const candidates = generateRecoveryCandidates(network, input, baseResult);

    // Candidates should include spare swap with VT-DS18
    const delSpareCandidates = candidates.filter(
      c => c.action.type === 'SPARE_SWAP' && c.action.spareTailId === 'VT-DS18'
    );

    expect(delSpareCandidates.length).toBeGreaterThan(0);
    const candidate = delSpareCandidates[0];
    expect(candidate.action.spareBase).toBe('DEL');
    expect(candidate.action.targetFlightIds.length).toBeGreaterThan(0);

    // Applying this candidate should yield the exact afterMetrics
    const simWithAction = simulateDisruption(network, input, candidate.action);
    expect(simWithAction.metrics).toEqual(candidate.afterMetrics);
  });

  it('identifies and evaluates spare swap with VT-DS17 at BLR during Bengaluru disruption', () => {
    // Bengaluru Squall: BLR closed 11:00 for 90 mins
    const input: DisruptionInput = {
      airport: 'BLR',
      startTime: '11:00',
      durationMinutes: 90,
    };
    const baseResult = simulateDisruption(network, input);
    const candidates = generateRecoveryCandidates(network, input, baseResult);

    const blrSpareCandidates = candidates.filter(
      c => c.action.type === 'SPARE_SWAP' && c.action.spareTailId === 'VT-DS17'
    );

    expect(blrSpareCandidates.length).toBeGreaterThan(0);
    const candidate = blrSpareCandidates[0];
    expect(candidate.action.spareBase).toBe('BLR');
    expect(candidate.action.targetFlightIds.length).toBeGreaterThan(0);

    // Applying the spare swap improves metrics (cuts delay or stranded pax)
    expect(candidate.delta.deltaDelayMinutes).toBeLessThan(0);
  });
});

describe('Recovery Engine: Bottleneck flight cancellations', () => {
  it('evaluates bottleneck flight cancellations to isolate delay cascades', () => {
    const input: DisruptionInput = {
      airport: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
    };
    const baseResult = simulateDisruption(network, input);
    const candidates = generateRecoveryCandidates(network, input, baseResult);

    const cancelCandidates = candidates.filter(
      c => c.action.type === 'CANCEL_FLIGHT' || c.action.type === 'CANCEL_TURN_PAIR'
    );

    expect(cancelCandidates.length).toBeGreaterThan(0);
    for (const c of cancelCandidates) {
      expect(c.action.targetFlightIds.length).toBeGreaterThanOrEqual(1);
      // Cancel action should record deltaCancelledFlights >= 1
      expect(c.delta.deltaCancelledFlights).toBeGreaterThanOrEqual(1);
    }
  });

  it('correctly marks target flights as cancelled in simulated output when action is applied', () => {
    const input: DisruptionInput = {
      airport: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
    };
    const baseResult = simulateDisruption(network, input);
    const candidates = generateRecoveryCandidates(network, input, baseResult);
    const cancelCandidate = candidates.find(c => c.action.type === 'CANCEL_FLIGHT');

    expect(cancelCandidate).toBeDefined();
    if (cancelCandidate) {
      const recoveredResult = simulateDisruption(network, input, cancelCandidate.action);
      for (const targetId of cancelCandidate.action.targetFlightIds) {
        const flight = recoveredResult.flights.find(f => f.flight_id === targetId);
        expect(flight?.status).toBe('cancelled');
      }
    }
  });
});

describe('Recovery Engine: Accurate Before vs. After metric deltas', () => {
  it('computes exact deltas between base and recovered simulation results across all candidates', () => {
    const scenarios: DisruptionInput[] = [
      { airport: 'BOM', startTime: '07:30', durationMinutes: 90 },
      { airport: 'DEL', startTime: '08:00', durationMinutes: 120 },
      { airport: 'BLR', startTime: '11:00', durationMinutes: 90 },
    ];

    for (const input of scenarios) {
      const baseResult = simulateDisruption(network, input);
      const candidates = generateRecoveryCandidates(network, input, baseResult);

      expect(candidates.length).toBeGreaterThan(0);

      for (const c of candidates) {
        const { beforeMetrics, afterMetrics, delta } = c;

        expect(beforeMetrics).toEqual(baseResult.metrics);

        // Verify deltas
        expect(delta.deltaDelayMinutes).toBe(afterMetrics.totalDelayMinutes - beforeMetrics.totalDelayMinutes);
        expect(delta.deltaStrandedPax).toBe(afterMetrics.totalStrandedPax - beforeMetrics.totalStrandedPax);
        expect(delta.deltaDelayedFlights).toBe(afterMetrics.delayedFlightsCount - beforeMetrics.delayedFlightsCount);
        expect(delta.deltaCancelledFlights).toBe(afterMetrics.cancelledFlightsCount - beforeMetrics.cancelledFlightsCount);
        expect(delta.deltaBrokenConnections).toBe(afterMetrics.brokenConnectionsCount - beforeMetrics.brokenConnectionsCount);
        expect(delta.deltaCrewBreaches).toBe(afterMetrics.crewBreachCount - beforeMetrics.crewBreachCount);

        // Verify simulateDisruption with action reproduces afterMetrics exactly
        const verifiedSim = simulateDisruption(network, input, c.action);
        expect(verifiedSim.metrics).toEqual(afterMetrics);
      }
    }
  });
});
